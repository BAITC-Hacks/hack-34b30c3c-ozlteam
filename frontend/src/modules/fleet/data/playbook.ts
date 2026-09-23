/**
 * Тексты событий рейса и заготовленные разборы.
 *
 * Разбор нужен на экране всегда, а модель доступна не всегда: нет ключа, нет сети,
 * кончился лимит. Поэтому заготовленный разбор здесь — не заглушка на случай сбоя,
 * а основной путь; ответ модели ложится поверх него и отличается только полем `source`.
 *
 * Оба пути подчиняются одному правилу дизайн-системы: сначала вывод, потом основание.
 * Первая фраза говорит, что происходит и чем это грозит, `why` объясняет, почему так
 * решено. Действия никогда не выполняются сами — это подсказка человеку, поэтому
 * формулировки в повелительной форме и всегда «глагол + объект».
 */

import type { Cargo, EventKind, EventSeverity, TripEvent, Verdict, VerdictAction } from "../types";

/** Ограничение скорости на трассе, км/ч — по нему считается превышение. */
export const SPEED_LIMIT: number = 90;

/** Всё, что разбор знает о моменте: событие и его окружение. */
export interface EventContext {
  event: TripEvent;
  tripId: string;
  /** Ближайшая точка маршрута, где случилось событие. */
  placeName: string;
  /** Конечная точка рейса. */
  destination: string;
  clientName: string;
  driverName: string;
  plate: string;
  cargo: Cargo;
  /** Накопленная задержка к плановому прибытию, минут. */
  delayMin: number;
  /** Плановое прибытие человеческим текстом: «завтра к 14:00». */
  etaText: string;
}

/* ─────────────────────────── мелкие помощники ─────────────────────────── */

/**
 * Разряды пробелами без `Intl`: тексты разбора уходят и на экран, и в промпт,
 * и должны выглядеть одинаково независимо от локали окружения.
 */
function money(value: number): string {
  return Math.round(value).toString().replace(/\B(?=(\d{3})+(?!\d))/g, " ");
}

/** Класс груза словами: в тексте для человека «fragile» ничего не объясняет. */
const CARGO_CLASS: Record<Cargo["class"], string> = {
  general: "обычный груз",
  food: "продукты с температурным режимом",
  fragile: "хрупкий груз",
  danger: "опасный груз",
  oversize: "негабарит",
};

/** Накопленная задержка словами: ноль минут — это «в графике», а не «задержка 0». */
function delayText(delayMin: number): string {
  if (delayMin <= 0) return "отставания от плана нет";
  if (delayMin < 60) return `отставание ${delayMin} мин`;
  const hours = Math.floor(delayMin / 60);
  const rest = delayMin % 60;
  return rest === 0 ? `отставание ${hours} ч` : `отставание ${hours} ч ${rest} мин`;
}

/* ─────────────────────────── лента событий ─────────────────────────── */

