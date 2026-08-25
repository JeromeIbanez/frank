/**
 * Money domain helpers for Frank OS.
 *
 * Invariants (PRD §6 M3): amounts are ALWAYS integer euro-cents. No floats
 * ever cross a domain API boundary. Formatting/parsing is deterministic and
 * locale-explicit (nl-NL style), implemented by hand so it does not depend on
 * ICU data present in the runtime.
 */

/**
 * Format integer cents as a Dutch euro string, e.g. 123456 -> "€ 1.234,56".
 * Negative amounts render as "€ -1.234,56".
 */
export function formatEuro(cents: number): string {
  if (!Number.isFinite(cents) || !Number.isInteger(cents)) {
    throw new Error(`formatEuro expects integer cents, got: ${cents}`);
  }
  const negative = cents < 0;
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = abs % 100;

  // Group the euro part with "." thousands separators.
  const eurosStr = euros
    .toString()
    .replace(/\B(?=(\d{3})+(?!\d))/g, ".");

  const decimals = rest.toString().padStart(2, "0");
  return `€ ${negative ? "-" : ""}${eurosStr},${decimals}`;
}

/**
 * Parse a user-entered euro amount to integer cents.
 * Accepts Dutch style ("1.234,56", "€ 1.234,56", "12,50") and
 * international style ("1234.56", "1,234.56", "1234").
 * Returns null when the input cannot be parsed unambiguously.
 */
export function parseEuro(input: string): number | null {
  if (typeof input !== "string") return null;
  let s = input.trim();
  if (s.length === 0) return null;

  // Strip currency symbol / EUR label and inner whitespace.
  s = s.replace(/€|eur/gi, "").trim();
  s = s.replace(/\s+/g, "");
  if (s.length === 0) return null;

  let negative = false;
  if (s.startsWith("-")) {
    negative = true;
    s = s.slice(1);
  } else if (s.startsWith("+")) {
    s = s.slice(1);
  }
  if (!/^[\d.,]+$/.test(s)) return null;

  const lastDot = s.lastIndexOf(".");
  const lastComma = s.lastIndexOf(",");

  let integerPart: string;
  let decimalPart: string;

  if (lastDot !== -1 && lastComma !== -1) {
    // Both present: the later one is the decimal separator.
    const decSep = lastDot > lastComma ? "." : ",";
    const decIdx = Math.max(lastDot, lastComma);
    integerPart = s.slice(0, decIdx).replace(/[.,]/g, "");
    decimalPart = s.slice(decIdx + 1);
    if (decimalPart.includes(".") || decimalPart.includes(",")) return null;
    if (decSep === "." && s.slice(0, decIdx).includes(".")) {
      // e.g. "1.234.56" — dots both as group and decimal: reject.
      return null;
    }
  } else if (lastComma !== -1) {
    // Only commas. A single comma is the Dutch decimal separator ("12,50").
    // Multiple commas ("1,234,567") are treated as thousands grouping.
    const commas = s.split(",").length - 1;
    if (commas === 1) {
      integerPart = s.slice(0, lastComma);
      decimalPart = s.slice(lastComma + 1);
      if (decimalPart.length === 3 && integerPart.length <= 3 && integerPart.length > 0) {
        // "1,234" — ambiguous; treat as English grouping -> 1234 euros.
        integerPart = s.replace(/,/g, "");
        decimalPart = "";
      }
    } else {
      if (!/^\d{1,3}(,\d{3})+$/.test(s)) return null;
      integerPart = s.replace(/,/g, "");
      decimalPart = "";
    }
  } else if (lastDot !== -1) {
    // Only dots. A single dot followed by exactly 3 digits is Dutch
    // thousands grouping ("1.234" -> 1234 euros); otherwise decimal.
    const dots = s.split(".").length - 1;
    if (dots === 1) {
      integerPart = s.slice(0, lastDot);
      decimalPart = s.slice(lastDot + 1);
      if (decimalPart.length === 3 && integerPart.length <= 3 && integerPart.length > 0) {
        integerPart = s.replace(/\./g, "");
        decimalPart = "";
      }
    } else {
      if (!/^\d{1,3}(\.\d{3})+$/.test(s)) return null;
      integerPart = s.replace(/\./g, "");
      decimalPart = "";
    }
  } else {
    integerPart = s;
    decimalPart = "";
  }

  if (!/^\d+$/.test(integerPart)) return null;
  if (decimalPart.length > 2) return null;
  if (decimalPart.length > 0 && !/^\d+$/.test(decimalPart)) return null;

  const euros = parseInt(integerPart, 10);
  const cents = decimalPart.length === 0 ? 0 : parseInt(decimalPart.padEnd(2, "0"), 10);
  const total = euros * 100 + cents;
  if (!Number.isSafeInteger(total)) return null;
  return negative ? -total : total;
}
