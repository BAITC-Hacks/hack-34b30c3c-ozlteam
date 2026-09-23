export interface RevealPlan { wordEnds: number[]; duration: number; length: number }

/** Offsets only: slicing the original string never reconstructs spaces or Unicode. */
export function createRevealPlan(content: string): RevealPlan {
  const wordEnds = Array.from(content.matchAll(/\S+\s*/gu), (match) => match.index + match[0].length);
  return { wordEnds, length: content.length, duration: wordEnds.length < 2 ? 0 : Math.min(1800, Math.max(240, wordEnds.length * 24)) };
}

export function revealWindow(plan: RevealPlan, elapsed: number): { end: number; newestStart: number } {
  if (plan.duration === 0 || elapsed >= plan.duration) return { end: plan.length, newestStart: plan.length };
  const progress = Math.max(0, elapsed) / plan.duration;
  const count = Math.min(plan.wordEnds.length, Math.max(1, Math.floor(progress * plan.wordEnds.length)));
  return { end: plan.wordEnds[count - 1] ?? plan.length, newestStart: count > 1 ? plan.wordEnds[count - 2] : 0 };
}

/** Paragraph boundaries retain their original CRLF/LF and whitespace for copying. */
export function answerParagraphs(content: string): Array<{ start: number; text: string }> {
  const result: Array<{ start: number; text: string }> = [];
  let start = 0;
  for (const match of content.matchAll(/\r?\n[\t ]*\r?\n(?:[\t ]*\r?\n)*/gu)) {
    const end = match.index + match[0].length;
    result.push({ start, text: content.slice(start, end) });
    start = end;
  }
  if (start < content.length) result.push({ start, text: content.slice(start) });
  return result;
}
