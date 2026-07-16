require('dotenv').config();

const { calculatePricing } = require('./services/pricingEngine');
const {
  summarizeOrders,
  summarizeRevenuePeriods,
  summarizeRankings,
  summarizeChartData
} = require('./services/financialAnalytics');
const FinancialSettings = require('./models/FinancialSettings');
// ======================================
// ⬇️ DITO SA IBABA MO IDIDIKIT ANG BUONG CODE MO ⬇️
// ======================================
// ============================================================
// PDE Backend Server - Node.js + Express + MongoDB
// Run: npm install && node server.js
// ============================================================
const Application = require('./models/Application');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const cors = require('cors');
const multer = require('multer');
const { getAllRegions, getProvincesByRegion, getMunicipalitiesByProvince, getBarangaysByMunicipality } = require('@aivangogh/ph-address');
const path = require('path');
const fs = require('fs');
const cloudinary = require('cloudinary').v2;
const webpush = require('web-push');
const nodemailer = require('nodemailer');

if (process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY) {
  webpush.setVapidDetails(
    process.env.VAPID_SUBJECT || 'mailto:admin@example.com',
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
  );
}

const crypto = require('crypto');
const mailTransporter = nodemailer.createTransport({
  service: 'gmail',
  auth: { user: process.env.GMAIL_USER, pass: process.env.GMAIL_APP_PASSWORD }
});
async function sendResetEmail(toEmail, name, code) {
  try {
    await mailTransporter.sendMail({
      from: `"Palawan Delivery Express" <${process.env.GMAIL_USER}>`,
      to: toEmail,
      subject: 'Password Reset Code - Palawan Delivery Express',
      html: `<p>Hi ${name || ''},</p><p>Your password reset code is:</p><h2 style="letter-spacing:4px">${code}</h2><p>This code expires in 15 minutes. If you did not request this, ignore this email.</p>`
    });
    return true;
  } catch (e) { console.log('Email send failed:', e.message); return false; }
}

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

// ── GEOCODING (OpenStreetMap Nominatim - free, rate limited to ~1 req/sec) ──
async function geocodeAddress(address) {
  if (!address || !address.trim()) return null;
  try {
    const cleaned = address.replace(/\bCity\b/gi, '').replace(/,\s*Palawan\b/gi, '').replace(/\s{2,}/g, ' ').trim();
    const query = encodeURIComponent(cleaned + ', Palawan, Philippines');
    const url = `https://nominatim.openstreetmap.org/search?q=${query}&format=json&limit=1`;
    const res = await fetch(url, { headers: { 'User-Agent': 'PalawanDeliveryExpress/1.0' } });
    const data = await res.json();
    if (data && data.length) return { lat: parseFloat(data[0].lat), lng: parseFloat(data[0].lon) };
    return null;
  } catch (e) {
    console.error('Geocoding error:', e.message);
    return null;
  }
}

// ── HAVERSINE DISTANCE (in kilometers) ──
function haversineDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

const app = express();

const server = http.createServer(app);

const io = new Server(server, {
  cors: {
    origin: "*",
    methods: ["GET","POST","PUT","DELETE"]
  }
});

app.set('io', io);

io.on('connection', (socket) => {
  console.log("🟢 Socket connected:", socket.id);

  socket.on('join', ({ role, userId }) => {
    if (!role || !userId) return;

    const room = `${role}:${userId}`;
    socket.join(room);

    if (role === 'admin') {
      socket.join('admin');
    }

    console.log(`✅ ${socket.id} joined ${room}`);
  });

  socket.on('disconnect', () => {
    console.log("🔴 Socket disconnected:", socket.id);
  });
});

app.use('/merchant', express.static(path.join(__dirname, 'merchant')));
app.use('/admin', express.static(path.join(__dirname, 'admin')));
app.use('/customer', express.static(path.join(__dirname, 'customer')));
app.use('/rider', express.static(path.join(__dirname, 'rider')));
app.use(cors());
app.use(express.json());

const PORT = 5000;
const JWT_SECRET = 'pde_secret_key_change_in_production';
require('dotenv').config();
const MONGO_URI = process.env.MONGODB_URI;
// Koneksyon sa Database
// Koneksyon sa Database
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('✅ Nakakonekta na sa Database (MongoDB)'))
  .catch(err => console.error('❌ Error sa koneksyon sa Database:', err));
// ── MIDDLEWARE ──
app.use(cors());
app.use(express.json());
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

// ── MONGOOSE CONNECTION ──

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
  resetCode: String, resetCodeExpiry: Date,
  isActive: { type: Boolean, default: true }, createdAt: { type: Date, default: Date.now },
  lat: Number, lng: Number, isOnline: { type: Boolean, default: false },
  cachedGreeting: String, cachedGreetingNotifId: String, cachedGreetingAt: Date
});

const MerchantSchema = new mongoose.Schema({
  name: String, phone: String, email: { type: String, unique: true },
  password: String, storeName: String, businessType: String, address: String,
  lat: Number, lng: Number,
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
  totalPaidOut: { type: Number, default: 0 }
});

const RiderSchema = new mongoose.Schema({
  name: String, phone: String, email: { type: String, unique: true },
  password: String, address: String, vehicleType: String,
  vehicleModel: String, plateNumber: String, licenseNumber: String,
  documents: { govId: String, license: String, orcr: String, clearance: String },
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
  weightKg: { type: Number, default: 0.5 },
  deliveryFeePercent: { type: Number, default: 15 },
  merchantId: String, merchantName: String,
  isAvailable: { type: Boolean, default: true },
  rating: { type: Number, default: 0 }, reviewCount: { type: Number, default: 0 },
  sold: { type: Number, default: 0 }, createdAt: { type: Date, default: Date.now }
});

const OrderSchema = new mongoose.Schema({
  customerId: String, customerName: String, customerPhone: String,
  customerAddress: String,
customerLat: Number,
customerLng: Number,
merchantId: String, merchantName: String, merchantAddress: String, merchantPhone: String,
  merchantLat: Number, merchantLng: Number,
  riderId: String, riderName: String,
  items: [{ id: String, name: String, qty: Number, price: Number, reviewed: { type: Boolean, default: false } }],
  total: Number,
distanceKm: { type: Number, default: 0 },
weightKg: { type: Number, default: 0 },
deliveryFee: { type: Number, default: 50 },
riderEarnings: { type: Number, default: 0 },
platformRevenue: { type: Number, default: 0 },
merchantCommission: { type: Number, default: 0 },
  merchantPayout: { type: Number, default: 0 },
serviceFee: { type: Number, default: 0 },
pricingSnapshot: { type: Object, default: {} },
  paymentMethod: { type: String, default: 'cod' },
  paymentStatus: { type: String, default: 'pending' },
  status: { type: String, default: 'pending' },
  statusHistory: [{ status: String, time: Date, note: String }],
  proofOfPickup: String, proofOfDelivery: String, rating: Number, review: String,
  estimatedDelivery: Date, deliveredAt: Date,
  offeredRiderId: String, offerExpiresAt: Date, excludedRiderIds: { type: [String], default: [] },
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
  verifiedPurchase: { type: Boolean, default: true },
  helpful: { type: Number, default: 0 },
  photos: [String],
  createdAt: { type: Date, default: Date.now }
});

const AuditSchema = new mongoose.Schema({
  adminId: String, action: String, target: String, targetId: String,
  details: String, createdAt: { type: Date, default: Date.now }
});



const FinancialLedgerSchema = new mongoose.Schema({
  orderId: String,

  userType: {
    type: String,
    enum: ['customer','merchant','rider','platform']
  },

  userId: String,

  transactionType: {
    type: String,
    enum: [
      'order_payment',
      'merchant_payout',
      'delivery_earnings',
      'platform_revenue',
      'withdrawal',
      'deposit',
      'refund',
      'remittance'
    ],
    default: 'order_payment'
  },

  type: {
    type: String,
    enum: ['credit','debit']
  },

  amount: {
    type: Number,
    default: 0
  },

  balanceBefore: {
    type: Number,
    default: 0
  },

  balanceAfter: {
    type: Number,
    default: 0
  },

  status: {
    type: String,
    default: 'completed'
  },

  description: String,

  createdAt: {
    type: Date,
    default: Date.now
  }
});


