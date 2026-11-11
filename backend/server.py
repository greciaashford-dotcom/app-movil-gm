"""GM Conecta API: public client flow, auth, files, worker and hardware-store roles."""
import asyncio
import logging
import uuid
from contextlib import suppress
from typing import List, Literal, Optional

from fastapi import APIRouter, Depends, FastAPI, File, HTTPException, Request, Response, UploadFile
from fastapi.concurrency import run_in_threadpool
from pydantic import BaseModel, EmailStr, Field
from pymongo import ASCENDING, DESCENDING, IndexModel
from pymongo.errors import DuplicateKeyError
from requests import HTTPError
from starlette.middleware.cors import CORSMiddleware

from account_routes import router as account_router
from admin_routes import export_router
from admin_routes import router as admin_router
from core import (
    COMPANY_ID, DUMMY_HASH, AccountSession, Anuncio, Cliente, FileDoc, Ferreteria, Obra, Presupuesto, Solicitud, Trabajador,
    UserDoc, check_pin, clear_login_failures, client_ip, current_account, current_user, db, find_docs, get_doc, get_settings,
    hasher, insert_doc, MAX_PROFILE_FAILURES, login_blocked, make_token, mongo_client, next_seq, norm_phone, now_iso,
    optional_account, optional_user, record_login_failure, require_roles, save_doc, scoped, to_oid, JWT_MINUTES,
)
from email_service import deliver, tpl_alerta_admin, tpl_confirmacion_cliente
from seed import seed_if_needed
from storage_service import APP_NAME, get_object, init_storage, put_object

logging.basicConfig(level=logging.INFO, format="%(asctime)s - %(name)s - %(levelname)s - %(message)s")
logger = logging.getLogger(__name__)

INDEXES: dict[str, list[IndexModel]] = {
    "requests": [
        IndexModel([("companyId", ASCENDING), ("numero_solicitud", ASCENDING)], name="numero", unique=True),
        IndexModel([("companyId", ASCENDING), ("idempotency_key", ASCENDING)], name="idem", unique=True),
        IndexModel([("companyId", ASCENDING), ("fecha_creacion", DESCENDING)], name="fecha_desc"),
        IndexModel([("companyId", ASCENDING), ("estado", ASCENDING)], name="estado"),
    ],
    "clients": [IndexModel([("companyId", ASCENDING), ("telefono_norm", ASCENDING)], name="tel")],
    "quotes": [IndexModel([("companyId", ASCENDING), ("estado", ASCENDING), ("fecha_creacion", DESCENDING)], name="estado_fecha")],
    "projects": [
        IndexModel([("companyId", ASCENDING), ("estado", ASCENDING)], name="estado"),
        IndexModel([("companyId", ASCENDING), ("trabajadores_asignados", ASCENDING)], name="trabajadores"),
    ],
    "transactions": [
        IndexModel([("companyId", ASCENDING), ("ambito", ASCENDING), ("fecha", DESCENDING)], name="ambito_fecha"),
        IndexModel([("companyId", ASCENDING), ("obra_id", ASCENDING)], name="obra"),
    ],
    "messages": [IndexModel([("companyId", ASCENDING), ("solicitud_id", ASCENDING), ("fecha", DESCENDING)], name="sol_fecha")],
    "reminders": [IndexModel([("companyId", ASCENDING), ("fecha", ASCENDING)], name="fecha")],
    "users": [IndexModel([("role", ASCENDING), ("code", ASCENDING)], name="role_code", unique=True)],
    "accounts": [
        IndexModel([("email", ASCENDING)], name="email", unique=True),
        IndexModel([("account_id", ASCENDING)], name="account_id", unique=True),
    ],
    "account_sessions": [
        IndexModel([("token_hash", ASCENDING)], name="token_hash", unique=True),
        IndexModel([("sid", ASCENDING)], name="sid", unique=True),
        IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0),
    ],
    "login_limits": [IndexModel([("expires_at", ASCENDING)], name="ttl", expireAfterSeconds=0)],
    "files": [IndexModel([("path", ASCENDING)], name="path", unique=True)],
}


