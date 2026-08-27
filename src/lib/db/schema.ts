import {
  pgTable,
  text,
  integer,
  timestamp,
  boolean,
  jsonb,
  date,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import { createId } from "@paralleldrive/cuid2";

// ---------- Actors (auth foundation, plan os-v1 W0) ----------
//
// One row per human who can act in Frank. In clerk mode rows are linked to
// Clerk users (clerkUserId); in dev mode they are seeded demo identities.
// Role/vier-ogen invariants are enforced against THIS table server-side,
// identically in both modes.

export const actors = pgTable(
  "actors",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    clerkUserId: text("clerk_user_id"), // null in dev mode
    email: text("email").notNull(),
    name: text("name").notNull(),
    role: text("role", { enum: ["bewindvoerder", "assistent"] })
      .notNull()
      .default("assistent"),
    active: boolean("active").notNull().default(true),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("actors_clerk_unique").on(t.clerkUserId),
    uniqueIndex("actors_email_unique").on(t.email),
  ]
);

// ---------- Dossiers ----------

export const dossiers = pgTable("dossiers", {
  id: text("id").primaryKey().$defaultFn(createId),
  // Person (ALL DATA SYNTHETIC until auth exists — demo-only deployment)
  firstName: text("first_name").notNull(),
  lastName: text("last_name").notNull(),
  initials: text("initials"),
  dateOfBirth: date("date_of_birth"),
  bsn: text("bsn"), // synthetic only; masked in AI calls
  addressStreet: text("address_street"),
  addressPostcode: text("address_postcode"),
  addressCity: text("address_city"),
  gemeente: text("gemeente"),
  phone: text("phone"),
  email: text("email"),
  language: text("language").notNull().default("nl"), // client communication language
  // Measure
  regime: text("regime", {
    enum: ["bewind", "curatele", "mentorschap", "bewind_mentorschap"],
  }).notNull(),
  grondslag: text("grondslag", {
    enum: ["geestelijk_lichamelijk", "schulden", "verkwisting"],
  }).notNull(),
  schuldenbewind: boolean("schuldenbewind").notNull().default(false),
  rechtbank: text("rechtbank"),
  zaaknummer: text("zaaknummer"),
  beschikkingDate: date("beschikking_date"), // date of court order
  startDate: date("start_date"), // start of measure (day after beschikking usually)
  // Court reporting schedule — explicit, never inferred (Temujin #4)
  rvScheduleMonth: integer("rv_schedule_month"), // 1-12; month the R&V is due per court instruction
  rvScheduleConfirmed: boolean("rv_schedule_confirmed").notNull().default(false),
  status: text("status", {
    enum: [
      "aanmelding",
      "intake",
      "aangevraagd",
      "actief",
      "uitstroom",
      "overleden",
      "afgesloten",
    ],
  })
    .notNull()
    .default("aanmelding"),
  // Intake werkdocumenten (plan os-v1 W2): free-text sections maintained on
  // the dossier, code-assembled into boedelbeschrijving / plan van aanpak.
  inboedelNote: text("inboedel_note"),
  pvaGoals: text("pva_goals"),
  pvaAgreements: text("pva_agreements"),
  pvaDebtStrategy: text("pva_debt_strategy"), // schuldenbewind supplement
  // Beloning category override (plan os-v1 W5): normally derived from
  // regime + schuldenbewind; an override requires an audited reason.
  feeCategory: text("fee_category"),
  feeCategoryReason: text("fee_category_reason"),
  /** end of the measure, for pro-rated beloning */
  endDate: date("end_date"),
  leefgeldAmountCents: integer("leefgeld_amount_cents"),
  leefgeldFrequency: text("leefgeld_frequency", {
    enum: ["weekly", "monthly"],
  }).default("weekly"),
  notes: text("notes"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const accounts = pgTable("accounts", {
  id: text("id").primaryKey().$defaultFn(createId),
  // Durable idempotent-materialization key (Temujin PR-6 r2 #1): set
  // when this row was created by accepting an AI proposal; retries find
  // the existing row instead of duplicating.
  sourceProposalId: text("source_proposal_id"),

  dossierId: text("dossier_id")
    .notNull()
    .references(() => dossiers.id),
  type: text("type", { enum: ["beheer", "leefgeld", "spaar"] }).notNull(),
  iban: text("iban").notNull(),
  bankName: text("bank_name"),
  openingBalanceCents: integer("opening_balance_cents").notNull().default(0),
  openingBalanceDate: date("opening_balance_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const contacts = pgTable("contacts", {
  id: text("id").primaryKey().$defaultFn(createId),
  // Durable idempotent-materialization key (Temujin PR-6 r2 #1): set
  // when this row was created by accepting an AI proposal; retries find
  // the existing row instead of duplicating.
  sourceProposalId: text("source_proposal_id"),

  dossierId: text("dossier_id")
    .notNull()
    .references(() => dossiers.id),
  kind: text("kind").notNull(), // gemeente | belastingdienst | uwv | svb | zorgverzekeraar | energie | woningcorporatie | cak | waterschap | deurwaarder | werkgever | overig
  name: text("name").notNull(),
  reference: text("reference"), // klantnummer / kenmerk
  email: text("email"),
  phone: text("phone"),
  addressLines: text("address_lines"),
  notified: boolean("notified").notNull().default(false), // aanschrijven done?
  notes: text("notes"),
});

export const debts = pgTable("debts", {
  id: text("id").primaryKey().$defaultFn(createId),
  // Durable idempotent-materialization key (Temujin PR-6 r2 #1): set
  // when this row was created by accepting an AI proposal; retries find
  // the existing row instead of duplicating.
  sourceProposalId: text("source_proposal_id"),

  dossierId: text("dossier_id")
    .notNull()
    .references(() => dossiers.id),
  creditor: text("creditor").notNull(),
  reference: text("reference"),
  originalAmountCents: integer("original_amount_cents").notNull(),
  currentAmountCents: integer("current_amount_cents").notNull(),
  status: text("status", {
    enum: ["open", "regeling", "betwist", "afgelost", "msnp", "wsnp"],
  })
    .notNull()
    .default("open"),
  monthlyPaymentCents: integer("monthly_payment_cents"),
  viaDeurwaarder: text("via_deurwaarder"),
  notes: text("notes"),
});

// ---------- Debt events (plan os-v1 W4, Temujin round-2 note) ----------
//
// Debt balances change ONLY through these audited, provenance-bearing
// events — never on pain.001 export (an export file proves nothing was
// executed). debts.currentAmountCents is an EXPLICITLY AUDITED CACHE:
// every event insert transactionally updates it through ONE chokepoint
// (lib/actions/debts.ts applyDebtEvent) and writes an audit event.
//
// deltaCents is SIGNED: a payment or waiver REDUCES the debt (negative
// delta); added costs/interest increase it (positive delta).

export const debtEvents = pgTable(
  "debt_events",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    debtId: text("debt_id")
      .notNull()
      .references(() => debts.id),
    kind: text("kind", {
      enum: ["payment_reconciled", "creditor_statement", "correction"],
    }).notNull(),
    deltaCents: integer("delta_cents").notNull(),
    /** payment_reconciled: the imported CAMT transaction that proves the
     *  payment. UNIQUE — one transaction can settle a debt at most once. */
    sourceTransactionId: text("source_transaction_id").references(
      () => transactions.id
    ),
    /** creditor_statement: the saldo-opgave document that proves the new
     *  balance (required for that kind, enforced in the action). */
    sourceDocumentId: text("source_document_id").references(() => documents.id),
    /** How the underlying bank fact reached Frank (Temujin PR-7 gate A):
     *  camt_import = machine-read from a bank file; manual_entry = a human
     *  transcribed it from a statement. Both are allowed evidence, but the
     *  distinction is recorded, never blurred. */
    sourceProvenance: text("source_provenance", {
      enum: ["camt_import", "manual_entry", "document", "human_assertion"],
    }),
    note: text("note"),
    actorId: text("actor_id").notNull(), // human, or "system" for reconciliation
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("debt_events_tx_unique").on(t.sourceTransactionId),
    index("debt_events_debt").on(t.debtId, t.createdAt),
  ]
);

export const debtEventsRelations = relations(debtEvents, ({ one }) => ({
  debt: one(debts, { fields: [debtEvents.debtId], references: [debts.id] }),
}));

// ---------- R&V periods (plan os-v1 W3) ----------
//
// The court sets the reporting period; Frank records it, never infers it
// (Temujin PR-5 #4). Bespreking/signature facts per the official LOV R&V
// form are human-entered here.

export const rvPeriods = pgTable(
  "rv_periods",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id),
    periodStart: date("period_start").notNull(),
    periodEnd: date("period_end").notNull(),
    /** bespreking met betrokkene (official form): date + outcome */
    besprekingDate: date("bespreking_date"),
    besprekingOutcome: text("bespreking_outcome", {
      enum: ["understood", "not_understood", "not_possible"],
    }),
    signedStatus: text("signed_status", {
      enum: ["signed", "declined", "pending"],
    })
      .notNull()
      .default("pending"),
    note: text("note"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [uniqueIndex("rv_periods_unique").on(t.dossierId, t.periodEnd)]
);

export const rvPeriodsRelations = relations(rvPeriods, ({ one }) => ({
  dossier: one(dossiers, {
    fields: [rvPeriods.dossierId],
    references: [dossiers.id],
  }),
}));

// ---------- Budget ----------

export const budgetLines = pgTable("budget_lines", {
  id: text("id").primaryKey().$defaultFn(createId),
  // Durable idempotent-materialization key (Temujin PR-6 r2 #1): set
  // when this row was created by accepting an AI proposal; retries find
  // the existing row instead of duplicating.
  sourceProposalId: text("source_proposal_id"),

  dossierId: text("dossier_id")
    .notNull()
    .references(() => dossiers.id),
  kind: text("kind", { enum: ["income", "expense", "reserve"] }).notNull(),
  name: text("name").notNull(),
  categoryKey: text("category_key").notNull(), // canonical category taxonomy
  amountCents: integer("amount_cents").notNull(),
  frequency: text("frequency", {
    enum: ["weekly", "monthly", "quarterly", "yearly", "once"],
  }).notNull(),
  expectedDay: integer("expected_day"), // day-of-month payment/receipt expected
  counterpartyName: text("counterparty_name"),
  counterpartyIban: text("counterparty_iban"),
  // Identifiable single purpose per LOVT B.D3 (e.g. "inboedel-2026",
  // "rijlessen"). Set => discretionary purchase semantics: the machtiging
  // guard aggregates this year's spend on the SAME purpose toward €2,000.
  // Null => contractual fixed last (regular_bill, never amount-triggered).
  purposeTag: text("purpose_tag"),
  // Betalingsregeling link (plan os-v1 W4): payments on this line service
  // this debt; reconciliation matches imported transactions to it.
  debtId: text("debt_id").references(() => debts.id),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Transactions & imports ----------

export const imports = pgTable("imports", {
  id: text("id").primaryKey().$defaultFn(createId),
  accountId: text("account_id")
    .notNull()
    .references(() => accounts.id),
  filename: text("filename").notNull(),
  format: text("format", { enum: ["camt053", "csv", "manual"] }).notNull(),
  fileHash: text("file_hash").notNull(), // sha256 of raw content — idempotency at file level
  rawContent: text("raw_content").notNull(), // immutable original (Temujin #5)
  stats: jsonb("stats").$type<{
    total: number;
    imported: number;
    duplicates: number;
    errors: string[];
  }>(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const transactions = pgTable(
  "transactions",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    accountId: text("account_id")
      .notNull()
      .references(() => accounts.id),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id),
    bookingDate: date("booking_date").notNull(),
    amountCents: integer("amount_cents").notNull(), // signed: negative = debit
    counterpartyName: text("counterparty_name"),
    counterpartyIban: text("counterparty_iban"),
    description: text("description"),
    endToEndId: text("end_to_end_id"),
    categoryKey: text("category_key"),
    categorySource: text("category_source", {
      enum: ["rule", "ai", "human"],
    }),
    categoryConfidence: integer("category_confidence"), // 0-100, for AI
    budgetLineId: text("budget_line_id").references(() => budgetLines.id),
    importId: text("import_id").references(() => imports.id),
    dedupeHash: text("dedupe_hash").notNull(), // uniqueness invariant
    reviewed: boolean("reviewed").notNull().default(false),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("tx_dedupe_unique").on(t.accountId, t.dedupeHash),
    index("tx_dossier_date").on(t.dossierId, t.bookingDate),
  ]
);

// ---------- Tasks (deadline provenance per Temujin #4, evidence per #9) ----------

export const tasks = pgTable(
  "tasks",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    dossierId: text("dossier_id").references(() => dossiers.id), // null = office-level
    titleKey: text("title_key").notNull(), // i18n key OR freeform below
    titleFree: text("title_free"),
    kind: text("kind").notNull(), // statutory | playbook | exception | manual | ai_proposal
    tier: text("tier", { enum: ["T1", "T2", "T3", "internal"] })
      .notNull()
      .default("internal"),
    // Deadline provenance
    legalSource: text("legal_source"), // e.g. "art. 1:436 BW; LOVT B.B1"
    basisDate: date("basis_date"), // date the deadline is computed from
    calculationVersion: text("calculation_version"),
    dueDate: date("due_date"),
    deadlineConfirmed: boolean("deadline_confirmed").notNull().default(false),
    // State machine: open → prepared → submitted → confirmed (or done for internal)
    status: text("status", {
      enum: ["open", "prepared", "submitted", "confirmed", "done", "cancelled"],
    })
      .notNull()
      .default("open"),
    checklist: jsonb("checklist").$type<
      { key: string; label: string; done: boolean }[]
    >(),
    playbookKey: text("playbook_key"),
    linkedEntityType: text("linked_entity_type"),
    linkedEntityId: text("linked_entity_id"),
    assignee: text("assignee").notNull().default("demo-user"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (t) => [index("tasks_due").on(t.status, t.dueDate)]
);

export const taskEvents = pgTable("task_events", {
  id: text("id").primaryKey().$defaultFn(createId),
  taskId: text("task_id")
    .notNull()
    .references(() => tasks.id),
  transition: text("transition").notNull(), // e.g. open→prepared
  method: text("method"), // portal | letter | phone | file_export | internal
  performedBy: text("performed_by").notNull(),
  evidenceDocumentId: text("evidence_document_id"),
  evidenceNote: text("evidence_note"),
  followUpDate: date("follow_up_date"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Documents (inbox + archive) ----------

export const documents = pgTable("documents", {
  id: text("id").primaryKey().$defaultFn(createId),
  dossierId: text("dossier_id").references(() => dossiers.id), // null until linked
  filename: text("filename").notNull(),
  mime: text("mime").notNull(),
  sizeBytes: integer("size_bytes").notNull(),
  sha256: text("sha256").notNull(), // hash from day one (Temujin §8-4)
  contentBase64: text("content_base64"), // demo storage; Blob/evidence-grade in P1
  textContent: text("text_content"), // extracted text for AI/search
  classification: text("classification"), // factuur | aanmaning | beschikking_toeslag | beschikking_gemeente | exploot | polis | loonstrook | bankafschrift | brief_rechtbank | overig
  classificationSource: text("classification_source", {
    enum: ["ai", "human"],
  }),
  classificationConfidence: integer("classification_confidence"),
  extracted: jsonb("extracted").$type<{
    sender?: string;
    date?: string;
    amountCents?: number;
    iban?: string;
    kenmerk?: string;
    deadline?: string;
    summary?: string;
  }>(),
  status: text("status", {
    enum: ["new", "triaged", "linked", "archived"],
  })
    .notNull()
    .default("new"),
  proposedAction: text("proposed_action"),
  uploadedAt: timestamp("uploaded_at").notNull().defaultNow(),
});

// ---------- AI intake proposals (plan os-v1 W2) ----------
//
// AI NEVER writes to real tables. Extraction lands here as proposals;
// accepting one materializes the real row through the SAME server actions
// as manual entry (same validation, same audit), with the audit carrying
// proposal id + source document hash. Idempotent per
// (document, kind, payloadHash, extractorVersion) — re-running extraction
// never duplicates proposals.

export const aiProposals = pgTable(
  "ai_proposals",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    dossierId: text("dossier_id")
      .notNull()
      .references(() => dossiers.id),
    sourceDocumentId: text("source_document_id")
      .notNull()
      .references(() => documents.id),
    /** Immutable copy of the source document's hash at extraction time —
     *  provenance must not depend on a mutable relation (Temujin PR-6 #4). */
    sourceDocumentSha256: text("source_document_sha256").notNull().default(""),
    /** Which agent produced this proposal (plan os-v2 PR-8). Null on rows
     *  predating the agent runtime; new proposals always carry it. */
    agentKey: text("agent_key"),
    kind: text("kind", {
      enum: ["budget_line", "debt", "contact", "account_opening_balance"],
    }).notNull(),
    payload: jsonb("payload").notNull().$type<Record<string, unknown>>(),
    /** Per extracted field: the verbatim source snippet it came from. */
    fieldProvenance: jsonb("field_provenance").$type<Record<string, string>>(),
    confidence: integer("confidence"), // 0-100
    extractorVersion: text("extractor_version").notNull(), // model + prompt version
    payloadHash: text("payload_hash").notNull(),
    status: text("status", {
      enum: ["proposed", "accepting", "accepted", "rejected"],
    })
      .notNull()
      .default("proposed"),
    /** Exclusive lease on `accepting` (Temujin PR-6 r3 #1): the claim
     *  writes a fresh token + timestamp; finalisation requires the same
     *  token; a stale lease may be re-claimed only after expiry. */
    claimToken: text("claim_token"),
    claimedAt: timestamp("claimed_at"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at"),
    /** Entity created on acceptance (audit cross-reference). */
    resultEntityId: text("result_entity_id"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("ai_proposals_idempotent").on(
      t.sourceDocumentId,
      t.kind,
      t.payloadHash,
      t.extractorVersion
    ),
    index("ai_proposals_dossier").on(t.dossierId, t.status),
  ]
);

export const aiProposalsRelations = relations(aiProposals, ({ one }) => ({
  dossier: one(dossiers, {
    fields: [aiProposals.dossierId],
    references: [dossiers.id],
  }),
  sourceDocument: one(documents, {
    fields: [aiProposals.sourceDocumentId],
    references: [documents.id],
  }),
}));

// ---------- Letters & filings ----------

export const letters = pgTable("letters", {
  id: text("id").primaryKey().$defaultFn(createId),
  dossierId: text("dossier_id")
    .notNull()
    .references(() => dossiers.id),
  templateKey: text("template_key").notNull(),
  recipientContactId: text("recipient_contact_id").references(() => contacts.id),
  recipientName: text("recipient_name"),
  subject: text("subject").notNull(),
  body: text("body").notNull(), // ALWAYS Dutch for official letters
  language: text("language").notNull().default("nl"),
  status: text("status", { enum: ["draft", "approved", "sent"] })
    .notNull()
    .default("draft"),
  approvedBy: text("approved_by"),
  sentAt: timestamp("sent_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Payments ----------

export const paymentBatches = pgTable("payment_batches", {
  id: text("id").primaryKey().$defaultFn(createId),
  name: text("name").notNull(),
  executionDate: date("execution_date").notNull(), // already feestdag-shifted
  status: text("status", {
    enum: ["draft", "approved", "exported", "cancelled"],
  })
    .notNull()
    .default("draft"),
  // Vier-ogen (plan os-v1 W0): with >1 active bewindvoerder, the approver
  // must differ from the creator — enforced server-side against these ids.
  createdBy: text("created_by"),
  approvedBy: text("approved_by"),
  approvedAt: timestamp("approved_at"),
  exportedAt: timestamp("exported_at"),
  exportFilename: text("export_filename"),
  demoExport: boolean("demo_export").notNull().default(true), // hard-disabled real export outside configured prod
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const paymentItems = pgTable("payment_items", {
  id: text("id").primaryKey().$defaultFn(createId),
  batchId: text("batch_id")
    .notNull()
    .references(() => paymentBatches.id),
  dossierId: text("dossier_id")
    .notNull()
    .references(() => dossiers.id),
  debtorAccountId: text("debtor_account_id")
    .notNull()
    .references(() => accounts.id),
  creditorName: text("creditor_name").notNull(),
  creditorIban: text("creditor_iban").notNull(),
  amountCents: integer("amount_cents").notNull(), // always positive
  remittanceInfo: text("remittance_info"),
  budgetLineId: text("budget_line_id").references(() => budgetLines.id),
  // Machtiging guard — a legal-review flag, never a legal conclusion (Temujin #6)
  machtigingFlag: jsonb("machtiging_flag").$type<{
    triggered: boolean;
    reasons: string[];
    resolution?: "consent_recorded" | "court_authorization" | "not_applicable";
    rationale?: string;
    resolvedBy?: string;
    resolvedAt?: string;
  }>(),
  validationErrors: jsonb("validation_errors").$type<string[]>(),
  // Deliberate-approve flow (design handoff): soft-exclude, held for court
  // authorisation. Server-side invariant, not UI state (Temujin guardrail 2).
  excluded: boolean("excluded").notNull().default(false),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Signals (plan os-v1 W1) ----------
//
// Materialized pointers with a lifecycle — NEVER authoritative state.
// Computed by pure detectors (src/lib/domain/signals.ts) via an
// event-triggered refresh; never mutated during page render. A dismissed
// signal reopens only after its condition clears and then recurs.

export const signals = pgTable(
  "signals",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    detectorKey: text("detector_key").notNull(),
    detectorVersion: text("detector_version").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    dossierId: text("dossier_id").references(() => dossiers.id),
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    severity: text("severity", { enum: ["red", "amber", "info"] }).notNull(),
    status: text("status", { enum: ["open", "dismissed", "resolved"] })
      .notNull()
      .default("open"),
    payload: jsonb("payload").$type<Record<string, string | number>>(),
    computedAt: timestamp("computed_at").notNull(),
    firstSeenAt: timestamp("first_seen_at").notNull(),
    lastSeenAt: timestamp("last_seen_at").notNull(),
    resolvedAt: timestamp("resolved_at"),
    dismissedBy: text("dismissed_by"),
    dismissedReason: text("dismissed_reason"),
    dismissedAt: timestamp("dismissed_at"),
  },
  (t) => [
    uniqueIndex("signals_dedupe_unique").on(t.dedupeKey),
    index("signals_status").on(t.status, t.severity),
  ]
);

export const signalsRelations = relations(signals, ({ one }) => ({
  dossier: one(dossiers, {
    fields: [signals.dossierId],
    references: [dossiers.id],
  }),
}));

// ---------- Time entries (plan os-v1 W5) ----------
//
// Tijdschrijven feeds the office capacity view. `source` distinguishes a
// hand-logged entry from one accepted out of a suggestion — suggestions
// are OFFERED after substantial actions, never auto-logged.

export const timeEntries = pgTable(
  "time_entries",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    dossierId: text("dossier_id").references(() => dossiers.id), // null = office-level
    actorId: text("actor_id").notNull(),
    date: date("date").notNull(),
    minutes: integer("minutes").notNull(),
    activityKey: text("activity_key").notNull(),
    note: text("note"),
    source: text("source", { enum: ["manual", "suggested"] })
      .notNull()
      .default("manual"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("time_entries_dossier").on(t.dossierId, t.date)]
);

export const timeEntriesRelations = relations(timeEntries, ({ one }) => ({
  dossier: one(dossiers, {
    fields: [timeEntries.dossierId],
    references: [dossiers.id],
  }),
}));

// ---------- Audit (Temujin #7) ----------

export const auditEvents = pgTable(
  "audit_events",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    actorId: text("actor_id").notNull(), // "demo-user" until auth
    actorType: text("actor_type", {
      enum: ["human", "agent", "system"],
    }).notNull(),
    action: text("action").notNull(), // create | update | approve | export | download | ai_call | transition
    entityType: text("entity_type").notNull(),
    entityId: text("entity_id").notNull(),
    versionBefore: jsonb("version_before"),
    versionAfter: jsonb("version_after"),
    correlationId: text("correlation_id"),
    approvalId: text("approval_id"),
    sourceDocumentHash: text("source_document_hash"),
    reason: text("reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [index("audit_entity").on(t.entityType, t.entityId)]
);

// ---------- AI gateway log ----------

export const aiCalls = pgTable("ai_calls", {
  id: text("id").primaryKey().$defaultFn(createId),
  purpose: text("purpose").notNull(), // classify | extract | categorize | draft | copilot
  /** Which agent spent this (plan os-v2 PR-8). Null = human-invoked call
   *  such as the copilot, which runs as the human, not as an agent. */
  agentKey: text("agent_key"),
  model: text("model").notNull(),
  promptVersion: text("prompt_version").notNull(),
  dataClass: text("data_class").notNull(), // synthetic_demo (only value until auth)
  inputTokens: integer("input_tokens"),
  outputTokens: integer("output_tokens"),
  ok: boolean("ok").notNull(),
  error: text("error"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

// ---------- Relations ----------

export const dossiersRelations = relations(dossiers, ({ many }) => ({
  accounts: many(accounts),
  contacts: many(contacts),
  budgetLines: many(budgetLines),
  transactions: many(transactions),
  tasks: many(tasks),
  documents: many(documents),
  letters: many(letters),
  debts: many(debts),
}));

export const accountsRelations = relations(accounts, ({ one, many }) => ({
  dossier: one(dossiers, {
    fields: [accounts.dossierId],
    references: [dossiers.id],
  }),
  transactions: many(transactions),
}));

export const transactionsRelations = relations(transactions, ({ one }) => ({
  account: one(accounts, {
    fields: [transactions.accountId],
    references: [accounts.id],
  }),
  dossier: one(dossiers, {
    fields: [transactions.dossierId],
    references: [dossiers.id],
  }),
  budgetLine: one(budgetLines, {
    fields: [transactions.budgetLineId],
    references: [budgetLines.id],
  }),
}));

export const tasksRelations = relations(tasks, ({ one, many }) => ({
  dossier: one(dossiers, {
    fields: [tasks.dossierId],
    references: [dossiers.id],
  }),
  events: many(taskEvents),
}));

export const taskEventsRelations = relations(taskEvents, ({ one }) => ({
  task: one(tasks, { fields: [taskEvents.taskId], references: [tasks.id] }),
}));

export const budgetLinesRelations = relations(budgetLines, ({ one }) => ({
  dossier: one(dossiers, {
    fields: [budgetLines.dossierId],
    references: [dossiers.id],
  }),
}));

export const paymentBatchesRelations = relations(
  paymentBatches,
  ({ many }) => ({
    items: many(paymentItems),
  })
);

export const paymentItemsRelations = relations(paymentItems, ({ one }) => ({
  batch: one(paymentBatches, {
    fields: [paymentItems.batchId],
    references: [paymentBatches.id],
  }),
  dossier: one(dossiers, {
    fields: [paymentItems.dossierId],
    references: [dossiers.id],
  }),
  debtorAccount: one(accounts, {
    fields: [paymentItems.debtorAccountId],
    references: [accounts.id],
  }),
}));

export const documentsRelations = relations(documents, ({ one }) => ({
  dossier: one(dossiers, {
    fields: [documents.dossierId],
    references: [dossiers.id],
  }),
}));

export const lettersRelations = relations(letters, ({ one }) => ({
  dossier: one(dossiers, {
    fields: [letters.dossierId],
    references: [dossiers.id],
  }),
}));

export const debtsRelations = relations(debts, ({ one }) => ({
  dossier: one(dossiers, {
    fields: [debts.dossierId],
    references: [dossiers.id],
  }),
}));

export const contactsRelations = relations(contacts, ({ one }) => ({
  dossier: one(dossiers, {
    fields: [contacts.dossierId],
    references: [dossiers.id],
  }),
}));

// ---------- Channels, messages, obligations (plan os-v2 W1 / PR-9) ----------
//
// The DRIVER layer. os-v1 had no way for anything to ARRIVE: a human
// uploaded a document. Curators live in email, so every inbound item — mail,
// scanned post, portal, bank — lands here as a `message`, is resolved to a
// dossier with recorded evidence, and becomes an `obligation`.
//
// N6: the only adapter in this build is a SIMULATED one over synthetic data.
// No real mailbox, bank or client contact.

export const channels = pgTable("channels", {
  id: text("id").primaryKey().$defaultFn(createId),
  kind: text("kind", {
    enum: ["email", "post", "portal", "bank", "client_app"],
  }).notNull(),
  label: text("label").notNull(),
  /** Only "simulated" exists in this build; the column is here so a real
   *  adapter is a new value rather than a schema change. */
  adapter: text("adapter").notNull().default("simulated"),
  active: boolean("active").notNull().default(true),
  lastSyncAt: timestamp("last_sync_at"),
});

export const messages = pgTable(
  "messages",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    channelId: text("channel_id")
      .notNull()
      .references(() => channels.id),
    /** Idempotent ingest: re-pulling a mailbox must never duplicate. */
    externalId: text("external_id").notNull(),
    threadKey: text("thread_key"),
    direction: text("direction", { enum: ["inbound", "outbound"] })
      .notNull()
      .default("inbound"),
    fromName: text("from_name"),
    fromAddress: text("from_address"),
    subject: text("subject"),
    bodyText: text("body_text"),
    receivedAt: timestamp("received_at").notNull(),
    rawSha256: text("raw_sha256").notNull(),

    dossierId: text("dossier_id").references(() => dossiers.id),
    resolutionConfidence: integer("resolution_confidence"), // 0-100
    /** WHY we think it is this dossier — per matcher, human-readable. */
    resolutionEvidence: jsonb("resolution_evidence").$type<
      { matcher: string; value: string }[]
    >(),
    /** An agent-written link is PROVISIONAL (plan os-v2 §2.1 category B):
     *  linkSource "agent" + linkReviewed false, shown as awaiting
     *  confirmation, and no dossier-dependent action may proceed on it. */
    linkSource: text("link_source", { enum: ["agent", "human"] }),
    linkReviewed: boolean("link_reviewed").notNull().default(false),

    status: text("status", {
      enum: ["new", "resolved", "needs_dossier", "archived"],
    })
      .notNull()
      .default("new"),
    /** Outbound only, and only ever set by a human decision (N2). */
    sentAt: timestamp("sent_at"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("messages_external_unique").on(t.channelId, t.externalId),
    index("messages_status").on(t.status, t.receivedAt),
  ]
);

export const messageAttachments = pgTable("message_attachments", {
  id: text("id").primaryKey().$defaultFn(createId),
  messageId: text("message_id")
    .notNull()
    .references(() => messages.id),
  documentId: text("document_id")
    .notNull()
    .references(() => documents.id),
});

/**
 * An obligation is what someone OUTSIDE demands of us, with a deadline and a
 * right answer. Distinct from `tasks`, which is our own internal work
 * (Temujin os-v2 r1): an obligation is externally sourced and evidential, and
 * it LINKS to tasks rather than duplicating their state.
 */
export const obligations = pgTable(
  "obligations",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    dossierId: text("dossier_id").references(() => dossiers.id),
    sourceMessageId: text("source_message_id")
      .notNull()
      .references(() => messages.id),
    sourceDocumentId: text("source_document_id").references(() => documents.id),
    kind: text("kind", {
      enum: [
        "payment_demand",
        "information_request",
        "court_filing",
        "decision_notice",
        "client_request",
        "appointment",
        "other",
      ],
    }).notNull(),
    summaryNl: text("summary_nl").notNull(),
    summaryEn: text("summary_en").notNull(),
    dueDate: date("due_date"),
    dueDateSource: text("due_date_source"),
    agentKey: text("agent_key"),
    /** Rule-check results. Every check ABSTAINS unless evidenced, so an
     *  empty array is the common and correct case. */
    findings: jsonb("findings").$type<Record<string, unknown>[]>(),
    proposedLetterId: text("proposed_letter_id").references(() => letters.id),
    proposedProposalIds: jsonb("proposed_proposal_ids").$type<string[]>(),
    status: text("status", {
      enum: ["open", "in_review", "actioned", "dismissed", "escalated"],
    })
      .notNull()
      .default("open"),
    decidedBy: text("decided_by"),
    decidedAt: timestamp("decided_at"),
    dismissReason: text("dismiss_reason"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("obligations_message_unique").on(t.sourceMessageId),
    index("obligations_status").on(t.status, t.dueDate),
  ]
);

/** Link, do not duplicate (Temujin os-v2 r1). */
export const obligationLinks = pgTable(
  "obligation_links",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    obligationId: text("obligation_id")
      .notNull()
      .references(() => obligations.id),
    targetType: text("target_type", { enum: ["task", "process_step"] }).notNull(),
    targetId: text("target_id").notNull(),
  },
  (t) => [uniqueIndex("obligation_link_unique").on(t.obligationId, t.targetType, t.targetId)]
);

export const messagesRelations = relations(messages, ({ one, many }) => ({
  channel: one(channels, {
    fields: [messages.channelId],
    references: [channels.id],
  }),
  dossier: one(dossiers, {
    fields: [messages.dossierId],
    references: [dossiers.id],
  }),
  attachments: many(messageAttachments),
}));

export const obligationsRelations = relations(obligations, ({ one }) => ({
  dossier: one(dossiers, {
    fields: [obligations.dossierId],
    references: [dossiers.id],
  }),
  sourceMessage: one(messages, {
    fields: [obligations.sourceMessageId],
    references: [messages.id],
  }),
}));

// ---------- Safeguarding (plan os-v2 W2 / PR-10) ----------
//
// Signals stay materialized POINTERS; durable casework lives here. A case is
// a protective work item about a real person's money — sometimes about their
// family, sometimes about this office — so it is deliberately heavier than a
// signal: immutable detector evidence, the client's own explanation as
// first-class content, and a disposition that only a human can make.
//
// N4: nothing here asserts fraud. N5: an office-scope case is IMMUTABLE to
// the actor it concerns, and where no independent reviewer exists it stays
// open rather than quietly closable.

export const safeguardingCases = pgTable(
  "safeguarding_cases",
  {
    id: text("id").primaryKey().$defaultFn(createId),
    detectorKey: text("detector_key").notNull(),
    detectorVersion: text("detector_version").notNull(),
    dedupeKey: text("dedupe_key").notNull(),
    scope: text("scope", { enum: ["client", "office"] }).notNull(),
    dossierId: text("dossier_id").references(() => dossiers.id),
    /** Office scope: the actor this case concerns, who may not dispose of it. */
    concernsActorId: text("concerns_actor_id"),
    severity: text("severity", { enum: ["red", "amber", "info"] }).notNull(),
    /** Immutable at open time — the facts the detector actually saw. */
    evidence: jsonb("evidence").$type<Record<string, unknown>>(),

    status: text("status", {
      enum: ["open", "clarifying", "explained", "resolved", "escalated"],
    })
      .notNull()
      .default("open"),

    /** The B1-Dutch question put to the client, and their answer. */
    clarificationMessageId: text("clarification_message_id").references(
      () => messages.id
    ),
    clientResponseMessageId: text("client_response_message_id").references(
      () => messages.id
    ),

    dispositionReason: text("disposition_reason"),
    dispositionBy: text("disposition_by"),
    dispositionAt: timestamp("disposition_at"),

    escalationGround: text("escalation_ground"),
    escalationDestination: text("escalation_destination"),
    escalationDocumentId: text("escalation_document_id").references(
      () => letters.id
    ),

    agentKey: text("agent_key"),
    openedAt: timestamp("opened_at").notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("safeguarding_dedupe_unique").on(t.dedupeKey),
    index("safeguarding_status").on(t.status, t.severity),
  ]
);

export const safeguardingCasesRelations = relations(
  safeguardingCases,
  ({ one }) => ({
    dossier: one(dossiers, {
      fields: [safeguardingCases.dossierId],
      references: [dossiers.id],
    }),
  })
);
