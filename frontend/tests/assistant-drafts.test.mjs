import assert from "node:assert/strict";
import test from "node:test";
import { readDraft, writeDraft, moveDraft, clearSubmittedDraft } from "../src/modules/assistant/lib/drafts.ts";

test("drafts belong to each conversation, including an unsaved new chat", () => {
  let drafts = writeDraft({}, "", "Новый вопрос\nв две строки");
  drafts = writeDraft(drafts, "chat-a", "Первый");
  drafts = writeDraft(drafts, "chat-b", "Второй");
  assert.equal(readDraft(drafts, "chat-a"), "Первый");
  assert.equal(readDraft(drafts, "chat-b"), "Второй");
  assert.equal(readDraft(drafts, ""), "Новый вопрос\nв две строки");
  assert.equal(readDraft(drafts, "new-id"), "");
});

test("automatic creation transfers latest draft, including edits made in flight", () => {
  const drafts = writeDraft({}, "", "Уже следующий вопрос");
  const moved = moveDraft(drafts, "", "created-id");
  assert.equal(readDraft(moved, ""), "");
  assert.equal(readDraft(moved, "created-id"), "Уже следующий вопрос");
  assert.equal(readDraft(drafts, ""), "Уже следующий вопрос");
});

test("successful response clears only the submitted text in its own chat", () => {
  const drafts = { a: "  Отправлено\n", b: "Другой черновик" };
  const cleared = clearSubmittedDraft(drafts, "a", "Отправлено");
  assert.equal(readDraft(cleared, "a"), "");
  assert.equal(readDraft(cleared, "b"), "Другой черновик");
  assert.equal(drafts.a, "  Отправлено\n");
});

test("response never erases a newer question or an edited failed attempt", () => {
  const drafts = { a: "Следующий вопрос" };
  assert.equal(clearSubmittedDraft(drafts, "a", "Старый вопрос"), drafts);
  assert.equal(readDraft(drafts, "a"), "Следующий вопрос");
});

test("explicit empty input removes only that draft; separate users share no state", () => {
  const alice = writeDraft({}, "a", "Личный текст");
  const bob = {};
  assert.equal(readDraft(bob, "a"), "");
  assert.deepEqual(writeDraft(alice, "a", ""), {});
  assert.equal(readDraft(alice, "a"), "Личный текст");
});