async def ensure_indexes() -> None:
    for collection, models in INDEXES.items():
        for model in models:
            try:
                await db[collection].create_indexes([model])
            except Exception as exc:
                logger.error("ensure_indexes(%s.%s): %s", collection, model.document["name"], exc)


app = FastAPI(title="GM Conecta API")


@app.get("/health", include_in_schema=False)
@app.head("/health", include_in_schema=False)
async def health():
    return {"status": "ok"}


api = APIRouter(prefix="/api")
_background: set = set()


def _spawn(coro) -> None:
    task = asyncio.create_task(coro)
    _background.add(task)
    task.add_done_callback(_background.discard)


@api.get("/")
async def root():
    return {"app": "GM Conecta", "status": "ok"}


@api.get("/config/public")
async def config_public():
    s = await get_settings()
    return {
        "nombre": s.nombre_comercial,
        "empresa": s.razon_social,
        "telefono": s.telefono,
        "whatsapp": s.whatsapp,
        "email_contacto": s.email_contacto,
        "direccion": s.direccion_fiscal,
    }


# ---------------------------------------------------------------- files
ALLOWED_TYPES = {"image/jpeg": "jpg", "image/jpg": "jpg", "image/png": "png", "image/webp": "webp", "image/heic": "heic", "image/heif": "heif"}
MAX_UPLOAD = 10 * 1024 * 1024


def sniff_image(data: bytes) -> Optional[str]:
    """Real file type from the magic bytes (the declared content type can lie)."""
    if data[:3] == b"\xff\xd8\xff":
        return "image/jpeg"
    if data[:8] == b"\x89PNG\r\n\x1a\n":
        return "image/png"
    if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
        return "image/webp"
    if data[4:8] == b"ftyp" and data[8:12] in (b"heic", b"heix", b"hevc", b"heim", b"heis", b"mif1", b"msf1"):
        return "image/heif" if data[8:12] in (b"mif1", b"msf1") else "image/heic"
    return None


@api.post("/upload")
async def upload(
    file: UploadFile = File(...),
    user: Optional[UserDoc] = Depends(optional_user),
    acc: Optional[AccountSession] = Depends(optional_account),
):
    if not user and not acc:
        raise HTTPException(status_code=401, detail="Inicia sesión para subir fotos", headers={"X-Auth-Error": "account"})
    content_type = (file.content_type or "").lower()
    if content_type not in ALLOWED_TYPES:
        name = (file.filename or "").lower()
        ext_guess = name.rsplit(".", 1)[-1] if "." in name else ""
        content_type = {"jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png", "webp": "image/webp", "heic": "image/heic"}.get(ext_guess, "")
    if content_type not in ALLOWED_TYPES:
        raise HTTPException(status_code=400, detail="Solo se permiten imágenes (JPG, PNG, WEBP o HEIC)")
    data = await file.read()
    if not data:
        raise HTTPException(status_code=400, detail="El archivo está vacío")
    if len(data) > MAX_UPLOAD:
        raise HTTPException(status_code=413, detail="La imagen supera 10 MB")
    sniffed = sniff_image(data)
    if not sniffed:
        raise HTTPException(status_code=400, detail="El archivo no es una imagen válida")
    content_type = sniffed
    owner = f"{user.role}-{user.code}" if user else f"cuenta-{acc.cuenta.account_id}"
    path = f"{APP_NAME}/uploads/{owner}/{uuid.uuid4()}.{ALLOWED_TYPES[content_type]}"
    try:
        result = await run_in_threadpool(put_object, path, data, content_type)
    except HTTPError as e:
        status = e.response.status_code if e.response is not None else 502
        if status == 402:
            raise HTTPException(status_code=402, detail="Sin crédito de almacenamiento. Inténtalo más tarde.")
        logger.error("upload failed: %s", e)
        raise HTTPException(status_code=502, detail="No se pudo guardar la imagen")
    except Exception as e:
        logger.error("upload failed: %s", e)
        raise HTTPException(status_code=502, detail="No se pudo guardar la imagen")
    doc = FileDoc(
        path=result["path"], owner=owner, content_type=content_type, size=len(data),
        public=bool(user and user.role == "ferreteria"),
    )
    await insert_doc("files", doc)
    return {"path": doc.path}


