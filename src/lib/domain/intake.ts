import { createHash } from "node:crypto";
import { z } from "zod";

/**
 * Intake proposal contracts (plan os-v1 W2) — pure module.
 *
 * The zod schemas are the contract for BOTH the AI extractor output and
 * the accept step's server-side re-validation. AI output never touches a
 * real table: it becomes an ai_proposals row, and acceptance re-validates
 * here before materializing through the same actions as manual entry.
 */

export const EXTRACTOR_VERSION = "intake-v1"; // + model id at call time

const isoDate = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .optional();

export const budgetLineProposal = z.object({
  kind: z.literal("budget_line"),
  lineKind: z.enum(["income", "expense", "reserve"]),
  name: z.string().min(2).max(80),
  categoryKey: z.string().min(2).max(50),
  amountCents: z.number().int().positive(),
  frequency: z.enum(["weekly", "monthly", "quarterly", "yearly", "once"]),
  expectedDay: z.number().int().min(1).max(31).nullable().optional(),
  counterpartyName: z.string().max(120).nullable().optional(),
  counterpartyIban: z.string().max(34).nullable().optional(),
});

export const debtProposal = z.object({
  kind: z.literal("debt"),
  creditor: z.string().min(2).max(120),
  reference: z.string().max(60).nullable().optional(),
  currentAmountCents: z.number().int().positive(),
  originalAmountCents: z.number().int().positive().nullable().optional(),
  viaDeurwaarder: z.string().max(120).nullable().optional(),
});

export const contactProposal = z.object({
  kind: z.literal("contact"),
  contactKind: z.string().min(2).max(40), // gemeente | uwv | zorgverzekeraar | ...
  name: z.string().min(2).max(120),
  reference: z.string().max(60).nullable().optional(),
  email: z.string().max(120).nullable().optional(),
  phone: z.string().max(40).nullable().optional(),
});

export const accountOpeningProposal = z.object({
  kind: z.literal("account_opening_balance"),
  iban: z.string().min(15).max(34),
  bankName: z.string().max(80).nullable().optional(),
  accountType: z.enum(["beheer", "leefgeld", "spaar"]),
  openingBalanceCents: z.number().int(),
  openingBalanceDate: isoDate,
});

export const proposalPayload = z.discriminatedUnion("kind", [
  budgetLineProposal,
  debtProposal,
  contactProposal,
  accountOpeningProposal,
]);
export type ProposalPayload = z.infer<typeof proposalPayload>;

/** What the extractor returns per document: proposals + per-field verbatim
 *  source snippets (provenance) + confidence. */
export const extractionResult = z.object({
  proposals: z
    .array(
      z.object({
        payload: proposalPayload,
        /** field name → verbatim quote from the document it was read from */
        provenance: z.record(z.string(), z.string().max(300)),
        confidence: z.number().min(0).max(100),
      })
    )
    .max(12),
});
export type ExtractionResult = z.infer<typeof extractionResult>;

/**
 * MODEL-FACING schema: some providers' structured-output mode rejects
 * oneOf/discriminated unions, so the extractor sees a flat superset and
 * the server maps each item back into the STRICT union (`toProposalPayload`)
 * before anything is stored. Items that don't survive the strict contract
 * are dropped — never loosened.
 */
export const extractionItemFlat = z.object({
  kind: z.enum(["budget_line", "debt", "contact", "account_opening_balance"]),
  // budget_line
  lineKind: z.enum(["income", "expense", "reserve"]).nullable(),
  name: z.string().nullable(),
  categoryKey: z.string().nullable(),
  amountCents: z.number().nullable(),
  frequency: z
    .enum(["weekly", "monthly", "quarterly", "yearly", "once"])
    .nullable(),
  expectedDay: z.number().nullable(),
  counterpartyName: z.string().nullable(),
  counterpartyIban: z.string().nullable(),
  // debt
  creditor: z.string().nullable(),
  reference: z.string().nullable(),
  currentAmountCents: z.number().nullable(),
  originalAmountCents: z.number().nullable(),
  viaDeurwaarder: z.string().nullable(),
  // contact
  contactKind: z.string().nullable(),
  email: z.string().nullable(),
  phone: z.string().nullable(),
  // account
  iban: z.string().nullable(),
  bankName: z.string().nullable(),
  accountType: z.enum(["beheer", "leefgeld", "spaar"]).nullable(),
  openingBalanceCents: z.number().nullable(),
  openingBalanceDate: z.string().nullable(),
  /** array form — strict structured-output modes reject record schemas */
  provenance: z.array(z.object({ field: z.string(), snippet: z.string() })),
  confidence: z.number(),
});
export const extractionResultFlat = z.object({
  proposals: z.array(extractionItemFlat).max(12),
});
export type ExtractionItemFlat = z.infer<typeof extractionItemFlat>;

