"""Remove TEST_ data created by automated tests (keeps seed data). Run from /app/backend."""
import os

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(".env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
C = os.environ["COMPANY_ID"]
rx = {"$regex": "^TEST", "$options": "i"}
anyrx = {"$regex": "TEST_", "$options": ""}

reqs = list(db.requests.find({"$or": [{"nombre_cliente": rx}, {"correo_cliente": "delivered@resend.dev"}]}))
rids = [str(r["_id"]) for r in reqs]
quotes = list(db.quotes.find({"$or": [{"titulo": rx}, {"cliente_nombre": rx}]}))
qids = [str(q["_id"]) for q in quotes]
projs = list(db.projects.find({"$or": [{"titulo": rx}, {"cliente_nombre": rx}]}))
pids = [str(p["_id"]) for p in projs]
stores = list(db.hardware_stores.find({"nombre": rx}))

print("tx", db.transactions.delete_many({"$or": [{"obra_id": {"$in": pids}}, {"concepto": anyrx}, {"contraparte": anyrx}]}).deleted_count)
print("msgs", db.messages.delete_many({"$or": [{"solicitud_id": {"$in": rids}}, {"presupuesto_id": {"$in": qids}}, {"tipo": "prueba"}]}).deleted_count)
print("req", db.requests.delete_many({"_id": {"$in": [r["_id"] for r in reqs]}}).deleted_count)
print("quotes", db.quotes.delete_many({"_id": {"$in": [q["_id"] for q in quotes]}}).deleted_count)
print("projs", db.projects.delete_many({"_id": {"$in": [p["_id"] for p in projs]}}).deleted_count)
print("reminders", db.reminders.delete_many({"$or": [{"titulo": rx}, {"obra_id": {"$in": pids}}]}).deleted_count)
db.workers.update_many({}, {"$pull": {"obras_asignadas": {"$in": pids}}})
test_workers = list(db.workers.find({"nombre": rx}))
print("workers", db.workers.delete_many({"_id": {"$in": [w["_id"] for w in test_workers]}}).deleted_count)
cl = list(db.clients.find({"$or": [{"nombre": rx}, {"nombre": "Prueba Email"}]}))
print("clients", db.clients.delete_many({"_id": {"$in": [c["_id"] for c in cl]}}).deleted_count)
db.clients.update_many({}, {"$pull": {"solicitudes": {"$in": rids}, "presupuestos": {"$in": qids}, "obras": {"$in": pids}}})
print("stores", db.hardware_stores.delete_many({"_id": {"$in": [s["_id"] for s in stores]}}).deleted_count)
db.users.delete_many({"role": "ferreteria", "code": {"$in": [s["codigo"].lower() for s in stores]}})
db.users.delete_many({"role": "trabajador", "code": {"$in": [w["codigo"].lower() for w in test_workers]}})
db.hardware_stores.update_many({}, {"$pull": {"derivaciones": {"cliente_nombre": rx}, "anuncios": {"titulo": rx}}})
db.files.update_many({"path": {"$regex": "TEST", "$options": "i"}}, {"$set": {"is_deleted": True}})

mx = 0
for t in db.transactions.find({"numero_factura": {"$regex": "^F-"}}):
    mx = max(mx, int(t["numero_factura"].split("-")[-1]))
for name, coll, field, prefix in [
    ("solicitud", "requests", "numero_solicitud", "GC-"),
    ("presupuesto", "quotes", "numero_presupuesto", "PR-"),
    ("obra", "projects", "numero_obra", "OB-"),
]:
    seq = max([int(d[field].split("-")[-1]) for d in db[coll].find({}, {field: 1})] or [0])
    db.counters.update_one({"_id": f"{C}:{name}"}, {"$set": {"seq": seq}})
db.counters.update_one({"_id": f"{C}:factura"}, {"$set": {"seq": mx}})
db.counters.update_one({"_id": f"{C}:ferreteria"}, {"$set": {"seq": max([int(s["codigo"][2:]) for s in db.hardware_stores.find()] or [0])}})
db.counters.update_one({"_id": f"{C}:trabajador"}, {"$set": {"seq": max([int(w["codigo"][2:]) for w in db.workers.find()] or [0])}})
print("workers", [(w["codigo"], len(w["obras_asignadas"])) for w in db.workers.find()])
print("obras", [(p["numero_obra"], p["porcentaje_avance"]) for p in db.projects.find()])
