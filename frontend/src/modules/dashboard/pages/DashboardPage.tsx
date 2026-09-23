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
import { useI18n, translate, type Locale } from "../../../shared/i18n/I18nContext";

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

function ageLabel(iso: string, now: number, locale: Locale): { text: string; stale: boolean } {
  const age = now - new Date(iso).getTime();
  if (age < DAY) return { text: translate(locale, "сегодня", "бүгін", "today"), stale: false };
  const days = Math.floor(age / DAY);
  if (days < 7) return { text: translate(locale, `${days} дн. назад`, `${days} күн бұрын`, `${days} days ago`), stale: false };
  return { text: translate(locale, `${days} дн. назад`, `${days} күн бұрын`, `${days} days ago`), stale: true };
}

export function DashboardPage() {
  const { locale, t } = useI18n();
  const { notes, loading, busy, error, create, remove, reload } = useNotes();
  const [title, setTitle] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const titleField = useRef<HTMLInputElement>(null);

  // Одна отметка времени на отрисовку: иначе соседние ячейки считают возраст по-разному.
  const now = useMemo(() => Date.now(), [notes]);
  const buckets = useMemo(() => split(notes, now), [notes, now]);

  const today = new Date(now).toLocaleDateString(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", {
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
        subtitle={t("Что записала команда и что из этого ждёт ответа дольше всего.", "Команда жазғандардың ішінде қайсысы көптен бері жауап күтуде.", "What the team noted and what has waited longest for a response.")}
        actions={
          <>
            <Button variant="secondary" size="sm" onClick={reload} disabled={loading || busy}>
              {t("Обновить", "Жаңарту", "Refresh")}
            </Button>
            <Button
              variant="dark"
              size="sm"
              icon={<Plus size={15} strokeWidth={1.8} />}
              onClick={() => titleField.current?.focus()}
            >
              {t("Заметка", "Жазба", "Note")}
            </Button>
          </>
        }
      />

      <Segmented
        className={styles.filter}
        ariaLabel={t("Фильтр заметок по давности", "Жазбаларды мерзімі бойынша сүзу", "Filter notes by age")}
        value={filter}
        onValueChange={(value) => setFilter(value as Filter)}
        items={[
          { value: "all", label: t("Все", "Барлығы", "All"), count: notes.length },
          { value: "today", label: t("Сегодня", "Бүгін", "Today"), count: buckets.today.length },
          { value: "week", label: t("Эта неделя", "Осы апта", "This week"), count: buckets.week.length },
          { value: "older", label: t("Старше недели", "Бір аптадан асқан", "Older than a week"), count: buckets.older.length },
        ]}
      />

      <StatRow
        items={[
          {
            label: t("Всего заметок", "Барлық жазба", "Total notes"),
            value: notes.length,
            icon: <StickyNote size={16} strokeWidth={1.8} />,
          },
          {
            label: t("Добавлено сегодня", "Бүгін қосылған", "Added today"),
            value: buckets.today.length,
            icon: <Plus size={16} strokeWidth={1.8} />,
            delta: buckets.today.length > 0 ? t("есть движение", "белсенділік бар", "active") : t("тихо", "тыныш", "quiet"),
            deltaTone: buckets.today.length > 0 ? "good" : "neutral",
          },
          {
            label: t("За эту неделю", "Осы аптада", "This week"),
            value: buckets.week.length + buckets.today.length,
            icon: <TrendingUp size={16} strokeWidth={1.8} />,
          },
          {
            label: t("Висит дольше недели", "Бір аптадан астам күтуде", "Pending over a week"),
            value: buckets.older.length,
            icon: <CalendarClock size={16} strokeWidth={1.8} />,
            delta: buckets.older.length > 0 ? t("разобрать", "қарастыру", "review") : t("чисто", "таза", "clear"),
            deltaTone: buckets.older.length > 0 ? "warn" : "good",
          },
        ]}
      />

      <div className={styles.cols}>
        <Card
          title={t("Заметки команды", "Команда жазбалары", "Team notes")}
          subtitle={t("Всё, что попало в общий список. Свежие сверху.", "Ортақ тізімдегі барлық жазба. Жаңалары жоғарыда.", "Everything in the shared list. Newest first.")}
          actions={<Badge tone="neutral">{shown.length}</Badge>}
        >
          <form className={styles.form} onSubmit={(event) => void submit(event)}>
            <Field
              label={t("Что нужно сделать команде?", "Команда не істеуі керек?", "What does the team need to do?")}
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder={t("Например, запросить CMR по отправке KZ-1176", "Мысалы, KZ-1176 жөнелтілімі бойынша CMR сұрау", "For example, request the CMR for shipment KZ-1176")}
              maxLength={200}
              disabled={busy || loading}
              ref={titleField}
            />
            <Button type="submit" disabled={busy || loading || !title.trim()} loading={busy}>
              {t("Добавить", "Қосу", "Add")}
            </Button>
          </form>

          {error ? (
            <ErrorState
              title={t("Не удалось загрузить заметки", "Жазбаларды жүктеу мүмкін болмады", "Could not load notes")}
              text={error}
              onRetry={reload}
              retrying={loading}
            />
          ) : loading ? (
            <p className={styles.loading} role="status">
              <Spinner size="sm" /> {t("Загружаем заметки…", "Жазбалар жүктелуде…", "Loading notes…")}
            </p>
          ) : shown.length === 0 ? (
            <EmptyState
              icon={<StickyNote size={20} strokeWidth={1.8} />}
              title={filter === "all" ? t("Список пуст", "Тізім бос", "List is empty") : t("В этом наборе пусто", "Бұл топта ештеңе жоқ", "No notes in this group")}
              text={
                filter === "all"
                  ? t("Первая же запись появится здесь и переживёт перезапуск — она лежит в базе.", "Алғашқы жазба осында пайда болып, дерекқорда сақталады.", "Your first note will appear here and stay saved after a restart.")
                  : t("Здесь ничего нет. Переключитесь на «Все», чтобы увидеть весь список.", "Мұнда ештеңе жоқ. Толық тізімді көру үшін «Барлығы» тармағын таңдаңыз.", "Nothing here. Switch to All to see the full list.")
              }
            />
          ) : (
            <Table maxHeight="380px">
              <thead>
                <Tr>
                  <Th>{t("Запись", "Жазба", "Note")}</Th>
                  <Th>{t("Возраст", "Мерзімі", "Age")}</Th>
                  <Th align="right">{t("Действие", "Әрекет", "Action")}</Th>
                </Tr>
              </thead>
              <tbody>
                {shown.map((note) => {
                  const age = ageLabel(note.created_at, now, locale);
                  return (
                    <Tr key={note.id}>
                      <Td>
                        <span className={styles.noteTitle}>{note.title}</span>
                        <time className={styles.noteTime} dateTime={note.created_at}>
                          {new Date(note.created_at).toLocaleString(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", {
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
                          aria-label={`${t("Удалить заметку", "Жазбаны жою", "Delete note")}: ${note.title}`}
                        >
                          {t("Удалить", "Жою", "Delete")}
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
              title={t(`${buckets.older.length} ${buckets.older.length === 1 ? "запись висит" : "записи висят"} дольше недели`, `${buckets.older.length} жазба бір аптадан астам күтуде`, `${buckets.older.length} notes pending over a week`)}
              detail={t(`Самая старая — «${stalest.title}». Либо у неё нет владельца, либо она уже неактуальна: и то и другое решается за минуту.`, `Ең ескісі — «${stalest.title}». Оның иесі жоқ немесе ол өзектілігін жоғалтқан болуы мүмкін.`, `Oldest: “${stalest.title}”. It may have no owner or may no longer be relevant.`)}
            />
          ) : null}
        </Card>

        <div className={styles.side}>
          <Card title={t("Давность записей", "Жазбалардың мерзімі", "Note age")} subtitle={t("Сколько времени висит то, что записано.", "Жазбалардың қанша уақыт күтіп тұрғаны.", "How long notes have been pending.")}>
            {notes.length === 0 ? (
              <p className={styles.muted}>{t("Пока нечего разбирать.", "Әзірге қарайтын ештеңе жоқ.", "Nothing to review yet.")}</p>
            ) : (
              <Breakdown
                totalLabel={t("Заметки по давности", "Жазбалар мерзімі бойынша", "Notes by age")}
                segments={[
                  {
                    label: t("Сегодня", "Бүгін", "Today"),
                    value: buckets.today.length,
                    display: buckets.today.length,
                    note: t("ещё в работе", "жұмыста", "in progress"),
                    tone: "good",
                  },
                  {
                    label: t("Эта неделя", "Осы апта", "This week"),
                    value: buckets.week.length,
                    display: buckets.week.length,
                    note: t("нормальный срок", "қалыпты мерзім", "on track"),
                    tone: "accent",
                  },
                  {
                    label: t("Старше недели", "Бір аптадан асқан", "Over a week"),
                    value: buckets.older.length,
                    display: buckets.older.length,
                    note: t("пора разобрать", "қарастыру керек", "review now"),
                    tone: "warn",
                  },
                ]}
              />
            )}
          </Card>

          <Card
            title={t("Каркас проекта", "Жоба негізі", "Project foundation")}
            subtitle={t("Что уже работает и на что можно опереться.", "Қазір жұмыс істейтін мүмкіндіктер.", "What already works and can be built on.")}
            actions={<FileText size={16} strokeWidth={1.8} aria-hidden="true" />}
          >
            <ul className={styles.facts}>
              <li>
                <span>{t("Хранилище файлов", "Файл қоймасы", "File storage")}</span>
                <Badge tone="success">{t("готово", "дайын", "ready")}</Badge>
              </li>
              <li>
                <span>{t("Очередь фоновых задач", "Фондық тапсырмалар кезегі", "Background task queue")}</span>
                <Badge tone="success">{t("готово", "дайын", "ready")}</Badge>
              </li>
              <li>
                <span>{t("Роли и права", "Рөлдер мен құқықтар", "Roles and permissions")}</span>
                <Badge tone="success">{t("готово", "дайын", "ready")}</Badge>
              </li>
              <li>
                <span>{t("Направление продукта", "Өнім бағыты", "Product direction")}</span>
                <Badge tone="warning">{t("не выбрано", "таңдалмаған", "not selected")}</Badge>
              </li>
            </ul>
            <Insight
              icon={<Lightbulb size={18} strokeWidth={1.8} />}
              title={t("Домены под тему ещё не заводим", "Тақырыпқа арналған бөлімдер әзірге жоқ", "Topic domains are not set up yet")}
              detail={t("Пока трек не объявлен, каркас держит вход, файлы и задачи. Предметные разделы появятся вместе с темой.", "Бағыт жарияланғанша, негіз кіруді, файлдарды және тапсырмаларды қамтамасыз етеді. Арнайы бөлімдер кейін қосылады.", "Until the track is announced, the foundation supports sign-in, files, and tasks. Topic-specific sections will follow.")}
            />
          </Card>
        </div>
      </div>
    </>
  );
}