/** Normalize for snippet matching: collapse whitespace, lowercase. */
function norm(s: string): string {
  return s.replace(/\s+/g, " ").trim().toLowerCase();
}

/** Printed forms of an amount, WITH sign (Temujin PR-6 r2 #2): a source
 *  saying "€500" never supports a claimed −€500. */
function euroForms(cents: number): string[] {
  const abs = Math.abs(cents);
  const euros = Math.floor(abs / 100);
  const rest = String(abs % 100).padStart(2, "0");
  const bases = new Set([
    `${euros},${rest}`,
    `${euros}.${rest}`,
    `${euros.toLocaleString("nl-NL")},${rest}`, // 1.842,50
  ]);
  if (abs % 100 === 0) {
    bases.add(String(euros)); // "2.000" style often written without cents
    bases.add(euros.toLocaleString("nl-NL"));
  }
  if (cents < 0) {
    // Negative claims require a printed negative: -500,00 / 500,00- / −500,00
    const out = new Set<string>();
    for (const b of bases) {
      out.add(`-${b}`);
      out.add(`- ${b}`);
      out.add(`−${b}`);
      out.add(`${b}-`);
    }
    return [...out].map(norm);
  }
  return [...bases].map(norm);
}

/** How far apart (in normalized characters) two pieces of evidence may sit
 *  and still count as describing the same claim (multi-creditor documents
 *  must not cross-attach an amount to the wrong creditor). */
const EVIDENCE_LOCALITY_CHARS = 500;

export type ProvenanceVerdict = {
  verified: Record<string, string>;
  /** all material claims evidenced (with sign, and bound for debts) */
  ok: boolean;
  /** payload with unevidenced OPTIONAL claims stripped (never loosened —
   *  only removed) */
  sanitizedPayload: ProposalPayload;
};

/**
 * Provenance enforcement (Temujin PR-6 #2 + r2 #2):
 * 1. keep only snippets that actually occur in the source text
 *    (whitespace-normalized) — fabricated provenance is discarded;
 * 2. EVERY material value must be evidenced by a verified snippet in a
 *    plausible printed form INCLUDING SIGN;
 * 3. for debts, the amount evidence and the creditor evidence must sit
 *    within locality of each other in the source (same or adjacent lines);
 * 4. unevidenced OPTIONAL values (debt originalAmount/reference) are
 *    stripped from the payload rather than trusted.
 */
export function verifyProvenance(
  item: ExtractionItemFlat,
  payload: ProposalPayload,
  sourceText: string
): ProvenanceVerdict {
  const haystack = norm(sourceText);
  const verified: Record<string, string> = {};
  for (const p of item.provenance) {
    if (p.snippet.trim() && haystack.includes(norm(p.snippet))) {
      verified[p.field] = p.snippet.slice(0, 300);
    }
  }
  const snippets = Object.values(verified).map(norm);
  /** position (in the normalized source) of the first verified snippet
   *  containing any needle; null when unevidenced */
  const evidencePos = (needles: string[]): number | null => {
    for (const s of snippets) {
      if (needles.some((n) => s.includes(n))) {
        return haystack.indexOf(s);
      }
    }
    return null;
  };
  const amountEvidenced = (cents: number) => evidencePos(euroForms(cents));

  let ok = false;
  let sanitizedPayload: ProposalPayload = payload;

  switch (payload.kind) {
    case "budget_line":
      ok = amountEvidenced(payload.amountCents) !== null;
      break;
    case "contact":
      ok = evidencePos([norm(payload.name)]) !== null;
      break;
    case "account_opening_balance":
      ok = amountEvidenced(payload.openingBalanceCents) !== null;
      break;
    case "debt": {
      const posAmount = amountEvidenced(payload.currentAmountCents);
      const posCreditor = evidencePos([norm(payload.creditor)]);
      ok =
        posAmount !== null &&
        posCreditor !== null &&
        Math.abs(posAmount - posCreditor) <= EVIDENCE_LOCALITY_CHARS;
      if (ok) {
        const stripped = { ...payload };
        if (
          stripped.originalAmountCents != null &&
          amountEvidenced(stripped.originalAmountCents) === null
        ) {
          stripped.originalAmountCents = null;
        }
        if (
          stripped.reference != null &&
          evidencePos([norm(stripped.reference)]) === null
        ) {
          stripped.reference = null;
        }
        sanitizedPayload = stripped;
      }
      break;
    }
  }
  return { verified, ok, sanitizedPayload };
}

