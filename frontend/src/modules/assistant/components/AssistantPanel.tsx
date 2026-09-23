import { ArrowUp, Bot } from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";

import { askAssistant, type ChatTurn } from "../api/assistant";
import styles from "./AssistantPanel.module.css";

export function AssistantPanel() {
  const [turns, setTurns] = useState<ChatTurn[]>([]);
  const [question, setQuestion] = useState("");
  const [asking, setAsking] = useState(false);
  const [error, setError] = useState("");
  const pending = useRef(false);
  const tail = useRef<HTMLDivElement>(null);

  useEffect(() => {
    tail.current?.scrollIntoView({ block: "nearest" });
  }, [turns, asking]);

  async function send(value: string, retry = false) {
    const trimmed = value.trim();
    if (!trimmed || pending.current) return;
    pending.current = true;
    const history = retry || error ? turns.slice(0, -1) : turns;
    if (!retry) setTurns([...history, { role: "user", content: trimmed }]);
    setQuestion("");
    setError("");
    setAsking(true);
    try {
      const answer = await askAssistant(trimmed, history);
      setTurns((current) => [...current, { role: "assistant", content: answer }]);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Не удалось получить ответ.");
    } finally {
      pending.current = false;
      setAsking(false);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void send(question);
  }

  return <div className={styles.chat}>
    <div className={styles.messages} role="log" aria-label="Диалог с ассистентом">
      {turns.length === 0 ? <div className={styles.empty}>
        <Bot size={24} strokeWidth={1.8} aria-hidden="true" />
        <b>Спросите помощника</b>
        <p>Помогу разобраться с расчётом пополнения и заказами. Ответы проверяйте перед применением.</p>
        <button type="button" onClick={() => void send("Что проверить перед утверждением заказа поставщику?")}>Что проверить в заказе?</button>
      </div> : turns.map((turn, index) => <div key={index} className={turn.role === "user" ? styles.mine : styles.theirs}>{turn.content}</div>)}
      {asking ? <p className={styles.pending} role="status">Помощник отвечает…</p> : null}
      {error ? <div className={styles.error} role="alert"><p>Не удалось получить ответ: {error}</p><button type="button" disabled={asking} onClick={() => void send(turns[turns.length - 1]?.content ?? "", true)}>Повторить вопрос</button></div> : null}
      <div ref={tail} />
    </div>
    <form className={styles.composer} onSubmit={submit}>
      <textarea value={question} onChange={(event) => setQuestion(event.target.value)} onKeyDown={(event) => {
        if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); void send(question); }
      }} rows={1} maxLength={4000} placeholder="Задайте вопрос…" aria-label="Вопрос ассистенту" />
      <button type="submit" disabled={asking || !question.trim()} aria-label="Отправить вопрос"><ArrowUp size={18} strokeWidth={1.8} /></button>
    </form>
  </div>;
}
