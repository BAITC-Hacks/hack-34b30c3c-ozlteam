/** Форматирование величин рейса. Одно место — чтобы километры и тенге везде выглядели одинаково. */

const NBSP = " ";

/** Числа с неразрывным пробелом в разрядах: «1 240», а не «1,240». */
export function num(value: number): string {
  return Math.round(value).toLocaleString("ru-RU").replace(/\s/g, NBSP);
}

export function km(value: number): string {
  return `${num(value)}${NBSP}км`;
}

export function money(value: number): string {
  return `${num(value)}${NBSP}₸`;
}

/** Длительность словами: «2 сут 6 ч», «14 ч 30 мин», «45 мин». */
export function duration(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const days = Math.floor(total / 1440);
  const hours = Math.floor((total % 1440) / 60);
  const mins = total % 60;
  if (days > 0) return `${days}${NBSP}сут ${hours}${NBSP}ч`;
  if (hours > 0) return mins === 0 ? `${hours}${NBSP}ч` : `${hours}${NBSP}ч ${mins}${NBSP}мин`;
  return `${mins}${NBSP}мин`;
}

/** Время от выезда как часы рейса: «+18:40». Ось симуляции, а не настенные часы. */
export function clock(minutes: number): string {
  const total = Math.max(0, Math.round(minutes));
  const hours = Math.floor(total / 60);
  const mins = total % 60;
  return `+${hours}:${String(mins).padStart(2, "0")}`;
}

const WEEKDAY = ["в воскресенье", "в понедельник", "во вторник", "в среду", "в четверг", "в пятницу", "в субботу"];

/**
 * Прибытие человеческим текстом: «сегодня к 14:00», «завтра к 09:30», «в четверг к 18:00».
 * Логисту важен день недели, а не дата: по дате он всё равно считает в уме.
 */
export function eta(departAt: string, minutesFromStart: number, now = new Date()): string {
  const arrival = new Date(new Date(departAt).getTime() + minutesFromStart * 60_000);
  const time = arrival.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  const day = (date: Date) => Math.floor(new Date(date).setHours(0, 0, 0, 0) / 86_400_000);
  const diff = day(arrival) - day(now);
  if (diff <= 0) return `сегодня к ${time}`;
  if (diff === 1) return `завтра к ${time}`;
  if (diff < 7) return `${WEEKDAY[arrival.getDay()]} к ${time}`;
  return `${arrival.toLocaleDateString("ru-RU", { day: "numeric", month: "long" })} к ${time}`;
}

export function percent(value: number): string {
  return `${Math.round(value)}%`;
}
