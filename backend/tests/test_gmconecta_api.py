"""GM Conecta backend regression tests (auth, solicitudes, presupuesto->obra, finanzas, gestoria, ferreterias, worker, config)."""
import os
import io
import uuid
import base64
import pytest
import requests

def _base():
    url = os.environ.get("EXPO_PUBLIC_BACKEND_URL") or os.environ.get("EXPO_BACKEND_URL")
    if not url:
        for line in open("/app/frontend/.env"):
            if line.startswith("EXPO_PUBLIC_BACKEND_URL="):
                url = line.split("=", 1)[1].strip().strip('"')
    return url.rstrip("/") + "/api"

API = _base()
PNG = base64.b64decode("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==")
STATE = {}


def login(role, code, pin):
    return requests.post(f"{API}/auth/login", json={"role": role, "code": code, "pin": pin}, timeout=20)


def H(tok):
    return {"Authorization": f"Bearer {tok}"}


@pytest.fixture(scope="session")
def admin():
    r = login("admin", "admin", "1234")
    if r.status_code != 200:
        pytest.skip("admin login failed")
    return H(r.json()["access_token"])


@pytest.fixture(scope="session")
def worker():
    r = login("trabajador", "TR01", "1111")
    assert r.status_code == 200
    return H(r.json()["access_token"]), r.json()["entity_id"]


@pytest.fixture(scope="session")
def store():
    r = login("ferreteria", "FE01", "2222")
    assert r.status_code == 200
    return H(r.json()["access_token"])


def new_solicitud(key=None):
    body = {"idempotency_key": key or f"TEST_{uuid.uuid4().hex}", "servicio": "Fontanería",
            "descripcion": "TEST_ fuga de agua en cocina bajo fregadero", "nombre_cliente": "TEST_Cliente",
            "telefono_cliente": "600111222", "correo_cliente": "test_cliente@example.com", "direccion": "Calle Test 1, Madrid"}
    return body, requests.post(f"{API}/solicitudes", json=body, timeout=20)


# ---------------- auth
class TestAuth:
    def test_logins(self):
        for role, code, pin in (("admin", "admin", "1234"), ("trabajador", "TR01", "1111"), ("ferreteria", "FE01", "2222")):
            r = login(role, code, pin)
            assert r.status_code == 200, r.text
            d = r.json()
            assert d["role"] == role and d["access_token"]

    def test_wrong_pin_401(self):
        r = login("trabajador", "TR05", "9999")
        assert r.status_code == 401

    def test_role_guard(self, worker, store):
        assert requests.get(f"{API}/admin/dashboard", headers=worker[0]).status_code == 403
        assert requests.get(f"{API}/admin/obras", headers=store).status_code == 403
        assert requests.get(f"{API}/admin/dashboard").status_code == 401

    def test_me(self, admin):
        r = requests.get(f"{API}/auth/me", headers=admin)
        assert r.status_code == 200 and r.json()["role"] == "admin"


# ---------------- public solicitudes
class TestSolicitudes:
    def test_create_idempotent_mine_lookup(self):
        body, r = new_solicitud()
        assert r.status_code == 201, r.text
        d = r.json()
        assert d["numero_solicitud"].startswith("GC-")
        _, r2 = new_solicitud(body["idempotency_key"])
        assert r2.status_code == 200 and r2.json()["numero_solicitud"] == d["numero_solicitud"]
        m = requests.post(f"{API}/solicitudes/mine", json={"items": [{"numero": d["numero_solicitud"], "key": body["idempotency_key"]}]})
        assert m.status_code == 200 and len(m.json()) == 1
        bad = requests.post(f"{API}/solicitudes/mine", json={"items": [{"numero": d["numero_solicitud"], "key": "wrongkey123"}]})
        assert bad.json() == []
        lk = requests.post(f"{API}/solicitudes/lookup", json={"numero": d["numero_solicitud"], "telefono": "600 111 222"})
        assert lk.status_code == 200 and lk.json()["numero_solicitud"] == d["numero_solicitud"]
        lk404 = requests.post(f"{API}/solicitudes/lookup", json={"numero": d["numero_solicitud"], "telefono": "699999999"})
        assert lk404.status_code == 404
        STATE["sol"] = d

    def test_validation(self):
        r = requests.post(f"{API}/solicitudes", json={"idempotency_key": "TEST_short"})
        assert r.status_code == 422


