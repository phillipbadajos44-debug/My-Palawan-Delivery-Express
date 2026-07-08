function summarizeOrders(orders = []) {

  const summary = {
    totalOrders: orders.length,

    pending: 0,
    accepted: 0,
    ready: 0,
    riderAssigned: 0,
    pickedUp: 0,
    delivered: 0,
    cancelled: 0,

    codOrders: 0,
    onlineOrders: 0,

    codRevenue: 0,
    onlineRevenue: 0,

    totalRevenue: 0,
    totalDeliveryFees: 0,
    totalDistance: 0,

    averageDeliveryFee: 0,
    averageDistance: 0
  };

  for (const order of orders) {

    switch (order.status) {
      case 'pending':
        summary.pending++;
        break;

      case 'accepted':
        summary.accepted++;
        break;

      case 'ready':
        summary.ready++;
        break;

      case 'rider_assigned':
        summary.riderAssigned++;
        break;

      case 'picked_up':
        summary.pickedUp++;
        break;

      case 'delivered':
        summary.delivered++;
        break;

      case 'cancelled':
        summary.cancelled++;
        break;
    }

    if (order.paymentMethod === 'cod') {
      summary.codOrders++;
      summary.codRevenue += Number(order.total || 0);
    } else {
      summary.onlineOrders++;
      summary.onlineRevenue += Number(order.total || 0);
    }

    summary.totalRevenue += Number(order.total || 0);
    summary.totalDeliveryFees += Number(order.deliveryFee || 0);
    summary.totalDistance += Number(order.distanceKm || 0);
  }

  if (summary.totalOrders > 0) {
    summary.averageDeliveryFee =
      Math.round(summary.totalDeliveryFees / summary.totalOrders);

    summary.averageDistance =
      Number((summary.totalDistance / summary.totalOrders).toFixed(2));
  }

  return summary;
}



function summarizeRevenuePeriods(orders = []) {

  const now = new Date();

  const startToday = new Date(now);
  startToday.setHours(0,0,0,0);

  const startWeek = new Date(now);
  startWeek.setDate(now.getDate() - 7);

  const startMonth = new Date(now.getFullYear(), now.getMonth(), 1);

  let todayRevenue = 0;
  let weekRevenue = 0;
  let monthRevenue = 0;

  for (const order of orders) {

    if (order.status !== 'delivered') continue;

    const amount = Number(order.total || 0);
    const date = new Date(order.createdAt || order.date || Date.now());

    if (date >= startToday)
      todayRevenue += amount;

    if (date >= startWeek)
      weekRevenue += amount;

    if (date >= startMonth)
      monthRevenue += amount;
  }

  return {
    todayRevenue,
    weekRevenue,
    monthRevenue
  };
}




function summarizeRankings(orders = []) {

  const merchants = {};
  const riders = {};

  for (const order of orders) {

    if (order.status !== 'delivered')
      continue;

    if (order.merchantId) {

      if (!merchants[order.merchantId]) {
        merchants[order.merchantId] = {
          merchantId: order.merchantId,
          merchantName: order.merchantName,
          revenue: 0,
          orders: 0
        };
      }

      merchants[order.merchantId].revenue += Number(order.total || 0);
      merchants[order.merchantId].orders++;
    }

    if (order.riderId) {

      if (!riders[order.riderId]) {
        riders[order.riderId] = {
          riderId: order.riderId,
          riderName: order.riderName,
          earnings: 0,
          deliveries: 0
        };
      }

      riders[order.riderId].earnings += Number(order.riderEarnings || 0);
      riders[order.riderId].deliveries++;
    }

  }

  return {

    topMerchants:
      Object.values(merchants)
        .sort((a,b)=>b.revenue-a.revenue)
        .slice(0,10),

    topRiders:
      Object.values(riders)
        .sort((a,b)=>b.earnings-a.earnings)
        .slice(0,10)

  };

}




function summarizeChartData(orders = []) {

  const daily = {};

  for (const order of orders) {

    if (order.status !== 'delivered')
      continue;

    const d = new Date(order.createdAt || order.date || Date.now());

    const key =
      d.getFullYear() + "-" +
      String(d.getMonth()+1).padStart(2,'0') + "-" +
      String(d.getDate()).padStart(2,'0');

    if (!daily[key]) {

      daily[key] = {
        date: key,
        revenue: 0,
        orders: 0,
        deliveryFees: 0
      };

    }

    daily[key].revenue += Number(order.total || 0);
    daily[key].orders++;
    daily[key].deliveryFees += Number(order.deliveryFee || 0);

  }

  return Object.values(daily).sort(
    (a,b)=>a.date.localeCompare(b.date)
  );

}


module.exports = {
  summarizeOrders,
  summarizeRevenuePeriods,
  summarizeRankings,
  summarizeChartData
};
