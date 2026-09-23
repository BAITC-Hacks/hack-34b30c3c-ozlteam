/** Draft text stays in the signed-in user's in-memory workspace, never browser storage. */
export type Drafts = Record<string, string>;
const key = (conversationId: string) => conversationId || "new";

export function readDraft(drafts: Drafts, conversationId: string): string {
  return drafts[key(conversationId)] ?? "";
}

export function writeDraft(drafts: Drafts, conversationId: string, content: string): Drafts {
  const next = { ...drafts };
  if (content) next[key(conversationId)] = content;
  else delete next[key(conversationId)];
  return next;
}

export function moveDraft(drafts: Drafts, from: string, to: string): Drafts {
  const content = readDraft(drafts, from);
  if (from === to || !content) return drafts;
  return writeDraft(writeDraft(drafts, from, ""), to, content);
}

/** A reply must not erase the next question typed while the request was in flight. */
export function clearSubmittedDraft(drafts: Drafts, conversationId: string, submitted: string): Drafts {
  return readDraft(drafts, conversationId).trim() === submitted.trim()
    ? writeDraft(drafts, conversationId, "") : drafts;
}
