const mongoose = require('mongoose');

const FollowSchema = new mongoose.Schema({
  customerId: {
    type: String,
    required: true
  },
  customerName: String,

  merchantId: {
    type: String,
    required: true
  },
  merchantName: String,

  createdAt: { type: Date, default: Date.now }
});

// Isang customer, isang follow lang bawat merchant
FollowSchema.index({ customerId: 1, merchantId: 1 }, { unique: true });

module.exports = mongoose.model('Follow', FollowSchema);
