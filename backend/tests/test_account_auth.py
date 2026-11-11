"""GM Conecta – account (email) auth + staff 6-digit PIN step, linking, admin accesos, account-gated endpoints."""
import uuid
import pytest
import requests

from test_gmconecta_api import API, PNG  # noqa: F401  (shared base URL)

PINS = {"admin": "582047", "TR01": "361948", "FE01": "724613", "TR02": "470285"}
PASS = "Clave2026x"


def reg(prefix="qa.auth"):
    email = f"{prefix}+{uuid.uuid4().hex[:8]}@example.com"
    r = requests.post(f"{API}/cuenta/registro", json={"nombre": "TEST_Auth", "email": email, "password": PASS}, timeout=20)
    assert r.status_code == 201, r.text
    return email, r.json()


def A(tok):
    return {"X-Account-Token": tok}


def pin_login(role, code, pin, tok):
    return requests.post(f"{API}/auth/login", json={"role": role, "code": code, "pin": pin}, headers=A(tok) if tok else {}, timeout=20)


@pytest.fixture(scope="module")
def acc1():
    email, d = reg()
    return email, d["token"], d["cuenta"]


@pytest.fixture(scope="module")
def admin_tok(acc1):
    r = pin_login("admin", "admin", PINS["admin"], acc1[1])
    if r.status_code != 200:
        pytest.skip(f"admin login failed {r.status_code} {r.text}")
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


# ---- account registration / login / logout
class TestCuenta:
    def test_registro_ok(self, acc1):
        email, tok, cuenta = acc1
        assert tok and cuenta["email"] == email and cuenta["tiene_password"] is True

    @pytest.mark.parametrize("pw", ["short1", "soloLetrasAqui", "12345678"])
    def test_registro_weak_password(self, pw):
        r = requests.post(f"{API}/cuenta/registro", json={"nombre": "TEST_W", "email": f"qa.w+{uuid.uuid4().hex[:6]}@example.com", "password": pw})
        assert r.status_code == 422

    def test_registro_duplicate(self, acc1):
        r = requests.post(f"{API}/cuenta/registro", json={"nombre": "TEST_D", "email": acc1[0].upper(), "password": PASS})
        assert r.status_code == 409

    def test_login_wrong_and_ok(self, acc1):
        bad = requests.post(f"{API}/cuenta/login", json={"email": acc1[0], "password": "Wrong12345"})
        assert bad.status_code == 401 and bad.json()["detail"] == "Correo o contraseña incorrectos"
        assert "x-auth-error" not in {k.lower() for k in bad.headers.keys()}
        ok = requests.post(f"{API}/cuenta/login", json={"email": acc1[0], "password": PASS})
        assert ok.status_code == 200 and ok.json()["token"] and ok.json()["cuenta"]["email"] == acc1[0]

    def test_me_and_logout(self):
        email, d = reg()
        tok = d["token"]
        me = requests.get(f"{API}/cuenta/me", headers=A(tok))
        assert me.status_code == 200 and me.json()["email"] == email
        assert requests.get(f"{API}/cuenta/me").status_code == 401
        assert requests.post(f"{API}/cuenta/logout", headers=A(tok)).status_code == 200
        r = requests.get(f"{API}/cuenta/me", headers=A(tok))
        assert r.status_code == 401 and r.headers.get("X-Auth-Error") == "account"


# ---- staff PIN step
class TestStaffPin:
    def test_pin_requires_account(self):
        r = pin_login("admin", "admin", PINS["admin"], None)
        assert r.status_code == 401 and r.headers.get("X-Auth-Error") == "account"

    def test_old_pins_fail(self, acc1):
        for role, code, pin in (("trabajador", "TR03", "1111"), ("ferreteria", "FE03", "2222")):
            assert pin_login(role, code, pin, acc1[1]).status_code == 401

    def test_new_pins_link_and_other_account_403(self, acc1):
        r = pin_login("trabajador", "TR01", PINS["TR01"], acc1[1])
        assert r.status_code == 200 and r.json()["role"] == "trabajador"
        assert pin_login("ferreteria", "FE01", PINS["FE01"], acc1[1]).status_code == 200
        _, d2 = reg("qa.other")
        r2 = pin_login("trabajador", "TR01", PINS["TR01"], d2["token"])
        assert r2.status_code == 403
        # options: acc2 must not see TR01/FE01; acc1 sees them with mio=true
        o2 = requests.get(f"{API}/auth/options", headers=A(d2["token"])).json()
        assert "TR01" not in [t["codigo"] for t in o2["trabajadores"]]
        assert "FE01" not in [f["codigo"] for f in o2["ferreterias"]]
        o1 = requests.get(f"{API}/auth/options", headers=A(acc1[1])).json()
        assert [t for t in o1["trabajadores"] if t["codigo"] == "TR01"][0]["mio"] is True

    def test_staff_jwt_dies_after_account_logout(self):
        _, d = reg("qa.lo")
        r = pin_login("trabajador", "TR02", PINS["TR02"], d["token"])
        assert r.status_code == 200, r.text
        H = {"Authorization": f"Bearer {r.json()['access_token']}"}
        assert requests.get(f"{API}/auth/me", headers=H).status_code == 200
        requests.post(f"{API}/cuenta/logout", headers=A(d["token"]))
        me = requests.get(f"{API}/auth/me", headers=H)
        assert me.status_code == 401 and me.headers.get("X-Auth-Error") == "staff"

    def test_cambiar_pin(self, acc1):
        r = pin_login("ferreteria", "FE01", PINS["FE01"], acc1[1])
        H = {"Authorization": f"Bearer {r.json()['access_token']}"}
        assert requests.post(f"{API}/auth/cambiar-pin", headers=H, json={"pin_actual": "000000", "pin_nuevo": "583920"}).status_code == 400
        for weak in ("123456", "111111", "121212", "987654", "12345"):
            w = requests.post(f"{API}/auth/cambiar-pin", headers=H, json={"pin_actual": PINS["FE01"], "pin_nuevo": weak})
            assert w.status_code == 422, weak
        ok = requests.post(f"{API}/auth/cambiar-pin", headers=H, json={"pin_actual": PINS["FE01"], "pin_nuevo": "583920"})
        assert ok.status_code == 200
        assert pin_login("ferreteria", "FE01", "583920", acc1[1]).status_code == 200
        r2 = pin_login("ferreteria", "FE01", "583920", acc1[1])
        H2 = {"Authorization": f"Bearer {r2.json()['access_token']}"}
        back = requests.post(f"{API}/auth/cambiar-pin", headers=H2, json={"pin_actual": "583920", "pin_nuevo": PINS["FE01"]})
        assert back.status_code == 200
        assert pin_login("ferreteria", "FE01", PINS["FE01"], acc1[1]).status_code == 200


