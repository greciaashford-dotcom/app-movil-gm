"""Shared core for GM Conecta: database, document models and auth helpers."""
import hashlib
import ipaddress
import logging
import os
import re
import secrets
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, List, Literal, NamedTuple, Optional
from zoneinfo import ZoneInfo

import jwt
from bson import ObjectId
from bson.errors import InvalidId
from dotenv import load_dotenv
from fastapi import Depends, HTTPException, Request
from fastapi.security import HTTPAuthorizationCredentials, HTTPBearer
from motor.motor_asyncio import AsyncIOMotorClient
from pwdlib import PasswordHash
from pydantic import BaseModel, BeforeValidator, ConfigDict, Field, model_validator
from pymongo import ReturnDocument

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

logger = logging.getLogger("gmconecta")

mongo_client = AsyncIOMotorClient(os.environ["MONGO_URL"])
db = mongo_client[os.environ["DB_NAME"]]
COMPANY_ID = os.environ["COMPANY_ID"]
JWT_SECRET = os.environ["JWT_SECRET"]
JWT_MINUTES = int(os.environ["JWT_MINUTES"])
ALGORITHM = "HS256"
TZ = ZoneInfo("Europe/Madrid")


# ---------------------------------------------------------------- helpers
def now_utc() -> datetime:
    return datetime.now(timezone.utc)


def now_iso() -> str:
    return now_utc().isoformat()


def today_local() -> date:
    return datetime.now(TZ).date()


def today_str() -> str:
    return today_local().isoformat()


def new_sub_id() -> str:
    return secrets.token_hex(6)


def to_oid(value: str) -> ObjectId:
    try:
        return ObjectId(value)
    except (InvalidId, TypeError):
        raise HTTPException(status_code=404, detail="No encontrado")


def money(value: float) -> float:
    return round(float(value) + 1e-9, 2)


def norm_phone(phone: str) -> str:
    digits = "".join(ch for ch in (phone or "") if ch.isdigit())
    if len(digits) == 11 and digits.startswith("34"):
        digits = digits[2:]
    return digits


def month_bounds(d: date) -> tuple[str, str]:
    start = d.replace(day=1)
    nxt = (start + timedelta(days=32)).replace(day=1)
    return start.isoformat(), (nxt - timedelta(days=1)).isoformat()


def scoped(query: Optional[dict] = None) -> dict:
    return {"companyId": COMPANY_ID, **(query or {})}


PyObjectId = Annotated[str, BeforeValidator(lambda v: str(v) if isinstance(v, ObjectId) else v)]


class BaseDocument(BaseModel):
    model_config = ConfigDict(populate_by_name=True, extra="ignore")
    id: Optional[PyObjectId] = Field(default=None, alias="_id")
    companyId: str = COMPANY_ID

    @classmethod
    def from_mongo(cls, doc):
        return cls.model_validate(doc) if doc else None

    def to_mongo(self) -> dict:
        data = self.model_dump(exclude={"id"})
        if self.id:
            data["_id"] = ObjectId(self.id)
        return data

    def out(self, exclude: Optional[set] = None) -> dict:
        return self.model_dump(exclude=exclude)


# ---------------------------------------------------------------- models
EstadoSolicitud = Literal["pendiente", "en_revision", "presupuestado", "en_obra", "finalizado"]


class Solicitud(BaseDocument):
    numero_solicitud: str
    fecha_creacion: str
    servicio: str
    es_urgencia: bool = False
    direccion: str
    estado: EstadoSolicitud = "pendiente"
    nombre_cliente: str
    telefono_cliente: str
    telefono_norm: str = ""
    correo_cliente: str
    descripcion: str
    fotografias: List[str] = Field(default_factory=list)
    idempotency_key: str
    cliente_id: Optional[str] = None
    cuenta_id: Optional[str] = None
    descuento_bienvenida: float = 0  # % for the first request of a new account
    presupuesto_id: Optional[str] = None
    obra_id: Optional[str] = None


