import assert from "node:assert/strict";
import test from "node:test";
import { answerParagraphs, createRevealPlan, revealWindow } from "./answerReveal.ts";

test("reveal uses original Unicode and whitespace boundaries", () => {
  const text = "  Привет 👨‍👩‍👧‍👦!\tЗаказ\r\n\r\nготов\u00a0сегодня.  ";
  const plan = createRevealPlan(text);
  let previous = 0;
  for (let time = 0; time <= plan.duration; time += 5) {
    const { end } = revealWindow(plan, time);
    assert.ok(end >= previous);
    assert.ok(plan.wordEnds.includes(end) || end === text.length);
    assert.equal(text.slice(0, end).isWellFormed(), true);
    previous = end;
  }
  assert.equal(revealWindow(plan, 2000).end, text.length);
  assert.equal(answerParagraphs(text).map((part) => part.text).join(""), text);
});

test("long responses finish within 1800ms and history never needs replay", () => {
  const text = "слово ".repeat(2000);
  const plan = createRevealPlan(text);
  assert.equal(plan.duration, 1800);
  assert.equal(revealWindow(plan, 1800).end, text.length);
  assert.equal(revealWindow(plan, 10000).end, text.length);
  assert.ok(revealWindow(plan, 900).end > revealWindow(plan, 0).end);
});

test("empty, whitespace-only and a single Unicode word are immediate", () => {
  for (const text of ["", " \n\t ", "你好世界", "👩🏽‍💻"]) {
    const plan = createRevealPlan(text);
    assert.equal(plan.duration, 0);
    assert.equal(revealWindow(plan, 0).end, text.length);
  }
});

test("paragraphs retain blank lines, indentation and literal markup", () => {
  const text = "**Важно** <script>alert(1)</script>\n\n  Не HTML.\r\n \r\n[Заказы](/orders)\n\n";
  const paragraphs = answerParagraphs(text);
  assert.equal(paragraphs.length, 3);
  assert.equal(paragraphs.map((part) => part.text).join(""), text);
  for (const part of paragraphs) assert.equal(text.slice(part.start, part.start + part.text.length), part.text);
});
