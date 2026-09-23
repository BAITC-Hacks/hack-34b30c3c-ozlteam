import { useEffect, useMemo, useRef, useState } from "react";
import { answerParagraphs, createRevealPlan, revealWindow } from "./answerReveal";
import { useI18n } from "../../../shared/i18n/I18nContext";
import styles from "./AssistantAnswer.module.css";

interface AssistantAnswerProps {
  content: string;
  animate: boolean;
  /** Server response arrival time, retained by the parent across route changes. */
  receivedAt?: number;
  onComplete?: () => void;
}

function prefersReducedMotion() {
  return typeof window !== "undefined" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

/** Presentation of an already received answer, not simulated server streaming. */
export function AssistantAnswer({ content, animate, receivedAt, onComplete }: AssistantAnswerProps) {
  const { t } = useI18n();
  const mountedAt = useRef(Date.now());
  const completed = useRef<string | null>(null);
  const completion = useRef(onComplete);
  completion.current = onComplete;
  const [reducedMotion, setReducedMotion] = useState(prefersReducedMotion);
  const [now, setNow] = useState(Date.now);
  const [skippedContent, setSkippedContent] = useState<string | null>(null);
  const plan = useMemo(() => createRevealPlan(content), [content]);
  const paragraphs = useMemo(() => answerParagraphs(content), [content]);
  const startedAt = receivedAt ?? mountedAt.current;
  const elapsed = Math.max(0, now - startedAt);
  const revealing = animate && completed.current !== content && !reducedMotion && skippedContent !== content && elapsed < plan.duration;
  const visible = revealing ? revealWindow(plan, elapsed) : { end: content.length, newestStart: content.length };

  useEffect(() => {
    const query = globalThis.window.matchMedia("(prefers-reduced-motion: reduce)");
    const change = () => setReducedMotion(query.matches);
    change();
    query.addEventListener("change", change);
    return () => query.removeEventListener("change", change);
  }, []);

  useEffect(() => {
    if (!animate || completed.current === content || reducedMotion || skippedContent === content || !plan.duration) return;
    let frame = 0;
    const tick = () => {
      const time = Date.now();
      setNow(time);
      if (time - startedAt < plan.duration) frame = requestAnimationFrame(tick);
    };
    tick();
    return () => cancelAnimationFrame(frame);
  }, [animate, content, plan.duration, reducedMotion, skippedContent, startedAt]);

  useEffect(() => {
    if (animate && !revealing && completed.current !== content) {
      completed.current = content;
      completion.current?.();
    }
  }, [animate, revealing, content]);

  return <div className={styles.answer}>
    {/* One full accessible message. Visual word updates are excluded from the log's announcements. */}
    <span className={styles.accessibleText}>{content}</span>
    <div aria-hidden="true" className={styles.visual}>
      {paragraphs.filter((paragraph) => paragraph.start < visible.end).map((paragraph) => {
        const text = paragraph.text.slice(0, visible.end - paragraph.start);
        const boundary = Math.max(0, Math.min(text.length, visible.newestStart - paragraph.start));
        return <p key={paragraph.start} className={styles.paragraph}>{text.slice(0, boundary)}{boundary < text.length ? <span key={visible.end} className={styles.newWords}>{text.slice(boundary)}</span> : null}</p>;
      })}
    </div>
    {revealing ? <div className={styles.revealControls}>
      <span aria-hidden="true">{t("Ответ получен", "Жауап алынды", "Answer received")}</span>
      <button type="button" onClick={() => setSkippedContent(content)}>{t("Показать полностью", "Толық көрсету", "Show full answer")}</button>
    </div> : null}
  </div>;
}
