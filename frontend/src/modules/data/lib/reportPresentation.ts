import { translate, type Locale } from "../../../shared/i18n/I18nContext";

type Copy = [ru: string, kk: string, en: string];
const copy = (locale: Locale, value: Copy): string => translate(locale, ...value);

const reportKinds: Record<string, { title: Copy; description: Copy }> = {
  products: {
    title: ["Товары", "Тауарлар", "Products"],
    description: ["Названия, артикулы, единицы измерения и условия закупки.", "Атаулар, артикулдар, өлшем бірліктері және сатып алу шарттары.", "Names, SKUs, units, and purchasing terms."],
  },
  sales: {
    title: ["Отгрузки клиентам", "Клиенттерге жөнелтілімдер", "Client shipments"],
    description: ["Что и когда отгружали клиентам, включая возвраты.", "Клиенттерге не және қашан жөнелтілді, қайтаруларды қоса.", "What was shipped to clients and when, including returns."],
  },
  stocks: {
    title: ["Остатки на складах", "Қойма қорлары", "Warehouse stock"],
    description: ["Сколько товара есть на складе и сколько зарезервировано.", "Қоймадағы тауар саны және резервтелген саны.", "Stock on hand and reserved quantities."],
  },
  inbound: {
    title: ["Товары в пути", "Жолдағы тауарлар", "Inbound goods"],
    description: ["Какие поставки ждём, в каком количестве и к какой дате.", "Күтілетін жеткізілімдер, олардың саны және келу күні.", "Expected deliveries, quantities, and arrival dates."],
  },
  suppliers: {
    title: ["Поставщики", "Жеткізушілер", "Suppliers"],
    description: ["Компании, у которых закупаем товары.", "Тауар сатып алынатын компаниялар.", "Companies we buy products from."],
  },
  warehouses: {
    title: ["Склады", "Қоймалар", "Warehouses"],
    description: ["Склады Электрокомплекта, для которых считаем пополнение.", "Қор толықтыруы есептелетін Электрокомплект қоймалары.", "Elektrokomplekt warehouses used for replenishment calculations."],
  },
  categories: {
    title: ["Категории товаров", "Тауар санаттары", "Product categories"],
    description: ["Группы товаров и правила пополнения для каждой группы.", "Тауар топтары және әр топтың қор толықтыру ережелері.", "Product groups and replenishment rules for each group."],
  },
  stockouts: {
    title: ["Периоды отсутствия товара", "Тауар болмаған кезеңдер", "Stockout periods"],
    description: ["Подтверждённые даты, когда товара не было на складе.", "Қоймада тауар болмаған расталған күндер.", "Confirmed dates when a product was out of stock."],
  },
  growth: {
    title: ["Прогноз роста спроса", "Сұраныс өсімінің болжамы", "Demand growth forecast"],
    description: ["Ожидаемое изменение спроса на товар или категорию.", "Тауарға немесе санатқа сұраныстың күтілетін өзгерісі.", "Expected demand change for a product or category."],
  },
};

