import { DateTime } from "luxon";
export const zone = "Europe/Madrid";
export const madrid = (date: Date = new Date()) =>
  DateTime.fromJSDate(date, { zone }).setLocale("es");
export const day = (iso: string) =>
  DateTime.fromISO(iso, { zone }).setLocale("es");
export function calendarRange(month: string) {
  if (!/^\d{4}-\d{2}$/.test(month)) throw new Error("Mes no válido.");
  const date = day(month + "-01");
  if (!date.isValid || date.year < 2000 || date.year > 2100)
    throw new Error("Mes no válido.");
  const start = date.startOf("week");
  return { start, end: start.plus({ days: 42 }), month: date };
}
