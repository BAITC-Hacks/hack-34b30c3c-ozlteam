import type { AnyCatalogRecord, CatalogKind, CategoryRecord, ManualCatalogFields, ProductRecord } from "./api/catalogs";

export type CatalogDraft = Record<"name" | "sku" | "code" | "unit" | "category_id" | "supplier_id" | "pack_size" | "min_order_qty" | "lead_time_days" | "review_days" | "safety_days", string>;

export function catalogDraft(kind: CatalogKind, record?: AnyCatalogRecord): CatalogDraft {
  const product = kind === "products" && record ? record as ProductRecord : null;
  const category = kind === "categories" && record ? record as CategoryRecord : null;
  return {
    name: record?.name ?? "", sku: product?.sku ?? "", code: product?.code ?? "", unit: product?.unit ?? "шт",
    category_id: product?.category_id ?? "", supplier_id: product?.supplier_id ?? "",
    pack_size: product?.pack_size ?? "1", min_order_qty: product?.min_order_qty ?? "0",
    lead_time_days: product?.lead_time_days?.toString() ?? "",
    review_days: String(category?.review_days ?? 7), safety_days: String(category?.safety_days ?? 7),
  };
}

/** Keep decimal quantities as strings so JSON never rounds large quantities. */
export function validCatalogQuantity(value: string, positive: boolean): boolean {
  const normalized = value.trim().replace(",", ".");
  if (!/^\d{1,14}(\.\d{1,6})?$/.test(normalized)) return false;
  return !positive || /[1-9]/.test(normalized);
}

export function catalogFields(kind: CatalogKind, draft: CatalogDraft): ManualCatalogFields {
  const fields: ManualCatalogFields = { name: draft.name.trim() };
  if (kind === "products") Object.assign(fields, {
    sku: draft.sku.trim(), code: draft.code.trim() || null, unit: draft.unit.trim(),
    category_id: draft.category_id || null, supplier_id: draft.supplier_id || null,
    pack_size: draft.pack_size.trim().replace(",", "."), min_order_qty: draft.min_order_qty.trim().replace(",", "."),
    lead_time_days: draft.lead_time_days === "" ? null : Number(draft.lead_time_days),
  });
  if (kind === "categories") Object.assign(fields, { review_days: Number(draft.review_days), safety_days: Number(draft.safety_days) });
  return fields;
}

/** PATCH only changed business fields; preserve hidden exchange identity and unchanged links. */
export function catalogChanges(kind: CatalogKind, draft: CatalogDraft, record: AnyCatalogRecord): ManualCatalogFields {
  const before = catalogFields(kind, catalogDraft(kind, record));
  return Object.fromEntries(Object.entries(catalogFields(kind, draft)).filter(([key, value]) => value !== before[key as keyof ManualCatalogFields]));
}
