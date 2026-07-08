function calculatePricing({
  distanceKm = 1,
  itemCount = 1,
  orderTotal = 0,
  settings = {}
}) {

  const delivery = settings.delivery || {};
  const merchant = settings.merchant || {};
  const platform = settings.platform || {};
  const rider = settings.rider || {};

  const baseFee = Number(delivery.baseFee || 40);
  const perKm = Number(delivery.perKm || 10);
  const serviceFee = Number(delivery.serviceFee || 5);
  const perItemFee = Number(delivery.perItemFee || 2);

  const platformPercent = Number(platform.percent || 20);
  const merchantPercent = Number(merchant.commissionPercent || 10);
  const minimumRiderPay = Number(rider.minimumPay || 50);

  const quantityFee =
    Math.max(0, itemCount - 1) * perItemFee;

  const deliveryFee =
    baseFee +
    (distanceKm * perKm) +
    quantityFee +
    serviceFee;

  const platformRevenue =
    deliveryFee * (platformPercent / 100);

  const riderEarnings =
    Math.max(
      minimumRiderPay,
      deliveryFee - platformRevenue
    );

  const merchantCommission =
    orderTotal * (merchantPercent / 100);

  const merchantPayout =
    orderTotal - merchantCommission;

  return {
    distanceKm,
    itemCount,
    orderTotal,

    deliveryFee: Math.round(deliveryFee),
    quantityFee: Math.round(quantityFee),
    serviceFee: Math.round(serviceFee),

    riderEarnings: Math.round(riderEarnings),
    platformRevenue: Math.round(platformRevenue),

    merchantCommission: Math.round(merchantCommission),
    merchantPayout: Math.round(merchantPayout),

    pricingSnapshot: {
      baseFee,
      perKm,
      perItemFee,
      serviceFee,
      platformPercent,
      merchantPercent,
      minimumRiderPay
    }
  };
}

module.exports = {
  calculatePricing
};