@api.get("/files/{path:path}")
async def get_file(path: str, user: Optional[UserDoc] = Depends(optional_user)):
    rec = await db.files.find_one({"path": path, "is_deleted": False})
    if not rec:
        raise HTTPException(status_code=404, detail="Archivo no encontrado")
    if not rec.get("public") and not user:
        raise HTTPException(status_code=401, detail="No autenticado")
    try:
        data, ct = await run_in_threadpool(get_object, path)
    except Exception as e:
        logger.error("download failed: %s", e)
        raise HTTPException(status_code=502, detail="No se pudo cargar la imagen")
    return Response(content=data, media_type=rec.get("content_type") or ct, headers={"Cache-Control": "private, max-age=86400"})


# ---------------------------------------------------------------- client requests
class SolicitudIn(BaseModel):
    idempotency_key: str = Field(min_length=8, max_length=80)
    servicio: str = Field(min_length=2, max_length=80)
    es_urgencia: bool = False
    descripcion: str = Field(min_length=10, max_length=3000)
    fotografias: List[str] = Field(default_factory=list, max_length=5)
    nombre_cliente: str = Field(min_length=2, max_length=120)
    telefono_cliente: str = Field(min_length=9, max_length=20)
    correo_cliente: EmailStr
    direccion: str = Field(min_length=3, max_length=200)


async def public_view(s: Solicitud) -> dict:
    data = {
        "id": s.id,
        "numero_solicitud": s.numero_solicitud,
        "fecha_creacion": s.fecha_creacion,
        "servicio": s.servicio,
        "es_urgencia": s.es_urgencia,
        "direccion": s.direccion,
        "estado": s.estado,
        "descripcion": s.descripcion,
        "nombre_cliente": s.nombre_cliente,
        "num_fotos": len(s.fotografias),
        "presupuesto": None,
        "obra": None,
    }
    if s.presupuesto_id:
        q = await db.quotes.find_one(scoped({"_id": to_oid(s.presupuesto_id)}))
        if q:
            q = Presupuesto.from_mongo(q)
            data["presupuesto"] = {"numero": q.numero_presupuesto, "total": q.total, "estado": q.estado}
    if s.obra_id:
        o = await db.projects.find_one(scoped({"_id": to_oid(s.obra_id)}))
        if o:
            o = Obra.from_mongo(o)
            data["obra"] = {"estado": o.estado, "porcentaje_avance": o.porcentaje_avance, "fecha_inicio": o.fecha_inicio}
    return data


async def upsert_cliente(nombre: str, telefono: str, correo: str, direccion: str) -> Cliente:
    tel = norm_phone(telefono)
    doc = await db.clients.find_one(scoped({"telefono_norm": tel}))
    if doc:
        cliente = Cliente.from_mongo(doc)
        cliente.nombre = nombre or cliente.nombre
        cliente.correo = correo or cliente.correo
        if direccion and direccion not in cliente.direcciones:
            cliente.direcciones.append(direccion)
        return await save_doc("clients", cliente)
    cliente = Cliente(nombre=nombre, telefono=telefono, telefono_norm=tel, correo=correo, direcciones=[direccion] if direccion else [])
    return await insert_doc("clients", cliente)


async def send_request_emails(s: Solicitud) -> None:
    try:
        settings = await get_settings()
        asunto, html, texto = tpl_confirmacion_cliente(s, settings)
        await deliver(tipo="confirmacion_cliente", destinatario=s.correo_cliente, asunto=asunto, html=html, texto=texto,
                      reply_to=settings.admin_email, solicitud_id=s.id, cliente_id=s.cliente_id)
        asunto, html, texto = tpl_alerta_admin(s, settings)
        await deliver(tipo="alerta_admin", destinatario=settings.admin_email, asunto=asunto, html=html, texto=texto,
                      solicitud_id=s.id, cliente_id=s.cliente_id)
    except Exception as e:  # never break the client flow because of email
        logger.error("request emails failed: %s", e)


