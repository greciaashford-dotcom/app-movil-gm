"""Shared core for GM Conecta: database, document models and auth helpers."""
import logging
import os
import secrets
from datetime import date, datetime, timedelta, timezone
from pathlib import Path
from typing import Annotated, List, Literal, Optional
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
        self.base_imponible = money(sum(l.subtotal for l in self.lineas))
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
MAX_FAILURES = 5  # per IP + role + code
MAX_ACCOUNT_FAILURES = 15  # per role + code, whatever the IP (X-Forwarded-For can be spoofed)
WINDOW_SECONDS = 15 * 60


def make_token(user: UserDoc) -> str:
    t = now_utc()
    payload = {
        "sub": user.id,
        "role": user.role,
        "code": user.code,
        "iat": t,
        "exp": t + timedelta(minutes=JWT_MINUTES),
    }
    return jwt.encode(payload, JWT_SECRET, algorithm=ALGORITHM)


async def resolve_token(token: str) -> UserDoc:
    try:
        payload = jwt.decode(token, JWT_SECRET, algorithms=[ALGORITHM])
        doc = await db.users.find_one({"_id": ObjectId(payload["sub"]), "active": True})
    except Exception:
        raise HTTPException(status_code=401, detail="Sesión no válida o caducada")
    if not doc:
        raise HTTPException(status_code=401, detail="Sesión no válida o caducada")
    return UserDoc.from_mongo(doc)


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
            }
        },
        upsert=True,
    )
