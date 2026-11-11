"""Unlink all staff profiles and delete QA test accounts (qa.*+xxxx@example.com) + their sessions. Run from /app/backend."""
import os

from dotenv import load_dotenv
from pymongo import MongoClient

load_dotenv(".env")
db = MongoClient(os.environ["MONGO_URL"])[os.environ["DB_NAME"]]
print("unlinked", db.users.update_many({"account_id": {"$ne": None}}, {"$set": {"account_id": None, "account_email": ""}}).modified_count)
accs = list(db.accounts.find({"email": {"$regex": r"^qa\.[a-z]+\+[0-9a-f]+@example\.com$"}}, {"account_id": 1}))
ids = [a["account_id"] for a in accs]
print("sessions", db.account_sessions.delete_many({"account_id": {"$in": ids}}).deleted_count)
print("accounts", db.accounts.delete_many({"account_id": {"$in": ids}}).deleted_count)
print("login_limits", db.login_limits.delete_many({"_id": {"$regex": "^(account:|cuenta|[0-9a-f.:]+:(admin|trabajador|ferreteria):)"}}).deleted_count)
