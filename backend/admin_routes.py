"""Admin (GM Conecta) routes: CRM, quotes, works, workers, finance, agenda, gestoría, stores, settings."""
import csv
import io
import re
from datetime import date, timedelta
from typing import List, Literal, Optional

import jwt
from fastapi import APIRouter, Depends, HTTPException, Query, Response
from pydantic import BaseModel, Field

from core import (
    ALGORITHM, COMPANY_ID, JWT_SECRET, Cliente, Derivacion, Ferreteria, LineaPresupuesto, ManoObra, Material, Mensaje,
    MovimientoFinanciero, Obra, Presupuesto, Recordatorio, Solicitud, Trabajador, UserDoc, db, find_docs, get_doc,
    get_settings, insert_doc, money, month_bounds, next_seq, norm_phone, now_iso, now_utc, optional_user,
    require_admin, save_doc, scoped, to_oid, today_local, today_str, upsert_user,
)
from email_service import EMAIL_KEY, deliver, email_mode, tpl_presupuesto, tpl_prueba, tpl_respuesta

router = APIRouter(prefix="/api", dependencies=[Depends(require_admin)])
export_router = APIRouter(prefix="/api")

MESES = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"]
DATE_RE = r"^\d{4}-\d{2}-\d{2}$"


def sol_out(s: Solicitud) -> dict:
    return s.out(exclude={"idempotency_key", "telefono_norm"})


# ================================================================ dashboard
async def totales(ambito: str, desde: str, hasta: str) -> dict:
    res = {"INGRESO": {"base": 0.0, "total": 0.0, "iva": 0.0}, "GASTO": {"base": 0.0, "total": 0.0, "iva": 0.0}}
    pipeline = [
        {"$match": scoped({"ambito": ambito, "fecha": {"$gte": desde, "$lte": hasta}})},
        {"$group": {"_id": "$tipo", "base": {"$sum": "$importe"}, "total": {"$sum": "$total"}, "iva": {"$sum": "$iva_importe"}}},
    ]
    async for r in db.transactions.aggregate(pipeline):
        res[r["_id"]] = {"base": money(r["base"]), "total": money(r["total"]), "iva": money(r["iva"])}
    return res


@router.get("/admin/dashboard")
async def dashboard():
    desde, hasta = month_bounds(today_local())
    t = await totales("EMPRESA", desde, hasta)
    beneficio = money(t["INGRESO"]["base"] - t["GASTO"]["base"])
    recientes = await find_docs("requests", Solicitud, sort=[("fecha_creacion", -1)], limit=5)
    recordatorios = await find_docs("reminders", Recordatorio, {"completado": False, "fecha": {"$gte": today_str()}}, sort=[("fecha", 1)], limit=5)
    return {
        "kpis": {
            "solicitudes_nuevas": await db.requests.count_documents(scoped({"estado": "pendiente"})),
            "urgencias_activas": await db.requests.count_documents(scoped({"es_urgencia": True, "estado": {"$in": ["pendiente", "en_revision"]}})),
            "presupuestos_enviados": await db.quotes.count_documents(scoped({"estado": "pendiente"})),
            "presupuestos_aceptados": await db.quotes.count_documents(scoped({"estado": "aceptado"})),
            "obras_en_curso": await db.projects.count_documents(scoped({"estado": {"$in": ["en_curso", "planificada", "pausada"]}})),
            "beneficio_mes": beneficio,
            "ingresos_mes": t["INGRESO"]["base"],
            "gastos_mes": t["GASTO"]["base"],
        },
        "recientes": [sol_out(s) for s in recientes],
        "recordatorios": [r.out() for r in recordatorios],
    }


# ================================================================ requests + reply
@router.get("/admin/solicitudes")
async def listar_solicitudes(estado: Optional[str] = None, urgente: Optional[bool] = None, q: Optional[str] = Query(None, max_length=60)):
    query: dict = {}
    if estado:
        query["estado"] = estado
    if urgente is not None:
        query["es_urgencia"] = urgente
    if q:
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"nombre_cliente": rx}, {"numero_solicitud": rx}, {"direccion": rx}, {"servicio": rx}]
    items = await find_docs("requests", Solicitud, query, sort=[("fecha_creacion", -1)])
    return [sol_out(s) for s in items]


@router.get("/admin/solicitudes/{sol_id}")
async def detalle_solicitud(sol_id: str):
    s = await get_doc("requests", Solicitud, sol_id)
    mensajes = await find_docs("messages", Mensaje, {"solicitud_id": s.id}, sort=[("fecha", -1)], limit=50)
    presupuesto = None
    if s.presupuesto_id:
        q = await db.quotes.find_one(scoped({"_id": to_oid(s.presupuesto_id)}))
        if q:
            q = Presupuesto.from_mongo(q)
            presupuesto = {"id": q.id, "numero": q.numero_presupuesto, "total": q.total, "estado": q.estado, "obra_id": q.obra_id}
    return {"solicitud": sol_out(s), "mensajes": [m.out() for m in mensajes], "presupuesto": presupuesto}


class EstadoIn(BaseModel):
    estado: Literal["pendiente", "en_revision", "presupuestado", "en_obra", "finalizado"]


@router.patch("/admin/solicitudes/{sol_id}")
async def cambiar_estado_solicitud(sol_id: str, body: EstadoIn):
    s = await get_doc("requests", Solicitud, sol_id)
    s.estado = body.estado
    await save_doc("requests", s)
    return sol_out(s)


class ResponderIn(BaseModel):
    solicitud_id: str
    mensaje: str = Field(min_length=2, max_length=4000)


@router.post("/responder")
async def responder(body: ResponderIn):
    s = await get_doc("requests", Solicitud, body.solicitud_id)
    recent = await db.messages.count_documents(scoped({"tipo": "respuesta", "fecha": {"$gte": (now_utc() - timedelta(minutes=1)).isoformat()}}))
    if recent >= 15:
        raise HTTPException(status_code=429, detail="Demasiados envíos seguidos. Espera un minuto.")
    settings = await get_settings()
    asunto, html = tpl_respuesta(s.nombre_cliente, body.mensaje.strip(), s.numero_solicitud, settings)
    msg = await deliver(
        tipo="respuesta", destinatario=s.correo_cliente, asunto=asunto, html=html, texto=body.mensaje.strip(),
        reply_to=settings.admin_email, solicitud_id=s.id, cliente_id=s.cliente_id,
    )
    if s.estado == "pendiente":
        s.estado = "en_revision"
        await save_doc("requests", s)
    return msg.out()


