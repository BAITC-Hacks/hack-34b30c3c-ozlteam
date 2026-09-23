import assert from "node:assert/strict";
import test from "node:test";
import { breakdownQuantity, breakdownValue, describeWarnings, formatQuantity } from "../src/modules/replenishment/lib/presentation.ts";

test("missing stock is unknown while a confirmed zero remains zero", () => {
  const detail = { status: "blocked", unit: "шт.", details: { warnings: ["missing_stock_snapshot"], breakdown: { available_stock: "0.000000", recommended_quantity: "51.000000" } } };
  assert.equal(breakdownQuantity(detail, "available_stock"), "Нет данных");
  assert.equal(breakdownValue(detail, "recommended_quantity"), "—");
  detail.details.warnings = [];
  assert.equal(breakdownQuantity(detail, "available_stock"), "0 шт.");
});

test("synonyms collapse and unknown diagnostics do not leak codes", () => {
  assert.equal(describeWarnings(["lead_time_missing", "missing_lead_time", "lead_time_missing"]), "Не указан срок поставки.");
  assert.ok(!describeWarnings(["new_internal_code"]).includes("new_internal_code"));
});

test("estimates are rounded by unit, exact quantities retain meaningful decimals", () => {
  assert.equal(formatQuantity("25.000003", "шт.", true), "≈ 25");
  assert.equal(formatQuantity("1.250000", "м", true), "1,25");
  assert.equal(formatQuantity("0.000003", "м"), "0,000003");
  assert.equal(formatQuantity(null), "Нет данных");
});
