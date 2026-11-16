"""App accounts: email + password and Google sign-in (Emergent managed). Everyone signs in before using the app."""
import hashlib
import hmac
import secrets
import uuid
from datetime import timedelta

import httpx
from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel, EmailStr, Field
from pymongo.errors import DuplicateKeyError

from core import (
    ACCOUNT_HEADER, DUMMY_HASH, MAX_EMAIL_FAILURES, AccountSession, Cuenta, _aware, clear_login_failures, client_ip,
    create_account_session, current_account, db, get_settings, hasher, insert_doc, login_blocked, logger, now_utc,
    record_login_failure, save_doc, scoped, token_hash,
)
from email_service import deliver, tpl_codigo_recuperacion

router = APIRouter(prefix="/api")
GOOGLE_SESSION_URL = "https://demobackend.emergentagent.com/auth/v1/env/oauth/session-data"
MAX_SIGNUPS_PER_IP = 10  # per 15-minute window
RESET_MINUTES = 15
MAX_RESET_ATTEMPTS = 5


class RegistroIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=80)
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginEmailIn(BaseModel):
    email: EmailStr
    password: str = Field(min_length=1, max_length=128)


class GoogleSessionIn(BaseModel):
    session_id: str = Field(min_length=4, max_length=512)


def norm_email(email) -> str:
    return str(email).strip().lower()


def new_account_id() -> str:
    return f"acc_{uuid.uuid4().hex[:12]}"


def check_password(password: str) -> None:
    if len(password) < 8 or not any(c.isdigit() for c in password) or not any(c.isalpha() for c in password):
        raise HTTPException(status_code=422, detail="La contraseña debe tener al menos 8 caracteres, con letras y números")


async def account_out(cuenta: Cuenta) -> dict:
    """Public account data + the welcome discount still available (only before the first request)."""
    settings = await get_settings()
    usado = await db.requests.find_one(scoped({"cuenta_id": cuenta.account_id}), {"_id": 1})
    return {**cuenta.public(), "descuento_bienvenida": 0 if usado else settings.descuento_bienvenida}


async def session_out(cuenta: Cuenta) -> dict:
    return {"token": await create_account_session(cuenta), "cuenta": await account_out(cuenta)}


@router.post("/cuenta/registro", status_code=201)
async def registro(body: RegistroIn, request: Request):
    signup_key = f"registro:{client_ip(request)}"
    if await login_blocked(signup_key):
        raise HTTPException(status_code=429, detail="Demasiados registros desde esta conexión. Espera 15 minutos.")
    email = norm_email(body.email)
    check_password(body.password)
    existing = await db.accounts.find_one({"email": email})
    if existing:
        if existing.get("password_hash"):
            raise HTTPException(status_code=409, detail="Ya existe una cuenta con este correo. Inicia sesión.")
        raise HTTPException(status_code=409, detail="Este correo ya está registrado con Google. Pulsa «Continuar con Google».")
    cuenta = Cuenta(account_id=new_account_id(), email=email, nombre=body.nombre.strip(),
                    password_hash=hasher.hash(body.password), proveedores=["email"])
    try:
        await insert_doc("accounts", cuenta)
    except DuplicateKeyError:
        raise HTTPException(status_code=409, detail="Ya existe una cuenta con este correo. Inicia sesión.")
    await record_login_failure(signup_key, MAX_SIGNUPS_PER_IP)  # counts sign-ups, not failures
    return await session_out(cuenta)


@router.post("/cuenta/login")
async def login_email(body: LoginEmailIn, request: Request):
    email = norm_email(body.email)
    key = f"cuenta:{client_ip(request)}:{email}"
    total_key = f"cuenta-total:{email}"
    if await login_blocked(key) or await login_blocked(total_key):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.")
    doc = await db.accounts.find_one({"email": email, "active": True})
    cuenta = Cuenta.from_mongo(doc) if doc else None
    try:
        valid = hasher.verify(body.password, cuenta.password_hash if cuenta and cuenta.password_hash else DUMMY_HASH)
    except Exception:
        valid = False
    if not cuenta or not cuenta.password_hash or not valid:
        await record_login_failure(key)
        await record_login_failure(total_key, MAX_EMAIL_FAILURES)
        if cuenta and not cuenta.password_hash:
            raise HTTPException(status_code=401, detail="Esta cuenta se creó con Google. Pulsa «Continuar con Google».")
        raise HTTPException(status_code=401, detail="Correo o contraseña incorrectos")
    await clear_login_failures(key)
    await clear_login_failures(total_key)
    return await session_out(cuenta)