@api.post("/solicitudes", status_code=201)
async def crear_solicitud(body: SolicitudIn, response: Response, ctx: AccountSession = Depends(current_account)):
    existing = await db.requests.find_one(scoped({"idempotency_key": body.idempotency_key}))
    if existing:
        response.status_code = 200
        return await public_view(Solicitud.from_mongo(existing))
    fotos = []
    for p in body.fotografias:
        if await db.files.find_one({"path": p, "is_deleted": False}):
            fotos.append(p)
    cliente = await upsert_cliente(body.nombre_cliente.strip(), body.telefono_cliente.strip(), str(body.correo_cliente), body.direccion.strip())
    seq = await next_seq("solicitud")
    s = Solicitud(
        numero_solicitud=f"GC-{seq:06d}",
        fecha_creacion=now_iso(),
        servicio=body.servicio.strip(),
        es_urgencia=body.es_urgencia or body.servicio.lower().startswith("urgencia"),
        direccion=body.direccion.strip(),
        nombre_cliente=body.nombre_cliente.strip(),
        telefono_cliente=body.telefono_cliente.strip(),
        telefono_norm=norm_phone(body.telefono_cliente),
        correo_cliente=str(body.correo_cliente),
        descripcion=body.descripcion.strip(),
        fotografias=fotos,
        idempotency_key=body.idempotency_key,
        cliente_id=cliente.id,
        cuenta_id=ctx.cuenta.account_id,
    )
    try:
        await insert_doc("requests", s)
    except DuplicateKeyError:
        existing = await db.requests.find_one(scoped({"idempotency_key": body.idempotency_key}))
        response.status_code = 200
        return await public_view(Solicitud.from_mongo(existing))
    await db.clients.update_one({"_id": to_oid(cliente.id)}, {"$addToSet": {"solicitudes": s.id}})
    _spawn(send_request_emails(s))
    return await public_view(s)


class MineItem(BaseModel):
    numero: str = Field(max_length=20)
    key: Optional[str] = Field(default=None, max_length=80)
    telefono: Optional[str] = Field(default=None, max_length=20)


class MineIn(BaseModel):
    items: List[MineItem] = Field(default_factory=list, max_length=100)


@api.post("/solicitudes/mine")
async def mis_solicitudes(body: MineIn, ctx: Optional[AccountSession] = Depends(optional_account)):
    results = []
    seen = set()
    if ctx:
        for s in await find_docs("requests", Solicitud, {"cuenta_id": ctx.cuenta.account_id}, sort=[("fecha_creacion", -1)], limit=100):
            seen.add(s.id)
            results.append(await public_view(s))
    for item in body.items:
        q = scoped({"numero_solicitud": item.numero.strip().upper()})
        if item.key:
            q["idempotency_key"] = item.key
        elif item.telefono:
            q["telefono_norm"] = norm_phone(item.telefono)
        else:
            continue
        doc = await db.requests.find_one(q)
        if doc and str(doc["_id"]) not in seen:
            seen.add(str(doc["_id"]))
            results.append(await public_view(Solicitud.from_mongo(doc)))
    results.sort(key=lambda r: r["fecha_creacion"], reverse=True)
    return results


class LookupIn(BaseModel):
    numero: str = Field(min_length=4, max_length=20)
    telefono: str = Field(min_length=9, max_length=20)


@api.post("/solicitudes/lookup")
async def buscar_solicitud(body: LookupIn):
    doc = await db.requests.find_one(scoped({"numero_solicitud": body.numero.strip().upper(), "telefono_norm": norm_phone(body.telefono)}))
    if not doc:
        raise HTTPException(status_code=404, detail="No encontramos una solicitud con ese número y teléfono")
    return await public_view(Solicitud.from_mongo(doc))


# ---------------------------------------------------------------- public hardware stores
def store_public(f: Ferreteria) -> dict:
    return {
        "id": f.id, "nombre": f.nombre, "direccion": f.direccion, "barrio": f.barrio, "telefono": f.telefono,
        "horario": f.horario, "descripcion": f.descripcion, "imagen": f.imagen, "valoracion": f.valoracion,
        "productos_destacados": f.productos_destacados,
        "anuncios": [a.model_dump() for a in f.anuncios if a.activo],
    }


@api.get("/ferreterias")
async def ferreterias_publicas():
    stores = await find_docs("hardware_stores", Ferreteria, {"activa": True}, sort=[("nombre", 1)])
    return [store_public(f) for f in stores]


