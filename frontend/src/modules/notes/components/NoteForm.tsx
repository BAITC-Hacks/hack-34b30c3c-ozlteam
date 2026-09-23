import { useState } from "react";
import type { FormEvent } from "react";
import { Button, Field } from "../../../shared/ui";
import styles from "./NoteForm.module.css";
import { useI18n } from "../../../shared/i18n/I18nContext";

interface Props {
  disabled: boolean;
  onCreate: (title: string) => Promise<boolean>;
}

export function NoteForm({ disabled, onCreate }: Props) {
  const { t } = useI18n();
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
          label={t("Что нужно сделать команде?", "Команда не істеуі керек?", "What does the team need to do?")}
          wrapperClassName={styles.field}
          value={title}
          onChange={(event) => setTitle(event.target.value)}
          placeholder={t("Например, обсудить идею MVP", "Мысалы, MVP идеясын талқылау", "For example, discuss the MVP idea")}
          maxLength={200}
          required
          disabled={disabled}
        />
        <Button type="submit" disabled={disabled || !title.trim()}>
          {t("Добавить", "Қосу", "Add")}
        </Button>
      </div>
    </form>
  );
}
