import { ArrowUp, Boxes, ClipboardCheck, FileText, ShoppingCart } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import type { FormEvent } from "react";

import { PageHeader } from "../../../app/PageHeader";
import { useCurrentUser } from "../../auth";
import { Insight, Spinner } from "../../../shared/ui";
import { askAssistant } from "../api/assistant";
import type { ChatTurn } from "../api/assistant";
import styles from "./AssistantPage.module.css";

const PROMPTS = [
  {
    icon: <FileText size={17} strokeWidth={1.8} />,
    title: "Проверить данные",
    text: "Какие данные нужны для расчёта пополнения склада и что проверить перед запуском?",
  },
  {
    icon: <ClipboardCheck size={17} strokeWidth={1.8} />,
    title: "Понять рекомендацию",
    text: "Как сезонность, рост спроса и отсутствие товара влияют на рекомендацию к заказу?",
  },
  {
    icon: <ShoppingCart size={17} strokeWidth={1.8} />,
    title: "Проверить заказ",
    text: "Что менеджеру закупок проверить перед утверждением черновика заказа поставщику?",
  },
  {
    icon: <Boxes size={17} strokeWidth={1.8} />,
    title: "Учесть товар в пути",
    text: "Как учесть товар в пути при расчёте потребности склада?",
  },
];

function greeting(hour: number): string {
  if (hour < 5) return "Доброй ночи";
  if (hour < 12) return "Доброе утро";
  if (hour < 18) return "Добрый день";
  return "Добрый вечер";
}

export function AssistantPage() {
  const { data: user } = useCurrentUser();
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const field = useRef<HTMLTextAreaElement>(null);
  const tail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tail.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [turns, asking]);

  async function send(text: string) {
    const value = text.trim();
    if (!value || asking) return;

    const history = turns;
    setTurns([...history, { role: "user", content: value }]);
    setQuestion("");
    setError("");
    setAsking(true);
    try {
      const answer = await askAssistant(value, history);
      setTurns((current) => [...current, { role: "assistant", content: answer }]);
    } catch (cause) {
      // Реплику пользователя не убираем: её видно, и вопрос можно повторить.
      setError(cause instanceof Error ? cause.message : "Не удалось получить ответ.");
    } finally {
      setAsking(false);
      field.current?.focus();
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(question);
  }

  // В приветствии нужно только имя: full_name может быть «Фамилия Имя Отчество».
  const name = user?.full_name?.split(/\s+/).filter(Boolean)[0] ?? "";
  const empty = turns.length === 0;

  return (
    <>
      <PageHeader title="Помощник по закупкам" subtitle="Спросите о данных, расчётах и заказах своими словами." />

      <div className={styles.room}>
        {empty ? (
          <div className={styles.welcome}>
            <h2 className={styles.hello}>
              {greeting(new Date().getHours())}
              {name ? `, ${name}` : ""}
            </h2>
            <div className={styles.prompts}>
              {PROMPTS.map((prompt) => (
                <button
                  key={prompt.title}
                  type="button"
                  className={styles.prompt}
                  onClick={() => void send(prompt.text)}
                >
                  <span className={styles.promptIcon} aria-hidden="true">
                    {prompt.icon}
                  </span>
                  <span className={styles.promptBody}>
                    <b>{prompt.title}</b>
                    <span>{prompt.text}</span>
                  </span>
                </button>
              ))}
            </div>
          </div>
        ) : (
          <div className={styles.thread}>
            {turns.map((turn, index) => (
              <div
                key={index}
                className={turn.role === "user" ? styles.mine : styles.theirs}
              >
                {turn.content}
              </div>
            ))}
            {asking ? (
              <p className={styles.thinking} role="status">
                <Spinner size="sm" /> Помощник отвечает…
              </p>
            ) : null}
            <div ref={tail} />
          </div>
        )}

        {error ? (
          <Insight
            tone="danger"
            title="Модель не ответила"
            detail={error}
            className={styles.error}
          />
        ) : null}

        <form className={styles.composer} onSubmit={submit}>
          <textarea
            ref={field}
            className={styles.input}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter" && !event.shiftKey) {
                event.preventDefault();
                void send(question);
              }
            }}
            placeholder="Спросите помощника"
            rows={1}
            maxLength={4000}
            aria-label="Вопрос ассистенту"
          />
          <button
            type="submit"
            className={styles.send}
            disabled={asking || !question.trim()}
            aria-label="Отправить"
          >
            <ArrowUp size={17} strokeWidth={2} />
          </button>
        </form>
        <p className={styles.note}>
          Enter отправляет, Shift + Enter переносит строку. Ответы модели проверяйте перед
          применением.
        </p>
      </div>
    </>
  );
}