/** Заголовок, подробность и важность события — то, что попадёт в ленту. */
export function describeEvent(
  kind: EventKind,
  ctx: { placeName: string; destination: string; speed: number; limit?: number; minutes?: number; cargo: Cargo },
): { title: string; detail: string; severity: EventSeverity } {
  // Ограничение приходит от участка дороги; если участок его не знает — берём трассовое.
  const limit = ctx.limit ?? SPEED_LIMIT;
  // Длительность есть не у каждого события, поэтому фраза строится и без цифры.
  const held = ctx.minutes !== undefined && ctx.minutes > 0 ? `${ctx.minutes} мин` : "";

  switch (kind) {
    case "depart":
      return {
        title: "Выехали",
        detail: `Погрузка закончена, машина ушла с точки «${ctx.placeName}» на точку «${ctx.destination}». На борту: ${ctx.cargo.name}, ${ctx.cargo.pallets} паллет.`,
        severity: "info",
      };
    case "checkpoint":
      return {
        title: "Контрольная точка пройдена",
        detail: `${ctx.placeName} позади, скорость ${ctx.speed} км/ч. Идём на точку «${ctx.destination}».`,
        severity: "info",
      };
    case "border":
      return {
        title: "Очередь на границе",
        detail: `Машина встала в очередь на пункте пропуска «${ctx.placeName}»${held ? `, в очереди уже ${held}` : ""}. Время в пути не идёт, а срок доставки идёт.`,
        severity: "warn",
      };
    case "customs":
      return {
        title: "Оформление на таможне",
        detail: `Декларация подана на «${ctx.placeName}». Простой на оформлении — ${held || "время пока не оценивается"}.`,
        severity: "warn",
      };
    case "customsDone":
      return {
        title: "Декларация выпущена",
        detail: `Груз выпущен на «${ctx.placeName}», машина продолжила путь на точку «${ctx.destination}».`,
        severity: "info",
      };
    case "speeding":
      return {
        title: "Превышение скорости",
        detail: `${ctx.speed} км/ч при ограничении ${limit} км/ч на подъезде к точке «${ctx.placeName}».`,
        severity: "alert",
      };
    case "stop":
      return {
        title: "Стоянка вне плана",
        detail: `Машина стоит у точки «${ctx.placeName}» ${held || "без движения"}, в задании этой остановки нет.`,
        severity: "warn",
      };
    case "rest":
      return {
        title: "Обязательный отдых",
        detail: `Водитель за рулём ${held || "дольше нормы"} подряд и уходит на перерыв у точки «${ctx.placeName}».`,
        severity: "info",
      };
    case "fuel":
      return {
        title: "Заправка",
        detail: `Дозаправка у точки «${ctx.placeName}»${held ? `, стоянка ${held}` : ""}. Остановка заложена в план рейса.`,
        severity: "info",
      };
    case "breakdown":
      return {
        title: "Неисправность в пути",
        detail: `Машина встала у точки «${ctx.placeName}» с неисправностью. На борту ${ctx.cargo.weightT} т груза «${ctx.cargo.name}».`,
        severity: "alert",
      };
    case "detour":
      return {
        title: "Объезд",
        detail: `Уходим с основной дороги у точки «${ctx.placeName}». Пробег и расход вырастут, прибытие на точку «${ctx.destination}» сдвигается.`,
        severity: "warn",
      };
    case "coldChain":
      return {
        title: "Температура вне режима",
        detail: `Рефрижератор ушёл за границу режима «${ctx.cargo.temperature ?? "режим в заказе не указан"}» у точки «${ctx.placeName}». Груз: ${ctx.cargo.name}.`,
        severity: "alert",
      };
    case "arrive":
      return {
        title: "Прибыли на выгрузку",
        detail: `Машина на месте в точке «${ctx.destination}». К приёмке ${ctx.cargo.pallets} паллет, ${ctx.cargo.weightT} т.`,
        severity: "info",
      };
    case "shortage":
      return {
        title: "Расхождение при приёмке",
        detail: `Приёмка в точке «${ctx.destination}» идёт с расхождением по количеству: в заказе ${ctx.cargo.pallets} паллет.`,
        severity: "alert",
      };
  }
}

/* ─────────────────────────── заготовленный разбор ─────────────────────────── */

/** Общие поля разбора, чтобы в каждой ветке остался только текст. */
function verdict(
  ctx: EventContext,
  body: { title: string; text: string; why: string; confidence: number; actions: VerdictAction[] },
): Verdict {
  return { eventId: ctx.event.id, source: "local", ...body };
}

