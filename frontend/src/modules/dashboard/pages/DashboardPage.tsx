import {
  CalendarClock,
  FileText,
  Lightbulb,
  Plus,
  StickyNote,
  TrendingUp,
} from "lucide-react";
import { useMemo, useRef, useState } from "react";
import type { FormEvent } from "react";

import { PageHeader } from "../../../app/PageHeader";
import { useNotes } from "../../notes";
import type { Note } from "../../notes";
import {
  Badge,
  Breakdown,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Field,
  Insight,
  Segmented,
  Spinner,
  StatRow,
  Table,
  Td,
  Th,
  Tr,
} from "../../../shared/ui";
import styles from "./DashboardPage.module.css";

const DAY = 24 * 60 * 60 * 1000;

type Filter = "all" | "today" | "week" | "older";

interface Buckets {
  today: Note[];
  week: Note[];
  older: Note[];
}

function split(notes: Note[], now: number): Buckets {
  const buckets: Buckets = { today: [], week: [], older: [] };
  for (const note of notes) {
    const age = now - new Date(note.created_at).getTime();
    if (age < DAY) buckets.today.push(note);
    else if (age < 7 * DAY) buckets.week.push(note);
    else buckets.older.push(note);
  }
  return buckets;
}

function ageLabel(iso: string, now: number): { text: string; stale: boolean } {
  const age = now - new Date(iso).getTime();
  if (age < DAY) return { text: "сегодня", stale: false };
  const days = Math.floor(age / DAY);
  if (days < 7) return { text: `${days} дн. назад`, stale: false };
  return { text: `${days} дн. назад`, stale: true };
}