const fieldLabels: Record<string, Copy> = {
  external_id: ["Идентификатор записи в 1С", "1С жазбасының идентификаторы", "1C record ID"],
  revision: ["Версия записи в 1С", "1С жазбасының нұсқасы", "1C record version"],
  source_updated_at: ["Обновлено в 1С", "1С жүйесінде жаңартылды", "Updated in 1C"],
  name: ["Название", "Атауы", "Name"],
  active: ["Используется", "Қолданылады", "Active"],
  review_days: ["Пересчитывать каждые, дней", "Қайта есептеу аралығы, күн", "Review interval, days"],
  safety_days: ["Запас на случай задержки, дней", "Кідіріске арналған қор, күн", "Safety stock, days"],
  organization_external_id: ["Идентификатор организации в 1С", "1С ұйымының идентификаторы", "1C organization ID"],
  sku: ["Артикул", "Артикул", "SKU"],
  code: ["Код товара в 1С", "1С жүйесіндегі тауар коды", "1C product code"],
  category_external_id: ["Идентификатор категории в 1С", "1С санатының идентификаторы", "1C category ID"],
  supplier_external_id: ["Идентификатор поставщика в 1С", "1С жеткізушісінің идентификаторы", "1C supplier ID"],
  characteristic_external_id: ["Идентификатор характеристики в 1С", "1С сипаттамасының идентификаторы", "1C characteristic ID"],
  unit: ["Единица измерения", "Өлшем бірлігі", "Unit"],
  pack_size: ["Кратность заказа", "Қаптама еселігі", "Pack size"],
  min_order_qty: ["Минимум для заказа", "Ең аз тапсырыс саны", "Minimum order quantity"],
  lead_time_days: ["Доставка, дней", "Жеткізу мерзімі, күн", "Lead time, days"],
  data_quality: ["Готовность данных", "Деректер дайындығы", "Data readiness"],
  product_external_id: ["Идентификатор товара в 1С", "1С тауарының идентификаторы", "1C product ID"],
  warehouse_external_id: ["Идентификатор склада в 1С", "1С қоймасының идентификаторы", "1C warehouse ID"],
  date: ["Дата отгрузки", "Жөнелтілім күні", "Shipment date"],
  document_date: ["Дата документа", "Құжат күні", "Document date"],
  document_id: ["Идентификатор документа в 1С", "1С құжатының идентификаторы", "1C document ID"],
  line_id: ["Идентификатор строки документа", "Құжат жолының идентификаторы", "Document line ID"],
  quantity: ["Количество", "Саны", "Quantity"],
  price: ["Цена", "Бағасы", "Price"],
  client_id: ["Обезличенный идентификатор клиента", "Клиенттің жасырын идентификаторы", "Anonymized client ID"],
  status: ["Статус", "Мәртебе", "Status"],
  as_of: ["Остаток на дату", "Күнгі қалдық", "Stock as of date"],
  reserved: ["В резерве", "Резервте", "Reserved"],
  expected_date: ["Ожидаемая дата прихода", "Күтілетін келу күні", "Expected arrival date"],
  start: ["Начало периода", "Кезең басы", "Period start"],
  end: ["Конец периода", "Кезең соңы", "Period end"],
  rate: ["Изменение спроса (0,1 = 10%)", "Сұраныс өзгерісі (0,1 = 10%)", "Demand change (0.1 = 10%)"],
  mode: ["Как учитывать прогноз", "Болжамды есепке алу тәсілі", "Forecast mode"],
  kind: ["Вид данных", "Дерек түрі", "Data type"],
};

export function reportKindTitle(kind: string, locale: Locale = "ru"): string {
  return reportKinds[kind] ? copy(locale, reportKinds[kind].title) : kind;
}

export function reportKindDescription(kind: string, locale: Locale = "ru"): string {
  return reportKinds[kind] ? copy(locale, reportKinds[kind].description) : translate(locale, "Данные из вашей 1С.", "Сіздің 1С деректеріңіз.", "Data from your 1C.");
}

export function reportFieldLabel(field: string, locale: Locale = "ru"): string {
  return fieldLabels[field] ? copy(locale, fieldLabels[field]) : field;
}

export function reportRowCount(count: number, locale: Locale = "ru"): string {
  if (locale === "kk") return `${count.toLocaleString("kk-KZ")} жол`;
  if (locale === "en") return `${count.toLocaleString("en-US")} ${count === 1 ? "row" : "rows"}`;
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

const valueLabels: Record<string, Copy> = {
  posted: ["Проведён", "Өткізілген", "Posted"],
  cancelled: ["Отменён", "Болдырылмаған", "Cancelled"],
  confirmed: ["Подтверждён", "Расталған", "Confirmed"],
  in_transit: ["В пути", "Жолда", "In transit"],
  received: ["Получен", "Қабылданған", "Received"],
  additional: ["Дополнительно к текущему росту", "Ағымдағы өсімге қосымша", "In addition to current growth"],
  replace_trend: ["Вместо текущего роста", "Ағымдағы өсімнің орнына", "Replace current growth"],
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

export function reportCellValue(value: unknown, field: string, locale: Locale = "ru"): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? translate(locale, "Да", "Иә", "Yes") : translate(locale, "Нет", "Жоқ", "No");
  if (typeof value === "object") return JSON.stringify(value);
  const text = String(value);
  if (field === "kind") return reportKindTitle(text, locale);
  if (field === "status" || field === "mode") return valueLabels[text] ? copy(locale, valueLabels[text]) : text;
  if (dateFields.has(field)) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(text))
      return new Intl.DateTimeFormat(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC" }).format(new Date(`${text}T12:00:00Z`));
    const date = new Date(text);
    if (!Number.isNaN(date.getTime())) {
      return date.toLocaleString(locale === "kk" ? "kk-KZ" : locale === "en" ? "en-US" : "ru-RU", {
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