/** Разбор без модели: работает всегда, в том числе без ключа и без сети. */
export function localVerdict(ctx: EventContext): Verdict {
  const { event, cargo, placeName, destination, clientName, driverName, plate, delayMin, etaText } = ctx;
  const telemetry = event.telemetry;

  switch (event.kind) {
    case "depart":
      return verdict(ctx, {
        title: "Рейс начался по плану, срок держим",
        text: `Машина ${plate} ушла с точки «${placeName}» на точку «${destination}», план принят за эталон. Дальше факт сверяется с планом на каждой контрольной точке — отклонение станет видно раньше, чем его заметит ${clientName}.`,
        why: `На борту «${cargo.name}»: ${CARGO_CLASS[cargo.class]}, ${cargo.weightT} т, ${cargo.pallets} паллет. Плановое прибытие — ${etaText}.`,
        confidence: 80,
        actions: [
          { label: "Отправить клиенту трек рейса", primary: true },
          { label: "Проверить комплект товаросопроводительных документов" },
        ],
      });

    case "checkpoint":
      return verdict(ctx, {
        title: "Идём по графику, вмешательство не нужно",
        text: `Точка «${placeName}» пройдена, ${delayText(delayMin)}. Маршрут до точки «${destination}» не менялся, прибытие ${etaText}.`,
        why: `Телеметрия в норме: ${telemetry.speed} км/ч, топлива ${telemetry.fuel}% бака, за рулём ${telemetry.drivingFor} мин — до обязательного перерыва запас есть.`,
        confidence: 82,
        actions: [
          { label: "Обновить статус в заказе", primary: true },
          { label: "Сверить остаток топлива с планом" },
        ],
      });

    case "border":
      return verdict(ctx, {
        title: "Граница съест срок раньше, чем дорога",
        text: `Машина в очереди на «${placeName}», и ${delayText(delayMin)} растёт без нашего участия. Дорогу мы наверстаем, очередь — нет. Предупредить ${clientName} стоит сейчас, а не в день выгрузки.`,
        why: `Время в очереди телеметрией не прогнозируется: оно зависит от потока и смены на пункте пропуска. Реальную оценку даст только брокер или водитель на месте.`,
        confidence: 58,
        actions: [
          { label: "Предупредить клиента о риске срока", primary: true },
          { label: "Запросить у брокера время в очереди" },
          { label: "Пересчитать плановое прибытие" },
        ],
      });

    case "customs":
      return verdict(ctx, {
        title: "Простой на таможне: срок под вопросом",
        text: `Декларация подана, машина ${plate} стоит на «${placeName}». Накопленное ${delayText(delayMin)} держится до выпуска, поэтому клиенту лучше назвать вилку, а не точный час.`,
        why: `Груз «${cargo.name}» объявленной стоимостью ${money(cargo.value)} ₸ идёт по декларации; скорость выпуска зависит от полноты пакета — инвойс, упаковочный лист, CMR. Сроки и платежи по этой поставке нужно уточнить у брокера: в системе их нет.`,
        confidence: 64,
        actions: [
          { label: "Запросить статус декларации у брокера", primary: true },
          { label: "Проверить инвойс и упаковочный лист" },
          { label: "Сдвинуть окно выгрузки у получателя" },
        ],
      });

    case "customsDone":
      return verdict(ctx, {
        title: "Груз выпущен, срок снова управляемый",
        text: `Таможня выпустила груз на «${placeName}», машина пошла на точку «${destination}». С учётом накопленного отставания прибытие — ${etaText}.`,
        why: `Непрогнозируемая часть рейса закончилась: дальше на прибытие влияют только дорога и режим отдыха водителя, а это считается.`,
        confidence: 86,
        actions: [
          { label: "Сообщить клиенту новое время прибытия", primary: true },
          { label: "Приложить выпущенную декларацию к рейсу" },
        ],
      });

    case "speeding":
      return verdict(ctx, {
        title: "Превышение: штраф и спор со страховой",
        text: `${driverName} идёт ${telemetry.speed} км/ч при ограничении ${SPEED_LIMIT} км/ч у точки «${placeName}». Это фиксируется камерами и остаётся в истории рейса. Звонок сейчас дешевле разбирательства потом.`,
        why: `Превышение подтверждено телеметрией, а не оценкой: ${telemetry.speed} против ${SPEED_LIMIT} км/ч. Кроме штрафа, нарушение режима движения даёт страховщику повод оспорить выплату при происшествии; конкретные суммы и последствия смотрите в полисе.`,
        confidence: 93,
        actions: [
          { label: "Позвонить водителю и сбросить скорость", primary: true },
          { label: "Зафиксировать нарушение в карточке водителя" },
        ],
      });

    case "stop":
      return verdict(ctx, {
        title: "Стоянка вне плана — нужна причина",
        text: `Машина ${plate} стоит у точки «${placeName}», в задании этой остановки нет. Пока причина неизвестна, ${delayText(delayMin)} считается нашим. Один звонок ${driverName} закрывает вопрос.`,
        why: `Датчики показывают нулевую скорость, но причину не различают: очередь, мелкий ремонт и личная остановка выглядят в телеметрии одинаково.`,
        confidence: 56,
        actions: [
          { label: "Связаться с водителем", primary: true },
          { label: "Проверить обстановку на участке трассы" },
        ],
      });

    case "rest":
      return verdict(ctx, {
        title: "Отдых по режиму: остановка плановая",
        text: `${driverName} провёл за рулём ${telemetry.drivingFor} мин и уходит на перерыв у точки «${placeName}». Это не потеря времени, а условие, при котором рейс вообще можно продолжать. Прибытие остаётся ${etaText}.`,
        why: `Дальше без перерыва нельзя ни по режиму труда и отдыха, ни по безопасности: на ${telemetry.speed} км/ч усталость водителя стоит дороже часа простоя. Фактическую длительность перерыва сверяйте с тахографом.`,
        confidence: 88,
        actions: [
          { label: "Назначить отдых 45 минут", primary: true },
          { label: "Пересчитать время прибытия" },
        ],
      });

    case "fuel":
      return verdict(ctx, {
        title: "Заправка в плане, на срок не влияет",
        text: `Остаток — ${telemetry.fuel}% бака, машина заправляется у точки «${placeName}». Стоянка короткая и в расчёт рейса заложена.`,
        why: `На таком остатке до точки «${destination}» без дозаправки не дойти, а заправка в пути дороже плановой. Чек нужен, чтобы себестоимость рейса сошлась с фактом.`,
        confidence: 78,
        actions: [
          { label: "Приложить чек к расходам рейса", primary: true },
          { label: "Сверить фактический расход с нормой" },
        ],
      });

    case "breakdown":
      return verdict(ctx, {
        title: "Машина встала: ремонт или подмена",
        text: `${plate} стоит у точки «${placeName}» с неисправностью, груз «${cargo.name}» на борту. До оценки объёма ремонта срок ${etaText} держать нельзя. Решение о подмене лучше принять в ближайший час, пока запас ещё есть.`,
        why: `${delayText(delayMin)} растёт непрерывно, а ${cargo.pallets} паллет весом ${cargo.weightT} т перегружаются только на площадке с техникой — чем дальше машина от «${placeName}», тем дороже перецепка.`,
        confidence: 72,
        actions: [
          { label: "Вызвать техпомощь", primary: true },
          { label: "Подобрать машину на подмену" },
          { label: "Предупредить клиента о срыве срока" },
        ],
      });

    case "detour":
      return verdict(ctx, {
        title: "Объезд: маршрут длиннее, прибытие позже",
        text: `Машина ушла с основной дороги у точки «${placeName}». Пробег, расход и прибытие на точку «${destination}» сдвигаются вверх. Насколько — станет понятно на выезде обратно на трассу.`,
        why: `Длину объезда телеметрия покажет только по факту проезда; пока считаем по накопленному: ${delayText(delayMin)}. Причину объезда — ремонт, погода, закрытый участок — нужно уточнить у водителя.`,
        confidence: 60,
        actions: [
          { label: "Уточнить у водителя причину объезда", primary: true },
          { label: "Пересчитать план рейса" },
        ],
      });

    case "coldChain":
      return verdict(ctx, {
        title: "Температура вне режима — груз под угрозой",
        text: `В кузове ${telemetry.cargoTemp ?? "—"} °C при режиме ${cargo.temperature ?? "который в заказе не указан"}. Для груза «${cargo.name}» это прямой риск порчи и отказа в приёмке на ${money(cargo.value)} ₸. Реагировать надо сейчас, а не на выгрузке.`,
        why: `Отклонение зафиксировано датчиком рефрижератора, а не замером на глаз. Чем дольше груз вне режима, тем труднее доказать сохранность при приёмке, поэтому журнал температуры за весь рейс нужно сохранить до разгрузки.`,
        confidence: 87,
        actions: [
          { label: "Связаться с водителем и проверить рефрижератор", primary: true },
          { label: "Выгрузить журнал температуры за рейс" },
          { label: "Предупредить клиента о риске по грузу" },
        ],
      });

    case "arrive":
      return verdict(ctx, {
        title: "Рейс доехал, осталась приёмка и документы",
        text: `Машина на выгрузке в точке «${destination}», ${delayText(delayMin)}. Пока водитель на месте, проще снять отметки в накладной и закрыть рейс без последующей переписки.`,
        why: `Претензии по количеству и состоянию груза заявляются при приёмке: отметка получателя в CMR — основной документ, если ${clientName} потом вернётся к этой поставке.`,
        confidence: 89,
        actions: [
          { label: "Получить отметку получателя в CMR", primary: true },
          { label: "Передать документы по рейсу в бухгалтерию" },
        ],
      });

    case "shortage":
      return verdict(ctx, {
        title: "Недостача: без акта её не предъявишь",
        text: `При приёмке в точке «${destination}» расхождение по количеству: в заказе ${cargo.pallets} паллет. Пока машина и водитель на месте, расхождение фиксируется актом; после отъезда доказывать будет нечем. ${clientName} предупреждаем сразу, до конца приёмки.`,
        why: `Заявлено ${cargo.pallets} паллет, ${cargo.weightT} т, объявленная стоимость ${money(cargo.value)} ₸. Основание претензии — акт приёмки с подписью водителя и отметка в накладной; порядок и размер возмещения смотрите в договоре с клиентом, в системе этих условий нет.`,
        confidence: 84,
        actions: [
          { label: "Оформить акт недостачи", primary: true },
          { label: "Сфотографировать пломбу и грузовые места" },
          { label: "Уведомить клиента о расхождении" },
        ],
      });
  }
}

