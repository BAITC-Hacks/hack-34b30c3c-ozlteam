import { useState } from "react";
import { Bell, Building2, Home, Minus, MoreHorizontal, Plus, Settings, SlidersHorizontal } from "lucide-react";

import {
  AiBlock,
  ActionPreview,
  Alert,
  Avatar,
  Badge,
  Breadcrumbs,
  Button,
  Card,
  Checkbox,
  Chip,
  EmptyState,
  ErrorState,
  Field,
  FormModal,
  IconButton,
  Modal,
  ConfirmModal,
  Progress,
  ProgressSteps,
  RangeSlider,
  RadioGroup,
  Search,
  Segmented,
  Select,
  Slider,
  Spinner,
  Table,
  Tabs,
  Td,
  Th,
  Tile,
  Tr,
  Switch,
  Textarea,
  ThinkingSteps,
  ResultNotice,
  useModalStack,
} from "../../../shared/ui";
import styles from "./UiKitPage.module.css";

export function UiKitPage() {
  const [criticalOnly, setCriticalOnly] = useState(true);
  const [riskNotifications, setRiskNotifications] = useState(true);
  const [priority, setPriority] = useState("normal");
  const [period, setPeriod] = useState("week");
  const [activeTab, setActiveTab] = useState("all");
  const [search, setSearch] = useState("");
  const [documentSearch, setDocumentSearch] = useState("Договор");
  const [activeFilter, setActiveFilter] = useState("all");
  const [comment, setComment] = useState("Проверить объём до согласования");
  const [progress, setProgress] = useState(64);
  const [processing, setProcessing] = useState(true);
  const [activeStep, setActiveStep] = useState(1);
  const [avatarLoading, setAvatarLoading] = useState(false);
  const [readiness, setReadiness] = useState(47);
  const [confidence, setConfidence] = useState(80);
  const [budgetRange, setBudgetRange] = useState<[number, number]>([8, 32]);
  const [dangerAlertVisible, setDangerAlertVisible] = useState(true);
  const [actionConfirmed, setActionConfirmed] = useState(false);
  const [thinkingStep, setThinkingStep] = useState(1);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [actionOpen, setActionOpen] = useState(false);
  const [formOpen, setFormOpen] = useState(false);
  const [primaryOpen, setPrimaryOpen] = useState(false);
  const [nestedOpen, setNestedOpen] = useState(false);
  const [draft, setDraft] = useState("");
  const modalStack = useModalStack();
  const nestedPayload = modalStack.payloadFor<{ source: string }>("kit-nested");

  function closePrimary() {
    setPrimaryOpen(false);
    setDraft("");
  }

  return (
    <section className={styles.page}>
      <header className={styles.header}>
        <div>
          <h1>Компоненты</h1>
          <p>Живые примитивы приложения со всеми основными состояниями.</p>
        </div>
        <code className="is-selectable">shared/ui</code>
      </header>

      <section className={styles.section}>
        <h2>Кнопки</h2>
        <div className={styles.demoSurface}>
          <div className={styles.row}>
            <Button>Согласовать</Button>
            <Button variant="secondary">Отчёт за смену</Button>
            <Button variant="ghost">Почему</Button>
            <Button variant="danger">Удалить</Button>
            <Button disabled>Недоступно</Button>
            <Button loading>Согласовать</Button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Контролы выбора</h2>
        <div className={styles.demoSurface}>
          <div className={styles.controlGrid}>
            <div className={styles.controlGroup}>
              <h3>Чекбоксы</h3>
              <Checkbox
                label="Только критичные"
                description="Скрыть задачи без риска"
                checked={criticalOnly}
                onChange={(event) => setCriticalOnly(event.target.checked)}
              />
              <Checkbox label="Приложить исходные документы" />
              <Checkbox label="Недоступный пункт" disabled />
            </div>
            <div className={styles.controlGroup}>
              <h3>Переключатели</h3>
              <Switch
                label="Уведомления о рисках"
                description="Сразу сообщать об отклонениях"
                checked={riskNotifications}
                onChange={(event) => setRiskNotifications(event.target.checked)}
              />
              <Switch label="Автосогласование" description="Недоступно для вашей роли" disabled />
            </div>
            <div className={styles.controlGroup}>
              <RadioGroup
                label="Приоритет задачи"
                value={priority}
                onValueChange={setPriority}
                items={[
                  { value: "low", label: "Низкий" },
                  { value: "normal", label: "Обычный" },
                  { value: "high", label: "Высокий" },
                ]}
              />
            </div>
            <div className={styles.controlGroup}>
              <h3>Сегментированный</h3>
              <Segmented
                ariaLabel="Период отчёта"
                value={period}
                onValueChange={setPeriod}
                items={[
                  { value: "today", label: "Сегодня" },
                  { value: "week", label: "Неделя" },
                  { value: "month", label: "Месяц" },
                  { value: "all", label: "Весь срок" },
                ]}
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Статусы</h2>
        <div className={styles.demoSurface}>
          <div className={styles.row}>
            <Badge tone="neutral">Черновик</Badge>
            <Badge tone="info">На проверке</Badge>
            <Badge tone="success">Готово</Badge>
            <Badge tone="warning">Есть риск</Badge>
            <Badge tone="danger">Требует решения</Badge>
            <Spinner label="Модель считает" />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Уведомления</h2>
        <div className={styles.demoSurface}>
          <div className={styles.alertGrid}>
            <Alert tone="info" title="Ставка обновлена">
              Новая версия доступна всем участникам проекта.
            </Alert>
            <Alert tone="success" title="Изменения сохранены">
              График и связанные задачи пересчитаны.
            </Alert>
            <Alert
              tone="warning"
              title="Срок поставки изменился"
              action={<Button size="sm" variant="ghost">Посмотреть поставку</Button>}
            >
              Прибытие отправки сдвинулось на два дня.
            </Alert>
            {dangerAlertVisible ? (
              <Alert tone="danger" title="Не удалось синхронизировать" onDismiss={() => setDangerAlertVisible(false)}>
                Проверьте соединение. Локальные изменения не потеряны.
              </Alert>
            ) : (
              <div className={styles.dismissedAlert}>
                <span>Уведомление закрыто</span>
                <Button size="sm" variant="secondary" onClick={() => setDangerAlertVisible(true)}>Вернуть</Button>
              </div>
            )}
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Аватары</h2>
          <p>Картинка плавно сменяет скелетон; при пустом или битом URL остаются инициалы.</p>
        </div>
        <div className={styles.demoSurface}>
          <div className={styles.avatarGrid}>
            <div className={styles.avatarExample}>
              <Avatar name="План закупок" src="/icon-192.png" size="xl" status="online" loading={avatarLoading} />
              <div><strong>Изображение</strong><span>С индикатором статуса</span></div>
            </div>
            <div className={styles.avatarExample}>
              <Avatar name="Анна Смирнова" size="lg" tone="violet" />
              <div><strong>АС</strong><span>Фоллбек из имени</span></div>
            </div>
            <div className={styles.avatarExample}>
              <Avatar name="Иван Петров" src="/missing-avatar-example.jpg" size="lg" tone="teal" status="busy" />
              <div><strong>Битый URL</strong><span>Автоматический фоллбек</span></div>
            </div>
            <div className={styles.avatarExample}>
              <Avatar name="Загрузка профиля" size="lg" loading />
              <div><strong>Скелетон</strong><span>Для данных без готового src</span></div>
            </div>
          </div>
          <div className={styles.avatarSizes}>
            <span>Размеры</span>
            <Avatar name="Алексей" size="xs" />
            <Avatar name="Алексей" size="sm" tone="violet" />
            <Avatar name="Алексей" size="md" tone="teal" />
            <Avatar name="Алексей" size="lg" tone="neutral" />
            <Switch
              label="Показать загрузку картинки"
              checked={avatarLoading}
              onChange={(event) => setAvatarLoading(event.target.checked)}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Горизонтальные вкладки</h2>
          <p>Нативная полоса скрыта; при переполнении появляются стрелки с учётом границ.</p>
        </div>
        <div className={styles.demoSurface}>
          <Tabs
            ariaLabel="Разделы отправки"
            value={activeTab}
            onValueChange={setActiveTab}
            items={[
              { id: "all", label: "Все работы", count: 128 },
              { id: "today", label: "На сегодня", count: 16 },
              { id: "overdue", label: "Просрочено", count: 7 },
              { id: "deviations", label: "Отклонения", count: 12 },
              { id: "documents", label: "Документы" },
              { id: "materials", label: "Материалы", count: 34 },
              { id: "procurement", label: "Закупки", count: 9 },
              { id: "schedule", label: "График" },
              { id: "carriers", label: "Перевозчики", count: 18 },
              { id: "documents", label: "Документы", count: 245 },
              { id: "reports", label: "Фотоотчёты", count: 72 },
              { id: "inspections", label: "Обходы", count: 21 },
              { id: "tasks", label: "Задачи", count: 41 },
              { id: "approvals", label: "Согласования", count: 15 },
              { id: "deliveries", label: "Поставки", count: 28 },
              { id: "archive", label: "Архив", count: 1_247 },
            ]}
          />
          <p className={styles.tabResult}>Выбрано: <strong>{activeTab}</strong></p>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Хлебные крошки</h2>
          <p>Текущий раздел отмечен семантически; длинный путь схлопывает середину.</p>
        </div>
        <div className={styles.demoSurface}>
          <div className={styles.breadcrumbExample}>
            <h3>Обычный путь</h3>
            <Breadcrumbs
              items={[
                { label: "Сводка", href: "/", icon: <Home size={16} strokeWidth={1.8} /> },
                { label: "Перевозчики", href: "/carriers" },
                { label: "КазТрансЛогистик" },
              ]}
            />
          </div>
          <div className={styles.breadcrumbExample}>
            <h3>Длинный путь</h3>
            <Breadcrumbs
              maxItems={4}
              items={[
                { label: "Все склады", href: "/", icon: <Building2 size={16} strokeWidth={1.8} /> },
                { label: "ЖК Северный", href: "/contractors" },
                { label: "Документы", href: "/ui-kit" },
                { label: "Исполнительная документация", href: "/ui-kit" },
                { label: "Склад Алматы", href: "/ui-kit" },
                { label: "Акт освидетельствования скрытых работ № 184" },
              ]}
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Плитки</h2>
        <div className={styles.grid}>
          <Tile label="Освоение бюджета" value="47%" hint="план 44%" progress={47} />
          <Tile label="Отклонение по ставке" value="+2,1%" hint="+3,9 млн к плану" tone="up" progress={62} />
          <Tile label="Прогноз срока" value="+6 дней" hint="критический путь" tone="warn" progress={38} />
          <Tile label="Проверено моделью" value="184" hint="без замечаний" tone="good" progress={84} />
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Прогресс</h2>
          <p>Определённые и фоновые процессы, с плавным продолжением от текущего значения.</p>
        </div>
        <div className={styles.demoSurface}>
          <div className={styles.progressGrid}>
            <div className={styles.progressExample}>
              <h3>Линейный</h3>
              <Progress
                label="Готовность комплекта"
                value={progress}
                tone={progress === 100 ? "success" : "accent"}
                description="Измените значение кнопками"
              />
              <div className={styles.row}>
                <IconButton
                  label="Уменьшить на 10 процентов"
                  icon={<Minus size={17} strokeWidth={1.8} />}
                  onClick={() => setProgress((value) => Math.max(0, value - 10))}
                />
                <IconButton
                  label="Увеличить на 10 процентов"
                  icon={<Plus size={17} strokeWidth={1.8} />}
                  onClick={() => setProgress((value) => Math.min(100, value + 10))}
                />
                <Button size="sm" variant="ghost" onClick={() => setProgress(64)}>Сбросить</Button>
              </div>
            </div>

            <div className={styles.progressExample}>
              <h3>Круговой</h3>
              <Progress
                label="Проверено моделью"
                value={progress}
                variant="circular"
                tone={progress === 100 ? "success" : "accent"}
                description="184 документа из 287"
              />
            </div>

            <div className={styles.progressExample}>
              <h3>Без известного процента</h3>
              <Progress
                label={processing ? "Разбираем документы" : "Обработка завершена"}
                value={processing ? 0 : 100}
                indeterminate={processing}
                tone={processing ? "accent" : "success"}
                description={processing ? "Сверяем накладную с заказом" : "12 документов обработано"}
              />
              <Switch
                label="Обработка запущена"
                checked={processing}
                onChange={(event) => setProcessing(event.target.checked)}
              />
            </div>
          </div>

          <div className={styles.progressSteps}>
            <h3>Шаги процесса</h3>
            <ProgressSteps
              label="Создание закупки"
              current={activeStep}
              onStepChange={setActiveStep}
              steps={["Потребность", "Предложения", "Согласование", "Заказ"]}
            />
            <p className={styles.tabResult}>Нажмите на любой шаг · выбран: <strong>{activeStep + 1}</strong></p>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Поля</h2>
        <div className={styles.demoSurface}>
          <div className={styles.fields}>
            <div className={styles.fieldColumn}>
              <Field label="Название" placeholder="Введите название" />
              <Field label="Со счётчиком" defaultValue="Принять поставку" maxLength={200} counter={{ value: 16, max: 200 }} />
              <Select label="Ответственный" defaultValue="foreman" hint="Получит уведомление о задаче">
                <option value="dispatcher">Диспетчер</option>
                <option value="supplier">Снабженец</option>
                <option value="engineer">Инженер ПТО</option>
              </Select>
              <Textarea
                label="Комментарий"
                value={comment}
                maxLength={200}
                counter={{ value: comment.length, max: 200 }}
                hint="Будет виден всем участникам задачи"
                onChange={(event) => setComment(event.target.value)}
              />
            </div>
            <div className={styles.fieldColumn}>
              <Field label="С ошибкой" defaultValue="Паллеты" error="Проверьте значение" />
              <Field label="Недоступно" defaultValue="Сохраняем…" disabled />
              <Select label="С ошибкой" defaultValue="" error="Выберите склад">
                <option value="" disabled>Выберите склад</option>
                <option value="north">ЖК «Северный»</option>
                <option value="river">БЦ «Речной»</option>
              </Select>
              <Textarea label="Недоступно" defaultValue="Комментарий уже отправлен" disabled />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Слайдеры</h2>
          <p>Нативные range-контролы: мышь, касание и стрелки клавиатуры работают одинаково.</p>
        </div>
        <div className={styles.demoSurface}>
          <div className={styles.sliderGrid}>
            <Slider
              label="Готовность отправки"
              value={readiness}
              onValueChange={setReadiness}
              formatValue={(value) => `${value}%`}
              hint="Шаг 1%"
            />
            <Slider
              label="Порог уверенности модели"
              value={confidence}
              onValueChange={setConfidence}
              min={50}
              max={100}
              step={5}
              tone="success"
              formatValue={(value) => `${value}%`}
              hint="Рекомендации ниже порога скрываются"
            />
            <RangeSlider
              label="Бюджет закупки"
              value={budgetRange}
              onValueChange={setBudgetRange}
              min={0}
              max={50}
              step={1}
              minGap={2}
              formatValue={([from, to]) => `${from}–${to} млн ₽`}
              hint="Перетащите любую границу"
            />
            <Slider
              label="Недоступное значение"
              value={35}
              onValueChange={() => undefined}
              tone="warning"
              formatValue={(value) => `${value}%`}
              hint="Нет прав на изменение"
              disabled
            />
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Поиск, чипы и иконки</h2>
        <div className={styles.demoSurface}>
          <div className={styles.searchGrid}>
            <Search
              label="Поиск по отправкам"
              value={search}
              onValueChange={setSearch}
              placeholder="Поиск по отправкам"
              shortcut="⌘K"
            />
            <Search
              label="Поиск документов"
              value={documentSearch}
              onValueChange={setDocumentSearch}
              placeholder="Поиск документов"
              loading
            />
          </div>
          <div className={styles.controlExamples}>
            <div className={styles.controlGroup}>
              <h3>Чипы-фильтры</h3>
              <div className={styles.row}>
                {[
                  { id: "all", label: "Все", count: 19 },
                  { id: "decision", label: "Требуют решения", count: 2 },
                  { id: "review", label: "На проверке", count: 2 },
                  { id: "closed", label: "Закрытые", count: 15 },
                ].map((filter) => (
                  <Chip
                    key={filter.id}
                    pressed={activeFilter === filter.id}
                    count={filter.count}
                    onClick={() => setActiveFilter(filter.id)}
                  >
                    {filter.label}
                  </Chip>
                ))}
                <Chip disabled>Недоступно</Chip>
              </div>
            </div>
            <div className={styles.controlGroup}>
              <h3>Кнопки-иконки</h3>
              <div className={styles.row}>
                <IconButton label="Настройки" icon={<Settings size={17} strokeWidth={1.8} />} />
                <IconButton label="Фильтры" icon={<SlidersHorizontal size={17} strokeWidth={1.8} />} />
                <IconButton label="Уведомления" icon={<Bell size={17} strokeWidth={1.8} />} indicator />
                <IconButton label="Другие действия" icon={<MoreHorizontal size={17} strokeWidth={1.8} />} loading />
                <IconButton label="Недоступно" icon={<Settings size={17} strokeWidth={1.8} />} disabled />
              </div>
            </div>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Карточки</h2>
        <div className={styles.gridTwo}>
          <Card title="Перевозчик" subtitle="КазТрансЛогистик" lift>
            <p>11 из 11 поставок выполнены в срок.</p>
          </Card>
          <Card title="Документ" subtitle="Договор П-114">
            <p className="is-selectable">Текст документа можно выделить и скопировать.</p>
          </Card>
        </div>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Блоки ИИ</h2>
          <p>Рекомендация → объяснение → предпросмотр → подтверждение → результат. Ни один шаг не пропускается.</p>
        </div>
        <AiBlock
          title="Отправка KZ-1176 опоздает на три дня"
          text="Можно отправить часть груза раньше и вернуть четыре дня из шести."
          confidence={88}
          actions={<Button size="sm">Посмотреть решение</Button>}
          why={<p className="is-selectable">График работ, договор П-114 и история поставщика.</p>}
        />
        <div className={styles.aiFlowGrid}>
          <div className={styles.aiFlowColumn}>
            <h3>Подтверждение и результат</h3>
            {actionConfirmed ? (
              <ResultNotice
                action={<Button size="sm" variant="ghost" onClick={() => setActionConfirmed(false)}>Отменить</Button>}
              >
                Закупка ЗК-115 создана. Окно забронировано до 14:20.
              </ResultNotice>
            ) : (
              <ActionPreview
                items={[
                  "Создам закупку ЗК-115 на 1 872 000 ₽ и отправлю на согласование.",
                  "Забронирую окно поставки 06.10 на 48 часов.",
                ]}
                note="Ничего не оплачивается — только заявка."
                actions={
                  <>
                    <Button size="sm" onClick={() => setActionConfirmed(true)}>Подтвердить</Button>
                    <Button size="sm" variant="secondary">Отмена</Button>
                  </>
                }
              />
            )}
          </div>
          <div className={styles.aiFlowColumn}>
            <h3>Видимые шаги работы</h3>
            <ThinkingSteps
              title={thinkingStep >= 3 ? "Проверка завершена" : "Подбираем поставщика"}
              steps={[
                "Читаю потребность: 420 м³, законтрактовано 120",
                "Смотрю договор П-114 и окно 09.10",
                "Сравниваю поставщиков по истории и срокам",
              ].map((label, index) => ({
                label,
                status: index < thinkingStep ? "complete" : index === thinkingStep ? "active" : "pending",
              }))}
            />
            <Button
              size="sm"
              variant="secondary"
              onClick={() => setThinkingStep((step) => step >= 3 ? 0 : step + 1)}
            >
              {thinkingStep >= 3 ? "Запустить заново" : "Следующий шаг"}
            </Button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Таблица</h2>
        <Card padded={false}>
          <Table stickyHeader={false}>
            <thead>
              <Tr><Th>Позиция</Th><Th numeric>Объём</Th><Th numeric>Разница</Th></Tr>
            </thead>
            <tbody>
              <Tr interactive tabIndex={0}><Td>Сборный груз, Алматы — Астана</Td><Td numeric>12,4 т</Td><Td numeric>+12%</Td></Tr>
              <Tr interactive tabIndex={0}><Td>Опалубка стеновая</Td><Td numeric>92 сут</Td><Td numeric>В рынке</Td></Tr>
            </tbody>
          </Table>
        </Card>
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHeader}>
          <h2>Модальные окна</h2>
          <p>Стандартные сценарии и отдельный пример вложенного стека.</p>
        </div>
        <div className={styles.demoSurface}>
          <div className={styles.row}>
            <Button variant="danger" onClick={() => setConfirmOpen(true)}>Вопрос да / нет</Button>
            <Button onClick={() => setActionOpen(true)}>Действие</Button>
            <Button variant="secondary" onClick={() => setFormOpen(true)}>Форма</Button>
            <Button variant="ghost" onClick={() => setPrimaryOpen(true)}>Стек модалок</Button>
          </div>
        </div>
      </section>

      <section className={styles.section}>
        <h2>Состояния</h2>
        <div className={styles.gridTwo}>
          <Card><EmptyState title="Приёмок пока нет" text="Отсканируйте накладную при разгрузке." action={<Button size="sm">Начать приёмку</Button>} /></Card>
          <Card><ErrorState title="Не удалось загрузить отправку" text="Сервер не ответил. Данные не потеряны." onRetry={() => undefined} /></Card>
        </div>
      </section>

      <ConfirmModal
        id="kit-confirm"
        title="Удалить черновик?"
        open={confirmOpen}
        onOpenChange={setConfirmOpen}
        confirmLabel="Да, удалить"
        cancelLabel="Нет"
        confirmVariant="danger"
        size="sm"
        onConfirm={() => undefined}
      >
        <p className={styles.modalText}>
          Этот текст передаётся снаружи: здесь может быть любой вопрос или описание последствия.
        </p>
      </ConfirmModal>

      <Modal
        id="kit-action"
        title="Передать задачу"
        open={actionOpen}
        onOpenChange={setActionOpen}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={() => setActionOpen(false)}>Позже</Button>
            <Button variant="ghost" onClick={() => setActionOpen(false)}>Открыть накладную</Button>
            <Button onClick={() => setActionOpen(false)}>Назначить диспетчеру</Button>
          </>
        }
      >
        <div className={styles.modalContent}>
          <p>Модалка действия принимает любой контент и произвольный набор кнопок.</p>
          <div className={styles.actionPreview}>
            <strong>Проверить приёмку на складе</strong>
            <span>Сегодня до 18:00 · склад Алматы</span>
          </div>
        </div>
      </Modal>

      <FormModal
        id="kit-form"
        title="Новая задача"
        open={formOpen}
        onOpenChange={setFormOpen}
        submitLabel="Создать задачу"
        onSubmit={() => undefined}
      >
        <div className={styles.modalForm}>
          <Field label="Название" name="title" placeholder="Например, принять поставку" required autoFocus />
          <div className={styles.formGrid}>
            <Field label="Срок" name="dueDate" type="date" required />
            <Select label="Ответственный" name="assignee" defaultValue="foreman">
                <option value="dispatcher">Диспетчер</option>
                <option value="supplier">Снабженец</option>
                <option value="engineer">Инженер ПТО</option>
            </Select>
          </div>
          <Textarea label="Комментарий" name="comment" rows={3} placeholder="Что важно учесть" />
        </div>
      </FormModal>

      <Modal
        id="kit-primary"
        title="Новая задача"
        open={primaryOpen}
        onOpenChange={setPrimaryOpen}
        onClose={closePrimary}
        footer={
          <>
            <Button variant="secondary" onClick={closePrimary}>Отмена</Button>
            <Button onClick={() => modalStack.open("kit-nested", { source: "Новая задача" })}>
              Продолжить
            </Button>
          </>
        }
      >
        <div className={styles.modalContent}>
          <p>Введите текст, откройте следующее окно и вернитесь — черновик останется.</p>
          <Field
            label="Описание"
            value={draft}
            onChange={(event) => setDraft(event.target.value)}
            placeholder="Например, проверить поставку"
          />
        </div>
      </Modal>

      <Modal
        id="kit-nested"
        title="Подтверждение"
        open={nestedOpen}
        onOpenChange={setNestedOpen}
        closeOnBackdrop={false}
        size="sm"
        footer={
          <>
            <Button variant="secondary" onClick={modalStack.closeAll}>Закрыть весь стек</Button>
            <Button onClick={modalStack.back}>Вернуться назад</Button>
          </>
        }
      >
        <div className={styles.modalContent}>
          <p>Предыдущее окно припарковано, но остаётся смонтированным.</p>
          <p className="is-selectable">Источник: {nestedPayload?.source}</p>
        </div>
      </Modal>
    </section>
  );
}
