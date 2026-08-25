/**
 * Dutch public holidays and business-day arithmetic.
 *
 * All date handling is UTC-based: a `Date` is interpreted through its
 * UTC year/month/day only, so results are independent of server timezone
 * (PRD conventions: ISO dates, compute with UTC).
 *
 * Holidays covered (nationale feestdagen):
 *  - Nieuwjaarsdag (1 Jan)
 *  - Goede Vrijdag (Easter - 2)
 *  - 1e & 2e Paasdag (Easter Sunday & Monday)
 *  - Koningsdag (27 Apr; observed 26 Apr when 27 Apr falls on a Sunday)
 *  - Bevrijdingsdag (5 May)
 *  - Hemelvaartsdag (Easter + 39)
 *  - 1e & 2e Pinksterdag (Easter + 49 / + 50)
 *  - 1e & 2e Kerstdag (25 & 26 Dec)
 */

/** Easter Sunday for a given year — Anonymous Gregorian algorithm. Returns UTC date. */
export function easterSunday(year: number): Date {
  const a = year % 19;
  const b = Math.floor(year / 100);
  const c = year % 100;
  const d = Math.floor(b / 4);
  const e = b % 4;
  const f = Math.floor((b + 8) / 25);
  const g = Math.floor((b - f + 1) / 3);
  const h = (19 * a + b - d - g + 15) % 30;
  const i = Math.floor(c / 4);
  const k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7;
  const m = Math.floor((a + 11 * h + 22 * l) / 451);
  const month = Math.floor((h + l - 7 * m + 114) / 31); // 3 = March, 4 = April
  const day = ((h + l - 7 * m + 114) % 31) + 1;
  return new Date(Date.UTC(year, month - 1, day));
}

function addDaysUtc(d: Date, days: number): Date {
  const out = new Date(d.getTime());
  out.setUTCDate(out.getUTCDate() + days);
  return out;
}

function utcKey(d: Date): string {
  const y = d.getUTCFullYear().toString().padStart(4, "0");
  const m = (d.getUTCMonth() + 1).toString().padStart(2, "0");
  const day = d.getUTCDate().toString().padStart(2, "0");
  return `${y}-${m}-${day}`;
}

const holidayCache = new Map<number, Set<string>>();

/** All Dutch public holidays for a year, as a set of "YYYY-MM-DD" keys (UTC). */
export function dutchHolidays(year: number): Set<string> {
  const cached = holidayCache.get(year);
  if (cached) return cached;

  const easter = easterSunday(year);
  const set = new Set<string>();

  set.add(utcKey(new Date(Date.UTC(year, 0, 1)))); // Nieuwjaarsdag
  set.add(utcKey(addDaysUtc(easter, -2))); // Goede Vrijdag
  set.add(utcKey(easter)); // 1e Paasdag
  set.add(utcKey(addDaysUtc(easter, 1))); // 2e Paasdag

  // Koningsdag: 27 April, moved to 26 April when 27 April is a Sunday.
  const apr27 = new Date(Date.UTC(year, 3, 27));
  const koningsdag = apr27.getUTCDay() === 0 ? new Date(Date.UTC(year, 3, 26)) : apr27;
  set.add(utcKey(koningsdag));

  set.add(utcKey(new Date(Date.UTC(year, 4, 5)))); // Bevrijdingsdag
  set.add(utcKey(addDaysUtc(easter, 39))); // Hemelvaartsdag
  set.add(utcKey(addDaysUtc(easter, 49))); // 1e Pinksterdag
  set.add(utcKey(addDaysUtc(easter, 50))); // 2e Pinksterdag
  set.add(utcKey(new Date(Date.UTC(year, 11, 25)))); // 1e Kerstdag
  set.add(utcKey(new Date(Date.UTC(year, 11, 26)))); // 2e Kerstdag

  holidayCache.set(year, set);
  return set;
}

/** True when the given date (UTC calendar day) is a Dutch public holiday. */
export function isDutchHoliday(d: Date): boolean {
  return dutchHolidays(d.getUTCFullYear()).has(utcKey(d));
}

/** True for Monday–Friday that is not a Dutch public holiday (UTC calendar day). */
export function isBusinessDay(d: Date): boolean {
  const dow = d.getUTCDay();
  if (dow === 0 || dow === 6) return false;
  return !isDutchHoliday(d);
}

/**
 * Shift a date falling on a weekend/holiday to the nearest business day in
 * the given direction. A date that is already a business day is returned
 * unchanged (as a copy).
 */
export function shiftToBusinessDay(d: Date, direction: "before" | "after"): Date {
  let cur = new Date(d.getTime());
  const step = direction === "before" ? -1 : 1;
  while (!isBusinessDay(cur)) {
    cur = addDaysUtc(cur, step);
  }
  return cur;
}
