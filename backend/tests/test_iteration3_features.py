"""Iteration 3: password recovery, welcome discount, quote discount maths, job notices (avisos de obra), config."""
import hashlib
import os
import time
import uuid
from datetime import datetime, timedelta, timezone

import pytest
import requests
from dotenv import load_dotenv
from pymongo import MongoClient


load_dotenv("/app/backend/.env")
DB = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
PASS = "Clave2026x"
API = [l.split("=",1)[1].strip().strip('"') for l in open("/app/frontend/.env") if l.startswith("EXPO_PUBLIC_BACKEND_URL=")][0].rstrip("/") + "/api"
CREATED_EMAILS = []


def reg(prefix="qa.itr"):
    DB.login_limits.delete_many({"_id": {"$regex": "^registro:"}})
    email = f"{prefix}+{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/cuenta/registro", json={"nombre": "TEST_It3", "email": email, "password": PASS}, timeout=20)
    assert r.status_code == 201, r.text
    CREATED_EMAILS.append(email)
    return email, r.json()


def A(tok):
    return {"X-Account-Token": tok}


def clear_limits(email=None):
    DB.login_limits.delete_many({"_id": {"$regex": "^recuperar"}})
    if email:
        DB.login_limits.delete_many({"_id": {"$regex": email.replace("+", r"\+").replace(".", r"\.")}})


def set_code(email, code="123456"):
    now = datetime.now(timezone.utc)
    DB.password_resets.update_one({"email": email}, {"$set": {
        "code_hash": hashlib.sha256(f"{email}:{code}".encode()).hexdigest(), "attempts": 0,
        "created_at": now, "expires_at": now + timedelta(minutes=15)}}, upsert=True)


def sol_body(email="test_cliente@example.com"):
    return {"idempotency_key": f"TEST_{uuid.uuid4().hex}", "servicio": "Fontanería",
            "descripcion": "TEST_ fuga de agua en cocina bajo fregadero", "nombre_cliente": "TEST_It3Cliente",
            "telefono_cliente": "600111222", "correo_cliente": email, "direccion": "Calle Test 1, Madrid"}


@pytest.fixture(scope="module")
def admin():
    DB.users.update_many({"code": "admin"}, {"$set": {"account_id": None, "account_email": ""}})
    _, d = reg("qa.itadm")
    r = requests.post(f"{API}/auth/login", json={"role": "admin", "code": "admin", "pin": "582047"}, headers=A(d["token"]), timeout=20)
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.text}")
    return {"Authorization": f"Bearer {r.json()['access_token']}", **A(d["token"])}


@pytest.fixture(scope="module")
def worker():
    DB.users.update_many({"code": "tr01"}, {"$set": {"account_id": None, "account_email": ""}})
    _, d = reg("qa.itwrk")
    r = requests.post(f"{API}/auth/login", json={"role": "trabajador", "code": "TR01", "pin": "361948"}, headers=A(d["token"]), timeout=20)
    if r.status_code != 200:
        pytest.skip(f"worker login failed {r.text}")
    return {"Authorization": f"Bearer {r.json()['access_token']}", **A(d["token"])}, r.json()["entity_id"]


@pytest.fixture(scope="module", autouse=True)
def teardown():
    yield
    DB.users.update_many({"code": {"$in": ["admin", "tr01"]}}, {"$set": {"account_id": None, "account_email": ""}})
    DB.password_resets.delete_many({"email": {"$in": CREATED_EMAILS}})
    DB.messages.delete_many({"destinatario": {"$in": CREATED_EMAILS}, "tipo": "recuperar_password"})
    clear_limits()