# ================================================================ clients
@router.get("/admin/clientes")
async def listar_clientes(q: Optional[str] = Query(None, max_length=60)):
    query: dict = {}
    if q:
        rx = {"$regex": re.escape(q.strip()), "$options": "i"}
        query["$or"] = [{"nombre": rx}, {"telefono": rx}, {"correo": rx}]
    items = await find_docs("clients", Cliente, query, sort=[("nombre", 1)])
    return [c.out(exclude={"telefono_norm"}) for c in items]


@router.get("/admin/clientes/{cli_id}")
async def detalle_cliente(cli_id: str):
    c = await get_doc("clients", Cliente, cli_id)
    sols = await find_docs("requests", Solicitud, {"cliente_id": c.id}, sort=[("fecha_creacion", -1)])
    quotes = await find_docs("quotes", Presupuesto, {"cliente_id": c.id}, sort=[("fecha_creacion", -1)])
    obras = await find_docs("projects", Obra, {"cliente_id": c.id}, sort=[("fecha_inicio", -1)])
    return {
        "cliente": c.out(exclude={"telefono_norm"}),
        "solicitudes": [sol_out(s) for s in sols],
        "presupuestos": [{"id": q.id, "numero": q.numero_presupuesto, "titulo": q.titulo, "total": q.total, "estado": q.estado} for q in quotes],
        "obras": [{"id": o.id, "numero": o.numero_obra, "titulo": o.titulo, "estado": o.estado, "porcentaje_avance": o.porcentaje_avance} for o in obras],
    }


async def ensure_cliente(nombre: str, telefono: str, correo: str, direccion: str) -> Cliente:
    tel = norm_phone(telefono)
    doc = await db.clients.find_one(scoped({"telefono_norm": tel})) if tel else None
    if doc:
        c = Cliente.from_mongo(doc)
        if direccion and direccion not in c.direcciones:
            c.direcciones.append(direccion)
            await save_doc("clients", c)
        return c
    return await insert_doc("clients", Cliente(nombre=nombre, telefono=telefono, telefono_norm=tel, correo=correo or "", direcciones=[direccion] if direccion else []))


# ================================================================ quotes
class LineaIn(BaseModel):
    tipo: Literal["MATERIAL", "MANO_OBRA"]
    concepto: str = Field(min_length=1, max_length=200)
    cantidad: float = Field(gt=0, le=100000)
    precio_unitario: float = Field(ge=0, le=1000000)


class PresupuestoIn(BaseModel):
    solicitud_id: Optional[str] = None
    cliente_nombre: str = Field(min_length=2, max_length=120)
    cliente_telefono: str = Field(default="", max_length=20)
    cliente_correo: str = Field(default="", max_length=120)
    direccion: str = Field(default="", max_length=200)
    servicio: str = Field(default="", max_length=80)
    titulo: str = Field(min_length=3, max_length=150)
    lineas: List[LineaIn] = Field(min_length=1, max_length=60)
    iva_porcentaje: float = Field(default=21, ge=0, le=30)
    notas: str = Field(default="", max_length=2000)


class PresupuestoPatch(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=3, max_length=150)
    lineas: Optional[List[LineaIn]] = Field(default=None, min_length=1, max_length=60)
    iva_porcentaje: Optional[float] = Field(default=None, ge=0, le=30)
    notas: Optional[str] = Field(default=None, max_length=2000)
    estado: Optional[Literal["pendiente", "aceptado", "rechazado"]] = None
    cliente_correo: Optional[str] = Field(default=None, max_length=120)
    direccion: Optional[str] = Field(default=None, max_length=200)


@router.get("/admin/presupuestos")
async def listar_presupuestos(estado: Optional[str] = None):
    items = await find_docs("quotes", Presupuesto, {"estado": estado} if estado else {}, sort=[("fecha_creacion", -1)])
    return [q.out() for q in items]


@router.post("/admin/presupuestos", status_code=201)
async def crear_presupuesto(body: PresupuestoIn):
    sol = await get_doc("requests", Solicitud, body.solicitud_id) if body.solicitud_id else None
    if sol and sol.presupuesto_id:
        raise HTTPException(status_code=409, detail="Esta solicitud ya tiene un presupuesto")
    cliente = await ensure_cliente(body.cliente_nombre, body.cliente_telefono, body.cliente_correo, body.direccion)
    seq = await next_seq("presupuesto")
    q = Presupuesto(
        numero_presupuesto=f"PR-{today_local().year}-{seq:04d}",
        solicitud_id=sol.id if sol else None,
        cliente_id=cliente.id,
        cliente_nombre=body.cliente_nombre,
        cliente_telefono=body.cliente_telefono,
        cliente_correo=body.cliente_correo,
        direccion=body.direccion,
        servicio=body.servicio,
        titulo=body.titulo,
        lineas=[LineaPresupuesto(**l.model_dump()) for l in body.lineas],
        iva_porcentaje=body.iva_porcentaje,
        notas=body.notas,
    )
    q.recalcular()
    await insert_doc("quotes", q)
    await db.clients.update_one({"_id": to_oid(cliente.id)}, {"$addToSet": {"presupuestos": q.id}})
    if sol:
        sol.presupuesto_id = q.id
        sol.estado = "presupuestado"
        await save_doc("requests", sol)
    return q.out()


@router.get("/admin/presupuestos/{q_id}")
async def detalle_presupuesto(q_id: str):
    return (await get_doc("quotes", Presupuesto, q_id)).out()


@router.patch("/admin/presupuestos/{q_id}")
async def editar_presupuesto(q_id: str, body: PresupuestoPatch):
    q = await get_doc("quotes", Presupuesto, q_id)
    data = body.model_dump(exclude_none=True)
    if q.obra_id and ("lineas" in data or data.get("estado") in ("pendiente", "rechazado")):
        raise HTTPException(status_code=409, detail="El presupuesto ya está convertido en obra")
    if "lineas" in data:
        q.lineas = [LineaPresupuesto(**l) for l in data.pop("lineas")]
    if "estado" in data and data["estado"] != q.estado:
        q.fecha_respuesta = now_iso() if data["estado"] != "pendiente" else None
    for k, v in data.items():
        setattr(q, k, v)
    q.recalcular()
    await save_doc("quotes", q)
    return q.out()


@router.post("/admin/presupuestos/{q_id}/enviar")
async def enviar_presupuesto(q_id: str):
    q = await get_doc("quotes", Presupuesto, q_id)
    settings = await get_settings()
    asunto, html, texto = tpl_presupuesto(q, settings)
    msg = await deliver(
        tipo="presupuesto", destinatario=q.cliente_correo, asunto=asunto, html=html, texto=texto,
        reply_to=settings.admin_email, solicitud_id=q.solicitud_id, presupuesto_id=q.id, cliente_id=q.cliente_id,
    )
    q.fecha_envio = now_iso()
    await save_doc("quotes", q)
    return {"presupuesto": q.out(), "mensaje": msg.out()}


