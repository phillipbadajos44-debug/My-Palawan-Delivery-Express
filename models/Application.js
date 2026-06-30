const mongoose = require('mongoose');

const ApplicationSchema = new mongoose.Schema({
  type: {
    type: String,
    enum: ['merchant', 'rider', 'customer'],
    required: true
  },
  data: {
    type: Object,
    required: true
  },
  status: {
    type: String,
    default: 'pending'
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

module.exports = mongoose.model('Application', ApplicationSchema);