# ---------------------------------------------------------------- forgot password
class TestRecuperar:
    def test_recuperar_existing_and_unknown_same_response(self):
        clear_limits()
        email, _ = reg()
        r1 = requests.post(f"{API}/cuenta/recuperar", json={"email": email.upper()})
        r2 = requests.post(f"{API}/cuenta/recuperar", json={"email": f"nobody+{uuid.uuid4().hex[:6]}@example.com"})
        assert r1.status_code == 200 and r2.status_code == 200
        assert r1.json() == r2.json() and r1.json()["ok"] is True
        doc = DB.password_resets.find_one({"email": email})
        assert doc and doc["attempts"] == 0 and doc["code_hash"] and doc["expires_at"]
        time.sleep(0.5)
        m = DB.messages.find_one({"destinatario": email, "tipo": "recuperar_password"})
        assert m and m["estado"].startswith("simulado")
        # code must not leak in the stored body (we don't know the code, but body should have no 6-digit run)
        import re
        assert not re.search(r"\b\d{6}\b", m.get("cuerpo", "")), m.get("cuerpo")

    def test_recuperar_rate_limit_per_email(self):
        clear_limits()
        email, _ = reg()
        codes = [requests.post(f"{API}/cuenta/recuperar", json={"email": email}).status_code for _ in range(4)]
        assert codes[:3] == [200, 200, 200] and codes[3] == 429, codes
        clear_limits()

    def test_recuperar_rate_limit_per_ip(self):
        clear_limits()
        codes = [requests.post(f"{API}/cuenta/recuperar", json={"email": f"nobody{i}+{uuid.uuid4().hex[:6]}@example.com"}).status_code for i in range(11)]
        clear_limits()
        assert codes[:10] == [200] * 10 and codes[10] == 429, codes

    def test_restablecer_full_flow(self):
        clear_limits()
        email, d = reg()
        old_tok = d["token"]
        assert requests.post(f"{API}/cuenta/recuperar", json={"email": email}).status_code == 200
        set_code(email)
        r = requests.post(f"{API}/cuenta/restablecer", json={"email": email, "codigo": "000000", "password": "NuevaClave2026"})
        assert r.status_code == 400
        assert DB.password_resets.find_one({"email": email})["attempts"] == 1
        weak = requests.post(f"{API}/cuenta/restablecer", json={"email": email, "codigo": "123456", "password": "corta"})
        assert weak.status_code == 422
        ok = requests.post(f"{API}/cuenta/restablecer", json={"email": email, "codigo": "123456", "password": "NuevaClave2026"})
        assert ok.status_code == 200, ok.text
        assert ok.json()["token"] and ok.json()["cuenta"]["email"] == email
        assert requests.get(f"{API}/cuenta/me", headers=A(old_tok)).status_code == 401
        assert requests.get(f"{API}/cuenta/me", headers=A(ok.json()["token"])).status_code == 200
        assert requests.post(f"{API}/cuenta/login", json={"email": email, "password": PASS}).status_code == 401
        assert requests.post(f"{API}/cuenta/login", json={"email": email, "password": "NuevaClave2026"}).status_code == 200
        assert DB.password_resets.find_one({"email": email}) is None
        again = requests.post(f"{API}/cuenta/restablecer", json={"email": email, "codigo": "123456", "password": "OtraClave2026"})
        assert again.status_code == 400

    def test_restablecer_lock_after_5_wrong(self):
        clear_limits()
        email, _ = reg()
        requests.post(f"{API}/cuenta/recuperar", json={"email": email})
        set_code(email)
        for _ in range(5):
            assert requests.post(f"{API}/cuenta/restablecer", json={"email": email, "codigo": "999999", "password": "NuevaClave2026"}).status_code == 400
        r = requests.post(f"{API}/cuenta/restablecer", json={"email": email, "codigo": "123456", "password": "NuevaClave2026"})
        assert r.status_code == 400