class Cliente(BaseDocument):
    nombre: str
    telefono: str
    telefono_norm: str = ""
    correo: str = ""
    direcciones: List[str] = Field(default_factory=list)
    solicitudes: List[str] = Field(default_factory=list)
    presupuestos: List[str] = Field(default_factory=list)
    obras: List[str] = Field(default_factory=list)
    notas: str = ""
    fecha_alta: str = Field(default_factory=now_iso)


class LineaPresupuesto(BaseModel):
    id: str = Field(default_factory=new_sub_id)
    tipo: Literal["MATERIAL", "MANO_OBRA"]
    concepto: str
    cantidad: float
    precio_unitario: float
    subtotal: float = 0


class Presupuesto(BaseDocument):
    numero_presupuesto: str
    solicitud_id: Optional[str] = None
    cliente_id: Optional[str] = None
    cliente_nombre: str
    cliente_telefono: str = ""
    cliente_correo: str = ""
    direccion: str = ""
    servicio: str = ""
    titulo: str
    lineas: List[LineaPresupuesto] = Field(default_factory=list)
    iva_porcentaje: float = 21
    importe_lineas: float = 0
    descuento_porcentaje: float = 0
    descuento_importe: float = 0
    base_imponible: float = 0
    iva_importe: float = 0
    total: float = 0
    estado: Literal["pendiente", "aceptado", "rechazado"] = "pendiente"
    notas: str = ""
    fecha_creacion: str = Field(default_factory=now_iso)
    fecha_envio: Optional[str] = None
    fecha_respuesta: Optional[str] = None
    obra_id: Optional[str] = None

    def recalcular(self) -> None:
        for linea in self.lineas:
            linea.subtotal = money(linea.cantidad * linea.precio_unitario)
        self.importe_lineas = money(sum(l.subtotal for l in self.lineas))
        self.descuento_importe = money(self.importe_lineas * self.descuento_porcentaje / 100)
        self.base_imponible = money(self.importe_lineas - self.descuento_importe)
        self.iva_importe = money(self.base_imponible * self.iva_porcentaje / 100)
        self.total = money(self.base_imponible + self.iva_importe)


class Material(BaseModel):
    id: str = Field(default_factory=new_sub_id)
    concepto: str
    cantidad: float = 1
    unidad: str = "ud"
    precio_previsto: float = 0
    precio_real: Optional[float] = None
    comprado: bool = False
    proveedor: str = ""
    ticket_foto: Optional[str] = None
    transaccion_id: Optional[str] = None


class ManoObra(BaseModel):
    id: str = Field(default_factory=new_sub_id)
    trabajador_id: Optional[str] = None
    trabajador_nombre: str = ""
    concepto: str
    horas: float = 0
    coste_hora: float = 0
    coste: float = 0
    fecha: str = Field(default_factory=today_str)
    transaccion_id: Optional[str] = None


class FotosObra(BaseModel):
    antes: List[str] = Field(default_factory=list)
    durante: List[str] = Field(default_factory=list)
    despues: List[str] = Field(default_factory=list)


class Obra(BaseDocument):
    numero_obra: str
    titulo: str
    cliente_id: Optional[str] = None
    cliente_nombre: str = ""
    cliente_telefono: str = ""
    presupuesto_id: Optional[str] = None
    solicitud_id: Optional[str] = None
    direccion: str
    fecha_inicio: str
    fecha_fin_prevista: str
    fecha_fin_real: Optional[str] = None
    estado: Literal["planificada", "en_curso", "pausada", "finalizada"] = "planificada"
    porcentaje_avance: int = 0
    trabajadores_asignados: List[str] = Field(default_factory=list)
    fotos: FotosObra = Field(default_factory=FotosObra)
    materiales: List[Material] = Field(default_factory=list)
    mano_obra: List[ManoObra] = Field(default_factory=list)
    presupuesto_previsto: float = 0
    ingresos_totales: float = 0
    coste_materiales_real: float = 0
    coste_mano_obra_real: float = 0
    beneficio_neto: float = 0
    notas: str = ""
    avisos_enviados: List[str] = Field(default_factory=list)  # client emails already sent (one-time events)
    fecha_creacion: str = Field(default_factory=now_iso)

    def recalcular(self) -> None:
        self.coste_materiales_real = money(
            sum(m.cantidad * m.precio_real for m in self.materiales if m.comprado and m.precio_real is not None)
        )
        self.coste_mano_obra_real = money(sum(l.coste for l in self.mano_obra))
        self.ingresos_totales = money(self.presupuesto_previsto)
        self.beneficio_neto = money(self.ingresos_totales - self.coste_materiales_real - self.coste_mano_obra_real)


