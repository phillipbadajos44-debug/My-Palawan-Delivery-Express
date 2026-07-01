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
  linkedId: {
    type: mongoose.Schema.Types.ObjectId
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