@api.get("/ferreterias/{store_id}")
async def ferreteria_publica(store_id: str):
    return store_public(await get_doc("hardware_stores", Ferreteria, store_id))


# ---------------------------------------------------------------- auth
@api.get("/auth/options")
async def auth_options(ctx: Optional[AccountSession] = Depends(optional_account)):
    """Staff profiles a signed-in account can pick. Profiles linked to another account are hidden."""
    workers = await find_docs("workers", Trabajador, {"activo": True}, sort=[("nombre", 1)])
    stores = await find_docs("hardware_stores", Ferreteria, {"activa": True}, sort=[("nombre", 1)])
    links = {
        (d["role"], d["code"]): d.get("account_id")
        async for d in db.users.find({"role": {"$in": ["trabajador", "ferreteria"]}}, {"role": 1, "code": 1, "account_id": 1})
    }
    mine = ctx.cuenta.account_id if ctx else None

    def state(role: str, code: str):
        owner = links.get((role, code.lower()))
        return None if owner and owner != mine else bool(owner and owner == mine)

    trabajadores, ferreterias = [], []
    for w in workers:
        st = state("trabajador", w.codigo)
        if st is not None:
            trabajadores.append({"codigo": w.codigo, "nombre": w.nombre, "especialidad": w.especialidad, "mio": st})
    for f in stores:
        st = state("ferreteria", f.codigo)
        if st is not None:
            ferreterias.append({"codigo": f.codigo, "nombre": f.nombre, "mio": st})
    return {"trabajadores": trabajadores, "ferreterias": ferreterias}


def mask_email(email: str) -> str:
    name, _, domain = email.partition("@")
    return f"{name[:2]}•••@{domain}" if domain else "otra cuenta"


class LoginIn(BaseModel):
    role: Literal["admin", "trabajador", "ferreteria"]
    code: str = Field(min_length=1, max_length=64, pattern=r"^[A-Za-z0-9_-]+$")
    pin: str = Field(min_length=1, max_length=12)


@api.post("/auth/login")
async def login(body: LoginIn, request: Request, ctx: AccountSession = Depends(current_account)):
    """Second step: a signed-in account unlocks a staff mode with its 6-digit PIN."""
    ip = client_ip(request)
    key = f"{ip}:{body.role}:{body.code.lower()}"
    own_key = f"pin:{ctx.cuenta.account_id}:{body.role}:{body.code.lower()}"
    account_key = f"account:{body.role}:{body.code.lower()}"
    if await login_blocked(key) or await login_blocked(own_key) or await login_blocked(account_key):
        raise HTTPException(status_code=429, detail="Demasiados intentos. Espera 15 minutos e inténtalo de nuevo.")
    doc = await db.users.find_one({"role": body.role, "code": body.code.lower(), "active": True})
    user = UserDoc.from_mongo(doc) if doc else None
    try:
        valid = hasher.verify(body.pin, user.pin_hash if user else DUMMY_HASH)
    except Exception:
        valid = False
    if not user or not valid or user.pin_reset_required:
        await record_login_failure(key)
        await record_login_failure(own_key)
        await record_login_failure(account_key, MAX_PROFILE_FAILURES)
        raise HTTPException(status_code=401, detail="PIN incorrecto")
    await clear_login_failures(key)
    await clear_login_failures(own_key)
    if user.account_id and user.account_id != ctx.cuenta.account_id:
        raise HTTPException(
            status_code=403,
            detail=f"Este perfil está vinculado a otra cuenta ({mask_email(user.account_email)}). Pide al administrador que lo desvincule.",
        )
    if not user.account_id:
        await db.users.update_one({"_id": doc["_id"]}, {"$set": {"account_id": ctx.cuenta.account_id, "account_email": ctx.cuenta.email}})
        user.account_id, user.account_email = ctx.cuenta.account_id, ctx.cuenta.email
    return {
        "access_token": make_token(user, ctx.sid),
        "token_type": "bearer",
        "expires_in": JWT_MINUTES * 60,
        "role": user.role,
        "code": user.code,
        "display_name": user.display_name,
        "entity_id": user.entity_id,
    }