class Trabajador(BaseDocument):
    codigo: str
    nombre: str
    especialidad: str
    telefono: str
    disponibilidad: Literal["disponible", "ocupado", "vacaciones"] = "disponible"
    coste_hora_o_servicio: float = 0
    tipo_coste: Literal["hora", "servicio"] = "hora"
    obras_asignadas: List[str] = Field(default_factory=list)
    activo: bool = True


class MovimientoFinanciero(BaseDocument):
    tipo: Literal["INGRESO", "GASTO"]
    ambito: Literal["EMPRESA", "PERSONAL_HOGAR"]
    categoria: str
    concepto: str
    importe: float  # base imponible
    iva: float = 0  # porcentaje
    iva_importe: float = 0
    total: float = 0
    fecha: str
    obra_id: Optional[str] = None
    foto_ticket_factura: Optional[str] = None
    numero_factura: Optional[str] = None
    contraparte: str = ""
    origen: str = "manual"
    fecha_registro: str = Field(default_factory=now_iso)

    @model_validator(mode="after")
    def _separacion_contable(self):
        # Regla contable estricta: lo personal/hogar nunca se imputa a una obra.
        if self.ambito == "PERSONAL_HOGAR" and self.obra_id:
            raise ValueError("Un movimiento PERSONAL_HOGAR no puede asociarse a una obra")
        return self

    def recalcular(self) -> None:
        self.importe = money(self.importe)
        self.iva_importe = money(self.importe * self.iva / 100)
        self.total = money(self.importe + self.iva_importe)


class Anuncio(BaseModel):
    id: str = Field(default_factory=new_sub_id)
    titulo: str
    descripcion: str = ""
    descuento: str = ""
    fecha_inicio: str = Field(default_factory=today_str)
    fecha_fin: Optional[str] = None
    activo: bool = True
    imagen: Optional[str] = None


class Derivacion(BaseModel):
    id: str = Field(default_factory=new_sub_id)
    fecha: str = Field(default_factory=today_str)
    cliente_nombre: str
    descripcion: str = ""
    obra_id: Optional[str] = None
    importe_compra: float = 0
    comision: float = 0
    estado: Literal["pendiente", "cobrada"] = "pendiente"
    transaccion_id: Optional[str] = None


class Ferreteria(BaseDocument):
    codigo: str
    nombre: str
    direccion: str
    barrio: str = ""
    telefono: str = ""
    horario: str = ""
    descripcion: str = ""
    imagen: Optional[str] = None
    valoracion: float = 4.5
    productos_destacados: List[str] = Field(default_factory=list)
    anuncios: List[Anuncio] = Field(default_factory=list)
    porcentaje_comision: float = 5
    tarifa_publicidad_mensual: float = 0
    derivaciones: List[Derivacion] = Field(default_factory=list)
    activa: bool = True


class Mensaje(BaseDocument):
    canal: str = "email"
    tipo: str
    solicitud_id: Optional[str] = None
    presupuesto_id: Optional[str] = None
    cliente_id: Optional[str] = None
    destinatario: str = ""
    asunto: str
    cuerpo: str
    estado: str
    proveedor_id: Optional[str] = None
    error: Optional[str] = None
    fecha: str = Field(default_factory=now_iso)


class Recordatorio(BaseDocument):
    titulo: str
    descripcion: str = ""
    fecha: str
    hora: Optional[str] = None
    tipo: Literal["visita", "obra", "factura", "cobro", "pago"] = "visita"
    ambito: Literal["EMPRESA", "PERSONAL_HOGAR"] = "EMPRESA"
    importe: Optional[float] = None
    obra_id: Optional[str] = None
    completado: bool = False