# ---- admin accesos
class TestAdminAccesos:
    def test_list_pin_unlink(self, acc1, admin_tok):
        tr = pin_login("trabajador", "TR01", PINS["TR01"], acc1[1])
        WH = {"Authorization": f"Bearer {tr.json()['access_token']}"}
        lst = requests.get(f"{API}/admin/accesos", headers=admin_tok)
        assert lst.status_code == 200
        tr01 = [u for u in lst.json() if u["code"] == "TR01"][0]
        assert tr01["vinculado"] is True and tr01["account_email"] == acc1[0]
        assert requests.patch(f"{API}/admin/accesos/{tr01['id']}/pin", headers=admin_tok, json={"pin": "123456"}).status_code == 422
        assert requests.patch(f"{API}/admin/accesos/{tr01['id']}/pin", headers=admin_tok, json={"pin": PINS["TR01"]}).status_code == 200
        un = requests.delete(f"{API}/admin/accesos/{tr01['id']}/cuenta", headers=admin_tok)
        assert un.status_code == 200 and un.json()["vinculado"] is False
        me = requests.get(f"{API}/auth/me", headers=WH)
        assert me.status_code == 401 and me.headers.get("X-Auth-Error") == "staff"

    def test_create_worker_store_pin_rules(self, admin_tok):
        w = {"nombre": "TEST_Worker", "especialidad": "Pintura", "telefono": "600000001", "coste_hora_o_servicio": 20}
        assert requests.post(f"{API}/admin/trabajadores", headers=admin_tok, json={**w, "pin": "4821"}).status_code == 422
        assert requests.post(f"{API}/admin/trabajadores", headers=admin_tok, json={**w, "pin": "111111"}).status_code == 422
        s = {"nombre": "TEST_Store", "direccion": "Calle Test 9"}
        assert requests.post(f"{API}/admin/ferreterias", headers=admin_tok, json={**s, "pin": "4821"}).status_code == 422
        ok = requests.post(f"{API}/admin/trabajadores", headers=admin_tok, json={**w, "pin": "583027"})
        assert ok.status_code == 201
        okf = requests.post(f"{API}/admin/ferreterias", headers=admin_tok, json={**s, "pin": "583027"})
        assert okf.status_code == 201
        print("CREATED", ok.json().get("id"), okf.json().get("id"))


# ---- account-gated endpoints
class TestGated:
    def test_solicitud_requires_account_and_mine(self, acc1):
        body = {"idempotency_key": f"TEST_{uuid.uuid4().hex}", "servicio": "Fontanería", "descripcion": "TEST_ fuga de agua en la cocina",
                "nombre_cliente": "TEST_Cliente", "telefono_cliente": "600111222", "correo_cliente": acc1[0], "direccion": "Calle Test 1, Madrid"}
        assert requests.post(f"{API}/solicitudes", json=body).status_code == 401
        r = requests.post(f"{API}/solicitudes", json=body, headers=A(acc1[1]))
        assert r.status_code == 201
        num = r.json()["numero_solicitud"]
        mine = requests.post(f"{API}/solicitudes/mine", json={"items": []}, headers=A(acc1[1]))
        assert num in [m["numero_solicitud"] for m in mine.json()]
        _, d2 = reg("qa.mine")
        other = requests.post(f"{API}/solicitudes/mine", json={"items": []}, headers=A(d2["token"]))
        assert num not in [m["numero_solicitud"] for m in other.json()]

    def test_upload_requires_token(self):
        import io
        r = requests.post(f"{API}/upload", files={"file": ("TEST_p.png", io.BytesIO(PNG), "image/png")})
        assert r.status_code == 401
