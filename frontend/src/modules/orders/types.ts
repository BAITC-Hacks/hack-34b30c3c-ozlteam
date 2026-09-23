export interface OrderLine {
  id: string;
  recommendation_id: string;
  run_id: string;
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  recommended_quantity: string;
  quantity: string;
  reason: string;
}

export interface SupplierOrder {
  id: string;
  supplier_id: string;
  supplier_name: string;
  warehouse_id: string;
  status: "draft" | "approved";
  version: number;
  revision: number;
  supersedes_order_id: string | null;
  comment: string;
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  lines: OrderLine[];
}
