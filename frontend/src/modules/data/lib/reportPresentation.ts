const reportKinds: Record<string, { title: string; description: string }> = {
  products: {
    title: "Товары",
    description: "Названия, артикулы, единицы измерения и условия закупки.",
  },
  sales: {
    title: "Отгрузки клиентам",
    description: "Что и когда отгружали клиентам, включая возвраты.",
  },
  stocks: {
    title: "Остатки на складах",
    description: "Сколько товара есть на складе и сколько зарезервировано.",
  },
  inbound: {
    title: "Товары в пути",
    description: "Какие поставки ждём, в каком количестве и к какой дате.",
  },
  suppliers: {
    title: "Поставщики",
    description: "Компании, у которых закупаем товары.",
  },
  warehouses: {
    title: "Склады",
    description: "Склады Электрокомплекта, для которых считаем пополнение.",
  },
  categories: {
    title: "Категории товаров",
    description: "Группы товаров и правила пополнения для каждой группы.",
  },
  stockouts: {
    title: "Периоды отсутствия товара",
    description: "Подтверждённые даты, когда товара не было на складе.",
  },
  growth: {
    title: "Прогноз роста спроса",
    description: "Ожидаемое изменение спроса на товар или категорию.",
  },
};

const fieldLabels: Record<string, string> = {
  external_id: "Идентификатор записи в 1С",
  revision: "Версия записи в 1С",
  source_updated_at: "Обновлено в 1С",
  name: "Название",
  active: "Используется",
  review_days: "Пересчитывать каждые, дней",
  safety_days: "Запас на случай задержки, дней",
  organization_external_id: "Идентификатор организации в 1С",
  sku: "Артикул",
  code: "Код товара в 1С",
  category_external_id: "Идентификатор категории в 1С",
  supplier_external_id: "Идентификатор поставщика в 1С",
  characteristic_external_id: "Идентификатор характеристики в 1С",
  unit: "Единица измерения",
  pack_size: "Кратность заказа",
  min_order_qty: "Минимум для заказа",
  lead_time_days: "Доставка, дней",
  data_quality: "Готовность данных",
  product_external_id: "Идентификатор товара в 1С",
  warehouse_external_id: "Идентификатор склада в 1С",
  date: "Дата отгрузки",
  document_date: "Дата документа",
  document_id: "Идентификатор документа в 1С",
  line_id: "Идентификатор строки документа",
  quantity: "Количество",
  price: "Цена",
  client_id: "Обезличенный идентификатор клиента",
  status: "Статус",
  as_of: "Остаток на дату",
  reserved: "В резерве",
  expected_date: "Ожидаемая дата прихода",
  start: "Начало периода",
  end: "Конец периода",
  rate: "Изменение спроса (0,1 = 10%)",
  mode: "Как учитывать прогноз",
  kind: "Вид данных",
};

export function reportKindTitle(kind: string): string {
  return reportKinds[kind]?.title ?? kind;
}

export function reportKindDescription(kind: string): string {
  return reportKinds[kind]?.description ?? "Данные из вашей 1С.";
}

export function reportFieldLabel(field: string): string {
  return fieldLabels[field] ?? field;
}

export function reportRowCount(count: number): string {
  const lastTwo = Math.abs(count) % 100;
  const last = lastTwo % 10;
  const noun =
    lastTwo >= 11 && lastTwo <= 14
      ? "строк"
      : last === 1
        ? "строка"
        : last >= 2 && last <= 4
          ? "строки"
          : "строк";
  return `${count.toLocaleString("ru-RU")} ${noun}`;
}

const valueLabels: Record<string, string> = {
  posted: "Проведён",
  cancelled: "Отменён",
  confirmed: "Подтверждён",
  in_transit: "В пути",
  received: "Получен",
  additional: "Дополнительно к текущему росту",
  replace_trend: "Вместо текущего роста",
};
const dateFields = new Set([
  "date",
  "as_of",
  "document_date",
  "expected_date",
  "start",
  "end",
  "source_updated_at",
]);

export function reportCellValue(value: unknown, field: string): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Да" : "Нет";
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (field === "kind") return reportKindTitle(text);
  if (field === "status" || field === "mode") return valueLabels[text] ?? text;
  if (dateFields.has(field)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text))
      return text.split("-").reverse().join(".");
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString("ru-RU", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit",
        timeZoneName: "short",
      });
    }
  }
  return text;
}