class CambiarPinIn(BaseModel):
    pin_actual: str = Field(min_length=1, max_length=12)
    pin_nuevo: str = Field(min_length=1, max_length=12)


@api.post("/auth/cambiar-pin")
async def cambiar_pin(body: CambiarPinIn, user: UserDoc = Depends(current_user)):
    try:
        valid = hasher.verify(body.pin_actual, user.pin_hash)
    except Exception:
        valid = False
    if not valid:
        raise HTTPException(status_code=400, detail="El PIN actual no es correcto")
    check_pin(body.pin_nuevo)
    if body.pin_nuevo == body.pin_actual:
        raise HTTPException(status_code=422, detail="El nuevo PIN debe ser distinto del actual")
    await db.users.update_one({"_id": to_oid(user.id)}, {"$set": {"pin_hash": hasher.hash(body.pin_nuevo), "pin_version": 2, "pin_reset_required": False}})
    return {"ok": True}


@api.get("/auth/me")
async def me(user: UserDoc = Depends(current_user)):
    return {"role": user.role, "code": user.code, "display_name": user.display_name, "entity_id": user.entity_id}


# ---------------------------------------------------------------- worker role
require_worker = require_roles("trabajador")
FASES = ("antes", "durante", "despues")


def worker_view(o: Obra, companeros: dict) -> dict:
    return {
        "id": o.id, "numero_obra": o.numero_obra, "titulo": o.titulo, "direccion": o.direccion,
        "fecha_inicio": o.fecha_inicio, "fecha_fin_prevista": o.fecha_fin_prevista, "estado": o.estado,
        "porcentaje_avance": o.porcentaje_avance, "fotos": o.fotos.model_dump(), "cliente_nombre": o.cliente_nombre,
        "cliente_telefono": o.cliente_telefono, "notas": o.notas,
        "companeros": [companeros.get(w, "") for w in o.trabajadores_asignados if w in companeros],
        "materiales": [{"concepto": m.concepto, "cantidad": m.cantidad, "unidad": m.unidad, "comprado": m.comprado} for m in o.materiales],
    }


async def _worker_names() -> dict:
    return {w.id: w.nombre for w in await find_docs("workers", Trabajador)}


async def _worker_obra(obra_id: str, user: UserDoc) -> Obra:
    o = await get_doc("projects", Obra, obra_id)
    if user.entity_id not in o.trabajadores_asignados:
        raise HTTPException(status_code=403, detail="Esta obra no está asignada a ti")
    return o


@api.get("/trabajador/obras")
async def trabajador_obras(user: UserDoc = Depends(require_worker)):
    obras = await find_docs("projects", Obra, {"trabajadores_asignados": user.entity_id}, sort=[("fecha_inicio", -1)])
    names = await _worker_names()
    return [worker_view(o, names) for o in obras]


@api.get("/trabajador/obras/{obra_id}")
async def trabajador_obra(obra_id: str, user: UserDoc = Depends(require_worker)):
    return worker_view(await _worker_obra(obra_id, user), await _worker_names())


class FotoIn(BaseModel):
    fase: Literal["antes", "durante", "despues"]
    path: str = Field(min_length=3, max_length=300)


@api.post("/trabajador/obras/{obra_id}/fotos")
async def trabajador_foto(obra_id: str, body: FotoIn, user: UserDoc = Depends(require_worker)):
    o = await _worker_obra(obra_id, user)
    if not await db.files.find_one({"path": body.path, "is_deleted": False}):
        raise HTTPException(status_code=400, detail="La foto no existe")
    getattr(o.fotos, body.fase).append(body.path)
    await save_doc("projects", o)
    return worker_view(o, await _worker_names())


class AvanceIn(BaseModel):
    porcentaje_avance: int = Field(ge=0, le=100)


@api.patch("/trabajador/obras/{obra_id}/avance")
async def trabajador_avance(obra_id: str, body: AvanceIn, user: UserDoc = Depends(require_worker)):
    o = await _worker_obra(obra_id, user)
    o.porcentaje_avance = body.porcentaje_avance
    if o.estado == "planificada" and body.porcentaje_avance > 0:
        o.estado = "en_curso"
    await save_doc("projects", o)
    return worker_view(o, await _worker_names())


# ---------------------------------------------------------------- hardware store role
require_store = require_roles("ferreteria")


