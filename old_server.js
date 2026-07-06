require('dotenv').config();
// ============================================================
// PDE Backend Server - Node.js + Express + MongoDB
// Run: npm install && node server.js
// ============================================================
const Application = require('./models/Application');
const express = require('express');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const { getAllRegions, getProvincesByRegion, getMunicipalitiesByProvince, getBarangaysByMunicipality } = require('@aivangogh/ph-address');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

function uploadToCloudinary(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({ folder }, (err, result) => {
      if (err) reject(err); else resolve(result);
    });
    stream.end(buffer);
  });
}

const app = express();

app.use('/merchant', express.static(path.join(__dirname, 'merchant')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/customer', express.static(path.join(__dirname, 'customer')));
app.use('/rider', express.static(path.join(__dirname, 'rider')));
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 5000;
const JWT_SECRET = 'pde_secret_key_change_in_production';

// Koneksyon sa Database
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Nakakonekta na sa Database (MongoDB)'))
  .catch(err => console.error('❌ Error sa koneksyon sa Database:', err));

app.use('/uploads', express.static('uploads'));

// ── FILE UPLOAD ──
const storage = multer.memoryStorage();
const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|pdf/;
    cb(null, allowed.test(path.extname(file.originalname).toLowerCase()));
  }
});

// ============================================================
// SCHEMAS
// ============================================================
const CustomerSchema = new mongoose.Schema({
  name: String, firstName: String, lastName: String, phone: String, email: { type: String, unique: true },
  password: String, address: String, addresses: [{ label: String, address: String }],
  birthday: Date, gender: String,
  addressDetails: {
    region: String, province: String, municipality: String, barangay: String,
    street: String, additionalInfo: String
  },
  profilePic: String, favorites: [String], role: { type: String, default: 'customer' },
  isActive: { type: Boolean, default: true }, createdAt: { type: Date, default: Date.now }
});

const MerchantSchema = new mongoose.Schema({
  name: String, phone: String, email: { type: String, unique: true },
  password: String, storeName: String, businessType: String, address: String,
  productCategory: String, description: String, dtiNumber: String,
  permitNumber: String, mayorPermit: String, tin: String,
  documents: { govId: String, businessPermit: String, storeFront: String },
  storeLogo: String, storeBanner: String, isOpen: { type: Boolean, default: true },
  status: { type: String, default: 'pending' }, role: { type: String, default: 'merchant' },
  isActive: { type: Boolean, default: true }, rating: { type: Number, default: 0 },
  totalOrders: { type: Number, default: 0 }, totalRevenue: { type: Number, default: 0 },
  appliedAt: { type: Date, default: Date.now },
  pendingBalance: { type: Number, default: 0 },
  availableBalance: { type: Number, default: 0 },
  totalPaidOut: { type: Number, default: 0 },
  location: { lat: Number, lon: Number }
});

const RiderSchema = new mongoose.Schema({
  name: String, phone: String, email: { type: String, unique: true },
  password: String, address: String, vehicleType: String,
  vehicleModel: String, plateNumber: String,
  documents: { govId: String, license: String },
  profilePic: String, isOnline: { type: Boolean, default: false },
  status: { type: String, default: 'pending' }, role: { type: String, default: 'rider' },
  isActive: { type: Boolean, default: true }, rating: { type: Number, default: 0 },
  totalDeliveries: { type: Number, default: 0 }, totalEarnings: { type: Number, default: 0 },
  wallet: { type: Number, default: 0 }, totalEarningsAmount: { type: Number, default: 0 },
  currentLocation: { lat: Number, lng: Number },
  appliedAt: { type: Date, default: Date.now }
});

const ProductSchema = new mongoose.Schema({
  name: String, price: Number, category: String, description: String,
  stock: { type: Number, default: 0 }, image: String, images: [String],
  deliveryFeePercent: { type: Number, default: 15 },
  merchantId: String, merchantName: String,
  isAvailable: { type: Boolean, default: true },
  rating: { type: Number, default: 0 }, reviewCount: { type: Number, default: 0 },
  sold: { type: Number, default: 0 }, createdAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  customerId: String, customerName: String, customerPhone: String,
  customerAddress: String, merchantId: String, merchantName: String, merchantAddress: String, merchantPhone: String,
  riderId: String, riderName: String,
  items: [{ id: String, name: String, qty: Number, price: Number }],
  total: Number, deliveryFee: { type: Number, default: 50 },
  paymentMethod: { type: String, default: 'cod' },
  paymentStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  statusHistory: [{ status: String, time: Date, note: String }],
  proofOfPickup: String, proofOfDelivery: String, rating: Number, review: String,
  estimatedDelivery: Date, deliveredAt: Date,
  date: { type: Date, default: Date.now }
});