@router.post("/auth/session")
async def google_session(body: GoogleSessionIn):
    """Exchange the one-time Google session_id (from the redirect URL) for an app session."""
    try:
        async with httpx.AsyncClient(timeout=15) as client:
            r = await client.get(GOOGLE_SESSION_URL, headers={"X-Session-ID": body.session_id})
    except httpx.HTTPError as e:
        logger.error("google session exchange failed: %s", e)
        raise HTTPException(status_code=502, detail="No se pudo conectar con Google. Inténtalo de nuevo.")
    if r.status_code != 200:
        raise HTTPException(status_code=401, detail="No se pudo completar el acceso con Google. Inténtalo de nuevo.")
    data = r.json()
    email = norm_email(data.get("email") or "")
    if not email:
        raise HTTPException(status_code=401, detail="Google no ha devuelto tu correo. Inténtalo de nuevo.")
    nombre = (data.get("name") or email.split("@")[0]).strip()[:80]
    foto = data.get("picture") or ""
    doc = await db.accounts.find_one({"email": email})
    if doc:
        cuenta = Cuenta.from_mongo(doc)
        if not cuenta.active:
            raise HTTPException(status_code=403, detail="Esta cuenta está desactivada")
        if "google" not in cuenta.proveedores:
            cuenta.proveedores.append("google")
        cuenta.foto = foto or cuenta.foto
        cuenta.nombre = cuenta.nombre or nombre
        await save_doc("accounts", cuenta)
    else:
        cuenta = Cuenta(account_id=new_account_id(), email=email, nombre=nombre, foto=foto, proveedores=["google"])
        try:
            await insert_doc("accounts", cuenta)
        except DuplicateKeyError:
            cuenta = Cuenta.from_mongo(await db.accounts.find_one({"email": email}))
    return await session_out(cuenta)


@router.get("/cuenta/me")
async def cuenta_me(ctx: AccountSession = Depends(current_account)):
    return await account_out(ctx.cuenta)


@router.post("/cuenta/bienvenida-vista")
async def bienvenida_vista(ctx: AccountSession = Depends(current_account)):
    await db.accounts.update_one({"account_id": ctx.cuenta.account_id}, {"$set": {"bienvenida_pendiente": False}})
    ctx.cuenta.bienvenida_pendiente = False
    return await account_out(ctx.cuenta)


# ------------------------------------------------ password reset with a 6-digit emailed code
class RecuperarIn(BaseModel):
    email: EmailStr


class RestablecerIn(BaseModel):
    email: EmailStr
    codigo: str = Field(min_length=1, max_length=12)
    password: str = Field(min_length=1, max_length=128)


def reset_hash(email: str, codigo: str) -> str:
    return hashlib.sha256(f"{email}:{codigo}".encode()).hexdigest()


@router.post("/cuenta/recuperar")
async def recuperar(body: RecuperarIn, request: Request):
    """Always answers the same, so nobody can find out which emails have an account."""
    email = norm_email(body.email)
    ip_key, mail_key = f"recuperar-ip:{client_ip(request)}", f"recuperar:{email}"
    if await login_blocked(ip_key) or await login_blocked(mail_key):
        raise HTTPException(status_code=429, detail="Ya te hemos enviado varios códigos. Espera 15 minutos y vuelve a intentarlo.")
    await record_login_failure(ip_key, 10)  # counts requests, not failures
    await record_login_failure(mail_key, 3)
    doc = await db.accounts.find_one({"email": email, "active": True})
    if doc:
        codigo = f"{secrets.randbelow(10**6):06d}"
        t = now_utc()
        await db.password_resets.update_one(
            {"email": email},
            {"$set": {"code_hash": reset_hash(email, codigo), "attempts": 0, "created_at": t, "expires_at": t + timedelta(minutes=RESET_MINUTES)}},
            upsert=True,
        )
        settings = await get_settings()
        asunto, html, texto = tpl_codigo_recuperacion(doc.get("nombre") or email, codigo, settings)
        await deliver(tipo="recuperar_password", destinatario=email, asunto=asunto, html=html, texto=texto)
    return {"ok": True, "detail": "Si existe una cuenta con ese correo, te hemos enviado un código de 6 cifras."}


@router.post("/cuenta/restablecer")
async def restablecer(body: RestablecerIn):
    email = norm_email(body.email)
    check_password(body.password)
    doc = await db.password_resets.find_one({"email": email})
    if not doc or _aware(doc["expires_at"]) <= now_utc() or doc.get("attempts", 0) >= MAX_RESET_ATTEMPTS:
        raise HTTPException(status_code=400, detail="El código ha caducado o ya no es válido. Pide uno nuevo.")
    if not hmac.compare_digest(doc["code_hash"], reset_hash(email, body.codigo.strip())):
        await db.password_resets.update_one({"email": email}, {"$inc": {"attempts": 1}})
        raise HTTPException(status_code=400, detail="Código incorrecto. Revisa el correo e inténtalo de nuevo.")
    acc = await db.accounts.find_one({"email": email, "active": True})
    if not acc:
        raise HTTPException(status_code=400, detail="El código ha caducado o ya no es válido. Pide uno nuevo.")
    cuenta = Cuenta.from_mongo(acc)
    cuenta.password_hash = hasher.hash(body.password)
    if "email" not in cuenta.proveedores:
        cuenta.proveedores.append("email")
    await save_doc("accounts", cuenta)
    await db.password_resets.delete_one({"email": email})
    # New password: every other device is signed out.
    await db.account_sessions.delete_many({"account_id": cuenta.account_id})
    await clear_login_failures(f"cuenta-total:{email}")
    return await session_out(cuenta)


@router.post("/cuenta/logout")
async def cuenta_logout(request: Request):
    token = request.headers.get(ACCOUNT_HEADER, "").strip()
    if token:
        await db.account_sessions.delete_one({"token_hash": token_hash(token)})
    return {"ok": True}
