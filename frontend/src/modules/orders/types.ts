export interface OrderLine {
  id: string;
  recommendation_id: string | null;
  run_id: string | null;
  product_id: string;
  sku: string;
  name: string;
  unit: string;
  recommended_quantity: string | null;
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
  external_references: {
    supplier: ExternalReference;
    warehouse: ExternalReference;
    products: Array<ExternalReference & {
      code: string | null;
      sku: string;
      unit: string;
      characteristic_external_id: string | null;
    }>;
  };
  created_by: string;
  created_at: string;
  approved_by: string | null;
  approved_at: string | null;
  lines: OrderLine[];
}

export interface ExternalReference {
  id: string;
  source_id: string;
  external_id: string;
  name: string;
}

export interface OrderAudit {
  id: string;
  actor_id: string;
  action: string;
  data: Record<string, unknown>;
  created_at: string;
}

export interface OrderDelivery {
  order_id: string;
  revision: number;
  status: "pending" | "accepted" | "rejected";
  external_document_id: string | null;
  message: string;
  acknowledged_by: string | null;
  acknowledged_at: string | null;
}

export interface OrderHandoff {
  schema_version: "1.0";
  idempotency_key: string;
  order: SupplierOrder;
  delivery: OrderDelivery;
}
