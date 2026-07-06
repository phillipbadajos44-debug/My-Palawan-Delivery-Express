import os
from flask import Flask, jsonify, request

app = Flask(__name__)

@app.route('/', methods=['GET'])
def home():
    return jsonify({
        "status": "online",
        "message": "Palawan Delivery Express AI Service is running on Render."
    }), 200

@app.route('/predict', methods=['POST'])
def predict():
    # Dito inilalagay ang iyong AI/Distance logic para sa mga riders sa Palawan
    data = request.get_json() or {}
    return jsonify({
        "status": "success",
        "message": "AI Dispatch system ready",
        "received_data": data
    }), 200

if __name__ == "__main__":
    # Awtomatikong babasahin ang PORT na ibibigay ng Render sa production.
    # Kung wala sa local (Termux), gagamitin nito ang Port 5001.
    port = int(os.environ.get("PORT", 5001))
    app.run(host="0.0.0.0", port=port)