export function friendlyReportError(error: string): {
  title: string;
  message: string;
  technical?: string;
} {
  let title = "Проверьте данные";
  let message = error.replace(/^Value error, /, "");
  if (/ONEC_ALLOWED_ORIGINS|разрешённых адресов 1С/.test(error)) {
    title = "Нужно разрешить подключение";
    message =
      "Попросите администратора разрешить сервису подключаться к этому адресу 1С.";
  } else if (/переменная авторизации|auth_env/.test(error)) {
    title = "Нужно настроить доступ";
    message =
      "Попросите администратора настроить доступ к 1С на сервере сервиса.";
  } else if (
    /HTTP 200|соединение и доступ|Failed to fetch|NetworkError/.test(error)
  ) {
    title = "Не удалось связаться с 1С";
    message = "Проверьте адрес отчёта и доступ к 1С, затем попробуйте ещё раз.";
  } else if (/Версия источника изменилась/.test(error)) {
    title = "Данные уже изменились";
    message =
      "После проверки были сохранены другие данные. Получите отчёт ещё раз и повторите проверку.";
  } else if (/Устаревшая версия объекта|Одна версия объекта/.test(error)) {
    title = "Нужны актуальные данные из 1С";
    message =
      "Этот отчёт содержит устаревшие или противоречивые записи. Попросите специалиста 1С проверить выгрузку.";
  } else if (/не найдено \w+_external_id=/.test(error)) {
    title = "Не найдена связанная запись";
    const field = error.match(/не найдено (\w+_external_id)=/)?.[1];
    const references: Record<string, string> = {
      product_external_id: "товар",
      warehouse_external_id: "склад",
      supplier_external_id: "поставщик",
      category_external_id: "категория",
    };
    const reference = references[field ?? ""] ?? "связанная запись";
    message = `Не найдена связь с 1С: ${reference}. Сначала загрузите соответствующий справочник и проверьте соответствие полей.`;
  } else if (
    /повторяются идентификаторы|Дублирование учётного факта/.test(error)
  ) {
    title = "Найдены повторяющиеся записи";
    message =
      "Некоторые строки повторяют уже переданные данные или друг друга. Попросите специалиста 1С проверить выгрузку.";
  } else if (/следующую страницу/.test(error)) {
    title = "Получена только часть отчёта";
    message =
      "Попросите специалиста 1С подготовить полный отчёт или отдельные части до 10 000 строк каждая.";
  } else if (
    /JSON-массив|JSON-объект|корректным JSON|несжатый JSON/.test(error)
  ) {
    title = "Не удалось прочитать отчёт";
    message =
      "Формат ответа 1С не подходит. Проверьте настройки получения данных со специалистом 1С.";
  } else if (
    /Field required|отсутствует сопоставленное исходное поле/.test(error)
  ) {
    message =
      "Значение не получено. Проверьте, какое поле 1С выбрано для этой колонки.";
  } else if (
    /Input should be a valid (decimal|number|integer)|Количество не является числом/.test(
      error,
    )
  ) {
    message = /integer/.test(error)
      ? "Здесь нужно целое число."
      : "Здесь нужно число. Проверьте значение в 1С.";
  } else if (
    /Input should be a valid date|Input should have timezone info/.test(error)
  ) {
    message =
      "Не удалось распознать дату. Проверьте её формат и часовой пояс в настройках выгрузки.";
  } else if (/Input should be greater than or equal to (.+)/.test(error)) {
    message = `Значение должно быть не меньше ${error.match(/equal to (.+)/)?.[1]}.`;
  } else if (/Input should be greater than (.+)/.test(error)) {
    message = `Значение должно быть больше ${error.match(/than (.+)/)?.[1]}.`;
  } else if (/Input should be less than or equal to (.+)/.test(error)) {
    message = `Значение должно быть не больше ${error.match(/equal to (.+)/)?.[1]}.`;
  } else if (/String should have at least/.test(error)) {
    message = "Значение слишком короткое или пустое. Проверьте его в 1С.";
  } else if (/String should have at most/.test(error)) {
    message =
      "Значение слишком длинное. Проверьте, что выбрана нужная колонка.";
  } else if (/Extra inputs are not permitted/.test(error)) {
    message =
      "В отчёте есть лишняя колонка. Настройте соответствие нужных полей.";
  } else if (
    /^Input should|^String should|^Unable to|^Decimal input/.test(error)
  ) {
    message =
      "Значение не подходит для этой колонки. Проверьте его в 1С и выбранное соответствие.";
  } else if (/Конец stockout раньше начала/.test(error)) {
    message =
      "Дата окончания отсутствия товара раньше даты начала. Проверьте обе даты.";
  } else if (!/[а-яё]/i.test(error)) {
    message =
      "Не удалось обработать данные. Повторите попытку или передайте технические сведения специалисту.";
  }
  return { title, message, ...(message !== error ? { technical: error } : {}) };
}
