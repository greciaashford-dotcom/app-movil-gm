"""Email via Emergent managed Resend, with a safe simulation fallback.

If the email key is missing, simulation mode is enabled in Configuración, or the
recipient is a placeholder address, the email is NOT sent: it is logged and stored
in MongoDB with estado "simulado_pendiente_api_key" so the user flow never breaks.
"""
import ipaddress
import os
import re
from html import escape
from html.parser import HTMLParser
from typing import Optional
from urllib.parse import urlparse

import httpx
from fastapi import HTTPException

from core import CompanySettings, Mensaje, get_settings, insert_doc, logger

EMAIL_BASE_URL = "https://integrations.emergentagent.com"
EMAIL_KEY = os.environ.get("EMERGENT_EMAIL_KEY")
EMAIL_FROM_NAME = os.environ["EMAIL_FROM_NAME"]
SIMULATED = "simulado_pendiente_api_key"
PLACEHOLDER_DOMAINS = ("example.com", "example.org", "example.net", "test.com", "prueba.com", "correo.com")

# ---------------------------------------------------------------- guardrail gate (playbook, unchanged)
_SHORTENERS = ("bit.ly", "tinyurl.com", "t.co", "is.gd", "cutt.ly", "goo.gl", "rebrand.ly")
_CRED_ASK = ("reply with your password", "reply with the code", "send your password", "cvv",
             "send us your password", "enter your password below", "confirm your card number",
             "your full card number", "seed phrase", "recovery phrase", "verify your card",
             "social security number", "confirm your bank details")
_HOSTISH = re.compile(r"\b(?:https?://)?((?:[a-z0-9-]+\.)+[a-z]{2,})", re.I)


def _host_ok(host: str) -> bool:
    if not host or "xn--" in host:
        return False
    try:
        ipaddress.ip_address(host)
        return False
    except ValueError:
        pass
    return not any(host == s or host.endswith("." + s) for s in _SHORTENERS)


def _same_site(shown: str, real: str) -> bool:
    return shown == real or real.endswith("." + shown) or shown.endswith("." + real)


class _EmailScan(HTMLParser):
    def __init__(self):
        super().__init__()
        self.tags, self.urls, self.anchors = set(), [], []
        self._href, self._text = None, []

    def handle_starttag(self, tag, attrs):
        self.tags.add(tag.lower())
        self.urls += [v for k, v in attrs if k.lower() in ("href", "src") and v]
        if tag.lower() == "a":
            self._href = dict((k.lower(), v) for k, v in attrs).get("href")
            self._text = []

    def handle_data(self, data):
        if self._href is not None:
            self._text.append(data)

    def handle_endtag(self, tag):
        if tag.lower() == "a" and self._href is not None:
            self.anchors.append((self._href, "".join(self._text)))
            self._href, self._text = None, []


def _assert_safe_email(subject: str, html: str) -> None:
    scan = _EmailScan()
    scan.feed(html)
    if scan.tags & {"form", "input", "textarea", "select"}:
        raise ValueError("No forms or input fields in email (G2)")
    body = f"{subject}\n{html}".lower()
    for p in _CRED_ASK:
        if p in body:
            raise ValueError(f"Email asks the recipient for credentials: {p!r} (G2)")
    for url in scan.urls:
        low = url.strip().lower()
        if low.startswith(("mailto:", "tel:", "cid:", "#")):
            continue
        if not low.startswith("https://"):
            raise ValueError(f"Email links/assets must be absolute https: {url!r} (G3)")
        host = urlparse(low).hostname or ""
        if not _host_ok(host) or urlparse(low).username is not None:
            raise ValueError(f"Shortened, numeric-host or credential-bearing URL: {url!r} (G3)")
    for href, text in scan.anchors:
        real = urlparse(href.strip().lower()).hostname or ""
        if not real:
            continue
        for m in _HOSTISH.finditer(text):
            if not _same_site(m.group(1).lower(), real):
                raise ValueError(f"Anchor text {m.group(1)!r} != real link host {real!r} (G3)")


async def send_email(*, to: str, subject: str, html: str, reply_to: Optional[str] = None) -> Optional[str]:
    _assert_safe_email(subject, html)
    payload = {"to": [to], "subject": subject, "html": html, "from_name": EMAIL_FROM_NAME}
    if reply_to:
        payload["contact_email"] = reply_to
    try:
        async with httpx.AsyncClient(timeout=30) as client:
            resp = await client.post(
                f"{EMAIL_BASE_URL}/api/v1/email/send",
                headers={"X-Email-Key": EMAIL_KEY},
                json=payload,
            )
        resp.raise_for_status()
        return resp.json().get("id")
    except httpx.HTTPStatusError as e:
        try:
            code = e.response.json().get("code", "")
        except ValueError:
            code = ""
        if code in ("insufficient_credits", "integration_disabled", "daily_limit_reached"):
            logger.warning(f"Email paused: {code} ({e.response.status_code})")
            raise HTTPException(status_code=503, detail="Email temporalmente no disponible")
        logger.error(f"Email send failed: {e.response.status_code} {e.response.text}")
        raise HTTPException(status_code=502, detail="No se pudo enviar el correo")
    except Exception as e:  # network errors etc.
        logger.error(f"Email send error: {str(e)}")
        raise HTTPException(status_code=500, detail="No se pudo enviar el correo")