export function DashboardPage() {
  const { notes, loading, busy, error, create, remove, reload } = useNotes();
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const titleField = useRef<HTMLInputElement>(null);

  // Одна отметка времени на отрисовку: иначе соседние ячейки считают возраст по-разному.
  const now = useMemo(() => Date.now(), [notes]);
  const buckets = useMemo(() => split(notes, now), [notes, now]);

  const today = new Date(now).toLocaleDateString("ru-RU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const value = title.trim();
    if (value && (await create(value))) setTitle("");
  }

  const stalest = buckets.older[buckets.older.length - 1];

  const shown =
    filter === "all"
      ? notes
      : filter === "today"
        ? buckets.today
        : filter === "week"
          ? buckets.week
          : buckets.older;

  return (
    <>
      <PageHeader
        title={today[0].toUpperCase() + today.slice(1)}
        subtitle="Что записала команда и что из этого ждёт ответа дольше всего."
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={reload} disabled={loading || busy}>
              Обновить
            </Button>
            <Button
              variant="dark"
              size="sm"
              icon={<Plus size={15} strokeWidth={1.8} />}
              onClick={() => titleField.current?.focus()}
            >
              Заметка
            </Button>
          </>
        }
      />

      <Segmented
        className={styles.filter}
        ariaLabel="Фильтр заметок по давности"
        value={filter}
        onValueChange={(value) => setFilter(value as Filter)}
        items={[
          { value: "all", label: "Все", count: notes.length },
          { value: "today", label: "Сегодня", count: buckets.today.length },
          { value: "week", label: "Эта неделя", count: buckets.week.length },
          { value: "older", label: "Старше недели", count: buckets.older.length },
        ]}
      />

      <StatRow
        items={[
          {
            label: "Всего заметок",
            value: notes.length,
            icon: <StickyNote size={16} strokeWidth={1.8} />,
          },
          {
            label: "Добавлено сегодня",
            value: buckets.today.length,
            icon: <Plus size={16} strokeWidth={1.8} />,
            delta: buckets.today.length > 0 ? "есть движение" : "тихо",
            deltaTone: buckets.today.length > 0 ? "good" : "neutral",
          },
          {
            label: "За эту неделю",
            value: buckets.week.length + buckets.today.length,
            icon: <TrendingUp size={16} strokeWidth={1.8} />,
          },
          {
            label: "Висит дольше недели",
            value: buckets.older.length,
            icon: <CalendarClock size={16} strokeWidth={1.8} />,
            delta: buckets.older.length > 0 ? "разобрать" : "чисто",
            deltaTone: buckets.older.length > 0 ? "warn" : "good",
          },
        ]}
      />

      <div className={styles.cols}>
        <Card
          title="Заметки команды"
          subtitle="Всё, что попало в общий список. Свежие сверху."
          actions={<Badge tone="neutral">{shown.length}</Badge>}
        >
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <Field
              label="Что нужно сделать команде?"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="Например, запросить CMR по отправке KZ-1176"
              maxLength={200}
              disabled={busy || loading}
              ref={titleField}
            />
            <Button type="submit" disabled={busy || loading || !title.trim()} loading={busy}>
              Добавить
            </Button>
          </form>

          {error ? (
            <ErrorState
              title="Не удалось загрузить заметки"
              text={error}
              onRetry={reload}
              retrying={loading}
            />
          ) : loading ? (
            <p className={styles.loading} role="status">
              <Spinner size="sm" /> Загружаем заметки…
            </p>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<StickyNote size={20} strokeWidth={1.8} />}
              title={filter === "all" ? "Список пуст" : "В этом наборе пусто"}
              text={
                filter === "all"
                  ? "Первая же запись появится здесь и переживёт перезапуск — она лежит в базе."
                  : "Здесь ничего нет. Переключитесь на «Все», чтобы увидеть весь список."
              }
            />
          ) : (
            <Table maxHeight="380px">
              <thead>
                <Tr>
                  <Th>Запись</Th>
                  <Th>Возраст</Th>
                  <Th align="right">Действие</Th>
                </Tr>
              </thead>
              <tbody>
                {shown.map((note) => {
                  const age = ageLabel(note.created_at, now);
                  return (
                    <Tr key={note.id}>
                      <Td>
                        <span className={styles.noteTitle}>{note.title}</span>
                        <time className={styles.noteTime} dateTime={note.created_at}>
                          {new Date(note.created_at).toLocaleString("ru-RU", {
                            day: "2-digit",
                            month: "2-digit",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </time>
                      </Td>
                      <Td>
                        <Badge tone={age.stale ? "warning" : "neutral"}>{age.text}</Badge>
                      </Td>
                      <Td align="right">
                        <Button
                          variant="ghost"
                          size="sm"
                          disabled={busy}
                          onClick={() => void remove(note.id)}
                          aria-label={`Удалить заметку: ${note.title}`}
                        >
                          Удалить
                        </Button>
                      </Td>
                    </Tr>
                  );
                })}
              </tbody>
            </Table>
          )}

          {!loading && !error && stalest ? (
            <Insight
              icon={<Lightbulb size={18} strokeWidth={1.8} />}
              tone="warning"
              title={`${buckets.older.length} ${buckets.older.length === 1 ? "запись висит" : "записи висят"} дольше недели`}
              detail={`Самая старая — «${stalest.title}». Либо у неё нет владельца, либо она уже неактуальна: и то и другое решается за минуту.`}
            />
          ) : null}
        </Card>

        <div className={styles.side}>
          <Card title="Давность записей" subtitle="Сколько времени висит то, что записано.">
            {notes.length === 0 ? (
              <p className={styles.muted}>Пока нечего разбирать.</p>
            ) : (
              <Breakdown
                totalLabel="Заметки по давности"
                segments={[
                  {
                    label: "Сегодня",
                    value: buckets.today.length,
                    display: buckets.today.length,
                    note: "ещё в работе",
                    tone: "good",
                  },
                  {
                    label: "Эта неделя",
                    value: buckets.week.length,
                    display: buckets.week.length,
                    note: "нормальный срок",
                    tone: "accent",
                  },
                  {
                    label: "Старше недели",
                    value: buckets.older.length,
                    display: buckets.older.length,
                    note: "пора разобрать",
                    tone: "warn",
                  },
                ]}
              />
            )}
          </Card>

          <Card
            title="Каркас проекта"
            subtitle="Что уже работает и на что можно опереться."
            actions={<FileText size={16} strokeWidth={1.8} aria-hidden="true" />}
          >
            <ul className={styles.facts}>
              <li>
                <span>Хранилище файлов</span>
                <Badge tone="success">готово</Badge>
              </li>
              <li>
                <span>Очередь фоновых задач</span>
                <Badge tone="success">готово</Badge>
              </li>
              <li>
                <span>Роли и права</span>
                <Badge tone="success">готово</Badge>
              </li>
              <li>
                <span>Направление продукта</span>
                <Badge tone="warning">не выбрано</Badge>
              </li>
            </ul>
            <Insight
              icon={<Lightbulb size={18} strokeWidth={1.8} />}
              title="Домены под тему ещё не заводим"
              detail="Пока трек не объявлен, каркас держит вход, файлы и задачи. Предметные разделы появятся вместе с темой."
            />
          </Card>
        </div>
      </div>
    </>
  );
}