class UserDoc(BaseDocument):
    role: Literal["admin", "trabajador", "ferreteria"]
    code: str
    pin_hash: str
    display_name: str
    entity_id: Optional[str] = None
    active: bool = True
    account_id: Optional[str] = None  # app account allowed to use this staff profile (linked on first PIN login)
    account_email: str = ""
    pin_version: int = 1  # 2 = 6-digit PIN policy
    pin_reset_required: bool = False


class Cuenta(BaseDocument):
    """App account (email + password and/or Google). Everybody signs in with one before using the app."""
    account_id: str
    email: str
    nombre: str
    password_hash: Optional[str] = None
    proveedores: List[str] = Field(default_factory=list)
    foto: str = ""
    fecha_alta: str = Field(default_factory=now_iso)
    active: bool = True
    bienvenida_pendiente: bool = True

    def public(self) -> dict:
        return {
            "account_id": self.account_id,
            "email": self.email,
            "nombre": self.nombre,
            "foto": self.foto,
            "proveedores": self.proveedores,
            "tiene_password": bool(self.password_hash),
            "bienvenida_pendiente": self.bienvenida_pendiente,
        }


class FileDoc(BaseDocument):
    path: str
    owner: str
    content_type: str
    size: int
    public: bool = False
    is_deleted: bool = False
    created_at: str = Field(default_factory=now_iso)


class CompanySettings(BaseModel):
    model_config = ConfigDict(extra="ignore")
    nombre_comercial: str = "GM Conecta"
    razon_social: str = "GM Reforma Express"
    cif: str = ""
    direccion_fiscal: str = "Madrid"
    telefono: str = "640677948"
    whatsapp: str = "34640677948"
    email_contacto: str = ""
    admin_email: str = ""
    iva_defecto: float = 21
    email_simulacion: bool = False
    descuento_bienvenida: float = 5  # % off the first quote of every new account (0 = off)
    avisos_cliente: bool = True  # email the client when their job is scheduled / progresses / finishes
    saldo_inicial_empresa: float = 0
    saldo_inicial_hogar: float = 0


# ---------------------------------------------------------------- data access
async def insert_doc(collection: str, model: BaseDocument):
    res = await db[collection].insert_one(model.to_mongo())
    model.id = str(res.inserted_id)
    return model


async def get_doc(collection: str, model_cls, doc_id: str):
    doc = await db[collection].find_one(scoped({"_id": to_oid(doc_id)}))
    if not doc:
        raise HTTPException(status_code=404, detail="No encontrado")
    return model_cls.from_mongo(doc)


async def find_docs(collection: str, model_cls, query: Optional[dict] = None, sort=None, limit: int = 500):
    cursor = db[collection].find(scoped(query))
    if sort:
        cursor = cursor.sort(sort)
    docs = await cursor.limit(limit).to_list(limit)
    return [model_cls.from_mongo(d) for d in docs]


async def save_doc(collection: str, model: BaseDocument):
    await db[collection].replace_one({"_id": ObjectId(model.id)}, model.to_mongo())
    return model


async def next_seq(name: str) -> int:
    doc = await db.counters.find_one_and_update(
        {"_id": f"{COMPANY_ID}:{name}"}, {"$inc": {"seq": 1}}, upsert=True, return_document=ReturnDocument.AFTER
    )
    return int(doc["seq"])


async def get_settings() -> CompanySettings:
    doc = await db.settings.find_one({"_id": COMPANY_ID})
    return CompanySettings.model_validate(doc or {})


# ---------------------------------------------------------------- auth
hasher = PasswordHash.recommended()
DUMMY_HASH = hasher.hash("pin-no-valido")
bearer = HTTPBearer(auto_error=False)
MAX_FAILURES = 5  # per IP (or per signed-in account) + role + code
MAX_ACCOUNT_FAILURES = 15  # per email for email login, whatever the IP (X-Forwarded-For can be spoofed)
MAX_PROFILE_FAILURES = 100  # global brute-force ceiling per staff profile; high so other accounts cannot lock it out
MAX_EMAIL_FAILURES = 50  # global ceiling per email for email login
WINDOW_SECONDS = 15 * 60
ACCOUNT_HEADER = "x-account-token"
ACCOUNT_SESSION_DAYS = 60