# ---------------------------------------------------------------- mode + delivery
def email_mode(settings: CompanySettings) -> str:
    return "simulacion" if (not EMAIL_KEY or settings.email_simulacion) else "activo"


def is_placeholder(address: str) -> bool:
    domain = (address or "").rsplit("@", 1)[-1].lower()
    return domain in PLACEHOLDER_DOMAINS or domain.endswith((".test", ".local", ".invalid", ".example"))


async def deliver(
    *,
    tipo: str,
    destinatario: str,
    asunto: str,
    html: str,
    texto: str,
    reply_to: Optional[str] = None,
    solicitud_id: Optional[str] = None,
    presupuesto_id: Optional[str] = None,
    cliente_id: Optional[str] = None,
) -> Mensaje:
    settings = await get_settings()
    estado, proveedor_id, error = SIMULATED, None, None
    simulate = email_mode(settings) == "simulacion" or not destinatario or is_placeholder(destinatario)
    if simulate:
        logger.info(f"[EMAIL SIMULADO] tipo={tipo} to={destinatario or '-'} subject={asunto!r}")
    else:
        try:
            proveedor_id = await send_email(to=destinatario, subject=asunto, html=html, reply_to=reply_to or None)
            estado = "enviado"
        except (HTTPException, ValueError) as e:
            estado = "error"
            error = getattr(e, "detail", None) or str(e)
    msg = Mensaje(
        tipo=tipo,
        solicitud_id=solicitud_id,
        presupuesto_id=presupuesto_id,
        cliente_id=cliente_id,
        destinatario=destinatario or "(sin destinatario configurado)",
        asunto=asunto,
        cuerpo=texto,
        estado=estado,
        proveedor_id=proveedor_id,
        error=error,
    )
    return await insert_doc("messages", msg)


# ---------------------------------------------------------------- templates (server side only)
def _p(text: str) -> str:
    return f'<p style="margin:0 0 12px;font-size:15px;line-height:22px">{escape(text).replace(chr(10), "<br>")}</p>'


def _layout(titulo: str, bloques: list[str], settings: CompanySettings) -> str:
    tel = "".join(ch for ch in settings.telefono if ch.isdigit())
    return (
        '<table role="presentation" width="100%" style="background:#F2F6FB;padding:24px 0"><tr><td align="center">'
        '<table role="presentation" width="560" style="background:#FFFFFF;border-radius:16px;font-family:Arial,sans-serif;color:#071B35">'
        '<tr><td style="background:#002B55;padding:20px 24px;border-radius:16px 16px 0 0">'
        '<span style="font-size:24px;font-weight:900;font-style:italic;color:#FFFFFF">GM <span style="color:#FFCC00">Conecta</span></span><br>'
        '<span style="font-size:12px;font-style:italic;color:#FFFFFF">Servicios para tu hogar</span></td></tr>'
        f'<tr><td style="padding:24px"><h2 style="margin:0 0 12px;font-size:20px;color:#001D3D">{escape(titulo)}</h2>{"".join(bloques)}</td></tr>'
        '<tr><td style="padding:16px 24px;font-size:12px;color:#556476;border-top:1px solid #CFDCE9">'
        f'Enviado por {escape(EMAIL_FROM_NAME)}, una plataforma de {escape(settings.razon_social)}. '
        f'Tel. <a href="tel:{tel}" style="color:#0055A5">{escape(settings.telefono)}</a>. '
        'Nunca te pediremos contraseñas ni datos bancarios por correo.</td></tr>'
        "</table></td></tr></table>"
    )


def _tabla(filas: list[tuple[str, str]]) -> str:
    rows = "".join(
        f'<tr><td style="padding:8px 12px;border-bottom:1px solid #CFDCE9;font-size:13px;color:#556476">{escape(k)}</td>'
        f'<td style="padding:8px 12px;border-bottom:1px solid #CFDCE9;font-size:14px;font-weight:bold">{escape(v)}</td></tr>'
        for k, v in filas
    )
    return f'<table role="presentation" width="100%" style="background:#E3F0FF;border-radius:12px;margin:8px 0 16px">{rows}</table>'


def eur(v: float) -> str:
    s = f"{v:,.2f}".replace(",", "X").replace(".", ",").replace("X", ".")
    return f"{s} €"