const MessageSchema = new mongoose.Schema({
  orderId: String, channel: String,
  senderId: String, senderRole: String, senderName: String,
  text: String,
  isRead: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

const FinancialLedger = mongoose.model(
  'FinancialLedger',
  FinancialLedgerSchema
);

async function addLedgerEntry({
  orderId,
  userType,
  userId,
  transactionType = 'order_payment',
  type,
  amount,
  description,
  balanceBefore = 0,
  balanceAfter = 0,
  status = 'completed'
}) {
  return await FinancialLedger.create({
    orderId,
    userType,
    userId,
    transactionType,
    type,
    amount,
    description,
    balanceBefore,
    balanceAfter,
    status
  });
}



const Customer = mongoose.model('Customer', CustomerSchema);
const Merchant = mongoose.model('Merchant', MerchantSchema);
const Rider = mongoose.model('Rider', RiderSchema);
const Product = mongoose.model('Product', ProductSchema);
const Order = mongoose.model('Order', OrderSchema);
const Notification = mongoose.model('Notification', NotificationSchema);
const Review = mongoose.model('Review', ReviewSchema);
const Audit = mongoose.model('Audit', AuditSchema);
const Message = mongoose.model('Message', MessageSchema);
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

// ── NOTIFICATION HELPER ──
const PushSubscriptionSchema = new mongoose.Schema({
  userId: String, userRole: String,
  endpoint: String, keys: { p256dh: String, auth: String },
  createdAt: { type: Date, default: Date.now }
});
const PushSubscription = mongoose.model('PushSubscription', PushSubscriptionSchema);

async function sendPushToUser(userId, title, message, url) {
  try {
    const subs = await PushSubscription.find({ userId: String(userId) });
    const payload = JSON.stringify({ title, body: message, url: url || '/' });
    for (const sub of subs) {
      const pushConfig = { endpoint: sub.endpoint, keys: sub.keys };
      webpush.sendNotification(pushConfig, payload).catch(async (err) => {
        if (err.statusCode === 410 || err.statusCode === 404) {
          await PushSubscription.deleteOne({ _id: sub._id });
        }
      });
    }
  } catch (e) {}
}

app.post('/api/push/subscribe', auth(), async (req, res) => {
  try {
    const { endpoint, keys } = req.body;
    if (!endpoint || !keys) return res.status(400).json({ error: 'Invalid subscription' });
    await PushSubscription.findOneAndUpdate(
      { endpoint },
      { userId: String(req.user.id), userRole: req.user.role, endpoint, keys },
      { upsert: true }
    );
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/push/unsubscribe', auth(), async (req, res) => {
  try {
    await PushSubscription.deleteOne({ endpoint: req.body.endpoint });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/push/vapid-public-key', (req, res) => {
  res.json({ publicKey: process.env.VAPID_PUBLIC_KEY || '' });
});

async function createNotification(userId, userRole, title, message, type, orderId = null) {
  try { await Notification.create({ userId, userRole, title, message, type, orderId }); } catch (e) {}
  sendPushToUser(userId, title, message, '/');
}

// ============================================================
// AUTO-ASSIGNMENT ENGINE (nearest available rider)
// ============================================================
const MAX_ACTIVE_ORDERS_PER_RIDER = 5;

async function getMerchantLocation(merchantId, merchantAddress) {
  const merchant = await Merchant.findById(merchantId);
  if (merchant && merchant.lat != null && merchant.lng != null) {
    return { lat: merchant.lat, lng: merchant.lng };
  }
  const geo = await geocodeAddress(merchantAddress);
  if (geo && merchant) {
    merchant.lat = geo.lat; merchant.lng = geo.lng;
    await merchant.save();
  }
  return geo;
}

async function tryAssignNearestRider(orderId) {
  try {
    const order = await Order.findById(orderId);
    if (!order || order.status !== 'ready') return false;

    if (order.offeredRiderId && order.offerExpiresAt && order.offerExpiresAt > new Date()) {
      return false;
    }

    let merchantLoc = null;
    if (order.merchantLat != null && order.merchantLng != null) {
      merchantLoc = { lat: order.merchantLat, lng: order.merchantLng };
    } else {
      merchantLoc = await getMerchantLocation(order.merchantId, order.merchantAddress);
      if (merchantLoc) {
        order.merchantLat = merchantLoc.lat;
        order.merchantLng = merchantLoc.lng;
      }
    }

    const excluded = order.excludedRiderIds || [];
    const onlineRiders = await Rider.find({ isOnline: true, status: 'approved', _id: { $nin: excluded } });
    if (!onlineRiders.length) return false;

    const candidates = [];
    for (const rider of onlineRiders) {
      const activeCount = await Order.countDocuments({ riderId: rider._id.toString(), status: { $in: ['rider_assigned', 'picked_up'] } });
      if (activeCount >= MAX_ACTIVE_ORDERS_PER_RIDER) continue;
      candidates.push({ rider, activeCount });
    }
    if (!candidates.length) return false;

    let best = null, bestDist = null;
    if (merchantLoc) {
      let closestDist = Infinity;
      for (const c of candidates) {
        if (!c.rider.currentLocation || c.rider.currentLocation.lat == null) continue;
        const dist = haversineDistance(merchantLoc.lat, merchantLoc.lng, c.rider.currentLocation.lat, c.rider.currentLocation.lng);
        if (dist < closestDist) { closestDist = dist; best = c.rider; }
      }
      if (best) bestDist = closestDist;
    }
    if (!best) {
      candidates.sort((a, b) => a.activeCount - b.activeCount);
      best = candidates[0].rider;
    }

    order.offeredRiderId = best._id.toString();
    order.offerExpiresAt = new Date(Date.now() + 45000);
    await order.save();

    const distMsg = bestDist != null ? `, ${bestDist.toFixed(1)}km away` : '';
    await createNotification(best._id.toString(), 'rider', '🛵 New Delivery Offer!', `An order from ${order.merchantName}${distMsg} is waiting for you to accept.`, 'order', order._id);

    return true;
  } catch (e) {
    console.error('Auto-offer error:', e.message);
    return false;
  }
}

async function expireStaleOffers() {
  try {
    const stale = await Order.find({ status: 'ready', offeredRiderId: { $ne: null }, offerExpiresAt: { $lte: new Date() } });
    for (const o of stale) {
      o.excludedRiderIds = [...(o.excludedRiderIds || []), o.offeredRiderId];
      o.offeredRiderId = null;
      o.offerExpiresAt = null;
      await o.save();
    }
  } catch (e) {}
}

async function runAssignmentSweep() {
  try {
    await expireStaleOffers();
    const readyOrders = await Order.find({ status: 'ready' });
    for (const o of readyOrders) {
      await tryAssignNearestRider(o._id.toString());
    }
  } catch (e) {}
}

setInterval(runAssignmentSweep, 5000);

// ============================================================
// ROUTES
// ============================================================

// ── HEALTH ──
app.get('/', (req, res) => res.json({ status: 'PDE API Running', version: '2.0' }));

// ============================================================
// PHILIPPINE LOCATIONS (Region/Province/Municipality/Barangay)
// ============================================================
app.get('/api/locations/regions', (req, res) => {
  try { res.json(getAllRegions()); } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/locations/provinces/:regionCode', (req, res) => {
  try { res.json(getProvincesByRegion(req.params.regionCode)); } catch (e) { res.status(500).json({ error: e.message }); }
});
// Manual patch: the ph-address package omits Highly Urbanized Cities (HUCs)
// that are independent of any province. Add known HUCs here as needed.
const HUC_PATCHES = {
  '1705300000': [{ name: 'Puerto Princesa City', psgcCode: '1731500000', provinceCode: '1705300000' }] // Palawan
};

app.get('/api/locations/municipalities/:provinceCode', (req, res) => {
  try {
    let munis = getMunicipalitiesByProvince(req.params.provinceCode).slice();
    if (HUC_PATCHES[req.params.provinceCode]) munis = munis.concat(HUC_PATCHES[req.params.provinceCode]);
    munis.sort((a, b) => a.name.localeCompare(b.name));
    res.json(munis);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/locations/barangays/:municipalityCode', (req, res) => {
  try { res.json(getBarangaysByMunicipality(req.params.municipalityCode)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// CUSTOMER AUTH
// ============================================================
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

app.post('/api/customers/forgot-password', async (req, res) => {
  try {
    const { email } = req.body;
    const customer = await Customer.findOne({ email });
    if (!customer) return res.json({ success: true }); // don't reveal if email exists
    const code = Math.floor(100000 + Math.random() * 900000).toString();
    customer.resetCode = code;
    customer.resetCodeExpiry = new Date(Date.now() + 15 * 60 * 1000);
    await customer.save();
    await sendResetEmail(email, customer.name, code);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/customers/reset-password', async (req, res) => {
  try {
    const { email, code, newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const customer = await Customer.findOne({ email, resetCode: code });
    if (!customer || !customer.resetCodeExpiry || customer.resetCodeExpiry < new Date()) {
      return res.status(400).json({ error: 'Invalid or expired code' });
    }
    customer.password = await bcrypt.hash(newPassword, 10);
    customer.resetCode = undefined;
    customer.resetCodeExpiry = undefined;
    await customer.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/customers/me', auth(['customer']), async (req, res) => {
  try {
    const c = await Customer.findById(req.user.id).select('-password');
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/customers/greeting', auth(['customer']), async (req, res) => {
  try {
    const customer = await Customer.findById(req.user.id);
    if (!customer) return res.status(404).json({ error: 'Not found' });

    const latestNotif = await Notification.findOne({ userId: String(req.user.id) }).sort('-createdAt');
    const latestNotifId = latestNotif ? String(latestNotif._id) : null;
    const cacheAgeMs = customer.cachedGreetingAt ? (Date.now() - new Date(customer.cachedGreetingAt).getTime()) : Infinity;
    const cacheStillFresh = cacheAgeMs < 6 * 60 * 60 * 1000; // 6 hours

    if (customer.cachedGreeting && customer.cachedGreetingNotifId === latestNotifId && cacheStillFresh) {
      return res.json({ greeting: customer.cachedGreeting });
    }

    const hour = new Date().getHours();
    const timeOfDay = hour < 12 ? 'morning' : hour < 18 ? 'afternoon' : 'evening';
    const firstName = (customer.name || '').split(' ')[0] || 'there';

    let contextLine = 'No recent notifications.';
    if (latestNotif) contextLine = `Their most recent app notification was: "${latestNotif.title}: ${latestNotif.message}".`;

    const prompt = `Write ONE short, warm, friendly, comforting greeting (max 12 words) for a food/parcel delivery app's home screen banner. It's currently ${timeOfDay}. The customer's first name is ${firstName}. ${contextLine} Make it sound caring and human, like a small kind note from the app, not a sales pitch. Do not mention "free delivery" or discounts. Do not use quotation marks. Reply with ONLY the greeting text, nothing else.`;

    let greeting = `Good ${timeOfDay}, ${firstName}! Hope you're having a great day. 💚`;
    try {
      const gr = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': process.env.ANTHROPIC_API_KEY,
          'anthropic-version': '2023-06-01'
        },
        body: JSON.stringify({
          model: 'claude-sonnet-4-6',
          max_tokens: 60,
          messages: [{ role: 'user', content: prompt }]
        })
      });
      const gd = await gr.json();
      const aiText = gd?.content?.[0]?.text?.trim();
      if (aiText) greeting = aiText;
    } catch (e) { /* fall back to default greeting above */ }

    customer.cachedGreeting = greeting;
    customer.cachedGreetingNotifId = latestNotifId;
    customer.cachedGreetingAt = new Date();
    await customer.save();

    res.json({ greeting });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/customers/me', auth(['customer']), async (req, res) => {
  try {
    const { name, phone, address, addresses } = req.body;
    const c = await Customer.findByIdAndUpdate(req.user.id, { name, phone, address, addresses }, { new: true }).select('-password');
    res.json(c);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/customers/password', auth(['customer']), async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const c = await Customer.findById(req.user.id);
    if (!await bcrypt.compare(currentPassword, c.password)) return res.status(400).json({ error: 'Wrong current password' });
    c.password = await bcrypt.hash(newPassword, 10);
    await c.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Favorites
app.post('/api/customers/favorites/:productId', auth(['customer']), async (req, res) => {
  try {
    await Customer.findByIdAndUpdate(req.user.id, { $addToSet: { favorites: req.params.productId } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.delete('/api/customers/favorites/:productId', auth(['customer']), async (req, res) => {
  try {
    await Customer.findByIdAndUpdate(req.user.id, { $pull: { favorites: req.params.productId } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Profile pic upload
app.post('/api/customers/upload-profile', auth(['customer']), (req, res) => {
  req.uploadDir = 'profiles';
  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    const url = `/uploads/profiles/${req.file.filename}`;
    await Customer.findByIdAndUpdate(req.user.id, { profilePic: url });
    res.json({ url });
  });
});

// ============================================================
// MERCHANT AUTH
// ============================================================
app.post('/api/merchants/apply', (req, res) => {
  upload.fields([{ name: 'govId', maxCount: 1 }, { name: 'businessPermitPhoto', maxCount: 1 }, { name: 'storeFrontPhoto', maxCount: 1 }])(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const {
        name, phone, email, password, storeName, businessType, address,
        productCategory, description, dtiNumber, permitNumber, mayorPermit, tin
      } = req.body;

      const existsMerchant = await Merchant.findOne({ email });
      const existsApplication = await Application.findOne({ "data.email": email, type: "merchant" });
      if (existsMerchant || existsApplication) {
        return res.status(400).json({ error: "Email already registered or application already submitted" });
      }

      const hashed = await bcrypt.hash(password, 10);

      let govIdUrl = '', businessPermitPhotoUrl = '', storeFrontPhotoUrl = '';
      if (req.files) {
        if (req.files.govId) govIdUrl = (await uploadToCloudinary(req.files.govId[0].buffer, 'merchant-docs')).secure_url;
        if (req.files.businessPermitPhoto) businessPermitPhotoUrl = (await uploadToCloudinary(req.files.businessPermitPhoto[0].buffer, 'merchant-docs')).secure_url;
        if (req.files.storeFrontPhoto) storeFrontPhotoUrl = (await uploadToCloudinary(req.files.storeFrontPhoto[0].buffer, 'merchant-docs')).secure_url;
      }

      await Application.create({
        type: "merchant",
        data: {
          fullName: name, name, phone, email, password: hashed,
          storeName, businessType, address, productCategory, description,
          dtiNumber, permitNumber, mayorPermit, tin,
          documents: { govId: govIdUrl, businessPermit: businessPermitPhotoUrl, storeFront: storeFrontPhotoUrl }
        },
        status: "pending"
      });

      res.json({ success: true, message: "Merchant application submitted successfully." });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});
app.post('/api/merchants/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const merchant = await Merchant.findOne({ email });
    if (!merchant || !await bcrypt.compare(password, merchant.password)) return res.status(401).json({ error: 'Invalid credentials' });
    if (merchant.status === 'pending') return res.status(403).json({ error: 'pending', status: 'pending' });
    if (merchant.status === 'rejected') return res.status(403).json({ error: 'rejected', status: 'rejected' });
    if (!merchant.isActive) return res.status(403).json({ error: 'Account disabled' });
    const token = jwt.sign({ id: merchant._id, role: 'merchant', name: merchant.name, storeName: merchant.storeName }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: merchant._id, name: merchant.name, email, storeName: merchant.storeName, role: 'merchant', isOpen: merchant.isOpen } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/merchants/me', auth(['merchant']), async (req, res) => {
  try { res.json(await Merchant.findById(req.user.id).select('-password')); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/merchants/me', auth(['merchant']), async (req, res) => {
  try {
    const m = await Merchant.findByIdAndUpdate(req.user.id, req.body, { new: true }).select('-password');
    res.json(m);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/merchants/toggle-store', auth(['merchant']), async (req, res) => {
  try {
    const m = await Merchant.findById(req.user.id);
    m.isOpen = !m.isOpen;
    await m.save();
    res.json({ isOpen: m.isOpen });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Upload merchant documents
app.post('/api/merchants/upload-docs', auth(['merchant']), (req, res) => {
  req.uploadDir = 'merchants/' + req.user.id;
  upload.fields([{ name: 'govId' }, { name: 'businessPermit' }, { name: 'storeFront' }, { name: 'storeLogo' }, { name: 'storeBanner' }])(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    const docs = {};
    if (req.files?.govId) docs['documents.govId'] = `/uploads/merchants/${req.user.id}/${req.files.govId[0].filename}`;
    if (req.files?.businessPermit) docs['documents.businessPermit'] = `/uploads/merchants/${req.user.id}/${req.files.businessPermit[0].filename}`;
    if (req.files?.storeFront) docs['documents.storeFront'] = `/uploads/merchants/${req.user.id}/${req.files.storeFront[0].filename}`;
    if (req.files?.storeLogo) docs['storeLogo'] = `/uploads/merchants/${req.user.id}/${req.files.storeLogo[0].filename}`;
    if (req.files?.storeBanner) docs['storeBanner'] = `/uploads/merchants/${req.user.id}/${req.files.storeBanner[0].filename}`;
    await Merchant.findByIdAndUpdate(req.user.id, { $set: docs });
    res.json({ success: true, docs });
  });
});

// ============================================================
// RIDER AUTH
// ============================================================
app.post('/api/riders/apply', (req, res) => {
  upload.fields([{ name: 'licensePhoto', maxCount: 1 }, { name: 'orcrPhoto', maxCount: 1 }, { name: 'clearancePhoto', maxCount: 1 }])(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    try {
      const { name, fullName, email, phone, address, vehicleType, vehicleModel, plateNumber, licenseNumber, password } = req.body;
      const finalName = fullName || name;

      const exists = await Rider.findOne({ email });
      if (exists) return res.status(400).json({ error: 'Email already registered' });

      const hashed = await bcrypt.hash(password, 10);

      let licenseUrl = '', orcrUrl = '', clearanceUrl = '';
      if (req.files) {
        if (req.files.licensePhoto) licenseUrl = (await uploadToCloudinary(req.files.licensePhoto[0].buffer, 'rider-docs')).secure_url;
        if (req.files.orcrPhoto) orcrUrl = (await uploadToCloudinary(req.files.orcrPhoto[0].buffer, 'rider-docs')).secure_url;
        if (req.files.clearancePhoto) clearanceUrl = (await uploadToCloudinary(req.files.clearancePhoto[0].buffer, 'rider-docs')).secure_url;
      }

      const rider = await Rider.create({
        name: finalName, email, phone, address, vehicleType, vehicleModel, plateNumber, licenseNumber,
        password: hashed, status: 'pending',
        documents: { license: licenseUrl, orcr: orcrUrl, clearance: clearanceUrl }
      });

      await Application.create({
        type: 'rider',
        data: {
          fullName: finalName, name: finalName, email, phone, address,
          vehicleType, vehicleModel, plateNumber, licenseNumber,
          documents: { license: licenseUrl, orcr: orcrUrl, clearance: clearanceUrl }
        },
        status: 'pending',
        createdAt: new Date(),
        linkedId: rider._id
      });

      res.json({ success: true, message: 'Application submitted' });
    } catch (err) {
      res.status(500).json({ error: err.message });
    }
  });
});
app.post('/api/riders/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    const rider = await Rider.findOne({ email });
    if (!rider || !await bcrypt.compare(password, rider.password)) return res.status(401).json({ error: 'Invalid credentials' });
    if (rider.status === 'pending') return res.status(403).json({ error: 'pending', status: 'pending' });
    if (rider.status === 'rejected') return res.status(403).json({ error: 'rejected', status: 'rejected' });
    if (!rider.isActive) return res.status(403).json({ error: 'Account disabled' });
    const token = jwt.sign({ id: rider._id, role: 'rider', name: rider.name }, JWT_SECRET, { expiresIn: '30d' });
    res.json({ success: true, token, user: { id: rider._id, name: rider.name, email, vehicleType: rider.vehicleType, plateNumber: rider.plateNumber, role: 'rider' } });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/riders/location', auth(['rider']), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await Rider.findByIdAndUpdate(req.user.id, { currentLocation: { lat, lng } });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/customers/location', auth(['customer']), async (req, res) => {
  try {
    const { lat, lng } = req.body;
    await Customer.findByIdAndUpdate(req.user.id, { lat, lng, isOnline: true });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/riders/me', auth(['rider']), async (req, res) => {
  try {
    const r = await Rider.findById(req.user.id).select('-password');
    if (!r) return res.status(404).json({ error: 'Rider not found' });
    res.json(r);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/riders/toggle-online', auth(['rider']), async (req, res) => {
  try {
    const r = await Rider.findById(req.user.id);
    r.isOnline = !r.isOnline;
    await r.save();
    res.json({ isOnline: r.isOnline });
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/debug/reset-offer/:id', async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.offeredRiderId = null;
    order.offerExpiresAt = null;
    order.excludedRiderIds = [];
    await order.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/debug/riders-status', async (req, res) => {
  try {
    const riders = await Rider.find({}).select('name isOnline status currentLocation');
    res.json(riders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/debug/ready-orders', async (req, res) => {
  try {
    const orders = await Order.find({ status: { $in: ['ready', 'rider_assigned'] } }).select('merchantName merchantAddress merchantLat merchantLng status riderName offeredRiderId offerExpiresAt excludedRiderIds');
    const now = new Date();
    res.json({ now, orders });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/riders/set-online', auth(['rider']), async (req, res) => {
  try {
    const { isOnline } = req.body;
    const r = await Rider.findByIdAndUpdate(req.user.id, { isOnline: !!isOnline }, { new: true });
    res.json({ isOnline: r.isOnline });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get open merchants for the live map (rider-facing)
app.get('/api/riders/merchants-map', auth(['rider']), async (req, res) => {
  try {
    const merchants = await Merchant.find({ isOpen: true, lat: { $ne: null }, lng: { $ne: null }, status: 'approved' })
      .select('storeName name lat lng');
    res.json(merchants);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get current delivery offer for this rider (if any, not expired)
app.get('/api/riders/current-offer', auth(['rider']), async (req, res) => {
  try {
    const order = await Order.findOne({
      offeredRiderId: req.user.id,
      status: 'ready',
      offerExpiresAt: { $gt: new Date() }
    });
    if (!order) return res.json({ offer: null });
    res.json({
      offer: {
        orderId: order._id,
        merchantName: order.merchantName,
        merchantAddress: order.merchantAddress,
        merchantLat: order.merchantLat,
        merchantLng: order.merchantLng,
        total: order.total,
        deliveryFee: order.deliveryFee,
        expiresAt: order.offerExpiresAt
      }
    });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Accept a delivery offer
app.put('/api/riders/orders/:id/accept', auth(['rider']), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.offeredRiderId !== req.user.id) return res.status(403).json({ error: 'This offer is not yours' });
    if (!order.offerExpiresAt || order.offerExpiresAt <= new Date()) return res.status(410).json({ error: 'Offer expired' });

    const rider = await Rider.findById(req.user.id);
    order.status = 'rider_assigned';
    order.riderId = req.user.id;
    order.riderName = rider.name;
    order.offeredRiderId = null;
    order.offerExpiresAt = null;
    order.statusHistory.push({ status: 'rider_assigned', time: new Date(), note: 'Accepted by rider' });
    await order.save();

    await createNotification(order.customerId, 'customer', '🛵 Rider Assigned!', `${rider.name} is heading to the merchant to pick up your order.`, 'order', order._id);
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Decline a delivery offer
app.put('/api/riders/orders/:id/decline', auth(['rider']), async (req, res) => {
  try {
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    if (order.offeredRiderId !== req.user.id) return res.status(403).json({ error: 'This offer is not yours' });

    order.excludedRiderIds = [...(order.excludedRiderIds || []), req.user.id];
    order.offeredRiderId = null;
    order.offerExpiresAt = null;
    await order.save();
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Proof of delivery upload
app.post('/api/riders/proof-of-delivery/:orderId', auth(['rider']), (req, res) => {
  upload.single('proof')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    try {
      const result = await uploadToCloudinary(req.file.buffer, 'deliveries');
      await Order.findByIdAndUpdate(req.params.orderId, { proofOfDelivery: result.secure_url });
      res.json({ url: result.secure_url });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

app.post('/api/riders/proof-of-pickup/:orderId', auth(['rider']), (req, res) => {
  upload.single('proof')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'No file' });
    try {
      const result = await uploadToCloudinary(req.file.buffer, 'pickups');
      await Order.findByIdAndUpdate(req.params.orderId, { proofOfPickup: result.secure_url });
      res.json({ url: result.secure_url });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// ============================================================
// ADMIN AUTH
// ============================================================
app.post('/api/admin/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === 'admin123') {
    const token = jwt.sign({ id: 'admin', role: 'admin', name: 'Admin' }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ success: true, token });
  } else res.status(401).json({ error: 'Invalid admin credentials' });
});

// Admin - Approve/Reject application
app.put('/api/admin/applications/:id', auth(['admin']), async (req, res) => {
  try {
    const { status, reason } = req.body;

    const appData = await Application.findById(req.params.id);
    if (!appData)
      return res.status(404).json({ error: 'Application not found' });

    appData.status = status;
    await appData.save();

    if (status === 'approved') {

      // ========================
      // MERCHANT SYNC FIX
      // ========================
      if (appData.type === 'merchant') {

        await Merchant.findOneAndUpdate(
          { email: appData.data.email },
          {
            $set: {
              name: appData.data.fullName || appData.data.name,
              email: appData.data.email,
              phone: appData.data.phone,
              password: appData.data.password,
              storeName: appData.data.storeName,
              businessType: appData.data.businessType,
              address: appData.data.address,
              productCategory: appData.data.productCategory,
              description: appData.data.description,
              dtiNumber: appData.data.dtiNumber,
              permitNumber: appData.data.permitNumber,
              mayorPermit: appData.data.mayorPermit,
              tin: appData.data.tin,
              status: 'approved',
              isActive: true
            }
          },
          { upsert: true, new: true }
        );
      }

      // ========================
      // RIDER SYNC FIX
      // ========================
      else if (appData.type === 'rider') {

        await Rider.findOneAndUpdate(
          { email: appData.data.email },
          {
            $set: {
              name: appData.data.fullName,
              phone: appData.data.phone,
              address: appData.data.address,
              vehicleType: appData.data.vehicleType,
              vehicleModel: appData.data.vehicleModel,
              plateNumber: appData.data.plateNumber,
              licenseNumber: appData.data.licenseNumber,
              documents: appData.data.documents,
              status: 'approved',
              isActive: true
            }
          },
          { upsert: true, new: true }
        );
      }
    }

    await Audit.create({
      adminId: "admin",
      action: `${status} application`,
      target: appData.type,
      targetId: appData._id,
      details: reason || ""
    });

    res.json({ success: true });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/applications', async (req, res) => {
  try {
    const data = await Application.create(req.body);

    res.json({
      success: true,
      message: "Application submitted successfully",
      data
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/admin/applications', auth(['admin']), async (req, res) => {
  try {
    const { status, type } = req.query;

    let query = {};
    if (status) query.status = status;
    if (type) query.type = type;

    const applications = await Application.find(query).sort({ createdAt: -1 });

    const formatted = applications.map(a => ({
      _id: a._id,
      type: a.type,
      status: a.status,
      appliedAt: a.createdAt,
      name: a.data.fullName,
      ...a.data
    }));

    res.json(formatted);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Admin - Get all users
app.get('/api/admin/customers', auth(['admin']), async (req, res) => {
  try {
    const { search, page = 1, limit = 20 } = req.query;

    const query = search
      ? { name: new RegExp(search, 'i') }
      : {};

    const customers = await Customer.find(query)
      .select('-password')
      .limit(Number(limit))
      .skip((page - 1) * limit);

    const total = await Customer.countDocuments(query);

    res.json({
      customers,
      total,
      pages: Math.ceil(total / limit)
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/admin/merchants', auth(['admin']), async (req, res) => {
  try {
    const merchants = await Merchant.find({})
      .select('-password')
      .sort('-createdAt');

    res.json({ success: true, data: merchants });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.get('/api/admin/riders', auth(['admin']), async (req, res) => {
  try {
    const { search, status } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { name: new RegExp(search, 'i') }
      ];
    }
    if (status) query.status = status;

    const riders = await Rider.find(query)
      .select('-password')
      .sort('-createdAt');

    res.json(riders);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// Admin - Ban/Unban account
app.put('/api/admin/ban/:role/:id', auth(['admin']), async (req, res) => {
  try {
    const { role, id } = req.params;
    const { ban, reason } = req.body;
    const Model = role === 'customer' ? Customer : role === 'merchant' ? Merchant : Rider;
    await Model.findByIdAndUpdate(id, { isActive: !ban });
    await Audit.create({ adminId: 'admin', action: ban ? 'banned account' : 'unbanned account', target: role, targetId: id, details: reason || '' });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin - Reset password
app.put('/api/admin/reset-password/:role/:id', auth(['admin']), async (req, res) => {
  try {
    const { role, id } = req.params;
    const { newPassword } = req.body;
    const Model = role === 'customer' ? Customer : role === 'merchant' ? Merchant : Rider;
    const hashed = await bcrypt.hash(newPassword, 10);
    await Model.findByIdAndUpdate(id, { password: hashed });
    await Audit.create({ adminId: 'admin', action: 'reset password', target: role, targetId: id });
    res.json({ success: true });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin - Analytics
app.get('/api/admin/analytics', auth(['admin']), async (req, res) => {
  try {
    const { period = 'monthly' } = req.query;
    const now = new Date();
    let startDate;
    if (period === 'daily') startDate = new Date(now - 24 * 60 * 60 * 1000);
    else if (period === 'weekly') startDate = new Date(now - 7 * 24 * 60 * 60 * 1000);
    else if (period === 'monthly') startDate = new Date(now.getFullYear(), now.getMonth(), 1);
    else startDate = new Date(now.getFullYear(), 0, 1);

    const [orders, delivered, customers, merchants, riders, topProducts] = await Promise.all([
      Order.countDocuments({ date: { $gte: startDate } }),
      Order.find({ status: 'delivered', date: { $gte: startDate } }),
      Customer.countDocuments({ createdAt: { $gte: startDate } }),
      Merchant.countDocuments({ status: 'approved' }),
      Rider.countDocuments({ status: 'approved' }),
      Order.aggregate([
        { $match: { status: 'delivered', date: { $gte: startDate } } },
        { $unwind: '$items' },
        { $group: { _id: '$items.name', total: { $sum: '$items.qty' }, revenue: { $sum: { $multiply: ['$items.price', '$items.qty'] } } } },
        { $sort: { total: -1 } },
        { $limit: 10 }
      ])
    ]);
    const revenue = delivered.reduce((s, o) => s + o.total, 0);
    res.json({ orders, delivered: delivered.length, revenue, customers, merchants, riders, topProducts, successRate: orders ? Math.round(delivered.length / orders * 100) : 0 });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Admin - Audit logs
app.get('/api/admin/audit-logs', auth(['admin']), async (req, res) => {
  try { res.json(await Audit.find().sort('-createdAt').limit(100)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PRODUCTS
// ============================================================
app.get('/api/products', async (req, res) => {
  try {
    const { merchantId, category, search, page = 1, limit = 20, sort = '-createdAt' } = req.query;
    const query = { isAvailable: true };
    if (merchantId) query.merchantId = merchantId;
    if (category) query.category = category;
    if (search) query.name = new RegExp(search, 'i');
    const products = await Product.find(query).sort(sort).limit(Number(limit)).skip((page - 1) * limit);

    const enrichedProducts = await Promise.all(
      products.map(async (p)=>{
        const m = await Merchant.findById(p.merchantId).select('lat lng');
        return {
          ...p.toObject(),
          merchantLat: m?.lat ?? null,
          merchantLng: m?.lng ?? null
        };
      })
    );

    const total = await Product.countDocuments(query);
    res.json({ products: enrichedProducts, total, pages: Math.ceil(total / limit) });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/products/:id', async (req, res) => {
  try { res.json(await Product.findById(req.params.id)); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/products', auth(['merchant']), async (req, res) => {
  try {
    const product = await Product.create({ ...req.body, merchantId: req.user.id, merchantName: req.user.storeName || req.user.name });
    res.json(product);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/products/:id', auth(['merchant']), async (req, res) => {
  try { res.json(await Product.findOneAndUpdate({ _id: req.params.id, merchantId: req.user.id }, req.body, { new: true })); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.delete('/api/products/:id', auth(['merchant']), async (req, res) => {
  try { await Product.findOneAndDelete({ _id: req.params.id, merchantId: req.user.id }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// Product image upload
app.post('/api/products/:id/image', auth(['merchant']), (req, res) => {
  upload.array('images', 5)(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.files || !req.files.length) return res.status(400).json({ error: 'No files uploaded' });
    try {
      const results = await Promise.all(req.files.map(f => uploadToCloudinary(f.buffer, 'products')));
      const urls = results.map(r => r.secure_url);
      const prod = await Product.findById(req.params.id);
      const existingImages = (prod && prod.images) || [];
      const allImages = [...existingImages, ...urls];
      await Product.findByIdAndUpdate(req.params.id, { images: allImages, image: allImages[0] });
      res.json({ urls: allImages });
    } catch (e) {
      res.status(500).json({ error: e.message });
    }
  });
});

// Stock update
app.put('/api/products/:id/stock', auth(['merchant']), async (req, res) => {
  try {
    const p = await Product.findByIdAndUpdate(req.params.id, { stock: req.body.stock, isAvailable: req.body.stock > 0 }, { new: true });
    res.json(p);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// ORDERS
// ============================================================
app.get('/api/orders', auth(['customer', 'merchant', 'rider', 'admin']), async (req, res) => {
  try {
    const { status, merchantId, riderId, customerId, page = 1, limit = 20 } = req.query;
    const query = {};
    if (req.user.role === 'customer') query.customerId = req.user.id;
    else if (req.user.role === 'merchant') query.merchantId = req.user.id;
    else if (req.user.role === 'rider') query.riderId = req.user.id;
    if (status) query.status = status;
    const orders = await Order.find(query).sort('-date').limit(Number(limit)).skip((page - 1) * limit);
    const total = await Order.countDocuments(query);
    res.json({ orders, total });
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Get ready orders for riders
app.get('/api/orders/ready', auth(['rider']), async (req, res) => {
  try { res.json(await Order.find({ status: 'ready' }).sort('-date')); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/orders/:id', async (req, res) => {
  try { res.json(await Order.findById(req.params.id)); } catch (e) { res.status(500).json({ error: e.message }); }
});


// ============================================================
// PRICING ESTIMATE
// ============================================================
app.post('/api/pricing/calculate', async (req, res) => {
  try {
    let settings = await FinancialSettings.findOne();
    if (!settings) settings = await FinancialSettings.create({});

    const pricing = calculatePricing({
      distanceKm: Number(req.body.distanceKm || 1),
      weightKg: Number(req.body.weightKg || 0),
      orderTotal: Number(req.body.orderTotal || 0),
      settings
    });

    res.json(pricing);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.post('/api/orders', auth(['customer']), async (req, res) => {
  try {
    const {
      items,
      merchantId,
      merchantName,
      total,
      paymentMethod,
      customerAddress,
      customerLat,
      customerLng,
      distanceKm
    } = req.body;

    const itemCount = (items || []).reduce(
      (sum, item) => sum + Number(item.qty || 1),
      0
    );

    let settings = await FinancialSettings.findOne();

    if (!settings) {
      settings = await FinancialSettings.create({});
    }

    const pricing = calculatePricing({
      distanceKm: Number(distanceKm || 1),
      weightKg: Number(req.body.weightKg || 0),
      orderTotal: Number(total || 0),
      settings
    });
    const merchant = await Merchant.findById(merchantId);
    const customer = await Customer.findById(req.user.id);
    const io = req.app.get('io');

const order = await Order.create({
      customerId: req.user.id, customerName: req.user.name,
      customerPhone: customer ? customer.phone : '',
      merchantId,
      merchantName,
      items,
      total,

      customerLat,
      customerLng,

      distanceKm: pricing.distanceKm,
      weightKg: Number(req.body.weightKg || 0),
      deliveryFee: pricing.deliveryFee,
      riderEarnings: pricing.riderEarnings,
      platformRevenue: pricing.platformRevenue,
      merchantCommission: pricing.merchantCommission,
      merchantPayout: pricing.merchantPayout,
      serviceFee: pricing.serviceFee,
      pricingSnapshot: pricing.pricingSnapshot,
      paymentMethod: paymentMethod || 'cod', customerAddress,
      merchantAddress: merchant ? merchant.address : '',
      merchantPhone: merchant ? merchant.phone : '',
      merchantLat: merchant ? merchant.lat : null,
      merchantLng: merchant ? merchant.lng : null,
      statusHistory: [{ status: 'pending', time: new Date(), note: 'Order placed by customer' }]
    });

    if (io) {
      // Admin dashboard
      io.to('admin').emit('admin_dashboard_update');

      // Merchant who owns the order
      io.to(`merchant:${merchantId}`).emit('merchant_new_order', order);

      // Customer who created the order
      io.to(`customer:${req.user.id}`).emit('order_created', order);
    }

    // Deduct stock for each ordered item
    for (const item of items) {
      const prod = await Product.findById(item.id);
      if (prod) {
        prod.stock = Math.max(0, (prod.stock || 0) - item.qty);
        prod.isAvailable = prod.stock > 0;
        await prod.save();
      }
    }

    // Notify merchant
    await createNotification(merchantId, 'merchant', '🆕 New Order!', `${req.user.name} placed an order worth ₱${total}`, 'order', order._id);
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.patch('/api/orders/:id/status', auth(['merchant', 'rider', 'admin']), async (req, res) => {
  try {
    const { status, note } = req.body;
    const order = await Order.findById(req.params.id);
    if (!order) return res.status(404).json({ error: 'Order not found' });
    order.status = status;
    order.statusHistory.push({ status, time: new Date(), note: note || '' });
    if (status === 'rider_assigned') { order.riderId = req.user.id; order.riderName = req.user.name; }
    await order.save();

    const io = req.app.get('io');

    if (io) {
      io.emit('order_updated', order);
      io.emit('admin_dashboard_update');

      if (status === 'rider_assigned') {
        io.emit('rider_assigned', order);
      }

      if (status === 'delivered') {
        io.emit('order_delivered', order);
      }
    }

    if (status === 'delivered') {
      const deliveryFee = order.deliveryFee || 0;
      const riderEarnings = order.riderEarnings || 0;
      const platformRevenue = order.platformRevenue || 0;
      const merchantPayout = order.merchantPayout || 0;
      const totalCashCollected = order.paymentMethod === 'cod' ? (order.total + deliveryFee) : 0;
      const amountToRemit = order.paymentMethod === 'cod' ? (totalCashCollected - riderEarnings) : 0;
      const companyEarnings = deliveryFee - riderEarnings;

      
      await addLedgerEntry({
        orderId: order._id.toString(),
        userType: 'rider',
        userId: order.riderId,
        transactionType: 'delivery_earnings',
        type: 'credit',
        amount: riderEarnings,
        description: 'Delivery earnings'
      });

      await addLedgerEntry({
        orderId: order._id.toString(),
        userType: 'merchant',
        userId: order.merchantId,
        transactionType: 'merchant_payout',
        type: 'credit',
        amount: merchantPayout,
        description: 'Merchant payout'
      });

      await addLedgerEntry({
        orderId: order._id.toString(),
        userType: 'platform',
        userId: 'platform',
        transactionType: 'platform_revenue',
        type: 'credit',
        amount: platformRevenue,
        description: 'Platform revenue'
      });

      const remittance = await Remittance.create({

        orderId: order._id.toString(),
        riderId: order.riderId, riderName: order.riderName,
        merchantId: order.merchantId, merchantName: order.merchantName,
        productAmount: order.total, deliveryFee,
        totalCashCollected, riderEarnings, companyEarnings, amountToRemit,
        status: order.paymentMethod === 'cod' ? 'pending' : 'verified',
        verifiedAt: order.paymentMethod === 'cod' ? null : new Date()
      });

      if (order.paymentMethod !== 'cod') {
        // Non-COD: payment already settled electronically, credit balances immediately
        await Merchant.findByIdAndUpdate(order.merchantId, { $inc: { availableBalance: merchantPayout } });
        if (order.riderId) await Rider.findByIdAndUpdate(order.riderId, { $inc: { wallet: riderEarnings, totalEarningsAmount: riderEarnings } });
      } else {
        // COD: merchant amount stays pending until rider remits and admin verifies
        await Merchant.findByIdAndUpdate(order.merchantId, { $inc: { pendingBalance: merchantPayout } });
      }
    }

    // Notify based on status
    const messages = {
      accepted: { title: '✅ Order Accepted!', msg: 'Merchant accepted your order and is preparing it.' },
      ready: { title: '📦 Order Ready!', msg: 'Your order is packed and ready for pickup.' },
      rider_assigned: { title: '🛵 Rider Assigned!', msg: `${req.user.name} is heading to the merchant to pick up your order.` },
      picked_up: { title: '🛵 Rider On The Way!', msg: `${req.user.name} picked up your order and is on the way.` },
      delivered: { title: '🎉 Order Delivered!', msg: 'Your order has been delivered successfully.' }
    };
    if (messages[status]) await createNotification(order.customerId, 'customer', messages[status].title, messages[status].msg, 'order', order._id);
    if (status === 'ready') tryAssignNearestRider(order._id.toString());

    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// Payment verification
app.post('/api/orders/:id/payment', auth(['customer', 'admin']), async (req, res) => {
  try {
    const { paymentStatus, paymentRef } = req.body;
    const order = await Order.findByIdAndUpdate(req.params.id, { paymentStatus, paymentRef }, { new: true });
    res.json(order);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// REVIEWS
// ============================================================
app.post('/api/reviews', auth(['customer']), async (req, res) => {
  try {
    const { orderId, merchantId, productId, rating, review } = req.body;

    const rev = await Review.create({
      orderId,
      customerId: req.user.id,
      customerName: req.user.name,
      merchantId,
      productId,
      rating,
      review
    });

    // Update product rating
    if (productId) {
      const reviews = await Review.find({ productId });
      const avg = reviews.reduce((s, r) => s + r.rating, 0) / reviews.length;
      await Product.findByIdAndUpdate(productId, {
        rating: avg,
        reviewCount: reviews.length
      });
    }

    // Update order rating
    await Order.findByIdAndUpdate(orderId, { rating, review });

    res.json(rev);

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.get('/api/reviews/:productId', async (req, res) => {
  try { res.json(await Review.find({ productId: req.params.productId }).sort('-createdAt').limit(20)); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// NOTIFICATIONS
// ============================================================
app.get('/api/notifications', auth(['customer', 'merchant', 'rider']), async (req, res) => {
  try { res.json(await Notification.find({ userId: { $in: [req.user.id, 'all_' + req.user.role] } }).sort('-createdAt').limit(30)); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/:id/read', auth(['customer', 'merchant', 'rider']), async (req, res) => {
  try { await Notification.findByIdAndUpdate(req.params.id, { isRead: true }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.put('/api/notifications/read-all', auth(['customer', 'merchant', 'rider']), async (req, res) => {
  try { await Notification.updateMany({ userId: req.user.id }, { isRead: true }); res.json({ success: true }); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// ORDER CHAT MESSAGES
// ============================================================
app.get('/api/messages/:orderId', auth(['customer', 'merchant', 'rider']), async (req, res) => {
  try {
    const { channel } = req.query;
    const query = { orderId: req.params.orderId };
    if (channel) query.channel = channel;
    const messages = await Message.find(query).sort('createdAt');
    res.json(messages);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/messages/:orderId', auth(['customer', 'merchant', 'rider']), async (req, res) => {
  try {
    const { text, channel } = req.body;
    if (!text || !text.trim()) return res.status(400).json({ error: 'Message text required' });
    const message = await Message.create({
      orderId: req.params.orderId, channel: channel || 'customer',
      senderId: req.user.id, senderRole: req.user.role, senderName: req.user.name,
      text: text.trim()
    });
    res.json(message);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// REPORTS (Admin)
// ============================================================
app.get('/api/admin/reports/export', auth(['admin']), async (req, res) => {
  try {
    const { format = 'json', period = 'monthly' } = req.query;
    const now = new Date();
    const startDate = period === 'daily' ? new Date(now - 86400000) : period === 'weekly' ? new Date(now - 604800000) : new Date(now.getFullYear(), now.getMonth(), 1);
    const orders = await Order.find({ date: { $gte: startDate } }).sort('-date');
    if (format === 'csv') {
      const csv = ['Order ID,Customer,Total,Status,Date', ...orders.map(o => `${o._id},${o.customerName},${o.total},${o.status},${o.date}`)].join('\n');
      res.setHeader('Content-Type', 'text/csv');
      res.setHeader('Content-Disposition', `attachment; filename=pde-report-${period}.csv`);
      return res.send(csv);
    }
    res.json(orders);
  } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// BACKWARD COMPAT — old endpoints without auth (for HTML apps using no token)
// ============================================================
app.get('/api/products-public', async (req, res) => {
  try { res.json(await Product.find({ isAvailable: true }).sort('-createdAt').limit(50)); } catch (e) { res.json([]); }
});

app.post('/api/customers', async (req, res) => {
  try {
    const { email, password } = req.body;
    const exists = await Customer.findOne({ email });
    if (exists) return res.status(400).json({ error: 'Email exists' });
    const hashed = await bcrypt.hash(password || 'pass123', 10);
    const c = await Customer.create({ ...req.body, password: hashed });
    res.json({ success: true, id: c._id });
  } catch (e) { res.json({ success: false, error: e.message }); }
});
// ✅ BAGONG IDADAGDAG: Kumuha ng listahan ng Merchant (Admin lang)
app.get('/api/admin/merchants', auth(['admin']), async (req, res) => {
  try {
    const merchants = await Merchant.find({})
      .select('-password')
      .sort('-createdAt');

    res.json({ success: true, data: merchants });

  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});
app.put('/api/admin/riders/:id/reset-password', auth(['admin']), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hashed = await bcrypt.hash(newPassword, 10);
    const r = await Rider.findByIdAndUpdate(req.params.id, { password: hashed }, { new: true });
    if (!r) return res.status(404).json({ error: 'Rider not found' });
    res.json({ success: true, message: 'Password reset' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/admin/merchants/:id/reset-password', auth(['admin']), async (req, res) => {
  try {
    const { newPassword } = req.body;
    if (!newPassword || newPassword.length < 6) return res.status(400).json({ error: 'Password must be at least 6 characters' });
    const hashed = await bcrypt.hash(newPassword, 10);
    const m = await Merchant.findByIdAndUpdate(req.params.id, { password: hashed }, { new: true });
    if (!m) return res.status(404).json({ error: 'Merchant not found' });
    res.json({ success: true, message: 'Password reset' });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
app.put('/api/admin/merchants/:id/approve', auth(['admin']), async (req, res) => {
  try {
    const m = await Merchant.findByIdAndUpdate(
      req.params.id,
      { status: 'approved', isActive: true },
      { new: true }
    );
    if (!m) return res.status(404).json({ error: 'Merchant not found' });
    res.json({ success: true, data: m });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
// ── START SERVER ──

// ============================================================
// REMITTANCE ROUTES
// ============================================================
app.get('/api/remittances/my', auth(['rider']), async (req, res) => {
  try {
    const remittances = await Remittance.find({ riderId: req.user.id }).sort('-createdAt');
    const totalCashCollected = remittances.reduce((s,r) => s+(r.totalCashCollected||0), 0);
    const totalEarnings = remittances.reduce((s,r) => s+(r.riderEarnings||0), 0);
    const pendingRemit = remittances.filter(r=>r.status!=='verified').reduce((s,r) => s+(r.amountToRemit||0), 0);
    res.json({ remittances, totalCashCollected, totalEarnings, pendingRemit });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/remittances/:id/remit', auth(['rider']), async (req, res) => {
  try {
    const r = await Remittance.findOneAndUpdate(
      { _id: req.params.id, riderId: req.user.id, status: 'pending' },
      { status: 'remitted', remittedAt: new Date() }, { new: true }
    );
    if (!r) return res.status(404).json({ error: 'Hindi mahanap' });
    res.json({ success: true, remittance: r });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/remittances', auth(['admin']), async (req, res) => {
  try {
    const { status } = req.query;
    const remittances = await Remittance.find(status ? { status } : {}).sort('-createdAt');
    const totalCashCollected = remittances.reduce((s,r) => s+(r.totalCashCollected||0), 0);
    const totalRiderEarnings = remittances.reduce((s,r) => s+(r.riderEarnings||0), 0);
    const totalCompanyEarnings = remittances.reduce((s,r) => s+(r.companyEarnings||0), 0);
    const totalRemitted = remittances.filter(r=>r.status==='verified').reduce((s,r) => s+(r.amountToRemit||0), 0);
    const pendingCount = remittances.filter(r=>r.status==='remitted').length;
    res.json({ remittances, totalCashCollected, totalRiderEarnings, totalCompanyEarnings, totalRemitted, pendingCount });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/admin/remittances/:id/verify', auth(['admin']), async (req, res) => {
  try {
    const remittance = await Remittance.findOneAndUpdate(
      { _id: req.params.id, status: 'remitted' },
      { status: 'verified', verifiedAt: new Date() }, { new: true }
    );
    if (!remittance) return res.status(404).json({ error: 'Hindi mahanap o hindi pa nire-remit' });
    await Merchant.findByIdAndUpdate(remittance.merchantId, {
      $inc: { pendingBalance: -remittance.productAmount, availableBalance: remittance.productAmount }
    });
    await Rider.findByIdAndUpdate(remittance.riderId, {
      $inc: { wallet: remittance.riderEarnings, totalEarningsAmount: remittance.riderEarnings }
    });
    res.json({ success: true, remittance });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
// ============================================================
// PAYOUT ROUTES
// ============================================================
app.get('/api/merchants/balance', auth(['merchant']), async (req, res) => {
  try {
    const merchant = await Merchant.findById(req.user.id).select(
      'pendingBalance availableBalance totalPaidOut totalRevenue storeName'
    );

    const transactions = await FinancialLedger.find({
      userType: 'merchant',
      userId: req.user.id
    })
    .sort('-createdAt')
    .limit(50);

    const totalCommission = transactions
      .filter(t => t.transactionType === 'merchant_payout')
      .reduce((sum, t) => sum + (t.amount || 0), 0);

    res.json({
      merchant,
      wallet: {
        availableBalance: merchant.availableBalance || 0,
        pendingBalance: merchant.pendingBalance || 0,
        totalPaidOut: merchant.totalPaidOut || 0,
        totalRevenue: merchant.totalRevenue || 0,
        totalCommission
      },
      recentTransactions: transactions
    });

  } catch(e) {
    res.status(500).json({ error: e.message });
  }
});
app.post('/api/merchants/payout', auth(['merchant']), async (req, res) => {
  try {
    const merchant = await Merchant.findById(req.user.id);
    if (!merchant.availableBalance || merchant.availableBalance <= 0)
      return res.status(400).json({ error: 'Walang available balance' });
    const amount = merchant.availableBalance;
    const payout = await Payout.create({ merchantId: req.user.id, merchantName: merchant.storeName||merchant.name, amount });
    await Merchant.findByIdAndUpdate(req.user.id, { $inc: { availableBalance: -amount } });
    res.json({ success: true, payout });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/merchants/payouts', auth(['merchant']), async (req, res) => {
  try { res.json(await Payout.find({ merchantId: req.user.id }).sort('-requestedAt')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/admin/payouts', auth(['admin']), async (req, res) => {
  try { res.json(await Payout.find().sort('-requestedAt')); }
  catch(e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/admin/payouts/:id/approve', auth(['admin']), async (req, res) => {
  try {
    const payout = await Payout.findOneAndUpdate(
      { _id: req.params.id, status: 'pending' },
      { status: 'paid', approvedAt: new Date(), paidAt: new Date() }, { new: true }
    );
    if (!payout) return res.status(404).json({ error: 'Hindi mahanap' });
    await Merchant.findByIdAndUpdate(payout.merchantId, { $inc: { totalPaidOut: payout.amount } });
    res.json({ success: true, payout });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.get('/api/riders/wallet', auth(['rider']), async (req, res) => {
  try {
    const remittances = await Remittance.find({ riderId: req.user.id }).sort('-createdAt').limit(50);
    const codRemittances = remittances.filter(r => r.totalCashCollected > 0);
    const totalCashCollected = codRemittances.reduce((s, r) => s + (r.totalCashCollected || 0), 0);
    const yourEarnings = remittances.filter(r => r.status === 'verified').reduce((s, r) => s + (r.riderEarnings || 0), 0);
    const amountToRemit = remittances.filter(r => r.status === 'pending').reduce((s, r) => s + (r.amountToRemit || 0), 0);
    let remittanceStatus = 'All Clear';
    if (remittances.some(r => r.status === 'pending')) remittanceStatus = 'Pending Remittance';
    else if (remittances.some(r => r.status === 'remitted')) remittanceStatus = 'Awaiting Verification';
    res.json({ totalCashCollected, yourEarnings, amountToRemit, remittanceStatus, remittanceHistory: remittances });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.post('/api/riders/remit-all', auth(['rider']), async (req, res) => {
  try {
    const result = await Remittance.updateMany(
      { riderId: req.user.id, status: 'pending' },
      { $set: { status: 'remitted', remittedAt: new Date() } }
    );
    res.json({ success: true, updated: result.modifiedCount || 0 });
  } catch(e) { res.status(500).json({ error: e.message }); }
});
app.put('/api/admin/riders/:riderId/verify-all-remittances', auth(['admin']), async (req, res) => {
  try {
    const list = await Remittance.find({ riderId: req.params.riderId, status: 'remitted' });
    for (const remittance of list) {
      remittance.status = 'verified';
      remittance.verifiedAt = new Date();
      await remittance.save();
      await Merchant.findByIdAndUpdate(remittance.merchantId, {
        $inc: { pendingBalance: -remittance.productAmount, availableBalance: remittance.productAmount }
      });
      await Rider.findByIdAndUpdate(remittance.riderId, {
        $inc: { wallet: remittance.riderEarnings, totalEarningsAmount: remittance.riderEarnings }
      });
    }
    res.json({ success: true, verified: list.length });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/admin/financial-dashboard', auth(['admin']), async (req, res) => {
  try {

    const [
      merchants,
      riders,
      orders,
      ledgers,
      remittances
    ] = await Promise.all([
      Merchant.find(),
      Rider.find(),
      Order.find(),
      FinancialLedger.find(),
      Remittance.find()
    ]);

    const analytics = summarizeOrders(orders);
    const revenue = summarizeRevenuePeriods(orders);
    const rankings = summarizeRankings(orders);
    const charts = summarizeChartData(orders);

    const platformRevenue =
      ledgers
        .filter(l => l.transactionType === 'platform_revenue')
        .reduce((s, l) => s + (l.amount || 0), 0);

    const merchantPending =
      merchants.reduce((s, m) => s + (m.pendingBalance || 0), 0);

    const merchantAvailable =
      merchants.reduce((s, m) => s + (m.availableBalance || 0), 0);

    const riderWallets =
      riders.reduce((s, r) => s + (r.wallet || 0), 0);

    const pendingRemittances =
      remittances
        .filter(r => r.status !== 'verified')
        .reduce((s, r) => s + (r.amountToRemit || 0), 0);

    res.json({
      analytics,
      revenue,
      rankings,

      activeMerchants: merchants.length,
      activeRiders: riders.length,

      financial: {
        platformRevenue,
        merchantPending,
        merchantAvailable,
        riderWallets,
        pendingRemittances
      }
    });

  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});

app.put('/api/admin/payouts/:id/reject', auth(['admin']), async (req, res) => {
  try {
    const payout = await Payout.findByIdAndUpdate(req.params.id, { status: 'rejected', paidAt: new Date() }, { new: true });
    if (!payout) return res.status(404).json({ error: 'Payout not found' });
    res.json({ success: true, payout });
  } catch(e) { res.status(500).json({ error: e.message }); }
});

server.listen(PORT, () => {
  console.log(`\n🚀 PDE Server running at http://localhost:${PORT}`);
  console.log(`📦 MongoDB: ${MONGO_URI}`);
  console.log(`\n📋 Setup Instructions:`);
  console.log(`   1. npm init -y`);
  console.log(`   2. npm install express mongoose bcryptjs jsonwebtoken cors multer`);
  console.log(`   3. Make sure MongoDB is running`);
  console.log(`   4. node server.js\n`);
});

// ============================================================
// PRODUCT REVIEWS API
// ============================================================

// Submit a review for a product (only verified buyers)
    const average = reviews.length > 0 ? total / reviews.length : 0;
    res.json({
      averageRating: average,
      totalReviews: reviews.length,
      reviews
    });
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});


// ============================================================
// GET MERCHANT BY ID (Public)
// ============================================================
app.get('/api/merchants/:id', async (req, res) => {
  try {
    const merchant = await Merchant.findById(req.params.id)
      .select('storeName name phone email address lat lng productCategory businessType description storeLogo storeBanner isOpen status dtiNumber permitNumber tin createdAt');
    if (!merchant) return res.status(404).json({ error: 'Merchant not found' });
    res.json(merchant);
  } catch (e) {
    res.status(500).json({ error: e.message });
  }
});