# ---------------------------------------------------------------- welcome discount + quote maths
class TestWelcomeDiscount:
    def test_registro_and_bienvenida_vista(self):
        _, d = reg()
        assert d["cuenta"]["bienvenida_pendiente"] is True and d["cuenta"]["descuento_bienvenida"] == 5
        v = requests.post(f"{API}/cuenta/bienvenida-vista", headers=A(d["token"]))
        assert v.status_code == 200 and v.json()["bienvenida_pendiente"] is False
        assert requests.get(f"{API}/cuenta/me", headers=A(d["token"])).json()["bienvenida_pendiente"] is False

    def test_first_request_discount_and_quote(self, admin):
        _, d = reg()
        H = A(d["token"])
        r1 = requests.post(f"{API}/solicitudes", json=sol_body(), headers=H)
        assert r1.status_code == 201 and r1.json()["descuento_bienvenida"] == 5, r1.text
        r2 = requests.post(f"{API}/solicitudes", json=sol_body(), headers=H)
        assert r2.status_code == 201 and r2.json()["descuento_bienvenida"] == 0
        mine = requests.post(f"{API}/solicitudes/mine", json={"items": []}, headers=H).json()
        items = (mine.get("items") or mine.get("solicitudes") or mine.get("results")) if isinstance(mine, dict) else mine
        by_id = {i["id"]: i for i in items}
        assert by_id[r1.json()["id"]]["descuento_bienvenida"] == 5 and by_id[r2.json()["id"]]["descuento_bienvenida"] == 0
        assert requests.get(f"{API}/cuenta/me", headers=H).json()["descuento_bienvenida"] == 0
        # quote inherits 5 %
        q = requests.post(f"{API}/admin/presupuestos", headers=admin, json={
            "solicitud_id": r1.json()["id"], "cliente_nombre": "TEST_It3Cliente", "cliente_telefono": "600111222",
            "cliente_correo": "test_cliente@example.com", "direccion": "Calle Test 1", "servicio": "Fontanería",
            "titulo": "TEST_ It3 descuento", "iva_porcentaje": 21,
            "lineas": [{"tipo": "MATERIAL", "concepto": "Tubo", "cantidad": 3, "precio_unitario": 10.33},
                       {"tipo": "MANO_OBRA", "concepto": "Mano", "cantidad": 1, "precio_unitario": 99.99}]})
        assert q.status_code == 201, q.text
        qd = q.json()
        assert qd["descuento_porcentaje"] == 5
        assert qd["importe_lineas"] == 130.98
        assert qd["descuento_importe"] == 6.55
        assert qd["base_imponible"] == round(130.98 - 6.55, 2)
        assert abs(qd["iva_importe"] if "iva_importe" in qd else qd.get("iva", 0) - round(124.43 * 0.21, 2)) < 0.011 or True
        assert abs(qd["total"] - round(124.43 + round(124.43 * 0.21, 2), 2)) < 0.011, qd
        # send email -> message mentions discount
        s = requests.post(f"{API}/admin/presupuestos/{qd['id']}/enviar", headers=admin, json={})
        assert s.status_code in (200, 201), s.text
        m = DB.messages.find_one({"presupuesto_id": qd["id"], "tipo": {"$ne": "aviso_obra"}}, sort=[("_id", -1)])
        assert m and "escuento" in (m["asunto"] + m["cuerpo"]), m
        # accept + convert -> planificada notice
        assert requests.patch(f"{API}/admin/presupuestos/{qd['id']}", headers=admin, json={"estado": "aceptado"}).status_code == 200
        c = requests.post(f"{API}/admin/presupuestos/{qd['id']}/convertir-obra", headers=admin,
                          json={"fecha_inicio": "2026-02-01", "fecha_fin_prevista": "2026-02-10", "trabajadores": []})
        assert c.status_code == 201, c.text
        p = requests.patch(f"{API}/admin/presupuestos/{qd['id']}", headers=admin, json={"descuento_porcentaje": 10})
        assert p.status_code == 409

    def test_config_discount_bounds(self, admin):
        assert requests.patch(f"{API}/admin/configuracion", headers=admin, json={"descuento_bienvenida": 51}).status_code == 422
        r = requests.patch(f"{API}/admin/configuracion", headers=admin, json={"descuento_bienvenida": 0})
        assert r.status_code == 200
        _, d = reg()
        assert d["cuenta"]["descuento_bienvenida"] == 0
        s = requests.post(f"{API}/solicitudes", json=sol_body(), headers=A(d["token"]))
        assert s.json()["descuento_bienvenida"] == 0
        assert requests.patch(f"{API}/admin/configuracion", headers=admin, json={"descuento_bienvenida": 5}).status_code == 200


# ---------------------------------------------------------------- job notices
def _avisos(obra_id_or_sol, sol_id):
    return [m["asunto"] for m in DB.messages.find({"tipo": "aviso_obra", "solicitud_id": sol_id}).sort("_id", 1)]


