const mongoose = require("mongoose");

const FinancialSettingsSchema = new mongoose.Schema({
  delivery: {
    baseFee: { type: Number, default: 40 },
    perKm: { type: Number, default: 10 },
    minimumFee: { type: Number, default: 40 },
    maximumFee: { type: Number, default: 500 }
  },

  rider: {
    basePay: { type: Number, default: 30 },
    perKmPay: { type: Number, default: 8 },
    heavyItemBonus: { type: Number, default: 10 },
    peakHourBonus: { type: Number, default: 20 },
    nightBonus: { type: Number, default: 15 }
  },

  merchant: {
    commissionPercent: { type: Number, default: 10 }
  },

  platform: {
    serviceFee: { type: Number, default: 0 }
  }

}, {
  timestamps: true
});

module.exports = mongoose.model(
  "FinancialSettings",
  FinancialSettingsSchema
);
