from pymongo import MongoClient
from werkzeug.security import generate_password_hash

# ✅ FINAL WORKING LINK — check password is correct
MONGODB_URI = "mongodb+srv://phillipbadajos44_db_user:Fskyae72oaNbeFAv@cluster0.mt8uncj.mongodb.net/delivery_db?retryWrites=true&w=majority&appName=Cluster0"
client = MongoClient(MONGODB_URI, serverSelectionTimeoutMS=20000)
db = client.delivery_db

admin = {
    "username": "palawan_admin",
    "email": "admin@palawandelivery.ph",
    "password": generate_password_hash("PalawanPhillip90!", method="pbkdf2:sha256"),
    "role": "admin"
}

# Check if admin already exists
existing = db.users.find_one({"role": "admin"})
if existing:
    print("⚠️ Admin already exists — no new one added.")
else:
    db.users.insert_one(admin)
    print("✅ SUCCESS! Admin account created.")
    print("🔐 Username: palawan_admin")
    print("🔐 Password: PalawanPhillip90!")

client.close()
