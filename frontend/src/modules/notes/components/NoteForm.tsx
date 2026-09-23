import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Field } from "../../../shared/ui";
import styles from "./NoteForm.module.css";

interface Props {
  disabled: boolean;
  onCreate: (title: string) => Promise<boolean>;
}

export function NoteForm({ disabled, onCreate }: Props) {
  const [title, setTitle] = useState("");
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (title.trim() && (await onCreate(title.trim()))) setTitle("");
  }
  return (
    <form onSubmit={(event) => void submit(event)}>
      <div className={styles.row}>
        <Field
          id="note-title"
          label="Что нужно сделать команде?"
          wrapperClassName={styles.field}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder="Например, обсудить идею MVP"
          maxLength={200}
          required
          disabled={disabled}
        />
        <Button type="submit" disabled={disabled || !title.trim()}>
          Добавить
        </Button>
      </div>
    </form>
  );
}