const NotificationSchema = new mongoose.Schema({
  userId: String, userRole: String, title: String, message: String,
  type: String, orderId: String, isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const ReviewSchema = new mongoose.Schema({
  orderId: String, customerId: String, customerName: String,
  merchantId: String, productId: String, rating: Number, review: String,
  createdAt: { type: Date, default: Date.now }
});

const AuditSchema = new mongoose.Schema({
  adminId: String, action: String, target: String, targetId: String,
  details: String, createdAt: { type: Date, default: Date.now }
});

const MessageSchema = new mongoose.Schema({
  orderId: String, channel: String,
  senderId: String, senderRole: String, senderName: String,
  text: String,
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const RemittanceSchema = new mongoose.Schema({
  orderId: String, riderId: String, riderName: String,
  merchantId: String, merchantName: String,
  productAmount: Number, deliveryFee: Number,
  totalCashCollected: Number, riderEarnings: Number,
  companyEarnings: Number, amountToRemit: Number,
  status: { type: String, default: 'pending' },
  remittedAt: Date, verifiedAt: Date,
  createdAt: { type: Date, default: Date.now }
});

const PayoutSchema = new mongoose.Schema({
  merchantId: String, merchantName: String, amount: Number,
  status: { type: String, default: 'pending' },
  requestedAt: { type: Date, default: Date.now },
  approvedAt: Date, paidAt: Date
});

const Customer = mongoose.model('Customer', CustomerSchema);
const Merchant = mongoose.model('Merchant', MerchantSchema);
const Rider = mongoose.model('Rider', RiderSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);
const Notification = mongoose.model('Notification', NotificationSchema);
const Review = mongoose.model('Review', ReviewSchema);
const Audit = mongoose.model('Audit', AuditSchema);
const Message = mongoose.model('Message', MessageSchema);
const Remittance = mongoose.model('Remittance', RemittanceSchema);
const Payout = mongoose.model('Payout', PayoutSchema);

// ── AUTH MIDDLEWARE ──
const auth = (roles = []) => (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ error: 'No token' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    if (roles.length && !roles.includes(decoded.role)) return res.status(403).json({ error: 'Forbidden' });
    req.user = decoded; next();
  } catch { res.status(401).json({ error: 'Invalid token' }); }
};

async function createNotification(userId, userRole, title, message, type, orderId = null) {
  try { await Notification.create({ userId, userRole, title, message, type, orderId }); } catch (e) {}
}

// ============================================================
// RENDER COMPATIBLE AI ROUTING INTEGRATION
// ============================================================
app.post('/api/orders/:id/ai-dispatch', auth(['merchant', 'admin']), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Hindi mahanap ang Order.' });

    const merchant = await Merchant.findById(order.merchantId);
    if (!merchant || !merchant.location || !merchant.location.lat) {
      return res.status(400).json({ error: 'Ang merchant ay walang GPS location coordinates.' });
    }

    // Gagamitin ang live Render URL kung nasa production, kundi localhost port 5001 sa local testing
    const pythonAiBaseUrl = process.env.PYTHON_AI_SERVICE_URL || 'http://localhost:5001';
    const pythonAiUrl = `${pythonAiBaseUrl}/predict`;
    
    const aiResponse = await fetch(pythonAiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        merchant_lat: merchant.location.lat,
        merchant_lon: merchant.location.lon,
        order_id: order._id
      })
    });

    const aiData = await aiResponse.json();

    if (aiData.status === 'error') {
      return res.status(404).json({ error: aiData.message });
    }

    res.json({
      success: true,
      message: 'Matagumpay na natanggap ng AI Server ang dispatch data!',
      ai_response: aiData
    });

  } catch (e) {
    res.status(500).json({ error: `AI Cloud Communication Error: ${e.message}` });
  }
});

// ============================================================
// PUBLIC ROUTES & CORE CRUD (Retained for Backward Compatibility)
// ============================================================
app.get('/', (req, res) => res.json({ status: 'PDE Production API Running', environment: process.env.NODE_ENV || 'development' }));

