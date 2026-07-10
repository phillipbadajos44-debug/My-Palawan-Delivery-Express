function calculatePricing({
  distanceKm = 0,
  weightKg = 0,
  orderTotal = 0,
  settings = {}
}) {
  const delivery = settings.delivery || {};
  const merchant = settings.merchant || {};
  const rider = settings.rider || {};
  const platform = settings.platform || {};

  const baseFee = Number(delivery.baseFee || 40);
  const perKm = Number(delivery.perKm || 10);
  const perKg = Number(delivery.perKg || 5);
  const minimumFee = Number(delivery.minimumFee || 40);
  const maximumFee = Number(delivery.maximumFee || 500);

  const merchantPercent = Number(merchant.commissionPercent || 10);
  const serviceFee = Number(platform.serviceFee || 0);

  let deliveryFee =
    baseFee +
    (distanceKm * perKm) +
    (weightKg * perKg);

  if (deliveryFee < minimumFee) deliveryFee = minimumFee;
  if (deliveryFee > maximumFee) deliveryFee = maximumFee;

  const merchantCommission =
    orderTotal * (merchantPercent / 100);

  const merchantPayout =
    orderTotal - merchantCommission;

  const riderEarnings =
    Math.max(
      Number(rider.basePay || 30),
      deliveryFee - serviceFee
    );

  const platformRevenue =
    merchantCommission + Math.max(0, deliveryFee - riderEarnings);

  return {
    distanceKm,
    weightKg,
    orderTotal,
    deliveryFee: Math.round(deliveryFee),
    riderEarnings: Math.round(riderEarnings),
    merchantCommission: Math.round(merchantCommission),
    merchantPayout: Math.round(merchantPayout),
    platformRevenue: Math.round(platformRevenue),
    serviceFee,
    pricingSnapshot: {
      baseFee,
      perKm,
      perKg,
      minimumFee,
      maximumFee,
      serviceFee
    }
  };
}

module.exports = {
  calculatePricing
};
