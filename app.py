import os
import math
from flask import Flask, jsonify, request
from pymongo import MongoClient
from dotenv import load_dotenv

# I-load ang mga environment variables (.env)
load_dotenv()

app = Flask(__name__)

# Kumonekta sa MongoDB Atlas
MONGODB_URI = os.getenv("MONGODB_URI")
client = MongoClient(MONGODB_URI)
db = client["delivery_db"]

# ─── 🤖 AI GEOLOCATION CORE: HAVERSINE FORMULA ────────────────────────────
def kalkulahin_distansya(lat1, lon1, lat2, lon2):
    R = 6371.0  # Radius ng mundo sa kilometro
    
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "status": "online",
        "message": "Palawan Delivery Express AI Dispatch Engine is live and fixed."
    }), 200

# ─── 🛵 AI DISPATCH ENDPOINT ──────────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json() or {}
        
        if 'merchant_lat' not in data or 'merchant_lon' not in data:
            return jsonify({
                "status": "error",
                "message": "Kailangan ng 'merchant_lat' at 'merchant_lon' coordinates."
            }), 400
            
        merchant_lat = float(data['merchant_lat'])
        merchant_lon = float(data['merchant_lon'])
        order_id = data.get('order_id', 'Unknown Order')

        # Kumuha ng mga rider na approved, active, at online
        mga_rider = list(db.riders.find({
            "status": "approved",
            "isActive": True,
            "isOnline": True
        }))
        
        if not mga_rider:
            return jsonify({
                "status": "error",
                "message": "Sa ngayon, walang online o bakanteng rider na malapit sa Palawan area."
            }), 404
            
        pinakamalapit_na_rider = None
        pinakamababang_distansya = float('inf')

        # AI Loop upang hanapin ang pinakamalapit na lokasyon
        for rider in mga_rider:
            loc = rider.get('currentLocation')
            if loc and 'lat' in loc and 'lng' in loc:
                rider_lat = float(loc['lat'])
                rider_lon = float(loc['lng'])
                
                # SAKTO NA ANG POSITIONAL ARGUMENTS DITO:
                distansya = kalkulahin_distansya(merchant_lat, merchant_lon, rider_lat, rider_lon)
                
                if distansya < pinakamababang_distansya:
                    pinakamababang_distansya = distansya
                    pinakamalapit_na_rider = rider

        if pinakamalapit_na_rider:
            return jsonify({
                "status": "success",
                "message": "Rider matched successfully via PDE-AI Geolocation.",
                "order_id": order_id,
                "rider_id": str(pinakamalapit_na_rider['_id']),
                "pangalan": pinakamalapit_na_rider.get('name', 'Walang Pangalan'),
                "telepono": pinakamalapit_na_rider.get('phone', 'N/A'),
                "sasakyan": pinakamalapit_na_rider.get('vehicleType', 'Motorcycle'),
                "plaka": pinakamalapit_na_rider.get('plateNumber', 'N/A'),
                "distansya_km": round(pinakamababang_distansya, 2)
            }), 200
        else:
            return jsonify({
                "status": "error",
                "message": "May mga online riders pero walang valid na currentLocation GPS coordinates sa database."
            }), 404

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"AI Internal Error: {str(e)}"
        }), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
