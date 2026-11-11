"""Idempotent seed data so every panel of GM Conecta is populated from the first second."""
import random
import secrets
from datetime import date, datetime, time, timedelta

from core import (
    COMPANY_ID, Anuncio, Cliente, Derivacion, Ferreteria, FotosObra, LineaPresupuesto, ManoObra, Material, Mensaje,
    MovimientoFinanciero, Obra, Presupuesto, Recordatorio, Solicitud, TZ, Trabajador, db, hasher, insert_doc, logger,
    norm_phone, save_doc, today_local, upsert_user,
)

# 6-digit PINs (policy v2). Each staff profile has its own; the admin can change them in "Accesos y PIN".
ADMIN_PIN = "582047"
WORKER_PINS = {"TR01": "361948", "TR02": "470285", "TR03": "815362", "TR04": "293071", "TR05": "648139"}
STORE_PINS = {"FE01": "724613", "FE02": "309584", "FE03": "951270", "FE04": "186453"}
DEFAULT_PINS = {
    ("admin", "admin"): ADMIN_PIN,
    **{("trabajador", k.lower()): v for k, v in WORKER_PINS.items()},
    **{("ferreteria", k.lower()): v for k, v in STORE_PINS.items()},
}
U = "https://images.unsplash.com/"
IMG = {
    "bano1": U + "photo-1584622650111-993a426fbf0a?w=900",
    "bano2": U + "photo-1552321554-5fefe8c9ef14?w=900",
    "cocina": U + "photo-1556911220-bff31c812dba?w=900",
    "pintura1": U + "photo-1589939705384-5185137a7f0f?w=900",
    "pintura2": U + "photo-1562259949-e8e7689d7828?w=900",
    "herramientas": U + "photo-1504148455328-c376907d081c?w=900",
    "electricidad": U + "photo-1621905251189-08b45d6a269e?w=900",
    "fontaneria": U + "photo-1607472586893-edb57bdc0e39?w=900",
    "salon": U + "photo-1600566753190-17f0baa2a6c3?w=900",
    "ferre1": U + "photo-1581783898377-1c85bf937427?w=900",
    "ferre2": U + "photo-1530124566582-a618bc2615dc?w=900",
    "ferre3": U + "photo-1572981779307-38b8cabb2407?w=900",
    "ferre4": U + "photo-1416879595882-3373a0480b5b?w=900",
    "reforma": U + "photo-1581578731548-c64695cc6952?w=900",
    "interior": U + "photo-1600585154526-990dced4db0d?w=900",
}


def _iso(d: date, h: int = 10, m: int = 0) -> str:
    return datetime.combine(d, time(h, m), tzinfo=TZ).isoformat()


async def _tx(**kw) -> MovimientoFinanciero:
    m = MovimientoFinanciero(origen=kw.pop("origen", "seed"), **kw)
    m.recalcular()
    return await insert_doc("transactions", m)


