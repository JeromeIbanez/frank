import { describe, expect, it } from "vitest";
import {
  easterSunday,
  isBusinessDay,
  isDutchHoliday,
  shiftToBusinessDay,
} from "../holidays";

function utc(iso: string): Date {
  return new Date(`${iso}T00:00:00.000Z`);
}

describe("easterSunday (Anonymous Gregorian algorithm)", () => {
  it("computes Easter 2026 as 5 April", () => {
    const e = easterSunday(2026);
    expect(e.getUTCFullYear()).toBe(2026);
    expect(e.getUTCMonth()).toBe(3); // April
    expect(e.getUTCDate()).toBe(5);
  });

  it("computes known Easters", () => {
    expect(easterSunday(2025).toISOString().slice(0, 10)).toBe("2025-04-20");
    expect(easterSunday(2024).toISOString().slice(0, 10)).toBe("2024-03-31");
  });
});

describe("Koningsdag", () => {
  it("moves to 26 April 2025 because 27 April 2025 is a Sunday", () => {
    expect(utc("2025-04-27").getUTCDay()).toBe(0); // sanity: Sunday
    expect(isDutchHoliday(utc("2025-04-26"))).toBe(true);
    expect(isDutchHoliday(utc("2025-04-27"))).toBe(false);
  });

  it("stays on 27 April in a normal year (2026: Monday)", () => {
    expect(isDutchHoliday(utc("2026-04-27"))).toBe(true);
    expect(isDutchHoliday(utc("2026-04-26"))).toBe(false);
  });
});

describe("isDutchHoliday", () => {
  it("covers the fixed and Easter-relative holidays for 2026", () => {
    for (const d of [
      "2026-01-01", // Nieuwjaarsdag
      "2026-04-03", // Goede Vrijdag
      "2026-04-05", // 1e Paasdag
      "2026-04-06", // 2e Paasdag
      "2026-04-27", // Koningsdag
      "2026-05-05", // Bevrijdingsdag
      "2026-05-14", // Hemelvaart
      "2026-05-24", // 1e Pinksterdag
      "2026-05-25", // 2e Pinksterdag
      "2026-12-25", // 1e Kerstdag
      "2026-12-26", // 2e Kerstdag
    ]) {
      expect(isDutchHoliday(utc(d)), d).toBe(true);
    }
    expect(isDutchHoliday(utc("2026-07-14"))).toBe(false);
  });
});

describe("isBusinessDay", () => {
  it("is false on weekends and holidays, true on ordinary weekdays", () => {
    expect(isBusinessDay(utc("2026-08-25"))).toBe(true); // Tuesday
    expect(isBusinessDay(utc("2026-08-22"))).toBe(false); // Saturday
    expect(isBusinessDay(utc("2026-08-23"))).toBe(false); // Sunday
    expect(isBusinessDay(utc("2026-12-25"))).toBe(false); // Kerstdag (Friday)
  });
});

describe("shiftToBusinessDay across Christmas", () => {
  it("shifts 25 Dec 2026 forward past Kerst + weekend to Monday 28 Dec", () => {
    // 2026-12-25 Fri (holiday), 26 Sat (holiday), 27 Sun -> 28 Mon.
    const shifted = shiftToBusinessDay(utc("2026-12-25"), "after");
    expect(shifted.toISOString().slice(0, 10)).toBe("2026-12-28");
  });

  it("shifts 26 Dec 2026 backward to Thursday 24 Dec", () => {
    const shifted = shiftToBusinessDay(utc("2026-12-26"), "before");
    expect(shifted.toISOString().slice(0, 10)).toBe("2026-12-24");
  });

  it("returns a business day unchanged", () => {
    const shifted = shiftToBusinessDay(utc("2026-12-24"), "after");
    expect(shifted.toISOString().slice(0, 10)).toBe("2026-12-24");
  });
});