async def _my_store(user: UserDoc) -> Ferreteria:
    return await get_doc("hardware_stores", Ferreteria, user.entity_id)


class StorePatch(BaseModel):
    telefono: Optional[str] = Field(default=None, max_length=20)
    horario: Optional[str] = Field(default=None, max_length=120)
    descripcion: Optional[str] = Field(default=None, max_length=600)
    productos_destacados: Optional[List[str]] = Field(default=None, max_length=20)
    imagen: Optional[str] = Field(default=None, max_length=300)


class AnuncioIn(BaseModel):
    titulo: str = Field(min_length=3, max_length=100)
    descripcion: str = Field(default="", max_length=500)
    descuento: str = Field(default="", max_length=40)
    fecha_fin: Optional[str] = Field(default=None, pattern=r"^\d{4}-\d{2}-\d{2}$")
    imagen: Optional[str] = Field(default=None, max_length=300)


class AnuncioPatch(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=3, max_length=100)
    descripcion: Optional[str] = Field(default=None, max_length=500)
    descuento: Optional[str] = Field(default=None, max_length=40)
    fecha_fin: Optional[str] = Field(default=None, pattern=r"^(\d{4}-\d{2}-\d{2})?$")
    activo: Optional[bool] = None
    imagen: Optional[str] = Field(default=None, max_length=300)


@api.get("/ferreteria/me")
async def ferreteria_me(user: UserDoc = Depends(require_store)):
    return (await _my_store(user)).out()


@api.patch("/ferreteria/me")
async def ferreteria_update(body: StorePatch, user: UserDoc = Depends(require_store)):
    f = await _my_store(user)
    for k, v in body.model_dump(exclude_none=True).items():
        if k == "productos_destacados":
            v = [p.strip() for p in v if p.strip()]
        elif k == "imagen":
            v = v or None
        setattr(f, k, v)
    await save_doc("hardware_stores", f)
    return f.out()


@api.post("/ferreteria/me/anuncios", status_code=201)
async def ferreteria_anuncio(body: AnuncioIn, user: UserDoc = Depends(require_store)):
    f = await _my_store(user)
    f.anuncios.insert(0, Anuncio(**body.model_dump()))
    await save_doc("hardware_stores", f)
    return f.out()


@api.patch("/ferreteria/me/anuncios/{anuncio_id}")
async def ferreteria_anuncio_update(anuncio_id: str, body: AnuncioPatch, user: UserDoc = Depends(require_store)):
    f = await _my_store(user)
    anuncio = next((a for a in f.anuncios if a.id == anuncio_id), None)
    if not anuncio:
        raise HTTPException(status_code=404, detail="Anuncio no encontrado")
    for k, v in body.model_dump(exclude_none=True).items():
        # empty string clears optional fields (no end date / no image)
        setattr(anuncio, k, (v or None) if k in ("fecha_fin", "imagen") else v)
    await save_doc("hardware_stores", f)
    return f.out()


@api.delete("/ferreteria/me/anuncios/{anuncio_id}")
async def ferreteria_anuncio_delete(anuncio_id: str, user: UserDoc = Depends(require_store)):
    f = await _my_store(user)
    f.anuncios = [a for a in f.anuncios if a.id != anuncio_id]
    await save_doc("hardware_stores", f)
    return f.out()


# ---------------------------------------------------------------- wiring
app.include_router(api)
app.include_router(account_router)
app.include_router(admin_router)
app.include_router(export_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=False,
    allow_origins=["*"],
    allow_methods=["*"],
    allow_headers=["*"],
    expose_headers=["X-Auth-Error"],
)


@app.on_event("startup")
async def startup():
    app.state.index_task = asyncio.create_task(ensure_indexes())
    try:
        await seed_if_needed()
    except Exception as e:
        logger.error("seed failed: %s", e)
    try:
        await run_in_threadpool(init_storage)
        logger.info("Object storage initialised")
    except Exception as e:
        logger.error("Storage init failed: %s", e)


@app.on_event("shutdown")
async def shutdown():
    app.state.index_task.cancel()
    with suppress(asyncio.CancelledError):
        await app.state.index_task
    mongo_client.close()