# ---------------- presupuesto -> obra -> profitability
class TestPresupuestoObra:
    def test_flow(self, admin, worker):
        _, r = new_solicitud()
        sol = r.json()
        sol_id = sol["id"]
        q = requests.post(f"{API}/admin/presupuestos", headers=admin, json={
            "solicitud_id": sol_id, "cliente_nombre": "TEST_Cliente", "cliente_telefono": "600111222",
            "cliente_correo": "test_cliente@example.com", "direccion": "Calle Test 1", "servicio": "Fontanería",
            "titulo": "TEST_ Reparación fuga", "iva_porcentaje": 21,
            "lineas": [{"tipo": "MATERIAL", "concepto": "Tubo PVC", "cantidad": 2, "precio_unitario": 10},
                       {"tipo": "MANO_OBRA", "concepto": "Instalación", "cantidad": 3, "precio_unitario": 30}]})
        assert q.status_code == 201, q.text
        qd = q.json()
        assert qd["base_imponible"] == 110 and abs(qd["total"] - 133.1) < 0.01
        s = requests.get(f"{API}/admin/solicitudes/{sol_id}", headers=admin).json()
        s = s.get("solicitud", s)
        assert s["estado"] == "presupuestado"
        # convert before accept -> 409
        c0 = requests.post(f"{API}/admin/presupuestos/{qd['id']}/convertir-obra", headers=admin,
                           json={"fecha_inicio": "2026-02-01", "fecha_fin_prevista": "2026-02-10", "trabajadores": [worker[1]]})
        assert c0.status_code == 409
        p = requests.patch(f"{API}/admin/presupuestos/{qd['id']}", headers=admin, json={"estado": "aceptado"})
        assert p.status_code == 200 and p.json()["estado"] == "aceptado"
        c = requests.post(f"{API}/admin/presupuestos/{qd['id']}/convertir-obra", headers=admin,
                          json={"fecha_inicio": "2026-02-01", "fecha_fin_prevista": "2026-02-10", "trabajadores": [worker[1]]})
        assert c.status_code == 201, c.text
        cd = c.json()
        obra = cd.get("obra", cd)
        obra_id = obra["id"]
        STATE["obra_id"] = obra_id
        s = requests.get(f"{API}/admin/solicitudes/{sol_id}", headers=admin).json()
        s = s.get("solicitud", s)
        assert s["estado"] == "en_obra"
        o = requests.get(f"{API}/admin/obras/{obra_id}", headers=admin).json()
        assert len(o["materiales"]) == 1
        mat = o["materiales"][0]
        m = requests.patch(f"{API}/admin/obras/{obra_id}/materiales/{mat['id']}", headers=admin, json={"comprado": True, "precio_real": 12, "proveedor": "TEST_Prov"})
        assert m.status_code == 200, m.text
        md = m.json()
        assert md["coste_materiales_real"] == 24
        txs = requests.get(f"{API}/admin/movimientos?ambito=EMPRESA&tipo=GASTO&limit=500", headers=admin).json()
        assert any(t.get("obra_id") == obra_id and t["categoria"] == "Materiales" and t["importe"] == 24 for t in txs)
        mo = requests.post(f"{API}/admin/obras/{obra_id}/mano-obra", headers=admin, json={"trabajador_id": worker[1], "concepto": "TEST horas", "horas": 2, "coste_hora": 20})
        assert mo.status_code == 201, mo.text
        mod = mo.json()
        assert mod["coste_mano_obra_real"] == 40
        assert mod["beneficio_neto"] == round(mod["ingresos_totales"] - 24 - 40, 2)
        cb = requests.post(f"{API}/admin/obras/{obra_id}/cobros", headers=admin, json={"importe": 50, "iva": 21})
        assert cb.status_code == 201, cb.text
        cbd = cb.json()
        assert cbd["cobrado"] == 50 and cbd["cobros"][0]["numero_factura"].startswith("F-")
        # linked tx cannot be deleted directly
        mat_tx = next(t for t in txs if t.get("obra_id") == obra_id and t["categoria"] == "Materiales")
        assert requests.delete(f"{API}/admin/movimientos/{mat_tx['id']}", headers=admin).status_code == 409
        # cleanup finance txs created by this test (obra/presupuesto cannot be deleted via API)
        un = requests.patch(f"{API}/admin/obras/{obra_id}/materiales/{mat['id']}", headers=admin, json={"comprado": False})
        assert un.status_code == 200 and un.json()["coste_materiales_real"] == 0
        for l in mod["mano_obra"]:
            requests.delete(f"{API}/admin/obras/{obra_id}/mano-obra/{l['id']}", headers=admin)
        for c in cbd["cobros"]:
            # issued invoices (cobros) cannot be deleted: consecutive numbering
            assert requests.delete(f"{API}/admin/movimientos/{c['id']}", headers=admin).status_code == 409
        left = [t for t in requests.get(f"{API}/admin/movimientos?limit=500", headers=admin).json() if t.get("obra_id") == obra_id]
        assert [t["origen"] for t in left] == ["cobro"]


