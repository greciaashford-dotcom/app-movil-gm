"""Client emails when a job (obra) changes: scheduled, started, 25/50/75 % progress, paused, resumed, finished."""
import asyncio
from typing import Optional

from core import Obra, db, get_settings, logger, scoped, to_oid
from email_service import deliver, tpl_aviso_obra

HITOS = (25, 50, 75)
_tasks: set = set()


def eventos_obra(o: Obra, estado_antes: Optional[str], avance_antes: int) -> list[str]:
    """Events to announce after a change (None = the job was just created). Marks one-time events as sent."""
    eventos: list[str] = []
    if estado_antes is None:
        eventos.append("planificada")
    elif o.estado != estado_antes:
        if o.estado == "en_curso":
            eventos.append("reanudada" if "en_curso" in o.avisos_enviados else "en_curso")
        elif o.estado in ("pausada", "finalizada"):
            eventos.append(o.estado)
    if o.estado != "finalizada":
        hito = max((h for h in HITOS if avance_antes < h <= o.porcentaje_avance), default=None)
        if hito:
            eventos.append(f"avance_{hito}")
    repetibles = {"pausada", "reanudada"}
    nuevos = [e for e in eventos if e in repetibles or e not in o.avisos_enviados]
    for e in nuevos:
        if e not in o.avisos_enviados:
            o.avisos_enviados.append(e)
    return nuevos


async def _destinatario(o: Obra) -> tuple[str, str]:
    if o.cliente_id:
        doc = await db.clients.find_one(scoped({"_id": to_oid(o.cliente_id)}))
        if doc and doc.get("correo"):
            return doc["correo"], doc.get("nombre") or o.cliente_nombre
    if o.solicitud_id:
        doc = await db.requests.find_one(scoped({"_id": to_oid(o.solicitud_id)}))
        if doc and doc.get("correo_cliente"):
            return doc["correo_cliente"], doc.get("nombre_cliente") or o.cliente_nombre
    return "", o.cliente_nombre


async def _enviar(o: Obra, eventos: list[str]) -> None:
    try:
        settings = await get_settings()
        if not settings.avisos_cliente:
            return
        correo, nombre = await _destinatario(o)
        if not correo:
            return
        for ev in eventos:
            asunto, html, texto = tpl_aviso_obra(o, ev, nombre, settings)
            await deliver(
                tipo="aviso_obra", destinatario=correo, asunto=asunto, html=html, texto=texto,
                reply_to=settings.admin_email, solicitud_id=o.solicitud_id, presupuesto_id=o.presupuesto_id,
                cliente_id=o.cliente_id,
            )
    except Exception as e:  # never break the admin / worker flow because of email
        logger.error("job notice emails failed: %s", e)


def lanzar_avisos(o: Obra, eventos: list[str]) -> None:
    """Send in the background so saving a job never waits for the email provider."""
    if not eventos:
        return
    task = asyncio.create_task(_enviar(o.model_copy(deep=True), eventos))
    _tasks.add(task)
    task.add_done_callback(_tasks.discard)
