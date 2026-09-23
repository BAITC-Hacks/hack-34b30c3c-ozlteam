import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "../../../shared/ui/Button";
import { NoteForm } from "../components/NoteForm";
import { NoteList } from "../components/NoteList";
import { useNotes } from "../hooks/useNotes";
import styles from "./NotesPage.module.css";

export function NotesPage() {
  const { notes, loading, busy, error, create, remove, reload } = useNotes();
  return (
    <div className="page">
      <header>
        <a className="brand" href="/">
          Центр закупок
        </a>
        <span className="badge">TEAM WORKSPACE</span>
      </header>
      <main>
        <section className="intro">
          <p className="eyebrow">ОТ ИДЕИ К ПЕРВОМУ ДЕМО</p>
          <h1>
            Большие идеи.
            <br />
            <span>Первый шаг — здесь.</span>
          </h1>
          <p>
            Общее место для планов команды. Запишите идею, выберите главное и
            начните создавать.
          </p>
        </section>
        <section className="workspace" aria-labelledby="notes-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">01 / РАБОЧИЙ СТОЛ</p>
              <h2 id="notes-heading">Заметки команды</h2>
            </div>
            <span className="count">{notes.length}</span>
          </div>
          <NoteForm onCreate={create} disabled={busy || loading} />
          {error && (
            <div className={styles.errorNotice} role="alert">
              <span className={styles.errorIcon} aria-hidden="true">
                <AlertCircle size={18} strokeWidth={1.8} />
              </span>
              <p className={styles.errorText}>{error}</p>
              <Button
                variant="secondary"
                size="sm"
                icon={<RotateCcw size={15} strokeWidth={1.8} />}
                onClick={reload}
                disabled={busy || loading}
              >
                Повторить
              </Button>
            </div>
          )}
          {loading ? (
            <p role="status" className="loading">
              Загружаем заметки…
            </p>
          ) : (
            <NoteList notes={notes} disabled={busy} onRemove={remove} />
          )}
        </section>
      </main>
      <footer>
        Центр закупок · Сделано для совместной работы
        <span>Идея → прототип → результат</span>
      </footer>
    </div>
  );
}
