import os
import math
from flask import Flask, jsonify, request
from pymongo import MongoClient
from bson import ObjectId
from dotenv import load_dotenv

# I-load ang mga environment variables (.env)
load_dotenv()

app = Flask(__name__)

# Kumonekta sa MongoDB gamit ang iyong MONGODB_URI galing sa environment variables
MONGODB_URI = os.getenv("MONGODB_URI")
client = MongoClient(MONGODB_URI)
db = client["delivery_db"]  # Gagamitin ang iyong kasalukuyang database name

# ─── 🤖 AI GEOLOCATION CORE: HAVERSINE FORMULA ────────────────────────────
# Kinukuha nito ang distansya (in kilometers) sa pagitan ng dalawang GPS points sa mundo.
def kalkulahin_distansya(lat1, lon1, lat2, lon2):
    R = 6371.0  # Radius ng mundo sa kilometro
    
    # I-convert ang degrees papuntang radians
    dlat = math.radians(lat2 - lat1)
    dlon = math.radians(lon2 - lon1)
    
    a = math.sin(dlat / 2)**2 + math.cos(math.radians(lat1)) * math.cos(math.radians(lat2)) * math.sin(dlon / 2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a))
    
    return R * c

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "status": "online",
        "message": "Palawan Delivery Express AI Dispatch Engine is live."
    }), 200

# ─── 🛵 AI DISPATCH ENDPOINT ──────────────────────────────────────────────
@app.route('/predict', methods=['POST'])
def predict():
    try:
        data = request.get_json() or {}
        
        # Siguraduhing ipinasa ng Node.js ang lokasyon ng merchant
        if 'merchant_lat' not in data or 'merchant_lon' not in data:
            return jsonify({
                "status": "error",
                "message": "Kailangan ng 'merchant_lat' at 'merchant_lon' coordinates."
            }), 400
            
        merchant_lat = float(data['merchant_lat'])
        merchant_lon = float(data['merchant_lon'])
        order_id = data.get('order_id', 'Unknown Order')

        # 1. Kumuha ng mga rider sa MongoDB na ONLINE at AVAILABLE (bakante)
        # Ang query na ito ay titingin sa iyong 'riders' collection sa Atlas
        mga_rider = list(db.riders.find({
            "status": "approved",  # Siguraduhing aprubado ng admin ang account
            "isActive": True,
            "isOnline": True       # Dapat naka-duty o online ang rider sa app nya
        }))
        
        if not mga_rider:
            return jsonify({
                "status": "error",
                "message": "Sa ngayon, walang online o bakanteng rider na malapit sa Palawan area."
            }), 404
            
        pinakamalapit_na_rider = None
        pinakamababang_distansya = float('inf') # Magsisimula sa pinakamalaking numero

        # 2. AI Loop: I-scan ang lokasyon ng bawat online rider
        for rider in mga_rider:
            # Babasahin ang 'currentLocation' field na galing sa schema ng server.js mo
            loc = rider.get('currentLocation')
            if loc and 'lat' in loc and 'lng' in loc:
                rider_lat = float(loc['lat'])
                rider_lon = float(loc['lng']) # 'lng' ang gamit sa server.js schema mo
                
                # Kalkulahin ang real-time distance gamit ang Haversine function sa itaas
                distansya = kalkulahin_distansya(merchant_lat, merchant_lon, r_lat=rider_lat, r_lon=rider_lon)
                
                # Kung mas malapit ang rider na ito kaysa sa naunang nakita, sya ang piliin
                if distansya < pinakamababang_distansya:
                    pinakamababang_distansya = distansya
                    pinakamalapit_na_rider = rider

        # 3. Ibalik ang resulta kung may nahanap na rider
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
                "message": "May mga online riders pero walang valid o updated na currentLocation GPS coordinates sa database."
            }), 404

    except Exception as e:
        return jsonify({
            "status": "error",
            "message": f"AI Internal Error: {str(e)}"
        }), 500

if __name__ == "__main__":
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