async def seed_if_needed() -> None:
    await upsert_admin()
    await migrate_pins()
    if await db.settings.find_one({"_id": COMPANY_ID, "seeded": True}):
        return
    logger.info("Seeding GM Conecta demo data…")
    today = today_local()
    rnd = random.Random(847)

    await db.settings.update_one(
        {"_id": COMPANY_ID},
        {"$set": {
            "nombre_comercial": "GM Conecta", "razon_social": "GM Reforma Express", "cif": "",
            "direccion_fiscal": "Madrid", "telefono": "640677948", "whatsapp": "34640677948",
            "email_contacto": "", "admin_email": "", "iva_defecto": 21, "email_simulacion": False,
            "saldo_inicial_empresa": 9500, "saldo_inicial_hogar": 3200,
        }},
        upsert=True,
    )

    # ------------------------------------------------------------ workers
    workers = {}
    for codigo, nombre, esp, tel, disp, coste, tipo in [
        ("TR01", "Carlos Ruiz", "Fontanería", "612345678", "disponible", 22, "hora"),
        ("TR02", "Javier Moreno", "Electricidad", "623456789", "ocupado", 25, "hora"),
        ("TR03", "Ana López", "Pintura", "634567890", "disponible", 20, "hora"),
        ("TR04", "Miguel Fernández", "Albañilería", "645678901", "ocupado", 21, "hora"),
        ("TR05", "David Sánchez", "Cerrajería urgente", "656789012", "disponible", 45, "servicio"),
    ]:
        w = await insert_doc("workers", Trabajador(codigo=codigo, nombre=nombre, especialidad=esp, telefono=tel,
                                                     disponibilidad=disp, coste_hora_o_servicio=coste, tipo_coste=tipo))
        workers[codigo] = w
        await upsert_user("trabajador", codigo, nombre, WORKER_PINS[codigo], w.id)
    await db.counters.update_one({"_id": f"{COMPANY_ID}:trabajador"}, {"$set": {"seq": 5}}, upsert=True)

    # ------------------------------------------------------------ clients
    clients = {}
    for key, nombre, tel, correo, dirc in [
        ("lucia", "Lucía Martín", "611223344", "lucia.martin@example.com", "Calle de Fuencarral 45, 3ºB, Madrid"),
        ("pedro", "Pedro Gómez", "622334455", "pedro.gomez@example.com", "Avenida de América 12, 5ºA, Madrid"),
        ("comunidad", "Comunidad de Propietarios Toledo 88", "633445566", "admin.toledo88@example.com", "Calle de Toledo 88, Madrid"),
        ("marta", "Marta Jiménez", "644556677", "marta.jimenez@example.com", "Calle de Bravo Murillo 210, 2ºC, Madrid"),
        ("rincon", "Restaurante El Rincón", "655667788", "elrincon@example.com", "Calle de Ponzano 30, Madrid"),
        ("elena", "Elena Navarro", "666778899", "elena.navarro@example.com", "Calle de Arturo Soria 150, Madrid"),
    ]:
        clients[key] = await insert_doc("clients", Cliente(nombre=nombre, telefono=tel, telefono_norm=norm_phone(tel), correo=correo,
                                                            direcciones=[dirc], fecha_alta=_iso(today - timedelta(days=90))))

    # ------------------------------------------------------------ requests GC-000837 … GC-000846
    req_specs = [
        (837, "lucia", "Reformas / Mantenimiento", False, "en_obra", 34, "Reforma integral del baño: quitar bañera y poner plato de ducha, cambiar azulejos y grifería.", [IMG["bano1"], IMG["bano2"]]),
        (838, "pedro", "Pintura", False, "finalizado", 58, "Pintar piso completo de 80 m² (salón, 3 dormitorios y pasillo) en blanco roto.", [IMG["pintura1"]]),
        (839, "marta", "Fontanería", False, "presupuestado", 12, "Fuga de agua bajo el fregadero de la cocina, gotea el sifón.", [IMG["fontaneria"]]),
        (840, "comunidad", "Electricidad", False, "presupuestado", 20, "Cambiar el cuadro eléctrico de zonas comunes del portal y revisar iluminación.", []),
        (841, "rincon", "Reformas / Mantenimiento", False, "en_obra", 9, "Reforma de la cocina del restaurante: alicatado, encimera y nueva toma de agua.", [IMG["cocina"]]),
        (842, "elena", "Urgencia 24h · Cerrajería", True, "finalizado", 6, "Puerta de casa bloqueada, la llave no gira. Necesito cerrajero urgente.", []),
        (843, "lucia", "Fontanería", False, "en_revision", 3, "Cambio de grifería del lavabo y del bidé por monomando.", []),
        (844, "pedro", "Urgencia 24h · Fontanería", True, "pendiente", 0, "Rotura de tubería en la cocina, sale agua por la pared. ¡Urgente!", [IMG["fontaneria"]]),
        (845, "marta", "Pintura", False, "pendiente", 1, "Alisado de paredes del salón (gotelé) y pintura en gris claro.", [IMG["pintura2"]]),
        (846, "elena", "Electricidad", False, "pendiente", 0, "Instalación de iluminación LED empotrada en cocina y pasillo.", [IMG["electricidad"]]),
    ]
    reqs = {}
    for num, ck, serv, urg, estado, days_ago, desc, fotos in req_specs:
        c = clients[ck]
        hour = 9 + (num % 9)
        s = Solicitud(
            numero_solicitud=f"GC-{num:06d}", fecha_creacion=_iso(today - timedelta(days=days_ago), hour, (num * 7) % 60),
            servicio=serv, es_urgencia=urg, direccion=c.direcciones[0], estado=estado, nombre_cliente=c.nombre,
            telefono_cliente=c.telefono, telefono_norm=c.telefono_norm, correo_cliente=c.correo, descripcion=desc,
            fotografias=fotos, idempotency_key=f"seed-{num}", cliente_id=c.id,
        )
        reqs[num] = await insert_doc("requests", s)
        c.solicitudes.append(s.id)
    await db.counters.update_one({"_id": f"{COMPANY_ID}:solicitud"}, {"$set": {"seq": 846}}, upsert=True)

    # ------------------------------------------------------------ quotes
    def L(tipo, concepto, cant, precio):
        return LineaPresupuesto(tipo=tipo, concepto=concepto, cantidad=cant, precio_unitario=precio)

    year = today.year
    quote_specs = [
        (1, 837, "Reforma integral de baño", 10, "aceptado", [
            L("MATERIAL", "Plato de ducha de resina 120x80", 1, 320), L("MATERIAL", "Mampara de cristal templado", 1, 280),
            L("MATERIAL", "Azulejo porcelánico (m²)", 18, 24), L("MATERIAL", "Grifería termostática", 1, 185),
            L("MATERIAL", "Adhesivo, rejuntado y material de agarre", 1, 95),
            L("MANO_OBRA", "Demolición y retirada de escombros", 1, 450), L("MANO_OBRA", "Fontanería (horas)", 16, 30),
            L("MANO_OBRA", "Alicatado y solado (horas)", 24, 28),
        ]),
        (2, 838, "Pintura completa de vivienda 80 m²", 21, "aceptado", [
            L("MATERIAL", "Pintura plástica mate 15 L", 4, 62), L("MATERIAL", "Masilla, cinta y protección", 1, 45),
            L("MANO_OBRA", "Pintura de paredes y techos (horas)", 32, 24),
        ]),
        (3, 839, "Reparación de fuga en fregadero", 21, "pendiente", [
            L("MATERIAL", "Sifón y latiguillos", 1, 38), L("MANO_OBRA", "Reparación (horas)", 2, 35),
            L("MANO_OBRA", "Desplazamiento", 1, 25),
        ]),
        (4, 840, "Sustitución de cuadro eléctrico comunitario", 21, "rechazado", [
            L("MATERIAL", "Cuadro eléctrico con protecciones", 1, 650), L("MANO_OBRA", "Instalación (horas)", 10, 30),
        ]),
        (5, 841, "Reforma de cocina – Restaurante El Rincón", 21, "aceptado", [
            L("MATERIAL", "Azulejo antideslizante (m²)", 22, 21), L("MATERIAL", "Encimera de acero inoxidable", 1, 890),
            L("MATERIAL", "Material de fontanería", 1, 210), L("MANO_OBRA", "Albañilería (horas)", 40, 26),
            L("MANO_OBRA", "Fontanería (horas)", 8, 30),
        ]),
    ]
    quotes = {}
    for n, rnum, titulo, iva, estado, lineas in quote_specs:
        s = reqs[rnum]
        q = Presupuesto(
            numero_presupuesto=f"PR-{year}-{n:04d}", solicitud_id=s.id, cliente_id=s.cliente_id, cliente_nombre=s.nombre_cliente,
            cliente_telefono=s.telefono_cliente, cliente_correo=s.correo_cliente, direccion=s.direccion, servicio=s.servicio,
            titulo=titulo, lineas=lineas, iva_porcentaje=iva, estado=estado,
            notas="Presupuesto válido 30 días. Forma de pago: 50% al inicio y 50% a la finalización.",
            fecha_creacion=(datetime.fromisoformat(s.fecha_creacion) + timedelta(days=2)).isoformat(),
            fecha_envio=(datetime.fromisoformat(s.fecha_creacion) + timedelta(days=2)).isoformat(),
        )
        q.recalcular()
        quotes[n] = await insert_doc("quotes", q)
        s.presupuesto_id = q.id
        await save_doc("requests", s)
    await db.counters.update_one({"_id": f"{COMPANY_ID}:presupuesto"}, {"$set": {"seq": 5}}, upsert=True)

    # ------------------------------------------------------------ works
    factura_seq = 0

    async def factura():
        nonlocal factura_seq
        factura_seq += 1
        return f"F-{year}-{factura_seq:04d}"

    async def build_obra(n, qn, estado, avance, inicio, fin, wcodes, fotos, compras, horas, cobros, fin_real=None):
        q = quotes[qn]
        o = Obra(
            numero_obra=f"OB-{year}-{n:03d}", titulo=q.titulo, cliente_id=q.cliente_id, cliente_nombre=q.cliente_nombre,
            cliente_telefono=q.cliente_telefono, presupuesto_id=q.id, solicitud_id=q.solicitud_id, direccion=q.direccion,
            fecha_inicio=inicio.isoformat(), fecha_fin_prevista=fin.isoformat(), fecha_fin_real=fin_real, estado=estado,
            porcentaje_avance=avance, trabajadores_asignados=[workers[c].id for c in wcodes], fotos=fotos,
            presupuesto_previsto=q.base_imponible,
            notas="Coordinar acceso con el cliente. Proteger suelos y muebles antes de empezar.",
        )
        await insert_doc("projects", o)
        for l in q.lineas:
            if l.tipo == "MATERIAL":
                o.materiales.append(Material(concepto=l.concepto, cantidad=l.cantidad, precio_previsto=l.precio_unitario,
                                             unidad="m²" if "(m²)" in l.concepto else "ud"))
        for idx, (precio_factor, proveedor) in compras.items():
            m = o.materiales[idx]
            m.precio_real = round(m.precio_previsto * precio_factor, 2)
            m.comprado = True
            m.proveedor = proveedor
            tx = await _tx(tipo="GASTO", ambito="EMPRESA", categoria="Materiales", concepto=f"Compra: {m.concepto} ({o.numero_obra})",
                           importe=m.cantidad * m.precio_real, iva=21, fecha=(inicio + timedelta(days=1)).isoformat(),
                           obra_id=o.id, contraparte=proveedor, origen="material")
            m.transaccion_id = tx.id
        for wcode, concepto, h, d in horas:
            w = workers[wcode]
            linea = ManoObra(trabajador_id=w.id, trabajador_nombre=w.nombre, concepto=concepto, horas=h,
                             coste_hora=w.coste_hora_o_servicio, coste=round(h * w.coste_hora_o_servicio, 2), fecha=d.isoformat())
            tx = await _tx(tipo="GASTO", ambito="EMPRESA", categoria="Personal", concepto=f"{w.nombre}: {concepto} ({o.numero_obra})",
                           importe=linea.coste, iva=0, fecha=d.isoformat(), obra_id=o.id, contraparte=w.nombre, origen="mano_obra")
            linea.transaccion_id = tx.id
            o.mano_obra.append(linea)
        for pct, d in cobros:
            await _tx(tipo="INGRESO", ambito="EMPRESA", categoria="Ingresos por obra", concepto=f"Cobro {int(pct * 100)}% ({o.numero_obra})",
                      importe=round(q.base_imponible * pct, 2), iva=q.iva_porcentaje, fecha=d.isoformat(), obra_id=o.id,
                      numero_factura=await factura(), contraparte=q.cliente_nombre, origen="cobro")
        o.recalcular()
        await save_doc("projects", o)
        q.obra_id = o.id
        await save_doc("quotes", q)
        s = reqs[[k for k, v in reqs.items() if v.id == q.solicitud_id][0]]
        s.obra_id = o.id
        await save_doc("requests", s)
        for c in wcodes:
            workers[c].obras_asignadas.append(o.id)
        return o

    o1_start = today - timedelta(days=12)
    o1 = await build_obra(
        1, 1, "en_curso", 60, o1_start, today + timedelta(days=10), ["TR01", "TR04"],
        FotosObra(antes=[IMG["bano1"], IMG["bano2"]], durante=[IMG["reforma"]]),
        {0: (0.96, "Suministros Alcalá"), 2: (1.05, "Bricomadrid Centro"), 4: (1.0, "Ferretería La Llave")},
        [("TR04", "Demolición y retirada", 14, o1_start + timedelta(days=1)), ("TR01", "Instalación de fontanería", 10, o1_start + timedelta(days=4)),
         ("TR04", "Alicatado paredes", 16, o1_start + timedelta(days=8))],
        [(0.5, o1_start)],
    )
    o2_start = today - timedelta(days=50)
    o2 = await build_obra(
        2, 2, "finalizada", 100, o2_start, o2_start + timedelta(days=6), ["TR03"],
        FotosObra(antes=[IMG["interior"]], durante=[IMG["pintura2"]], despues=[IMG["salon"]]),
        {0: (0.94, "Bricomadrid Centro"), 1: (1.1, "Ferretería La Llave")},
        [("TR03", "Pintura de paredes y techos", 30, o2_start + timedelta(days=5))],
        [(0.5, o2_start), (0.5, o2_start + timedelta(days=7))], fin_real=(o2_start + timedelta(days=6)).isoformat(),
    )
    o3 = await build_obra(
        3, 5, "planificada", 0, today + timedelta(days=7), today + timedelta(days=21), ["TR04", "TR02"],
        FotosObra(antes=[IMG["cocina"]]), {}, [], [],
    )
    for c in clients.values():
        c.presupuestos = [q.id for q in quotes.values() if q.cliente_id == c.id]
        c.obras = [o.id for o in (o1, o2, o3) if o.cliente_id == c.id]
        await save_doc("clients", c)
    for w in workers.values():
        await save_doc("workers", w)
    await db.counters.update_one({"_id": f"{COMPANY_ID}:obra"}, {"$set": {"seq": 3}}, upsert=True)

    # ------------------------------------------------------------ hardware stores
    stores_spec = [
        ("FE01", "Ferretería La Llave", "Calle de Santa Engracia 64, Madrid", "Chamberí", "915550101", "L-V 9:00-14:00 / 17:00-20:30 · S 10:00-14:00",
         "Ferretería de barrio de toda la vida: cerraduras, copias de llaves y herramienta profesional.", IMG["ferre1"], 4.8,
         ["Cerraduras de seguridad", "Copias de llaves", "Herramienta Bosch", "Tornillería"], 5, 49,
         [Anuncio(titulo="15% en cerraduras de seguridad", descripcion="Bombines antibumping y cerraduras multipunto.", descuento="-15%", fecha_fin=(today + timedelta(days=20)).isoformat())]),
        ("FE02", "Suministros Alcalá", "Calle de Alcalá 310, Madrid", "Ciudad Lineal", "915550202", "L-V 8:00-19:00 · S 9:00-13:30",
         "Especialistas en fontanería, grifería y climatización para profesionales.", IMG["ferre2"], 4.6,
         ["Grifería termostática", "Tubería multicapa", "Sanitarios", "Calentadores"], 7, 59,
         [Anuncio(titulo="Grifería termostática -20%", descripcion="Para clientes derivados desde GM Conecta.", descuento="-20%", fecha_fin=(today + timedelta(days=30)).isoformat())]),
        ("FE03", "Bricomadrid Centro", "Calle de Atocha 95, Madrid", "Centro", "915550303", "L-S 9:30-21:00",
         "Pinturas, revestimientos y todo para el bricolaje del hogar.", IMG["ferre3"], 4.4,
         ["Pinturas plásticas", "Rodillos profesionales", "Masillas y alisados", "Azulejos"], 4, 39,
         [Anuncio(titulo="2x1 en rodillos profesionales", descripcion="Promoción válida en tienda presentando GM Conecta.", descuento="2x1", fecha_fin=(today + timedelta(days=12)).isoformat())]),
        ("FE04", "Electro Vallecas", "Avenida de la Albufera 120, Madrid", "Vallecas", "915550404", "L-V 9:00-14:00 / 16:30-20:00",
         "Material eléctrico, iluminación LED y automatización.", IMG["ferre4"], 4.5,
         ["Iluminación LED", "Cuadros eléctricos", "Cableado", "Domótica"], 6, 0,
         [Anuncio(titulo="Packs LED para cocina", descripcion="Paneles y tiras LED con instalación recomendada.", descuento="-10%", activo=False)]),
    ]
    stores = {}
    for codigo, nombre, dirc, barrio, tel, horario, desc, img, val, prods, com, pub, ads in stores_spec:
        f = await insert_doc("hardware_stores", Ferreteria(
            codigo=codigo, nombre=nombre, direccion=dirc, barrio=barrio, telefono=tel, horario=horario, descripcion=desc,
            imagen=img, valoracion=val, productos_destacados=prods, porcentaje_comision=com, tarifa_publicidad_mensual=pub, anuncios=ads,
        ))
        stores[codigo] = f
        await upsert_user("ferreteria", codigo, nombre, STORE_PINS[codigo], f.id)
    await db.counters.update_one({"_id": f"{COMPANY_ID}:ferreteria"}, {"$set": {"seq": 4}}, upsert=True)

    deriv_specs = [
        ("FE02", "Lucía Martín", "Grifería termostática y plato de ducha", 505, "pendiente", 10, o1.id),
        ("FE03", "Pedro Gómez", "Pintura plástica 4 cubos", 233, "cobrada", 48, o2.id),
        ("FE01", "Lucía Martín", "Material de agarre y herramienta", 95, "pendiente", 9, o1.id),
        ("FE01", "Elena Navarro", "Cambio de bombín de seguridad", 120, "cobrada", 6, None),
        ("FE04", "Comunidad Toledo 88", "Pantallas LED portal", 340, "pendiente", 18, None),
    ]
    for codigo, cli, desc, imp, estado, days_ago, obra_id in deriv_specs:
        f = stores[codigo]
        d = Derivacion(fecha=(today - timedelta(days=days_ago)).isoformat(), cliente_nombre=cli, descripcion=desc, obra_id=obra_id,
                       importe_compra=imp, comision=round(imp * f.porcentaje_comision / 100, 2), estado=estado)
        if estado == "cobrada":
            tx = await _tx(tipo="INGRESO", ambito="EMPRESA", categoria="Comisiones", concepto=f"Comisión {f.nombre}: {cli}",
                           importe=d.comision, iva=21, fecha=(today - timedelta(days=max(days_ago - 3, 0))).isoformat(),
                           contraparte=f.nombre, numero_factura=await factura(), origen="comision")
            d.transaccion_id = tx.id
        f.derivaciones.append(d)
    for f in stores.values():
        await save_doc("hardware_stores", f)

    # ------------------------------------------------------------ monthly business & household movements (last 12 months)
    contrapartes = ["Lucía Martín", "Pedro Gómez", "Marta Jiménez", "Restaurante El Rincón", "Elena Navarro", "Comunidad Toledo 88", "Jorge Pérez", "Sofía Ruiz"]
    proveedores = ["Suministros Alcalá", "Bricomadrid Centro", "Ferretería La Llave", "Electro Vallecas"]
    for back in range(11, -1, -1):
        m, y = today.month - back, today.year
        while m <= 0:
            m += 12
            y -= 1
        first = date(y, m, 1)
        last = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)

        def day(dn):
            return min(first + timedelta(days=dn - 1), last)

        async def add(d: date, **kw):
            if d <= today:
                await _tx(fecha=d.isoformat(), **kw)

        for i in range(rnd.randint(2, 4)):
            await add(day(rnd.randint(3, 27)), tipo="INGRESO", ambito="EMPRESA", categoria="Ingresos por obra",
                      concepto=rnd.choice(["Reparación fontanería", "Instalación eléctrica", "Pintura vivienda", "Reforma parcial", "Mantenimiento comunidad"]),
                      importe=rnd.randint(9, 48) * 100 + rnd.choice([0, 50]), iva=rnd.choice([21, 21, 10]),
                      numero_factura=await factura(), contraparte=rnd.choice(contrapartes))
        for i in range(rnd.randint(3, 5)):
            await add(day(rnd.randint(2, 28)), tipo="GASTO", ambito="EMPRESA", categoria="Materiales",
                      concepto=rnd.choice(["Material de fontanería", "Cableado y mecanismos", "Pintura y masillas", "Azulejos y adhesivo", "Tornillería"]),
                      importe=rnd.randint(12, 95) * 10, iva=21, contraparte=rnd.choice(proveedores))
        await add(day(28), tipo="GASTO", ambito="EMPRESA", categoria="Personal", concepto="Pagos a colaboradores", importe=rnd.randint(14, 22) * 100, iva=0, contraparte="Colaboradores")
        await add(day(30), tipo="GASTO", ambito="EMPRESA", categoria="Cuota autónomos", concepto="Cuota de autónomos RETA", importe=294, iva=0, contraparte="Seguridad Social")
        await add(day(15), tipo="GASTO", ambito="EMPRESA", categoria="Vehículo", concepto="Combustible furgoneta", importe=rnd.randint(140, 230), iva=21, contraparte="Gasolinera Repsol")
        await add(day(5), tipo="GASTO", ambito="EMPRESA", categoria="Suministros", concepto="Teléfono e internet empresa", importe=45, iva=21, contraparte="Movistar")
        if m in (1, 4, 7, 10):
            await add(day(20), tipo="GASTO", ambito="EMPRESA", categoria="Impuestos", concepto="Pago IRPF trimestral (modelo 130)", importe=rnd.randint(6, 12) * 100, iva=0, contraparte="Agencia Tributaria")
        for codigo in ("FE01", "FE02", "FE03"):
            f = stores[codigo]
            await add(day(2), tipo="INGRESO", ambito="EMPRESA", categoria="Publicidad", concepto=f"Cuota de publicidad mensual · {f.nombre}",
                      importe=f.tarifa_publicidad_mensual, iva=21, numero_factura=await factura(), contraparte=f.nombre, origen="publicidad")
        # household — never affects the business
        await add(day(1), tipo="GASTO", ambito="PERSONAL_HOGAR", categoria="Hipoteca", concepto="Cuota hipoteca vivienda", importe=780, contraparte="Banco Santander")
        await add(day(5), tipo="GASTO", ambito="PERSONAL_HOGAR", categoria="Seguros", concepto="Seguro del hogar", importe=38, contraparte="Mapfre")
        await add(day(8), tipo="GASTO", ambito="PERSONAL_HOGAR", categoria="Seguros", concepto="Seguro del coche familiar", importe=42, contraparte="Línea Directa")
        await add(day(10), tipo="GASTO", ambito="PERSONAL_HOGAR", categoria="Suministros hogar", concepto="Luz y gas", importe=rnd.randint(65, 110), contraparte="Iberdrola")
        await add(day(12), tipo="GASTO", ambito="PERSONAL_HOGAR", categoria="Suministros hogar", concepto="Agua", importe=rnd.randint(25, 38), contraparte="Canal de Isabel II")
        for i in range(rnd.randint(3, 5)):
            await add(day(rnd.randint(2, 28)), tipo="GASTO", ambito="PERSONAL_HOGAR", categoria="Supermercado", concepto="Compra semanal", importe=rnd.randint(55, 140), contraparte=rnd.choice(["Mercadona", "Carrefour", "Lidl"]))
        await add(day(rnd.randint(6, 26)), tipo="GASTO", ambito="PERSONAL_HOGAR", categoria="Ocio", concepto=rnd.choice(["Cena familiar", "Cine", "Escapada fin de semana"]), importe=rnd.randint(30, 180))
        await add(day(1), tipo="INGRESO", ambito="PERSONAL_HOGAR", categoria="Retribución propietario", concepto="Retirada de beneficios para el hogar", importe=2200, contraparte="GM Reforma Express")
    await db.counters.update_one({"_id": f"{COMPANY_ID}:factura"}, {"$set": {"seq": factura_seq}}, upsert=True)

    # ------------------------------------------------------------ agenda
    def next_day(dn: int, months_ahead: int = 0) -> date:
        m, y = today.month + months_ahead, today.year
        while m > 12:
            m -= 12
            y += 1
        first = date(y, m, 1)
        last = (first + timedelta(days=32)).replace(day=1) - timedelta(days=1)
        return min(first + timedelta(days=dn - 1), last)

    reminders = [
        Recordatorio(titulo="Visita técnica – fuga en fregadero", descripcion="Marta Jiménez · Bravo Murillo 210", fecha=(today + timedelta(days=1)).isoformat(), hora="10:00", tipo="visita"),
        Recordatorio(titulo="Visita – alisado de paredes", descripcion="Marta Jiménez, medir salón", fecha=(today + timedelta(days=3)).isoformat(), hora="17:30", tipo="visita"),
        Recordatorio(titulo="Inicio obra cocina Restaurante El Rincón", descripcion=o3.numero_obra, fecha=o3.fecha_inicio, hora="08:00", tipo="obra", obra_id=o3.id),
        Recordatorio(titulo="Cobro 50% final – Lucía Martín", descripcion=f"Obra {o1.numero_obra}", fecha=o1.fecha_fin_prevista, tipo="cobro", importe=round(o1.presupuesto_previsto * 0.5, 2), obra_id=o1.id),
        Recordatorio(titulo="Vencimiento factura Suministros Alcalá", fecha=(today + timedelta(days=9)).isoformat(), tipo="factura", importe=412.5),
        Recordatorio(titulo="Revisión pendiente – urgencia cerrajería", fecha=(today - timedelta(days=4)).isoformat(), tipo="visita", completado=True),
    ]
    for ahead in (0, 1, 2):
        reminders += [
            Recordatorio(titulo="Cuota de autónomos", fecha=next_day(30, ahead).isoformat(), tipo="pago", ambito="EMPRESA", importe=294),
            Recordatorio(titulo="Hipoteca vivienda", fecha=next_day(1, ahead + 1 if ahead == 0 else ahead).isoformat(), tipo="pago", ambito="PERSONAL_HOGAR", importe=780),
            Recordatorio(titulo="Seguro del hogar", fecha=next_day(5, ahead).isoformat(), tipo="pago", ambito="PERSONAL_HOGAR", importe=38),
        ]
    q_month = next(mm for mm in (1, 4, 7, 10, 13) if mm > today.month or (mm == today.month and today.day <= 20))
    q_date = date(today.year + (1 if q_month == 13 else 0), 1 if q_month == 13 else q_month, 20)
    reminders.append(Recordatorio(titulo="Declaración trimestral IVA (modelo 303)", descripcion="Enviar exportación CSV a la gestoría", fecha=q_date.isoformat(), tipo="pago", ambito="EMPRESA"))
    seen = set()
    for r in reminders:
        key = (r.titulo, r.fecha)
        if key in seen or (r.fecha < today.isoformat() and not r.completado):
            continue
        seen.add(key)
        await insert_doc("reminders", r)

    # ------------------------------------------------------------ message history
    s837 = reqs[837]
    for tipo, asunto, cuerpo in [
        ("confirmacion_cliente", "Hemos recibido tu solicitud GC-000837", "Confirmación automática de recepción."),
        ("respuesta", "GM Conecta · Respuesta a tu solicitud GC-000837", "Hola Lucía, pasaremos el jueves a las 10:00 para medir el baño."),
        ("presupuesto", f"GM Conecta · Presupuesto {quotes[1].numero_presupuesto}", f"Presupuesto {quotes[1].numero_presupuesto} – total {quotes[1].total} €"),
    ]:
        await insert_doc("messages", Mensaje(tipo=tipo, solicitud_id=s837.id, cliente_id=s837.cliente_id, destinatario=s837.correo_cliente,
                                             asunto=asunto, cuerpo=cuerpo, estado="simulado_pendiente_api_key",
                                             fecha=(datetime.fromisoformat(s837.fecha_creacion) + timedelta(hours=2)).isoformat()))

    await db.settings.update_one({"_id": COMPANY_ID}, {"$set": {"seeded": True}})
    logger.info("Seed complete")


async def upsert_admin() -> None:
    if not await db.users.find_one({"role": "admin", "code": "admin"}):
        await upsert_user("admin", "admin", "Admin GM Conecta", ADMIN_PIN, None)


async def migrate_pins() -> None:
    """Move old 4-digit PINs to the 6-digit policy. Unknown profiles get a random PIN the admin must reset."""
    async for doc in db.users.find({"pin_version": {"$ne": 2}}):
        pin = DEFAULT_PINS.get((doc["role"], doc["code"]))
        reset = pin is None
        if reset:
            pin = f"{secrets.randbelow(10**6):06d}"
        await db.users.update_one(
            {"_id": doc["_id"]},
            {"$set": {"pin_hash": hasher.hash(pin), "pin_version": 2, "pin_reset_required": reset}},
        )
        logger.info("PIN migrated to 6 digits for %s/%s%s", doc["role"], doc["code"], " (reset required)" if reset else "")