class ConvertirIn(BaseModel):
    fecha_inicio: str = Field(pattern=DATE_RE)
    fecha_fin_prevista: str = Field(pattern=DATE_RE)
    trabajadores: List[str] = Field(default_factory=list, max_length=20)


@router.post("/admin/presupuestos/{q_id}/convertir-obra", status_code=201)
async def convertir_en_obra(q_id: str, body: ConvertirIn):
    q = await get_doc("quotes", Presupuesto, q_id)
    if q.estado != "aceptado":
        raise HTTPException(status_code=409, detail="Solo se puede convertir un presupuesto aceptado")
    if q.obra_id:
        raise HTTPException(status_code=409, detail="Este presupuesto ya tiene una obra")
    seq = await next_seq("obra")
    o = Obra(
        numero_obra=f"OB-{today_local().year}-{seq:03d}",
        titulo=q.titulo,
        cliente_id=q.cliente_id,
        cliente_nombre=q.cliente_nombre,
        cliente_telefono=q.cliente_telefono,
        presupuesto_id=q.id,
        solicitud_id=q.solicitud_id,
        direccion=q.direccion or "Madrid",
        fecha_inicio=body.fecha_inicio,
        fecha_fin_prevista=body.fecha_fin_prevista,
        trabajadores_asignados=body.trabajadores,
        materiales=[Material(concepto=l.concepto, cantidad=l.cantidad, precio_previsto=l.precio_unitario) for l in q.lineas if l.tipo == "MATERIAL"],
        presupuesto_previsto=q.base_imponible,
    )
    o.recalcular()
    await insert_doc("projects", o)
    q.obra_id = o.id
    await save_doc("quotes", q)
    for w in body.trabajadores:
        await db.workers.update_one(scoped({"_id": to_oid(w)}), {"$addToSet": {"obras_asignadas": o.id}})
    if q.cliente_id:
        await db.clients.update_one({"_id": to_oid(q.cliente_id)}, {"$addToSet": {"obras": o.id}})
    if q.solicitud_id:
        await db.requests.update_one({"_id": to_oid(q.solicitud_id)}, {"$set": {"estado": "en_obra", "obra_id": o.id}})
    return o.out()


# ================================================================ works
async def obra_detail(o: Obra) -> dict:
    movs = await find_docs("transactions", MovimientoFinanciero, {"obra_id": o.id}, sort=[("fecha", -1)])
    cobros = [m for m in movs if m.tipo == "INGRESO"]
    workers = await find_docs("workers", Trabajador)
    wmap = {w.id: w for w in workers}
    previsto = money(sum(m.cantidad * m.precio_previsto for m in o.materiales))
    data = o.out()
    data.update({
        "coste_materiales_previsto": previsto,
        "coste_total_real": money(o.coste_materiales_real + o.coste_mano_obra_real),
        "margen_pct": round(o.beneficio_neto / o.ingresos_totales * 100, 1) if o.ingresos_totales else 0,
        "cobrado": money(sum(c.importe for c in cobros)),
        "pendiente_cobro": money(o.ingresos_totales - sum(c.importe for c in cobros)),
        "cobros": [c.out() for c in cobros],
        "trabajadores": [
            {"id": wid, "nombre": wmap[wid].nombre, "especialidad": wmap[wid].especialidad, "telefono": wmap[wid].telefono,
             "coste_hora_o_servicio": wmap[wid].coste_hora_o_servicio, "tipo_coste": wmap[wid].tipo_coste}
            for wid in o.trabajadores_asignados if wid in wmap
        ],
    })
    return data


@router.get("/admin/obras")
async def listar_obras(estado: Optional[str] = None):
    items = await find_docs("projects", Obra, {"estado": estado} if estado else {}, sort=[("fecha_inicio", -1)])
    return [o.out(exclude={"materiales", "mano_obra"}) for o in items]


@router.get("/admin/obras/{obra_id}")
async def detalle_obra(obra_id: str):
    return await obra_detail(await get_doc("projects", Obra, obra_id))


class ObraPatch(BaseModel):
    titulo: Optional[str] = Field(default=None, min_length=3, max_length=150)
    direccion: Optional[str] = Field(default=None, max_length=200)
    fecha_inicio: Optional[str] = Field(default=None, pattern=DATE_RE)
    fecha_fin_prevista: Optional[str] = Field(default=None, pattern=DATE_RE)
    estado: Optional[Literal["planificada", "en_curso", "pausada", "finalizada"]] = None
    porcentaje_avance: Optional[int] = Field(default=None, ge=0, le=100)
    trabajadores_asignados: Optional[List[str]] = Field(default=None, max_length=20)
    notas: Optional[str] = Field(default=None, max_length=2000)
    presupuesto_previsto: Optional[float] = Field(default=None, ge=0)


@router.patch("/admin/obras/{obra_id}")
async def editar_obra(obra_id: str, body: ObraPatch):
    o = await get_doc("projects", Obra, obra_id)
    data = body.model_dump(exclude_none=True)
    if "trabajadores_asignados" in data:
        nuevos, antiguos = set(data["trabajadores_asignados"]), set(o.trabajadores_asignados)
        for w in nuevos - antiguos:
            await db.workers.update_one(scoped({"_id": to_oid(w)}), {"$addToSet": {"obras_asignadas": o.id}})
        for w in antiguos - nuevos:
            await db.workers.update_one(scoped({"_id": to_oid(w)}), {"$pull": {"obras_asignadas": o.id}})
    for k, v in data.items():
        setattr(o, k, v)
    if data.get("estado") == "finalizada":
        o.porcentaje_avance = 100
        o.fecha_fin_real = today_str()
        if o.solicitud_id:
            await db.requests.update_one({"_id": to_oid(o.solicitud_id)}, {"$set": {"estado": "finalizado"}})
    elif data.get("estado") == "en_curso" and o.solicitud_id:
        await db.requests.update_one({"_id": to_oid(o.solicitud_id)}, {"$set": {"estado": "en_obra"}})
    o.recalcular()
    await save_doc("projects", o)
    return await obra_detail(o)


class FotoIn(BaseModel):
    fase: Literal["antes", "durante", "despues"]
    path: str = Field(min_length=3, max_length=300)


@router.post("/admin/obras/{obra_id}/fotos")
async def foto_obra(obra_id: str, body: FotoIn):
    o = await get_doc("projects", Obra, obra_id)
    if not body.path.startswith("http") and not await db.files.find_one({"path": body.path, "is_deleted": False}):
        raise HTTPException(status_code=400, detail="La foto no existe")
    getattr(o.fotos, body.fase).append(body.path)
    await save_doc("projects", o)
    return await obra_detail(o)