/** Map a flat model item into the strict payload contract; null when it
 *  does not survive strict validation. */
export function toProposalPayload(
  item: ExtractionItemFlat
): ProposalPayload | null {
  const int = (v: number | null | undefined) =>
    typeof v === "number" && Number.isFinite(v) ? Math.round(v) : null;
  let candidate: Record<string, unknown>;
  switch (item.kind) {
    case "budget_line":
      candidate = {
        kind: "budget_line",
        lineKind: item.lineKind,
        name: item.name,
        categoryKey: item.categoryKey,
        amountCents: int(item.amountCents),
        frequency: item.frequency,
        expectedDay: int(item.expectedDay),
        counterpartyName: item.counterpartyName,
        counterpartyIban: item.counterpartyIban,
      };
      break;
    case "debt":
      candidate = {
        kind: "debt",
        creditor: item.creditor,
        reference: item.reference,
        currentAmountCents: int(item.currentAmountCents),
        originalAmountCents: int(item.originalAmountCents),
        viaDeurwaarder: item.viaDeurwaarder,
      };
      break;
    case "contact":
      candidate = {
        kind: "contact",
        contactKind: item.contactKind,
        name: item.name,
        reference: item.reference,
        email: item.email,
        phone: item.phone,
      };
      break;
    case "account_opening_balance":
      candidate = {
        kind: "account_opening_balance",
        iban: item.iban,
        bankName: item.bankName,
        accountType: item.accountType,
        openingBalanceCents: int(item.openingBalanceCents),
        openingBalanceDate: item.openingBalanceDate ?? undefined,
      };
      break;
  }
  const parsed = proposalPayload.safeParse(candidate);
  return parsed.success ? parsed.data : null;
}

/** Canonical hash for idempotency: stable key order, then sha256. */
export function payloadHash(payload: ProposalPayload): string {
  const canonical = JSON.stringify(
    payload,
    Object.keys(payload as Record<string, unknown>).sort()
  );
  return createHash("sha256").update(canonical).digest("hex");
}

// ---------- Boedelbeschrijving completeness (pure) ----------

export type IntakeSnapshot = {
  accounts: { type: string; openingBalanceCents: number | null; openingBalanceDate: string | null }[];
  incomeLines: number;
  expenseLines: number;
  debts: number;
  schuldenbewind: boolean;
  contactsTotal: number;
  contactsNotified: number;
  inboedelNoteSet: boolean;
  leefgeldSet: boolean;
  pvaGoalsSet: boolean;
  pvaDebtStrategySet: boolean;
};

export type ChecklistItem = {
  key: string;
  done: boolean;
  /** applies=false → not required for this dossier (e.g. debt plan without
   *  schuldenbewind) and excluded from the completeness ratio */
  applies: boolean;
};

export function boedelChecklist(s: IntakeSnapshot): ChecklistItem[] {
  const beheer = s.accounts.some(
    (a) => a.type === "beheer" && a.openingBalanceDate !== null
  );
  return [
    { key: "beheer_account_opening", done: beheer, applies: true },
    { key: "income_recorded", done: s.incomeLines > 0, applies: true },
    { key: "fixed_costs_recorded", done: s.expenseLines > 0, applies: true },
    {
      key: "debts_recorded",
      done: s.debts > 0,
      applies: s.schuldenbewind, // without schuldenbewind, debts may be zero
    },
    {
      key: "contacts_notified",
      done: s.contactsTotal > 0 && s.contactsNotified === s.contactsTotal,
      applies: true,
    },
    { key: "inboedel_described", done: s.inboedelNoteSet, applies: true },
    { key: "leefgeld_agreed", done: s.leefgeldSet, applies: true },
    { key: "pva_goals", done: s.pvaGoalsSet, applies: true },
    {
      key: "pva_debt_strategy",
      done: s.pvaDebtStrategySet,
      applies: s.schuldenbewind,
    },
  ];
}

export function completeness(items: ChecklistItem[]): {
  done: number;
  total: number;
} {
  const applicable = items.filter((i) => i.applies);
  return {
    done: applicable.filter((i) => i.done).length,
    total: applicable.length,
  };
}