# ---------------- worker
class TestWorker:
    def test_worker_obras(self, worker, admin):
        tok, wid = worker
        r = requests.get(f"{API}/trabajador/obras", headers=tok)
        assert r.status_code == 200
        obras = r.json()
        assert obras and all(True for _ in obras)
        all_obras = requests.get(f"{API}/admin/obras", headers=admin).json()
        all_obras = all_obras.get("items", all_obras) if isinstance(all_obras, dict) else all_obras
        mine = {o["id"] for o in obras}
        other = next((o for o in all_obras if o["id"] not in mine), None)
        if other:
            assert requests.get(f"{API}/trabajador/obras/{other['id']}", headers=tok).status_code == 403
            assert requests.patch(f"{API}/trabajador/obras/{other['id']}/avance", headers=tok, json={"porcentaje_avance": 10}).status_code == 403

    def test_avance_and_foto(self, worker):
        tok, _ = worker
        obra_id = STATE.get("obra_id")
        if not obra_id:
            pytest.skip("no test obra")
        a = requests.patch(f"{API}/trabajador/obras/{obra_id}/avance", headers=tok, json={"porcentaje_avance": 40})
        assert a.status_code == 200 and a.json()["porcentaje_avance"] == 40 and a.json()["estado"] == "en_curso"
        assert requests.patch(f"{API}/trabajador/obras/{obra_id}/avance", headers=tok, json={"porcentaje_avance": 140}).status_code == 422
        bad = requests.post(f"{API}/trabajador/obras/{obra_id}/fotos", headers=tok, json={"fase": "durante", "path": "nope/missing.png"})
        assert bad.status_code == 400
        up = requests.post(f"{API}/upload", headers=tok, files={"file": ("TEST_p.png", io.BytesIO(PNG), "image/png")})
        assert up.status_code in (200, 201), up.text
        path = up.json()["path"]
        f = requests.post(f"{API}/trabajador/obras/{obra_id}/fotos", headers=tok, json={"fase": "durante", "path": path})
        assert f.status_code == 200 and path in f.json()["fotos"]["durante"]
        g = requests.get(f"{API}/files/{path}", headers=tok)
        print("file GET status", g.status_code)


# ---------------- finanzas
class TestFinanzas:
    def test_hogar_with_obra_422(self, admin):
        r = requests.post(f"{API}/admin/movimientos", headers=admin, json={"tipo": "GASTO", "ambito": "PERSONAL_HOGAR", "categoria": "Hogar",
                          "concepto": "TEST_ compra", "importe": 10, "fecha": "2026-01-10", "obra_id": STATE.get("obra_id", "x")})
        assert r.status_code == 422

    def test_hogar_movement_and_resumen(self, admin):
        r = requests.post(f"{API}/admin/movimientos", headers=admin, json={"tipo": "GASTO", "ambito": "PERSONAL_HOGAR", "categoria": "Supermercado",
                          "concepto": "TEST_ super", "importe": 33.33, "fecha": "2026-01-10"})
        assert r.status_code == 201, r.text
        mid = r.json()["id"]
        try:
            e = requests.get(f"{API}/admin/finanzas/resumen?ambito=EMPRESA", headers=admin)
            h = requests.get(f"{API}/admin/finanzas/resumen?ambito=PERSONAL_HOGAR", headers=admin)
            assert e.status_code == 200 and h.status_code == 200
            assert e.json() != h.json()
            emp = requests.get(f"{API}/admin/movimientos?ambito=EMPRESA&limit=500", headers=admin).json()
            assert all(m["ambito"] == "EMPRESA" for m in emp) and not any(m["id"] == mid for m in emp)
        finally:
            assert requests.delete(f"{API}/admin/movimientos/{mid}", headers=admin).status_code == 200


# ---------------- gestoria
class TestGestoria:
    def test_gestoria(self, admin):
        r = requests.get(f"{API}/admin/gestoria?anio=2026&trimestre=0", headers=admin)
        assert r.status_code == 200 and "resumen" in r.json()

    def test_csv(self, admin):
        session = admin["Authorization"].split(" ")[1]
        dl = requests.post(f"{API}/admin/gestoria/export-token", headers=admin).json()["token"]
        r = requests.get(f"{API}/admin/gestoria/export.csv?anio=2026&trimestre=0&dl={dl}")
        assert r.status_code == 200 and "text/csv" in r.headers["content-type"]
        assert "IVA repercutido" in r.text
        assert requests.get(f"{API}/admin/gestoria/export.csv?anio=2026&trimestre=0").status_code == 401
        # the long-lived session token is not accepted as a download token
        assert requests.get(f"{API}/admin/gestoria/export.csv?anio=2026&trimestre=0&dl={session}").status_code == 401