class MaterialIn(BaseModel):
    concepto: str = Field(min_length=1, max_length=150)
    cantidad: float = Field(gt=0, le=100000)
    unidad: str = Field(default="ud", max_length=12)
    precio_previsto: float = Field(ge=0, le=1000000)


class MaterialPatch(BaseModel):
    precio_real: Optional[float] = Field(default=None, ge=0, le=1000000)
    comprado: Optional[bool] = None
    proveedor: Optional[str] = Field(default=None, max_length=120)
    ticket_foto: Optional[str] = Field(default=None, max_length=300)
    cantidad: Optional[float] = Field(default=None, gt=0, le=100000)


async def _sync_material_tx(o: Obra, m: Material) -> None:
    if m.comprado and m.precio_real is not None:
        tx = MovimientoFinanciero(
            tipo="GASTO", ambito="EMPRESA", categoria="Materiales", concepto=f"Compra: {m.concepto} ({o.numero_obra})",
            importe=m.cantidad * m.precio_real, iva=21, fecha=today_str(), obra_id=o.id,
            foto_ticket_factura=m.ticket_foto, contraparte=m.proveedor, origen="material",
        )
        tx.recalcular()
        if m.transaccion_id:
            existing = await db.transactions.find_one(scoped({"_id": to_oid(m.transaccion_id)}))
            if existing:
                tx.id = m.transaccion_id
                tx.fecha = existing.get("fecha", tx.fecha)
                await save_doc("transactions", tx)
                return
        await insert_doc("transactions", tx)
        m.transaccion_id = tx.id
    elif m.transaccion_id:
        await db.transactions.delete_one(scoped({"_id": to_oid(m.transaccion_id)}))
        m.transaccion_id = None


@router.post("/admin/obras/{obra_id}/materiales", status_code=201)
async def add_material(obra_id: str, body: MaterialIn):
    o = await get_doc("projects", Obra, obra_id)
    o.materiales.append(Material(**body.model_dump()))
    o.recalcular()
    await save_doc("projects", o)
    return await obra_detail(o)


@router.patch("/admin/obras/{obra_id}/materiales/{mat_id}")
async def edit_material(obra_id: str, mat_id: str, body: MaterialPatch):
    o = await get_doc("projects", Obra, obra_id)
    m = next((x for x in o.materiales if x.id == mat_id), None)
    if not m:
        raise HTTPException(status_code=404, detail="Material no encontrado")
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(m, k, v)
    if m.comprado and m.precio_real is None:
        raise HTTPException(status_code=422, detail="Indica el precio real de la compra")
    await _sync_material_tx(o, m)
    o.recalcular()
    await save_doc("projects", o)
    return await obra_detail(o)


@router.delete("/admin/obras/{obra_id}/materiales/{mat_id}")
async def delete_material(obra_id: str, mat_id: str):
    o = await get_doc("projects", Obra, obra_id)
    m = next((x for x in o.materiales if x.id == mat_id), None)
    if m and m.transaccion_id:
        await db.transactions.delete_one(scoped({"_id": to_oid(m.transaccion_id)}))
    o.materiales = [x for x in o.materiales if x.id != mat_id]
    o.recalcular()
    await save_doc("projects", o)
    return await obra_detail(o)


class ManoObraIn(BaseModel):
    trabajador_id: str
    concepto: str = Field(min_length=2, max_length=150)
    horas: float = Field(gt=0, le=2000)
    coste_hora: Optional[float] = Field(default=None, ge=0, le=10000)


@router.post("/admin/obras/{obra_id}/mano-obra", status_code=201)
async def add_mano_obra(obra_id: str, body: ManoObraIn):
    o = await get_doc("projects", Obra, obra_id)
    w = await get_doc("workers", Trabajador, body.trabajador_id)
    rate = body.coste_hora if body.coste_hora is not None else w.coste_hora_o_servicio
    linea = ManoObra(trabajador_id=w.id, trabajador_nombre=w.nombre, concepto=body.concepto, horas=body.horas, coste_hora=rate, coste=money(body.horas * rate))
    tx = MovimientoFinanciero(
        tipo="GASTO", ambito="EMPRESA", categoria="Personal", concepto=f"{w.nombre}: {body.concepto} ({o.numero_obra})",
        importe=linea.coste, iva=0, fecha=today_str(), obra_id=o.id, contraparte=w.nombre, origen="mano_obra",
    )
    tx.recalcular()
    await insert_doc("transactions", tx)
    linea.transaccion_id = tx.id
    o.mano_obra.append(linea)
    o.recalcular()
    await save_doc("projects", o)
    return await obra_detail(o)


@router.delete("/admin/obras/{obra_id}/mano-obra/{linea_id}")
async def delete_mano_obra(obra_id: str, linea_id: str):
    o = await get_doc("projects", Obra, obra_id)
    linea = next((x for x in o.mano_obra if x.id == linea_id), None)
    if linea and linea.transaccion_id:
        await db.transactions.delete_one(scoped({"_id": to_oid(linea.transaccion_id)}))
    o.mano_obra = [x for x in o.mano_obra if x.id != linea_id]
    o.recalcular()
    await save_doc("projects", o)
    return await obra_detail(o)


class CobroIn(BaseModel):
    importe: float = Field(gt=0, le=10000000)
    iva: float = Field(default=21, ge=0, le=30)
    concepto: str = Field(default="Cobro de obra", min_length=2, max_length=150)
    fecha: Optional[str] = Field(default=None, pattern=DATE_RE)


async def next_factura() -> str:
    return f"F-{today_local().year}-{await next_seq('factura'):04d}"


@router.post("/admin/obras/{obra_id}/cobros", status_code=201)
async def add_cobro(obra_id: str, body: CobroIn):
    o = await get_doc("projects", Obra, obra_id)
    tx = MovimientoFinanciero(
        tipo="INGRESO", ambito="EMPRESA", categoria="Ingresos por obra", concepto=f"{body.concepto} ({o.numero_obra})",
        importe=body.importe, iva=body.iva, fecha=body.fecha or today_str(), obra_id=o.id,
        numero_factura=await next_factura(), contraparte=o.cliente_nombre, origen="cobro",
    )
    tx.recalcular()
    await insert_doc("transactions", tx)
    return await obra_detail(o)


# ================================================================ workers
class TrabajadorIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=100)
    especialidad: str = Field(min_length=2, max_length=60)
    telefono: str = Field(min_length=9, max_length=20)
    disponibilidad: Literal["disponible", "ocupado", "vacaciones"] = "disponible"
    coste_hora_o_servicio: float = Field(ge=0, le=10000)
    tipo_coste: Literal["hora", "servicio"] = "hora"
    pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")