app.get('/api/locations/regions', (req, res) => { try { res.json(getAllRegions()); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/locations/provinces/:regionCode', (req, res) => { try { res.json(getProvincesByRegion(req.params.regionCode)); } catch (e) { res.status(500).json({ error: e.message }); } });
const HUC_PATCHES = { '1705300000': [{ name: 'Puerto Princesa City', psgcCode: '1731500000', provinceCode: '1705300000' }] };
app.get('/api/locations/municipalities/:provinceCode', (req, res) => { try { let munis = getMunicipalitiesByProvince(req.params.provinceCode).slice(); if (HUC_PATCHES[req.params.provinceCode]) munis = munis.concat(HUC_PATCHES[req.params.provinceCode]); munis.sort((a, b) => a.name.localeCompare(b.name)); res.json(munis); } catch (e) { res.status(500).json({ error: e.message }); } });
app.get('/api/locations/barangays/:municipalityCode', (req, res) => { try { res.json(getBarangaysByMunicipality(req.params.municipalityCode)); } catch (e) { res.status(500).json({ error: e.message }); } });

app.post('/api/customers/register', async (req, res) => {
  try {
    const { name, firstName, lastName, phone, email, password, address, birthday, gender, addressDetails } = req.body;
    if (!name || !email || !password) return res.status(400).json({ error: 'Missing fields' });
    const exists = await Customer.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email already registered' });
    const hashed = await bcrypt.hash(password, 10);
    const customer = await Customer.create({ name, firstName, lastName, phone, email, password: hashed, address, birthday, gender, addressDetails });
    const token = jwt.sign({ id: customer._id, role: 'customer', name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: customer._id, name, firstName, lastName, email, phone, address, addressDetails, birthday, gender, addresses: customer.addresses || [], role: 'customer' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/customers/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const customer = await Customer.findOne({ email });
    if (!customer || !await bcrypt.compare(password, customer.password)) return res.status(401).json({ error: 'Invalid credentials' });
    if (!customer.isActive) return res.status(403).json({ error: 'Account disabled' });
    const token = jwt.sign({ id: customer._id, role: 'customer', name: customer.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: customer._id, name: customer.name, email, phone: customer.phone, address: customer.address, addresses: customer.addresses || [], role: 'customer' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/merchants/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const merchant = await Merchant.findOne({ email });
    if (!merchant || !await bcrypt.compare(password, merchant.password)) return res.status(401).json({ error: 'Invalid credentials' });
    if (merchant.status === 'pending' || merchant.status === 'rejected') return res.status(403).json({ error: merchant.status, status: merchant.status });
    if (!merchant.isActive) return res.status(403).json({ error: 'Account disabled' });
    const token = jwt.sign({ id: merchant._id, role: 'merchant', name: merchant.name, storeName: merchant.storeName }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: merchant._id, name: merchant.name, email, storeName: merchant.storeName, role: 'merchant', isOpen: merchant.isOpen } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/riders/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const rider = await Rider.findOne({ email });
    if (!rider || !await bcrypt.compare(password, rider.password)) return res.status(401).json({ error: 'Invalid credentials' });
    if (rider.status === 'pending' || rider.status === 'rejected') return res.status(403).json({ error: rider.status, status: rider.status });
    if (!rider.isActive) return res.status(403).json({ error: 'Account disabled' });
    const token = jwt.sign({ id: rider._id, role: 'rider', name: rider.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: rider._id, name: rider.name, email, vehicleType: rider.vehicleType, plateNumber: rider.plateNumber, role: 'rider' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products', async (req, res) => {
  try {
    const { merchantId, category, search, page = 1, limit = 20, sort = '-createdAt' } = req.query;
    const query = { isAvailable: true }; if (merchantId) query.merchantId = merchantId; if (category) query.category = category; if (search) query.name = new RegExp(search, 'i');
    const products = await Product.find(query).sort(sort).limit(Number(limit)).skip((page - 1) * limit);
    res.json({ products, total: await Product.countDocuments(query) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/orders', auth(['customer']), async (req, res) => {
  try {
    const { items, merchantId, merchantName, total, deliveryFee, paymentMethod, customerAddress } = req.body;
    const merchant = await Merchant.findById(merchantId);
    const customer = await Customer.findById(req.user.id);
    const order = await Order.create({
      customerId: req.user.id, customerName: req.user.name, customerPhone: customer ? customer.phone : '',
      merchantId, merchantName, items, total, deliveryFee: deliveryFee || 50, paymentMethod: paymentMethod || 'cod', customerAddress,
      merchantAddress: merchant ? merchant.address : '', merchantPhone: merchant ? merchant.phone : '',
      statusHistory: [{ status: 'pending', time: new Date(), note: 'Order placed by customer' }]
    });
    for (const item of items) { await Product.findByIdAndUpdate(item.id, { $inc: { stock: -item.qty } }); }
    await createNotification(merchantId, 'merchant', '🆕 New Order!', `${req.user.name} placed an order worth ₱${total}`, 'order', order._id);
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.listen(PORT, () => {
  console.log(`\n🚀 Production Server configured for Render running at http://localhost:${PORT}`);
});
