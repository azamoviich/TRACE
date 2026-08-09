import { Metric, MenuItem } from '../types';

export function transformIikoMetricsToMetrics(iikoData: any, previousPeriod?: any): Metric[] {
  const revenue = iikoData.metrics?.revenue || 0;
  const orders = iikoData.metrics?.orders || 0;
  const avgCheck = orders > 0 ? revenue / orders : 0;
  const foodCost = iikoData.metrics?.foodCost || 0;
  const laborCost = iikoData.metrics?.laborCost || 0;
  const foodCostPercent = revenue > 0 ? (foodCost / revenue) * 100 : 0;
  const laborCostPercent = revenue > 0 ? (laborCost / revenue) * 100 : 0;
  const revenueChange = previousPeriod
    ? ((revenue - (previousPeriod.metrics?.revenue || 0)) / (previousPeriod.metrics?.revenue || 1)) * 100
    : 0;

  return [
    { label: 'total_revenue', value: `${revenue.toLocaleString('ru-RU')} UZS`, change: Math.round(revenueChange * 10) / 10, trend: revenueChange >= 0 ? 'up' : 'down', isCurrency: true },
    { label: 'avg_check', value: `${Math.round(avgCheck).toLocaleString('ru-RU')} UZS`, change: 0, trend: 'up', isCurrency: true },
    { label: 'guests_count', value: orders.toString(), change: 0, trend: 'up', isCurrency: false },
    { label: 'food_cost', value: `${foodCostPercent.toFixed(1)}%`, change: 0, trend: foodCostPercent < 30 ? 'down' : 'up', isCurrency: false },
    { label: 'labor_cost', value: `${laborCostPercent.toFixed(1)}%`, change: 0, trend: laborCostPercent < 25 ? 'down' : 'up', isCurrency: false },
  ];
}

export function transformIikoMenuItems(iikoItems: any[]): MenuItem[] {
  return iikoItems.map((item: any) => ({
    id: item.id || item.dishId,
    name: item.name || item.dishName,
    category: item.category || item.categoryName || 'Other',
    price: item.price || 0,
    orders: item.orders || item.quantity || 0,
    revenue: item.revenue || (item.price * (item.orders || 0)),
    trend: item.trend || (Math.random() > 0.5 ? 'up' : 'down'),
    inStock: item.inStock !== false,
  }));
}

export function formatCurrency(value: number, currency: string = 'UZS'): string {
  return `${value.toLocaleString('ru-RU')} ${currency}`;
}

export function formatPercentage(value: number, decimals: number = 1): string {
  return `${value.toFixed(decimals)}%`;
}