class TrabajadorPatch(BaseModel):
    nombre: Optional[str] = Field(default=None, min_length=2, max_length=100)
    especialidad: Optional[str] = Field(default=None, min_length=2, max_length=60)
    telefono: Optional[str] = Field(default=None, min_length=9, max_length=20)
    disponibilidad: Optional[Literal["disponible", "ocupado", "vacaciones"]] = None
    coste_hora_o_servicio: Optional[float] = Field(default=None, ge=0, le=10000)
    tipo_coste: Optional[Literal["hora", "servicio"]] = None
    pin: Optional[str] = Field(default=None, min_length=4, max_length=8, pattern=r"^\d+$")


async def worker_out(w: Trabajador) -> dict:
    data = w.out()
    data["obras_activas"] = await db.projects.count_documents(scoped({"trabajadores_asignados": w.id, "estado": {"$ne": "finalizada"}}))
    return data


@router.get("/admin/trabajadores")
async def listar_trabajadores():
    return [await worker_out(w) for w in await find_docs("workers", Trabajador, {"activo": True}, sort=[("nombre", 1)])]


@router.post("/admin/trabajadores", status_code=201)
async def crear_trabajador(body: TrabajadorIn):
    seq = await next_seq("trabajador")
    w = Trabajador(codigo=f"TR{seq:02d}", **body.model_dump(exclude={"pin"}))
    await insert_doc("workers", w)
    await upsert_user("trabajador", w.codigo, w.nombre, body.pin, w.id)
    return await worker_out(w)


@router.patch("/admin/trabajadores/{w_id}")
async def editar_trabajador(w_id: str, body: TrabajadorPatch):
    w = await get_doc("workers", Trabajador, w_id)
    data = body.model_dump(exclude_none=True)
    pin = data.pop("pin", None)
    for k, v in data.items():
        setattr(w, k, v)
    await save_doc("workers", w)
    if pin:
        await upsert_user("trabajador", w.codigo, w.nombre, pin, w.id)
    return await worker_out(w)


# ================================================================ finance
class MovimientoIn(BaseModel):
    tipo: Literal["INGRESO", "GASTO"]
    ambito: Literal["EMPRESA", "PERSONAL_HOGAR"]
    categoria: str = Field(min_length=2, max_length=60)
    concepto: str = Field(min_length=2, max_length=150)
    importe: float = Field(gt=0, le=10000000)
    iva: float = Field(default=0, ge=0, le=30)
    fecha: str = Field(pattern=DATE_RE)
    obra_id: Optional[str] = None
    foto_ticket_factura: Optional[str] = Field(default=None, max_length=300)
    contraparte: str = Field(default="", max_length=120)
    numero_factura: Optional[str] = Field(default=None, max_length=40)


@router.get("/admin/movimientos")
async def listar_movimientos(
    ambito: Optional[Literal["EMPRESA", "PERSONAL_HOGAR"]] = None, tipo: Optional[Literal["INGRESO", "GASTO"]] = None,
    desde: Optional[str] = None, hasta: Optional[str] = None, limit: int = Query(100, ge=1, le=500),
):
    query: dict = {}
    if ambito:
        query["ambito"] = ambito
    if tipo:
        query["tipo"] = tipo
    if desde or hasta:
        query["fecha"] = {k: v for k, v in (("$gte", desde), ("$lte", hasta)) if v}
    items = await find_docs("transactions", MovimientoFinanciero, query, sort=[("fecha", -1), ("fecha_registro", -1)], limit=limit)
    return [m.out() for m in items]


@router.post("/admin/movimientos", status_code=201)
async def crear_movimiento(body: MovimientoIn):
    if body.ambito == "PERSONAL_HOGAR" and body.obra_id:
        raise HTTPException(status_code=422, detail="Los gastos del hogar no pueden asociarse a una obra")
    data = body.model_dump()
    if body.ambito == "EMPRESA" and body.tipo == "INGRESO" and not body.numero_factura:
        data["numero_factura"] = await next_factura()
    if body.obra_id:
        await get_doc("projects", Obra, body.obra_id)
    m = MovimientoFinanciero(**data)
    m.recalcular()
    await insert_doc("transactions", m)
    return m.out()


@router.delete("/admin/movimientos/{mov_id}")
async def borrar_movimiento(mov_id: str):
    m = await get_doc("transactions", MovimientoFinanciero, mov_id)
    if m.origen in ("material", "mano_obra"):
        raise HTTPException(status_code=409, detail="Este gasto está vinculado a una obra; elimínalo desde la ficha de la obra")
    if m.tipo == "INGRESO" and m.numero_factura:
        raise HTTPException(status_code=409, detail=f"La factura {m.numero_factura} ya está emitida y no se puede borrar (la numeración debe ser correlativa). Registra una factura rectificativa.")
    await db.transactions.delete_one(scoped({"_id": to_oid(mov_id)}))
    return {"ok": True}


def build_buckets(periodo: str, today: date) -> list[tuple[str, date, date]]:
    buckets = []
    if periodo == "diario":
        for i in range(13, -1, -1):
            d = today - timedelta(days=i)
            buckets.append((f"{d.day}/{d.month}", d, d))
    elif periodo == "semanal":
        monday = today - timedelta(days=today.weekday())
        for i in range(7, -1, -1):
            s = monday - timedelta(weeks=i)
            buckets.append((f"S{s.isocalendar()[1]}", s, s + timedelta(days=6)))
    elif periodo == "anual":
        for i in range(3, -1, -1):
            y = today.year - i
            buckets.append((str(y), date(y, 1, 1), date(y, 12, 31)))
    else:
        for i in range(5, -1, -1):
            m, y = today.month - i, today.year
            while m <= 0:
                m += 12
                y -= 1
            start = date(y, m, 1)
            end = (start + timedelta(days=32)).replace(day=1) - timedelta(days=1)
            buckets.append((MESES[m - 1], start, end))
    return buckets


