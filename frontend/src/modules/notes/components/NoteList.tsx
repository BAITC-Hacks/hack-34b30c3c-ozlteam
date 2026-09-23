import { Button } from "../../../shared/ui/Button";
import type { Note } from "../types";
import { useI18n } from "../../../shared/i18n/I18nContext";

interface Props {
  notes: Note[];
  disabled: boolean;
  onRemove: (id: string) => Promise<boolean>;
}

export function NoteList({ notes, disabled, onRemove }: Props) {
  const { locale, t } = useI18n();
  if (!notes.length)
    return (
      <div className="empty-state">
        <span aria-hidden="true">↗</span>
        <h3>{t("Начните с первой идеи", "Алғашқы идеядан бастаңыз", "Start with your first idea")}</h3>
        <p>
          {t("Добавьте заметку — она сохранится в базе и останется после перезапуска.", "Жазба қосыңыз — ол дерекқорда сақталып, қайта іске қосқаннан кейін де қалады.", "Add a note. It will be saved and remain after a restart.")}
        </p>
      </div>
    );
  return (
    <ul className="note-list">
      {notes.map((note) => (
        <li key={note.id}>
          <div>
            <strong className="is-selectable">{note.title}</strong>
            <time dateTime={note.created_at}>
              {new Date(note.created_at).toLocaleString(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU")}
            </time>
          </div>
          <Button
            className="button-quiet"
            disabled={disabled}
            onClick={() => void onRemove(note.id)}
            aria-label={`${t("Удалить заметку", "Жазбаны жою", "Delete note")}: ${note.title}`}
          >
            {t("Удалить", "Жою", "Delete")}
          </Button>
        </li>
      ))}
    </ul>
  );
}
