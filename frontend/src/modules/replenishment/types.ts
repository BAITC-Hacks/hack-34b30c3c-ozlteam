export interface Product { sku: string; name: string; category: string; supplier_id: string }
export interface Supplier { id: string; name: string; lead_days: number; min_order_qty: number }
export interface Sale { date: string; sku: string; warehouse: string; customer_id: string; quantity: number; price: number }
export interface Stock { sku: string; warehouse: string; quantity: number }
export interface Inbound { sku: string; warehouse: string; quantity: number; eta: string }
export interface Stockout { sku: string; warehouse: string; start: string; end: string }
export interface CategoryGrowth { category: string; growth_pct: number }

export interface CalculationInput {
  as_of: string;
  review_days: number;
  products: Product[];
  suppliers: Supplier[];
  sales: Sale[];
  stock: Stock[];
  inbound: Inbound[];
  stockouts: Stockout[];
  category_growth: CategoryGrowth[];
}

export interface RecommendationMetrics {
  raw_sales: number;
  excluded_spike_units: number;
  lost_demand_units: number;
  adjusted_daily_demand: number;
  seasonality_factor: number;
  trend_factor: number;
  category_growth_factor: number;
  on_hand: number;
  inbound: number;
  target_stock: number;
  stock_position: number;
  lead_days: number;
  review_days: number;
}

export interface Recommendation {
  sku: string;
  name: string;
  warehouse: string;
  category: string;
  supplier_id: string;
  supplier_name: string;
  recommended_qty: number;
  urgency: "critical" | "soon" | "normal";
  explanation: string;
  metrics: RecommendationMetrics;
}

export interface CalculationResult {
  as_of: string;
  recommendations: Recommendation[];
}