def tpl_confirmacion_cliente(s, settings: CompanySettings) -> tuple[str, str, str]:
    asunto = f"Hemos recibido tu solicitud {s.numero_solicitud}"
    texto = (
        f"Hola {s.nombre_cliente}, gracias por confiar en GM Conecta. Nuestro equipo revisará tu solicitud "
        f"{s.numero_solicitud} ({s.servicio}) y te contactará en breve con un presupuesto personalizado."
    )
    html = _layout(
        "¡Hemos recibido tu solicitud!",
        [
            _p(f"Hola {s.nombre_cliente},"),
            _p("Gracias por confiar en GM Conecta. Nuestro equipo revisará la información y se pondrá en contacto contigo en breve para enviarte un presupuesto personalizado."),
            _tabla([("Nº de solicitud", s.numero_solicitud), ("Servicio", s.servicio), ("Dirección", s.direccion)]),
            _p("¿Qué ocurre ahora? Revisamos tu solicitud, te contactamos si necesitamos más detalles y te enviamos un presupuesto sin compromiso."),
        ],
        settings,
    )
    return asunto, html, texto


def tpl_alerta_admin(s, settings: CompanySettings) -> tuple[str, str, str]:
    prefijo = "URGENTE · " if s.es_urgencia else ""
    asunto = f"{prefijo}Nueva solicitud {s.numero_solicitud} · {s.servicio}"
    texto = f"Nueva solicitud {s.numero_solicitud} de {s.nombre_cliente} ({s.telefono_cliente}) – {s.servicio} en {s.direccion}."
    html = _layout(
        "Nueva solicitud recibida",
        [
            _tabla([
                ("Nº de solicitud", s.numero_solicitud),
                ("Servicio", s.servicio),
                ("Urgencia 24h", "Sí" if s.es_urgencia else "No"),
                ("Cliente", s.nombre_cliente),
                ("Teléfono", s.telefono_cliente),
                ("Correo", s.correo_cliente),
                ("Dirección", s.direccion),
            ]),
            _p(s.descripcion),
            _p("Ábrela en el panel Admin de GM Conecta para responder o preparar el presupuesto."),
        ],
        settings,
    )
    return asunto, html, texto


def tpl_respuesta(nombre: str, mensaje: str, numero: str, settings: CompanySettings) -> tuple[str, str]:
    asunto = f"GM Conecta · Respuesta a tu solicitud {numero}"
    html = _layout(f"Respuesta a tu solicitud {numero}", [_p(f"Hola {nombre},"), _p(mensaje)], settings)
    return asunto, html


def tpl_prueba(settings: CompanySettings) -> tuple[str, str, str]:
    asunto = "GM Conecta · Correo de prueba"
    texto = "Correo de prueba: las alertas de nuevas solicitudes llegarán a esta dirección."
    html = _layout(
        "Correo de prueba",
        [_p("¡Todo listo! Las alertas de nuevas solicitudes y urgencias de GM Conecta llegarán a esta dirección.")],
        settings,
    )
    return asunto, html, texto


def tpl_presupuesto(q, settings: CompanySettings) -> tuple[str, str, str]:
    asunto = f"GM Conecta · Presupuesto {q.numero_presupuesto}"
    lineas = "".join(
        f'<tr><td style="padding:6px 8px;border-bottom:1px solid #CFDCE9;font-size:13px">{escape(l.concepto)}'
        f'<br><span style="color:#556476;font-size:11px">{"Material" if l.tipo == "MATERIAL" else "Mano de obra"}</span></td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #CFDCE9;font-size:13px;text-align:right">{l.cantidad:g} × {escape(eur(l.precio_unitario))}</td>'
        f'<td style="padding:6px 8px;border-bottom:1px solid #CFDCE9;font-size:13px;text-align:right;font-weight:bold">{escape(eur(l.subtotal))}</td></tr>'
        for l in q.lineas
    )
    tabla = f'<table role="presentation" width="100%" style="margin:8px 0 16px">{lineas}</table>'
    texto = f"Presupuesto {q.numero_presupuesto} – {q.titulo}. Total {eur(q.total)} (IVA {q.iva_porcentaje:g}% incluido)."
    html = _layout(
        f"Presupuesto {q.numero_presupuesto}",
        [
            _p(f"Hola {q.cliente_nombre}, te enviamos el presupuesto solicitado: {q.titulo}."),
            tabla,
            _tabla([
                ("Base imponible", eur(q.base_imponible)),
                (f"IVA ({q.iva_porcentaje:g}%)", eur(q.iva_importe)),
                ("Total", eur(q.total)),
            ]),
            _p(q.notas) if q.notas else "",
            _p("Si estás de acuerdo, responde a este correo o llámanos y empezamos a organizar la obra."),
        ],
        settings,
    )
    return asunto, html, texto