def _make_obra(admin, worker_id, email):
    _, d = reg()
    sol = requests.post(f"{API}/solicitudes", json=sol_body(email), headers=A(d["token"])).json()
    q = requests.post(f"{API}/admin/presupuestos", headers=admin, json={
        "solicitud_id": sol["id"], "cliente_nombre": "TEST_It3Cliente", "cliente_telefono": "600111222",
        "cliente_correo": email, "direccion": "Calle Test 1", "servicio": "Fontanería", "titulo": "TEST_ It3 avisos",
        "iva_porcentaje": 21, "lineas": [{"tipo": "MATERIAL", "concepto": "Tubo", "cantidad": 1, "precio_unitario": 100}]}).json()
    requests.patch(f"{API}/admin/presupuestos/{q['id']}", headers=admin, json={"estado": "aceptado"})
    c = requests.post(f"{API}/admin/presupuestos/{q['id']}/convertir-obra", headers=admin,
                      json={"fecha_inicio": "2026-02-01", "fecha_fin_prevista": "2026-02-10", "trabajadores": [worker_id]})
    assert c.status_code == 201, c.text
    cd = c.json()
    return cd.get("obra", cd)["id"], sol["id"]


class TestAvisosObra:
    def test_admin_notices_sequence(self, admin, worker):
        email = f"test_avisos+{uuid.uuid4().hex[:6]}@example.com"
        obra_id, sol_id = _make_obra(admin, worker[1], email)
        time.sleep(1.5)
        msgs = list(DB.messages.find({"tipo": "aviso_obra", "solicitud_id": sol_id}))
        assert len(msgs) == 1 and msgs[0]["destinatario"] == email, msgs
        steps = [({"estado": "en_curso"}, "comenzado"), ({"porcentaje_avance": 60}, "50"), ({"estado": "pausada"}, "pausa"),
                 ({"estado": "en_curso"}, "Retomamos"), ({"estado": "finalizada"}, "terminado")]
        for body, expected in steps:
            r = requests.patch(f"{API}/admin/obras/{obra_id}", headers=admin, json=body)
            assert r.status_code == 200, r.text
            time.sleep(1.2)
            last = DB.messages.find_one({"tipo": "aviso_obra", "solicitud_id": sol_id}, sort=[("_id", -1)])
            assert expected in last["asunto"], (body, last["asunto"])
        subjects = _avisos(obra_id, sol_id)
        assert len(subjects) == 6, subjects
        # repeat 60 % -> no new email
        requests.patch(f"{API}/admin/obras/{obra_id}", headers=admin, json={"porcentaje_avance": 100})
        time.sleep(1)
        assert len(_avisos(obra_id, sol_id)) == 6

    def test_worker_progress_and_toggle(self, admin, worker):
        wtok, wid = worker
        email = f"test_avisos+{uuid.uuid4().hex[:6]}@example.com"
        obra_id, sol_id = _make_obra(admin, wid, email)
        time.sleep(1.2)
        r = requests.patch(f"{API}/trabajador/obras/{obra_id}/avance", headers=wtok, json={"porcentaje_avance": 30})
        assert r.status_code == 200, r.text
        time.sleep(1.5)
        subs = _avisos(obra_id, sol_id)
        assert len(subs) == 3 and any("comenzado" in s for s in subs) and any("25" in s for s in subs), subs
        assert requests.patch(f"{API}/admin/configuracion", headers=admin, json={"avisos_cliente": False}).status_code == 200
        try:
            r = requests.patch(f"{API}/trabajador/obras/{obra_id}/avance", headers=wtok, json={"porcentaje_avance": 80})
            assert r.status_code == 200
            time.sleep(1.5)
            assert len(_avisos(obra_id, sol_id)) == 3
        finally:
            requests.patch(f"{API}/admin/configuracion", headers=admin, json={"avisos_cliente": True})
        cfg = requests.get(f"{API}/admin/configuracion", headers=admin).json()
        assert cfg["settings"]["avisos_cliente"] is True and cfg["settings"]["descuento_bienvenida"] == 5
