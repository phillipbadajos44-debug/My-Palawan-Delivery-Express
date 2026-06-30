from flask import Flask, request, jsonify
from flask_cors import CORS
from pymongo import MongoClient
import os
from dotenv import load_dotenv

# I-load ang mga sikretong impormasyon mula sa .env
load_dotenv()

# Simulan ang app
app = Flask(__name__)
CORS(app)  # Para makakonekta ang mga pahina mo sa server

# Kumonekta sa MongoDB Atlas
MONGODB_URI = os.getenv("MONGODB_URI")
client = MongoClient(MONGODB_URI)
db = client["delivery_db"]  # Pangalan ng database mo

# --------------------------
# Dito mo ilalagay ang sarili mong code sa hinaharap
# Halimbawa: login, register, order, atbp.
# Wala ka pang ilalagay ngayon — okay lang ito!
# --------------------------

# Pagsubok lang kung gumagana ang server
@app.route('/')
def home():
    return jsonify(message="✅ Gumagana ang Palawan Delivery App!")

# Patakbuhin ang server
if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5000))
    app.run(host="0.0.0.0", port=port)