@router.get("/admin/finanzas/resumen")
async def resumen_financiero(
    ambito: Literal["EMPRESA", "PERSONAL_HOGAR"] = "EMPRESA",
    periodo: Literal["diario", "semanal", "mensual", "anual"] = "mensual",
):
    today = today_local()
    settings = await get_settings()
    desde, hasta = month_bounds(today)
    mes = await totales(ambito, desde, hasta)
    historico = await totales(ambito, "1900-01-01", today.isoformat())
    saldo_ini = settings.saldo_inicial_empresa if ambito == "EMPRESA" else settings.saldo_inicial_hogar
    saldo = money(saldo_ini + historico["INGRESO"]["total"] - historico["GASTO"]["total"])
    ingresos, gastos = mes["INGRESO"]["base"], mes["GASTO"]["base"]
    beneficio = money(ingresos - gastos)

    buckets = build_buckets(periodo, today)
    serie = [{"label": b[0], "ingresos": 0.0, "gastos": 0.0} for b in buckets]
    txs = await db.transactions.find(
        scoped({"ambito": ambito, "fecha": {"$gte": buckets[0][1].isoformat(), "$lte": buckets[-1][2].isoformat()}}),
        {"_id": 0, "fecha": 1, "tipo": 1, "importe": 1},
    ).to_list(5000)
    for t in txs:
        for i, (_, s, e) in enumerate(buckets):
            if s.isoformat() <= t["fecha"] <= e.isoformat():
                serie[i]["ingresos" if t["tipo"] == "INGRESO" else "gastos"] += t["importe"]
                break
    for p in serie:
        p["ingresos"], p["gastos"] = money(p["ingresos"]), money(p["gastos"])

    cats: dict[str, float] = {}
    async for r in db.transactions.aggregate([
        {"$match": scoped({"ambito": ambito, "tipo": "GASTO", "fecha": {"$gte": desde, "$lte": hasta}})},
        {"$group": {"_id": "$categoria", "total": {"$sum": "$importe"}}},
    ]):
        cats[r["_id"]] = money(r["total"])
    total_cats = sum(cats.values()) or 1
    categorias = sorted(
        [{"categoria": k, "total": v, "pct": round(v / total_cats * 100, 1)} for k, v in cats.items()],
        key=lambda c: c["total"], reverse=True,
    )
    ultimos = await find_docs("transactions", MovimientoFinanciero, {"ambito": ambito}, sort=[("fecha", -1), ("fecha_registro", -1)], limit=12)
    proximos = await find_docs(
        "reminders", Recordatorio,
        {"ambito": ambito, "tipo": {"$in": ["pago", "factura"]}, "completado": False, "fecha": {"$gte": today.isoformat()}},
        sort=[("fecha", 1)], limit=6,
    )
    return {
        "ambito": ambito,
        "periodo": periodo,
        "kpis": {
            "saldo_disponible": saldo,
            "ingresos_mes": ingresos,
            "gastos_mes": gastos,
            "beneficio": beneficio,
            "rentabilidad_pct": round(beneficio / ingresos * 100, 1) if ingresos else 0,
            "iva_repercutido_mes": mes["INGRESO"]["iva"],
            "iva_soportado_mes": mes["GASTO"]["iva"],
        },
        "serie": serie,
        "categorias": categorias,
        "ultimos": [m.out() for m in ultimos],
        "proximos_pagos": [r.out() for r in proximos],
    }


# ================================================================ agenda
class RecordatorioIn(BaseModel):
    titulo: str = Field(min_length=2, max_length=120)
    descripcion: str = Field(default="", max_length=500)
    fecha: str = Field(pattern=DATE_RE)
    hora: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    tipo: Literal["visita", "obra", "factura", "cobro", "pago"] = "visita"
    ambito: Literal["EMPRESA", "PERSONAL_HOGAR"] = "EMPRESA"
    importe: Optional[float] = Field(default=None, ge=0)
    obra_id: Optional[str] = None


class RecordatorioPatch(BaseModel):
    completado: Optional[bool] = None
    fecha: Optional[str] = Field(default=None, pattern=DATE_RE)
    hora: Optional[str] = Field(default=None, pattern=r"^\d{2}:\d{2}$")
    titulo: Optional[str] = Field(default=None, min_length=2, max_length=120)


@router.get("/admin/recordatorios")
async def listar_recordatorios(desde: Optional[str] = None, hasta: Optional[str] = None):
    query: dict = {}
    if desde or hasta:
        query["fecha"] = {k: v for k, v in (("$gte", desde), ("$lte", hasta)) if v}
    items = await find_docs("reminders", Recordatorio, query, sort=[("fecha", 1), ("hora", 1)])
    return [r.out() for r in items]


@router.post("/admin/recordatorios", status_code=201)
async def crear_recordatorio(body: RecordatorioIn):
    r = Recordatorio(**body.model_dump())
    await insert_doc("reminders", r)
    return r.out()


@router.patch("/admin/recordatorios/{r_id}")
async def editar_recordatorio(r_id: str, body: RecordatorioPatch):
    r = await get_doc("reminders", Recordatorio, r_id)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(r, k, v)
    await save_doc("reminders", r)
    return r.out()


@router.delete("/admin/recordatorios/{r_id}")
async def borrar_recordatorio(r_id: str):
    await get_doc("reminders", Recordatorio, r_id)
    await db.reminders.delete_one(scoped({"_id": to_oid(r_id)}))
    return {"ok": True}


# ================================================================ gestoría
def periodo_bounds(anio: int, trimestre: int) -> tuple[str, str]:
    if trimestre == 0:
        return f"{anio}-01-01", f"{anio}-12-31"
    start = date(anio, 3 * (trimestre - 1) + 1, 1)
    end_month = 3 * trimestre
    end = (date(anio, end_month, 1) + timedelta(days=32)).replace(day=1) - timedelta(days=1)
    return start.isoformat(), end.isoformat()


async def gestoria_data(anio: int, trimestre: int) -> dict:
    desde, hasta = periodo_bounds(anio, trimestre)
    movs = await find_docs("transactions", MovimientoFinanciero, {"ambito": "EMPRESA", "fecha": {"$gte": desde, "$lte": hasta}}, sort=[("fecha", 1)], limit=5000)
    emitidas = [m for m in movs if m.tipo == "INGRESO"]
    recibidas = [m for m in movs if m.tipo == "GASTO"]
    tipos: dict[float, dict] = {}
    for m in movs:
        t = tipos.setdefault(m.iva, {"iva": m.iva, "base_emitidas": 0.0, "cuota_repercutida": 0.0, "base_recibidas": 0.0, "cuota_soportada": 0.0})
        if m.tipo == "INGRESO":
            t["base_emitidas"] += m.importe
            t["cuota_repercutida"] += m.iva_importe
        else:
            t["base_recibidas"] += m.importe
            t["cuota_soportada"] += m.iva_importe
    rep = money(sum(m.iva_importe for m in emitidas))
    sop = money(sum(m.iva_importe for m in recibidas))
    return {
        "periodo": {"anio": anio, "trimestre": trimestre, "desde": desde, "hasta": hasta},
        "resumen": {
            "base_emitidas": money(sum(m.importe for m in emitidas)), "iva_repercutido": rep,
            "total_emitidas": money(sum(m.total for m in emitidas)),
            "base_recibidas": money(sum(m.importe for m in recibidas)), "iva_soportado": sop,
            "total_recibidas": money(sum(m.total for m in recibidas)),
            "resultado_iva": money(rep - sop), "num_emitidas": len(emitidas), "num_recibidas": len(recibidas),
        },
        "iva_por_tipo": [{k: (money(v) if isinstance(v, float) and k != "iva" else v) for k, v in t.items()} for t in sorted(tipos.values(), key=lambda x: -x["iva"])],
        "emitidas": [m.out() for m in reversed(emitidas)],
        "recibidas": [m.out() for m in reversed(recibidas)],
    }