# ---------------- ferreterias admin + store role
class TestFerreterias:
    def test_admin_comisiones(self, admin):
        r = requests.get(f"{API}/admin/comisiones", headers=admin)
        assert r.status_code == 200 and "por_ferreteria" in r.json()

    def test_derivacion_publicidad(self, admin):
        f = requests.post(f"{API}/admin/ferreterias", headers=admin, json={"nombre": "TEST_Ferreteria", "direccion": "Calle Test 9",
                          "porcentaje_comision": 10, "tarifa_publicidad_mensual": 25, "pin": "4321"})
        assert f.status_code == 201, f.text
        fid = f.json()["id"]
        STATE["store_id"] = fid
        d = requests.post(f"{API}/admin/ferreterias/{fid}/derivaciones", headers=admin, json={"cliente_nombre": "TEST_Cli", "importe_compra": 200})
        assert d.status_code == 201
        der = d.json()["derivaciones"][0]
        assert der["comision"] == 20 and der["estado"] == "pendiente"
        c = requests.patch(f"{API}/admin/ferreterias/{fid}/derivaciones/{der['id']}", headers=admin, json={"estado": "cobrada"})
        assert c.status_code == 200
        txid = c.json()["derivaciones"][0]["transaccion_id"]
        ing = requests.get(f"{API}/admin/movimientos?tipo=INGRESO&limit=500", headers=admin).json()
        assert any(t["id"] == txid and t["categoria"] == "Comisiones" for t in ing)
        # an invoiced commission cannot go back to pending (consecutive invoice numbering)
        back = requests.patch(f"{API}/admin/ferreterias/{fid}/derivaciones/{der['id']}", headers=admin, json={"estado": "pendiente"})
        assert back.status_code == 409
        p = requests.post(f"{API}/admin/ferreterias/{fid}/publicidad", headers=admin, json={})
        assert p.status_code == 201 and p.json()["importe"] == 25 and p.json()["categoria"] == "Publicidad"
        # issued invoices cannot be deleted
        assert requests.delete(f"{API}/admin/movimientos/{p.json()['id']}", headers=admin).status_code == 409
        assert requests.patch(f"{API}/admin/ferreterias/{fid}", headers=admin, json={"activa": False}).status_code == 200

    def test_store_me_and_ads(self, store):
        me = requests.get(f"{API}/ferreteria/me", headers=store)
        assert me.status_code == 200
        orig = me.json()
        try:
            p = requests.patch(f"{API}/ferreteria/me", headers=store, json={"horario": "TEST_ L-V 9-14"})
            assert p.status_code == 200 and p.json()["horario"] == "TEST_ L-V 9-14"
        finally:
            requests.patch(f"{API}/ferreteria/me", headers=store, json={"horario": orig["horario"]})
        a = requests.post(f"{API}/ferreteria/me/anuncios", headers=store, json={"titulo": "TEST_ Promo", "descuento": "-10%", "fecha_fin": "2026-12-31"})
        assert a.status_code == 201
        ad = next(x for x in a.json()["anuncios"] if x["titulo"] == "TEST_ Promo")
        try:
            u = requests.patch(f"{API}/ferreteria/me/anuncios/{ad['id']}", headers=store, json={"fecha_fin": "", "activo": False})
            assert u.status_code == 200
            ad2 = next(x for x in u.json()["anuncios"] if x["id"] == ad["id"])
            assert ad2["fecha_fin"] is None and ad2["activo"] is False
            pub = requests.get(f"{API}/ferreterias/{orig['id']}").json()
            assert not any(x["id"] == ad["id"] for x in pub["anuncios"])
        finally:
            dl = requests.delete(f"{API}/ferreteria/me/anuncios/{ad['id']}", headers=store)
            assert dl.status_code == 200 and not any(x["id"] == ad["id"] for x in dl.json()["anuncios"])


# ---------------- configuracion
class TestConfig:
    def test_config_and_probar_email(self, admin):
        g = requests.get(f"{API}/admin/configuracion", headers=admin)
        assert g.status_code == 200
        s = g.json()["settings"]
        orig_cif = s.get("cif")
        assert any(i["clave"] == "resend" for i in g.json()["integraciones"])
        if not s.get("admin_email"):
            r = requests.post(f"{API}/admin/configuracion/probar-email", headers=admin)
            assert r.status_code == 422
        p = requests.patch(f"{API}/admin/configuracion", headers=admin, json={"cif": "B00000000"})
        assert p.status_code == 200 and p.json()["settings"]["cif"] == "B00000000"
        requests.patch(f"{API}/admin/configuracion", headers=admin, json={"cif": orig_cif or ""})
        msgs = requests.get(f"{API}/admin/mensajes", headers=admin)
        assert msgs.status_code == 200 and isinstance(msgs.json(), list)


# ---------------- admin list endpoints smoke
@pytest.mark.parametrize("path", ["dashboard", "solicitudes", "clientes", "presupuestos", "obras", "trabajadores", "recordatorios", "ferreterias", "movimientos"])
def test_admin_lists(admin, path):
    r = requests.get(f"{API}/admin/{path}", headers=admin)
    assert r.status_code == 200, r.text
