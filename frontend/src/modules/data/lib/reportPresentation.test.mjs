import assert from "node:assert/strict";
import test from "node:test";
import {
  friendlyReportError,
  reportCellValue,
  reportFieldLabel,
  reportKindDescription,
  reportKindTitle,
  reportRowCount,
} from "./reportPresentation.ts";

test("all supported reports have human names and descriptions", () => {
  for (const kind of [
    "products",
    "sales",
    "stocks",
    "inbound",
    "suppliers",
    "warehouses",
    "categories",
    "stockouts",
    "growth",
  ]) {
    assert.notEqual(reportKindTitle(kind), kind);
    assert.match(reportKindDescription(kind), /[а-яё]/i);
  }
});

test("row count handles singular, plural and teen counts", () => {
  for (const [count, expected] of [
    [0, "0 строк"],
    [1, "1 строка"],
    [2, "2 строки"],
    [5, "5 строк"],
    [11, "11 строк"],
    [14, "14 строк"],
    [21, "21 строка"],
    [23, "23 строки"],
    [111, "111 строк"],
  ]) {
    assert.equal(reportRowCount(count), expected);
  }
});

test("display preserves identity, precision and signs while translating statuses and dates", () => {
  assert.equal(reportCellValue("0000123", "code"), "0000123");
  assert.equal(
    reportCellValue("-12345678901234.123456", "quantity"),
    "-12345678901234.123456",
  );
  assert.equal(reportCellValue("2026-09-23", "date"), "23.09.2026");
  assert.equal(reportCellValue(false, "active"), "Нет");
  assert.equal(reportCellValue("in_transit", "status"), "В пути");
  assert.equal(reportCellValue(null, "expected_date"), "—");
  assert.notEqual(reportFieldLabel("external_id"), reportFieldLabel("code"));
});

test("validation errors are readable with the original preserved for specialists", () => {
  const original =
    "Input should be a valid integer, unable to parse string as an integer";
  const display = friendlyReportError(original);
  assert.equal(display.message, "Здесь нужно целое число.");
  assert.equal(display.technical, original);
  assert.match(friendlyReportError("Field required").message, /поле 1С/);
  assert.equal(
    friendlyReportError("Резерв превышает остаток").message,
    "Резерв превышает остаток",
  );
});

test("connection and unresolved-reference errors keep machine details out of main text", () => {
  const blocked = friendlyReportError(
    "Адрес 1С не разрешён сервером. Настройте ONEC_ALLOWED_ORIGINS",
  );
  assert.match(blocked.message, /администратора/);
  assert.doesNotMatch(blocked.message, /ONEC_/);
  const original = "sales/event-123: не найдено product_external_id=00000123";
  const missing = friendlyReportError(original);
  assert.match(missing.message, /товар/);
  assert.doesNotMatch(missing.message, /external_id|00000123/);
  assert.equal(missing.technical, original);
});