def auth_error(detail: str, kind: Literal["account", "staff"]) -> HTTPException:
    """401 tagged with the session that failed, so the app knows whether to sign out or just leave the staff mode."""
    return HTTPException(status_code=401, detail=detail, headers={"X-Auth-Error": kind})


# Cloudflare edge ranges (https://www.cloudflare.com/ips/): they sit in front of the app and add hops to X-Forwarded-For.
PROXY_NETWORKS = [ipaddress.ip_network(n) for n in (
    "173.245.48.0/20", "103.21.244.0/22", "103.22.200.0/22", "103.31.4.0/22", "141.101.64.0/18", "108.162.192.0/18",
    "190.93.240.0/20", "188.114.96.0/20", "197.234.240.0/22", "198.41.128.0/17", "162.158.0.0/15", "104.16.0.0/13",
    "104.24.0.0/14", "172.64.0.0/13", "131.0.72.0/22", "2400:cb00::/32", "2606:4700::/32", "2803:f800::/32",
    "2405:b500::/32", "2405:8100::/32", "2a06:98c0::/29", "2c0f:f248::/32",
)]


def _is_proxy(ip: str) -> bool:
    try:
        addr = ipaddress.ip_address(ip)
    except ValueError:
        return False
    return addr.is_private or addr.is_loopback or any(addr in n for n in PROXY_NETWORKS)


def client_ip(request: Request) -> str:
    """Real client address. The left part of X-Forwarded-For is written by the client (spoofable),
    so read it from the right: drop the Google load balancer's own address and the proxy hops."""
    hops = [h.strip() for h in request.headers.get("x-forwarded-for", "").split(",") if h.strip()]
    if len(hops) > 1 and "google" in request.headers.get("via", "").lower():
        hops.pop()  # the Google load balancer appends "<client>, <its own address>"
    while len(hops) > 1 and _is_proxy(hops[-1]):
        hops.pop()
    return hops[-1] if hops else (request.client.host if request.client else "unknown")


def _aware(dt: datetime) -> datetime:
    return dt.replace(tzinfo=timezone.utc) if dt.tzinfo is None else dt


# ------------------------------------------------ PIN policy (6 digits, not trivial)
COMMON_PINS = {
    "123456", "654321", "123123", "321321", "112233", "111222", "123321", "696969", "159753", "147258",
    "258369", "789456", "456789", "987654", "012345", "543210", "102030", "101010", "202020", "000123",
}


def check_pin(pin: str) -> None:
    if not re.fullmatch(r"\d{6}", pin or ""):
        raise HTTPException(status_code=422, detail="El PIN debe tener exactamente 6 cifras")
    if len(set(pin)) < 3:
        raise HTTPException(status_code=422, detail="PIN demasiado fácil: usa al menos 3 cifras distintas")
    if len({(int(pin[i + 1]) - int(pin[i])) % 10 for i in range(5)}) == 1:
        raise HTTPException(status_code=422, detail="El PIN no puede ser una secuencia (123456, 987654…)")
    if pin in COMMON_PINS or pin[:3] == pin[3:]:
        raise HTTPException(status_code=422, detail="Ese PIN es demasiado común. Elige otro")


# ------------------------------------------------ app accounts
class AccountSession(NamedTuple):
    cuenta: Cuenta
    sid: str


def token_hash(token: str) -> str:
    return hashlib.sha256(token.encode()).hexdigest()


async def create_account_session(cuenta: Cuenta) -> str:
    token = secrets.token_urlsafe(32)
    t = now_utc()
    await db.account_sessions.insert_one({
        "token_hash": token_hash(token),
        "sid": secrets.token_hex(12),
        "account_id": cuenta.account_id,
        "created_at": t,
        "expires_at": t + timedelta(days=ACCOUNT_SESSION_DAYS),
    })
    return token


async def resolve_account(token: str) -> AccountSession:
    sess = await db.account_sessions.find_one({"token_hash": token_hash(token)})
    if not sess or _aware(sess["expires_at"]) <= now_utc():
        raise auth_error("Tu sesión ha caducado. Vuelve a iniciar sesión.", "account")
    doc = await db.accounts.find_one({"account_id": sess["account_id"], "active": True})
    if not doc:
        raise auth_error("Tu sesión ha caducado. Vuelve a iniciar sesión.", "account")
    return AccountSession(Cuenta.from_mongo(doc), sess["sid"])