@router.get("/admin/gestoria")
async def gestoria(anio: int = Query(default_factory=lambda: today_local().year, ge=2000, le=2100), trimestre: int = Query(0, ge=0, le=4)):
    return await gestoria_data(anio, trimestre)


@router.post("/admin/gestoria/export-token")
async def gestoria_export_token(user: UserDoc = Depends(require_admin)):
    """Single-purpose token valid 2 minutes, so the session token never goes in a download URL."""
    t = now_utc()
    token = jwt.encode({"sub": user.id, "scope": "csv", "iat": t, "exp": t + timedelta(minutes=2)}, JWT_SECRET, algorithm=ALGORITHM)
    return {"token": token}


@export_router.get("/admin/gestoria/export.csv")
async def gestoria_csv(
    anio: int = Query(..., ge=2000, le=2100), trimestre: int = Query(0, ge=0, le=4), dl: str = Query("", max_length=600),
):
    try:
        payload = jwt.decode(dl, JWT_SECRET, algorithms=[ALGORITHM])
        ok = payload.get("scope") == "csv" and await db.users.find_one({"_id": to_oid(payload["sub"]), "role": "admin", "active": True})
    except Exception:
        ok = False
    if not ok:
        raise HTTPException(status_code=401, detail="Enlace de descarga caducado. Vuelve a pulsar Exportar.")
    data = await gestoria_data(anio, trimestre)
    buf = io.StringIO()
    w = csv.writer(buf, delimiter=";")
    w.writerow(["Tipo", "Fecha", "Nº factura", "Concepto", "Categoría", "Contraparte", "Base imponible", "IVA %", "Cuota IVA", "Total", "Obra", "Justificante"])
    fmt = lambda v: f"{v:.2f}".replace(".", ",")
    for tipo, rows in (("Factura emitida", reversed(data["emitidas"])), ("Ticket/factura recibida", reversed(data["recibidas"]))):
        for m in rows:
            w.writerow([tipo, m["fecha"], m.get("numero_factura") or "", m["concepto"], m["categoria"], m.get("contraparte") or "",
                        fmt(m["importe"]), f"{m['iva']:g}", fmt(m["iva_importe"]), fmt(m["total"]), m.get("obra_id") or "",
                        "Sí" if m.get("foto_ticket_factura") else "No"])
    r = data["resumen"]
    w.writerow([])
    w.writerow(["Resumen", data["periodo"]["desde"], data["periodo"]["hasta"]])
    w.writerow(["IVA repercutido", fmt(r["iva_repercutido"])])
    w.writerow(["IVA soportado", fmt(r["iva_soportado"])])
    w.writerow(["Resultado IVA", fmt(r["resultado_iva"])])
    nombre = f"gestoria_GM_Reforma_Express_{anio}_{'T' + str(trimestre) if trimestre else 'anual'}.csv"
    return Response(content="\ufeff" + buf.getvalue(), media_type="text/csv; charset=utf-8",
                    headers={"Content-Disposition": f'attachment; filename="{nombre}"'})


# ================================================================ hardware stores + commissions
class FerreteriaIn(BaseModel):
    nombre: str = Field(min_length=2, max_length=100)
    direccion: str = Field(min_length=3, max_length=200)
    barrio: str = Field(default="", max_length=60)
    telefono: str = Field(default="", max_length=20)
    horario: str = Field(default="", max_length=120)
    descripcion: str = Field(default="", max_length=600)
    productos_destacados: List[str] = Field(default_factory=list, max_length=20)
    porcentaje_comision: float = Field(default=5, ge=0, le=50)
    tarifa_publicidad_mensual: float = Field(default=0, ge=0, le=10000)
    pin: str = Field(min_length=4, max_length=8, pattern=r"^\d+$")


class FerreteriaPatch(BaseModel):
    porcentaje_comision: Optional[float] = Field(default=None, ge=0, le=50)
    tarifa_publicidad_mensual: Optional[float] = Field(default=None, ge=0, le=10000)
    activa: Optional[bool] = None


class DerivacionIn(BaseModel):
    cliente_nombre: str = Field(min_length=2, max_length=120)
    descripcion: str = Field(default="", max_length=300)
    importe_compra: float = Field(gt=0, le=1000000)
    obra_id: Optional[str] = None


class DerivacionPatch(BaseModel):
    estado: Literal["pendiente", "cobrada"]


class PublicidadIn(BaseModel):
    importe: Optional[float] = Field(default=None, gt=0, le=100000)
    concepto: str = Field(default="Cuota de publicidad mensual", max_length=150)


@router.get("/admin/ferreterias")
async def admin_ferreterias():
    return [f.out() for f in await find_docs("hardware_stores", Ferreteria, sort=[("nombre", 1)])]


@router.post("/admin/ferreterias", status_code=201)
async def crear_ferreteria(body: FerreteriaIn):
    seq = await next_seq("ferreteria")
    f = Ferreteria(codigo=f"FE{seq:02d}", **body.model_dump(exclude={"pin"}))
    await insert_doc("hardware_stores", f)
    await upsert_user("ferreteria", f.codigo, f.nombre, body.pin, f.id)
    return f.out()


@router.patch("/admin/ferreterias/{f_id}")
async def editar_ferreteria(f_id: str, body: FerreteriaPatch):
    f = await get_doc("hardware_stores", Ferreteria, f_id)
    for k, v in body.model_dump(exclude_none=True).items():
        setattr(f, k, v)
    await save_doc("hardware_stores", f)
    return f.out()


@router.post("/admin/ferreterias/{f_id}/derivaciones", status_code=201)
async def crear_derivacion(f_id: str, body: DerivacionIn):
    f = await get_doc("hardware_stores", Ferreteria, f_id)
    d = Derivacion(**body.model_dump(), comision=money(body.importe_compra * f.porcentaje_comision / 100))
    f.derivaciones.insert(0, d)
    await save_doc("hardware_stores", f)
    return f.out()


