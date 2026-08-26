import { describe, expect, it } from "vitest";
import { formatEuro, parseEuro } from "../money";

describe("formatEuro", () => {
  it("formats cents in nl-NL style", () => {
    expect(formatEuro(123456)).toBe("€ 1.234,56");
    expect(formatEuro(0)).toBe("€ 0,00");
    expect(formatEuro(5)).toBe("€ 0,05");
    expect(formatEuro(100)).toBe("€ 1,00");
    expect(formatEuro(123456789)).toBe("€ 1.234.567,89");
  });

  it("formats negative amounts", () => {
    expect(formatEuro(-123456)).toBe("€ -1.234,56");
  });

  it("rejects non-integer input", () => {
    expect(() => formatEuro(12.5)).toThrow();
  });
});

describe("parseEuro", () => {
  it("parses Dutch style", () => {
    expect(parseEuro("1.234,56")).toBe(123456);
    expect(parseEuro("12,50")).toBe(1250);
    expect(parseEuro("€ 1.234,56")).toBe(123456);
    expect(parseEuro("1.234.567,89")).toBe(123456789);
  });

  it("parses international style", () => {
    expect(parseEuro("1234.56")).toBe(123456);
    expect(parseEuro("1234")).toBe(123400);
    expect(parseEuro("1,234.56")).toBe(123456);
  });

  it("treats a single separator with 3-digit group as thousands", () => {
    expect(parseEuro("1.234")).toBe(123400);
    expect(parseEuro("12,345")).toBe(1234500);
  });

  it("parses negatives and single decimals", () => {
    expect(parseEuro("-12,5")).toBe(-1250);
    expect(parseEuro("0,05")).toBe(5);
  });

  it("returns null for garbage", () => {
    expect(parseEuro("")).toBeNull();
    expect(parseEuro("abc")).toBeNull();
    expect(parseEuro("12,3456")).toBeNull();
    expect(parseEuro("1.23.45")).toBeNull();
    expect(parseEuro("12,3,4")).toBeNull();
  });

  it("round-trips with formatEuro", () => {
    for (const cents of [0, 5, 1250, 123456, 987654321]) {
      expect(parseEuro(formatEuro(cents))).toBe(cents);
    }
  });
});

describe("parseEuro — decimal-separator cases from PR-6 r2 #3", () => {
  it("dot as decimal: '486.30' is €486,30, never €48.630", () => {
    expect(parseEuro("486.30")).toBe(48_630);
  });
  it("comma as decimal: '486,30'", () => {
    expect(parseEuro("486,30")).toBe(48_630);
  });
  it("Dutch grouping + comma decimal: '1.842,50'", () => {
    expect(parseEuro("1.842,50")).toBe(184_250);
  });
  it("English grouping + dot decimal: '1,842.50'", () => {
    expect(parseEuro("1,842.50")).toBe(184_250);
  });
});