async def current_account(request: Request) -> AccountSession:
    token = request.headers.get(ACCOUNT_HEADER, "").strip()
    if not token:
        raise auth_error("Inicia sesión para continuar", "account")
    return await resolve_account(token)


async def optional_account(request: Request) -> Optional[AccountSession]:
    token = request.headers.get(ACCOUNT_HEADER, "").strip()
    if not token:
        return None
    try:
        return await resolve_account(token)
    except HTTPException:
        return None


# ------------------------------------------------ staff sessions (account + PIN)
def make_token(user: UserDoc, sid: str) -> str:
    t = now_utc()
    payload = {
        "sub": user.id,
        "role": user.role,
        "code": user.code,
        "sid": sid,  # account session that unlocked this staff mode
        "iat": t,
        "exp": t + timedelta(minutes=JWT_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


async def resolve_token(token: str) -> UserDoc:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        doc = await db.users.find_one({"_id": ObjectId(payload["sub"]), "active": True})
        sid = payload["sid"]
    except Exception:
        raise auth_error("Sesión no válida o caducada", "staff")
    if not doc:
        raise auth_error("Sesión no válida o caducada", "staff")
    sess = await db.account_sessions.find_one({"sid": sid})
    user = UserDoc.from_mongo(doc)
    # Signing out of the account, or the admin unlinking the profile, ends the staff mode at once.
    if not sess or _aware(sess["expires_at"]) <= now_utc() or user.account_id != sess["account_id"]:
        raise auth_error("Sesión no válida o caducada", "staff")
    return user


async def current_user(creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)) -> UserDoc:
    if not creds or creds.scheme.lower() != "bearer":
        raise HTTPException(status_code=401, detail="No autenticado")
    return await resolve_token(creds.credentials)


async def optional_user(
    request: Request, creds: Optional[HTTPAuthorizationCredentials] = Depends(bearer)
) -> Optional[UserDoc]:
    """Header token, or ?t= query token (needed for <img> on web and CSV links)."""
    token = creds.credentials if creds else request.query_params.get("t")
    if not token:
        return None
    try:
        return await resolve_token(token)
    except HTTPException:
        return None


def require_roles(*roles: str):
    async def dependency(user: UserDoc = Depends(current_user)) -> UserDoc:
        if user.role not in roles:
            raise HTTPException(status_code=403, detail="No tienes permiso para esta sección")
        return user

    return dependency


require_admin = require_roles("admin")


async def login_blocked(key: str) -> bool:
    doc = await db.login_limits.find_one({"_id": key})
    if not doc or not doc.get("locked_until"):
        return False
    locked = doc["locked_until"]
    if locked.tzinfo is None:
        locked = locked.replace(tzinfo=timezone.utc)
    return locked > now_utc()


async def record_login_failure(key: str, max_failures: int = MAX_FAILURES) -> None:
    t = now_utc()
    doc = await db.login_limits.find_one_and_update(
        {"_id": key},
        {"$inc": {"failures": 1}, "$setOnInsert": {"started_at": t, "expires_at": t + timedelta(seconds=WINDOW_SECONDS)}},
        upsert=True,
        return_document=ReturnDocument.AFTER,
    )
    if doc and doc.get("failures", 0) >= max_failures:
        await db.login_limits.update_one(
            {"_id": key},
            {"$set": {"locked_until": t + timedelta(seconds=WINDOW_SECONDS), "expires_at": t + timedelta(seconds=WINDOW_SECONDS)}},
        )


async def clear_login_failures(key: str) -> None:
    await db.login_limits.delete_one({"_id": key})


async def upsert_user(role: str, code: str, display_name: str, pin: str, entity_id: Optional[str]) -> None:
    await db.users.update_one(
        {"role": role, "code": code.lower()},
        {
            "$set": {
                "display_name": display_name,
                "entity_id": entity_id,
                "active": True,
                "companyId": COMPANY_ID,
                "pin_hash": hasher.hash(pin),
                "pin_version": 2,
                "pin_reset_required": False,
            }
        },
        upsert=True,
    )
