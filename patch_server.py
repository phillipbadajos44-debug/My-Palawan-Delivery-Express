import os, shutil, sys
SERVER_FILE = 'server.js'
with open(SERVER_FILE, 'r') as f: code = f.read()
shutil.copy(SERVER_FILE, 'server.js.backup')
print("✅ Backup done: server.js.backup")
changes = 0

# PATCH 1: MerchantSchema
OLD1 = '  appliedAt: { type: Date, default: Date.now }\n});'
NEW1 = '  appliedAt: { type: Date, default: Date.now },\n  pendingBalance: { type: Number, default: 0 },\n  availableBalance: { type: Number, default: 0 },\n  totalPaidOut: { type: Number, default: 0 }\n});'
if OLD1 in code and 'pendingBalance' not in code:
    code = code.replace(OLD1, NEW1, 1); changes += 1; print("✅ Patch 1: MerchantSchema updated")
else: print("⏭️  Patch 1: Skip")

# PATCH 2: RiderSchema
OLD2 = '  totalDeliveries: { type: Number, default: 0 }, totalEarnings: { type: Number, default: 0 },'
NEW2 = '  totalDeliveries: { type: Number, default: 0 }, totalEarnings: { type: Number, default: 0 },\n  wallet: { type: Number, default: 0 }, totalEarningsAmount: { type: Number, default: 0 },'
if OLD2 in code and 'wallet' not in code:
    code = code.replace(OLD2, NEW2, 1); changes += 1; print("✅ Patch 2: RiderSchema updated")
else: print("⏭️  Patch 2: Skip")

# PATCH 3: Bagong Schemas
NEW_SCHEMAS = """
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
"""
ANCHOR3 = "const Audit = mongoose.model('Audit', AuditSchema);"
if ANCHOR3 in code and 'RemittanceSchema' not in code:
    code = code.replace(ANCHOR3, ANCHOR3 + NEW_SCHEMAS); changes += 1; print("✅ Patch 3: Remittance & Payout schemas added")
else: print("⏭️  Patch 3: Skip")

# PATCH 4: Auto-remittance kapag delivered
OLD4 = "if (status === 'delivered') order.deliveredAt = new Date();"
NEW4 = """if (status === 'delivered') {
      order.deliveredAt = new Date();
      if (order.paymentMethod === 'cod') {
        const productAmount = order.total - (order.deliveryFee || 50);
        const riderEarnings = (order.deliveryFee || 50) * 0.80;
        const companyEarnings = (order.deliveryFee || 50) * 0.20;
        const amountToRemit = order.total - riderEarnings;
        await Remittance.create({
          orderId: order._id, riderId: order.riderId, riderName: order.riderName,
          merchantId: order.merchantId, merchantName: order.merchantName,
          productAmount, deliveryFee: order.deliveryFee || 50,
          totalCashCollected: order.total, riderEarnings, companyEarnings,
          amountToRemit, status: 'pending'
        });
        await Merchant.findByIdAndUpdate(order.merchantId, {
          $inc: { pendingBalance: productAmount }
        });
      }
    }"""
if OLD4 in code and 'amountToRemit' not in code:
    code = code.replace(OLD4, NEW4, 1); changes += 1; print("✅ Patch 4: Auto-remittance on delivered added")
else: print("⏭️  Patch 4: Skip")

# PATCH 5: Bagong Routes
NEW_ROUTES = """
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
    const m = await Merchant.findById(req.user.id).select('pendingBalance availableBalance totalPaidOut storeName');
    res.json(m);
  } catch(e) { res.status(500).json({ error: e.message }); }
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
    const r = await Rider.findById(req.user.id).select('wallet totalEarningsAmount name');
    res.json(r);
  } catch(e) { res.status(500).json({ error: e.message }); }
});
"""
ANCHOR5 = "app.listen(PORT, () => {"
if ANCHOR5 in code and '/api/remittances/my' not in code:
    code = code.replace(ANCHOR5, NEW_ROUTES + "\n" + ANCHOR5); changes += 1; print("✅ Patch 5: Routes added")
else: print("⏭️  Patch 5: Skip")

with open(SERVER_FILE, 'w') as f: f.write(code)
print(f"\n🎉 Tapos! {changes} patches applied. I-run mo na: node server.js")
