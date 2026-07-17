const mongoose = require('mongoose');

const PostSchema = new mongoose.Schema({
  merchantId: {
    type: String,
    required: true
  },
  merchantName: String,
  storeLogo: String,

  caption: String,
  images: [String],

  reactions: [{
    userId: String,
    userRole: { type: String, default: 'customer' },
    type: {
      type: String,
      enum: ['like', 'love', 'wow'],
      default: 'like'
    },
    createdAt: { type: Date, default: Date.now }
  }],

  sharesCount: { type: Number, default: 0 },

  isActive: { type: Boolean, default: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', PostSchema);