@router.patch("/admin/ferreterias/{f_id}/derivaciones/{d_id}")
async def estado_derivacion(f_id: str, d_id: str, body: DerivacionPatch):
    f = await get_doc("hardware_stores", Ferreteria, f_id)
    d = next((x for x in f.derivaciones if x.id == d_id), None)
    if not d:
        raise HTTPException(status_code=404, detail="Derivación no encontrada")
    if body.estado == "cobrada" and d.estado != "cobrada":
        tx = MovimientoFinanciero(
            tipo="INGRESO", ambito="EMPRESA", categoria="Comisiones", concepto=f"Comisión {f.nombre}: {d.cliente_nombre}",
            importe=d.comision, iva=21, fecha=today_str(), contraparte=f.nombre, origen="comision",
            numero_factura=await next_factura(),
        )
        tx.recalcular()
        await insert_doc("transactions", tx)
        d.transaccion_id = tx.id
    elif body.estado == "pendiente" and d.estado == "cobrada":
        raise HTTPException(status_code=409, detail="Esta comisión ya está cobrada y facturada; no se puede volver a pendiente")
    d.estado = body.estado
    await save_doc("hardware_stores", f)
    return f.out()


@router.post("/admin/ferreterias/{f_id}/publicidad", status_code=201)
async def cobro_publicidad(f_id: str, body: PublicidadIn):
    f = await get_doc("hardware_stores", Ferreteria, f_id)
    importe = body.importe or f.tarifa_publicidad_mensual
    if not importe:
        raise HTTPException(status_code=422, detail="Esta ferretería no tiene tarifa de publicidad")
    tx = MovimientoFinanciero(
        tipo="INGRESO", ambito="EMPRESA", categoria="Publicidad", concepto=f"{body.concepto} · {f.nombre}",
        importe=importe, iva=21, fecha=today_str(), contraparte=f.nombre, origen="publicidad", numero_factura=await next_factura(),
    )
    tx.recalcular()
    await insert_doc("transactions", tx)
    return tx.out()


@router.get("/admin/comisiones")
async def resumen_comisiones():
    stores = await find_docs("hardware_stores", Ferreteria, sort=[("nombre", 1)])
    year_start = f"{today_local().year}-01-01"
    publicidad_anual = 0.0
    async for r in db.transactions.aggregate([
        {"$match": scoped({"ambito": "EMPRESA", "categoria": "Publicidad", "fecha": {"$gte": year_start}})},
        {"$group": {"_id": None, "total": {"$sum": "$importe"}}},
    ]):
        publicidad_anual = money(r["total"])
    derivs, por = [], []
    for f in stores:
        pend = money(sum(d.comision for d in f.derivaciones if d.estado == "pendiente"))
        cob = money(sum(d.comision for d in f.derivaciones if d.estado == "cobrada"))
        por.append({"id": f.id, "nombre": f.nombre, "porcentaje_comision": f.porcentaje_comision, "pendiente": pend, "cobrada": cob,
                    "tarifa_publicidad_mensual": f.tarifa_publicidad_mensual, "anuncios_activos": sum(1 for a in f.anuncios if a.activo)})
        for d in f.derivaciones:
            derivs.append({**d.model_dump(), "ferreteria_id": f.id, "ferreteria_nombre": f.nombre})
    derivs.sort(key=lambda d: d["fecha"], reverse=True)
    return {
        "pendientes": money(sum(p["pendiente"] for p in por)),
        "cobradas": money(sum(p["cobrada"] for p in por)),
        "publicidad_mensual": money(sum(f.tarifa_publicidad_mensual for f in stores if f.activa)),
        "publicidad_anual_cobrada": publicidad_anual,
        "por_ferreteria": por,
        "derivaciones": derivs,
    }


# ================================================================ settings / integrations
class SettingsPatch(BaseModel):
    razon_social: Optional[str] = Field(default=None, min_length=2, max_length=120)
    cif: Optional[str] = Field(default=None, max_length=20)
    direccion_fiscal: Optional[str] = Field(default=None, max_length=200)
    telefono: Optional[str] = Field(default=None, max_length=20)
    whatsapp: Optional[str] = Field(default=None, max_length=20)
    email_contacto: Optional[str] = Field(default=None, max_length=120)
    admin_email: Optional[str] = Field(default=None, max_length=120)
    iva_defecto: Optional[float] = Field(default=None, ge=0, le=30)
    email_simulacion: Optional[bool] = None


async def config_out() -> dict:
    s = await get_settings()
    mode = email_mode(s)
    counts = {}
    for estado in ("enviado", "simulado_pendiente_api_key", "error"):
        counts[estado] = await db.messages.count_documents(scoped({"estado": estado}))
    fiscal_ok = bool(s.cif and s.razon_social and s.direccion_fiscal)
    return {
        "settings": s.model_dump(),
        "integraciones": [
            {
                "clave": "resend", "nombre": "Resend Email API",
                "estado": "activo" if mode == "activo" else "simulacion",
                "detalle": ("Correos reales activos (Resend gestionado por Emergent)." if mode == "activo" else
                            ("Modo simulación: los correos se guardan en el historial sin enviarse." if EMAIL_KEY else
                             "Falta la clave de correo: modo simulación automático.")),
                "extra": "Las alertas al admin requieren un correo de alertas." if not s.admin_email else f"Alertas a {s.admin_email}",
            },
            {"clave": "whatsapp", "nombre": "WhatsApp Link", "estado": "activo" if s.whatsapp else "pendiente",
             "detalle": f"Enlaces wa.me listos con el número +{s.whatsapp}" if s.whatsapp else "Añade el número de WhatsApp"},
            {"clave": "fiscal", "nombre": "Datos Fiscales de GM Reforma Express", "estado": "activo" if fiscal_ok else "pendiente",
             "detalle": "Datos fiscales completos" if fiscal_ok else "Completa el CIF y la dirección fiscal para facturas y gestoría"},
        ],
        "mensajes": counts,
    }


@router.get("/admin/configuracion")
async def get_configuracion():
    return await config_out()


@router.patch("/admin/configuracion")
async def patch_configuracion(body: SettingsPatch):
    data = body.model_dump(exclude_none=True)
    if data:
        await db.settings.update_one({"_id": COMPANY_ID}, {"$set": data}, upsert=True)
    return await config_out()


@router.post("/admin/configuracion/probar-email")
async def probar_email():
    settings = await get_settings()
    if not settings.admin_email:
        raise HTTPException(status_code=422, detail="Guarda primero el correo de alertas")
    recent = await db.messages.count_documents(scoped({"tipo": "prueba", "fecha": {"$gte": (now_utc() - timedelta(minutes=1)).isoformat()}}))
    if recent >= 3:
        raise HTTPException(status_code=429, detail="Espera un minuto antes de enviar otra prueba")
    asunto, html, texto = tpl_prueba(settings)
    msg = await deliver(tipo="prueba", destinatario=settings.admin_email, asunto=asunto, html=html, texto=texto)
    return msg.out()


@router.get("/admin/mensajes")
async def listar_mensajes(limit: int = Query(50, ge=1, le=200)):
    return [m.out() for m in await find_docs("messages", Mensaje, sort=[("fecha", -1)], limit=limit)]
