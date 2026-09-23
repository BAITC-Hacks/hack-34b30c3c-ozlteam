import { Button } from "../../../shared/ui/Button";
import type { Note } from "../types";

interface Props {
  notes: Note[];
  disabled: boolean;
  onRemove: (id: string) => Promise<boolean>;
}

export function NoteList({ notes, disabled, onRemove }: Props) {
  if (!notes.length)
    return (
      <div className="empty-state">
        <span aria-hidden="true">↗</span>
        <h3>Начните с первой идеи</h3>
        <p>
          Добавьте заметку — она сохранится в базе и останется после
          перезапуска.
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
              {new Date(note.created_at).toLocaleString("ru-RU")}
            </time>
          </div>
          <Button
            className="button-quiet"
            disabled={disabled}
            onClick={() => void onRemove(note.id)}
            aria-label={`Удалить заметку: ${note.title}`}
          >
            Удалить
          </Button>
        </li>
      ))}
    </ul>
  );
}