/* ─────────────────────────── вопрос модели ─────────────────────────── */

/**
 * Вопрос модели: короткий, с фактами момента, без выдумывания.
 *
 * Роль модели задаётся системным промптом на бэкенде, поэтому здесь только факты
 * и запрос. Формат ответа не навязываем: просим вывод и действия словами — так ответ
 * читается и в ленте, и в чате ассистента, и не ломается, если модель сменится.
 */
export function buildPrompt(ctx: EventContext): string {
  const { event, cargo, tripId, placeName, destination, clientName, driverName, plate, delayMin, etaText } = ctx;
  const telemetry = event.telemetry;

  const lines = [
    `Рейс ${tripId}, машина ${plate}, водитель ${driverName}, клиент ${clientName}. Идём на точку «${destination}».`,
    `Груз: ${cargo.name} — ${CARGO_CLASS[cargo.class]}, ${cargo.weightT} т, ${cargo.volumeM3} м³, ${cargo.pallets} паллет, объявленная стоимость ${money(cargo.value)} ₸${cargo.temperature ? `, температурный режим ${cargo.temperature}` : ""}.`,
    `Событие у точки «${placeName}» на ${event.km}-м километре: ${event.title}. ${event.detail}`,
    `Телеметрия: скорость ${telemetry.speed} км/ч, топливо ${telemetry.fuel}% бака, за рулём без перерыва ${telemetry.drivingFor} мин${telemetry.cargoTemp !== undefined ? `, температура в кузове ${telemetry.cargoTemp} °C` : ""}.`,
    `К плановому прибытию накоплено ${delayText(delayMin)}; по плану прибываем ${etaText}.`,
    `Скажи коротко: чем это грозит сроку, грузу и клиенту, и что диспетчеру сделать прямо сейчас — одно главное действие и одно-два запасных. Если фактов не хватает, так и скажи и назови, что уточнить; ставки, сроки и нормы не придумывай.`,
  ];

  return lines.join("\n");
}
