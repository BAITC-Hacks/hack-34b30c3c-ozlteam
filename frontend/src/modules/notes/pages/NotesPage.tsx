import { AlertCircle, RotateCcw } from "lucide-react";
import { Button } from "../../../shared/ui/Button";
import { NoteForm } from "../components/NoteForm";
import { NoteList } from "../components/NoteList";
import { useNotes } from "../hooks/useNotes";
import { useI18n } from "../../../shared/i18n/I18nContext";
import styles from "./NotesPage.module.css";

export function NotesPage() {
  const { t } = useI18n();
  const { notes, loading, busy, error, create, remove, reload } = useNotes();
  return (
    <div className="page">
      <header>
        <a className="brand" href="/">
          {t("Центр закупок", "Сатып алу орталығы", "Procurement center")}
        </a>
        <span className="badge">{t("КОМАНДНОЕ ПРОСТРАНСТВО", "КОМАНДАЛЫҚ КЕҢІСТІК", "TEAM WORKSPACE")}</span>
      </header>
      <main>
        <section className="intro">
          <p className="eyebrow">{t("ОТ ИДЕИ К ПЕРВОМУ ДЕМО", "ИДЕЯДАН АЛҒАШҚЫ ДЕМОҒА", "FROM IDEA TO FIRST DEMO")}</p>
          <h1>
            {t("Большие идеи.", "Үлкен идеялар.", "Big ideas.")}
            <br />
            <span>{t("Первый шаг — здесь.", "Алғашқы қадам — осында.", "The first step starts here.")}</span>
          </h1>
          <p>
            {t("Общее место для планов команды. Запишите идею, выберите главное и начните создавать.", "Команда жоспарларына арналған ортақ орын. Идеяны жазып, бастысына назар аударып, іске кірісіңіз.", "A shared space for team plans. Write down an idea, choose what matters, and get started.")}
          </p>
        </section>
        <section className="workspace" aria-labelledby="notes-heading">
          <div className="section-heading">
            <div>
              <p className="eyebrow">{t("01 / РАБОЧИЙ СТОЛ", "01 / ЖҰМЫС ҮСТЕЛІ", "01 / WORKSPACE")}</p>
              <h2 id="notes-heading">{t("Заметки команды", "Команда жазбалары", "Team notes")}</h2>
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
                {t("Повторить", "Қайталау", "Try again")}
              </Button>
            </div>
          )}
          {loading ? (
            <p role="status" className="loading">
              {t("Загружаем заметки…", "Жазбалар жүктелуде…", "Loading notes…")}
            </p>
          ) : (
            <NoteList notes={notes} disabled={busy} onRemove={remove} />
          )}
        </section>
      </main>
      <footer>
        {t("Центр закупок · Сделано для совместной работы", "Сатып алу орталығы · Бірлескен жұмысқа арналған", "Procurement center · Built for teamwork")}
        <span>{t("Идея → прототип → результат", "Идея → прототип → нәтиже", "Idea → prototype → result")}</span>
      </footer>
    </div>
  );
}
