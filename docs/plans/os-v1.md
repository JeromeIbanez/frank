# Plan: Frank OS v1 — from vertical slice to operating system

Status: **APPROVED (Temujin, round 2)** · Author: Claude · Reviewer: Temujin · Date: 2026-08-26

Round-2 notes to carry forward (Temujin):
- `debt_events` (W4): define signs + idempotency precisely before building —
  unique `sourceTransactionId` on `payment_reconciled`; require correct
  debit direction and debtor/creditor IBAN relationship; manual provenance-
  bearing path for partial/combined payments; `currentAmountCents` either
  fully derived on read OR an explicitly audited cache — never ambiguously
  both.
- Migrations ship with their feature PR, not front-loaded in PR-1
  (Foundation carries only auth/actor/audit/data-boundary schema).
- PR-4 gets two separate review gates: R&V/debts and office/fees, even on
  one delivery branch.
Directive from Jerome: "I want it to be as close to a real operating system as
possible. Create the plan to make it happen, review it with Temujin, then
implement it."

Round-1 review (Temujin): REVISE — 5 changes + PR split. All adopted; deltas
marked **[R1-n]**.

## 1. Diagnosis — what "not yet an OS" means concretely

The MVP proves the hardest loop (proposals → machtiging guard → deliberate
approve → pain.001) with real invariants and audit. What it lacks to be the
tool a bewindvoerder opens at 08:30 and lives in all day:

1. **No hallway.** Money movements, arrived documents, missed expected
   income, low leefgeld balances, and open legal flags are scattered across
   screens; nothing composes them into "here is what needs you, in order."
2. **Onboarding is hand-typed.** Intake → boedelbeschrijving (art. 1:436
   BW, 4 months) has upload + classification but extraction never lands:
   budget lines, debts, contacts are all manual. Highest-value AI surface.
3. **Court deliverables are shallow.** R&V pack misses schuldenverloop,
   beloning, the dossier's real reporting period, official-form mapping,
   and real attachments. No boedelbeschrijving or plan van aanpak document.
4. **Schulden barely surfaced** despite most bewind being schuldenbewind.
5. **No agency layer** — the tariff-cap thesis is invisible: no
   tijdschrijven, no fee engine, no hours-vs-fee view.
6. **One anonymous actor** — no auth, so vier-ogen and audit-REVOKE are
   unenforceable. **[R1-1: this is a prerequisite, not a later workstream.]**

## 2. Workstreams (build order)

### W0. Foundation: auth, actors, data boundary **[R1-1: moved first]**

- Clerk auth (PRD P1), middleware-protected app; all server actions resolve
  `currentActor()` from the session; audit gains real actor ids.
- Roles: `bewindvoerder` | `assistent`, enforced server-side on batch
  approve, machtiging resolution, letter approval, R&V/boedel confirmation.
- **Vier-ogen**: when >1 active bewindvoerder exists, batch approver must
  differ from creator (server invariant, audited). Solo user degrades to
  the acknowledged-approve flow — never blocks a solo founder.
- Dedicated app DB role; `REVOKE UPDATE, DELETE ON audit_events` becomes
  enforceable (manual SQL, applied via scripts/db-extras.ts).
- **Data boundary**: the deployed environment stays synthetic-data-only and
  goes behind login. No real client data enters Frank in this cycle. If a
  shareable public demo is wanted later, it is a *separately deployed*,
  synthetic, read-only environment (no mutation-capable server actions
  against the primary DB) — per Temujin's Q1 recommendation, carried to
  Jerome for final call on demo visibility.

### W1. Signals engine + "Today" (the hallway)

**Code-computed detectors** (never AI) emitting prioritized per-dossier
signals. Detectors are pure functions (fixture-testable); a refresh routine
materializes results. **[R1-4] Refresh runs on events** (import completed,
document uploaded/triaged, task transition, batch state change, dossier
edit) **plus an explicit refresh action — never during page render.**

Detectors (stable `detectorKey`, severity, provenance):
- `income_missed` — active income line with `expectedDay` passed by grace
  days and no matching transaction. **[R1-4] Matching is conservative:**
  counterparty-IBAN exact match resolves; amount-within-tolerance +
  category match resolves; anything weaker leaves the signal open. Never
  silently resolve on a weak match.
- `leefgeld_low` — leefgeld account balance below next scheduled transfer.
- `unexpected_debit` — debit ≥ threshold on beheer/leefgeld with no
  matching budget line. **[R1-4] Excludes internal transfers** (counter-
  party IBAN ∈ dossier's own accounts) **and clears only via the
  transaction's explicit `reviewed` state** (human action, audited).
- `doc_needs_triage`, `machtiging_open`, `task_due`/`task_overdue`,
  `rv_window` (from `rvScheduleMonth`, only if confirmed), `batch_waiting`.

Persistence **[R1-4: materialized lifecycle, not truth]** — `signals`:
`detectorKey`, `detectorVersion`, `dossierId?`, `entityType/entityId`,
`severity (red|amber|info)`, `dedupeKey` (unique), `status (open|dismissed|
resolved)`, `payload`, `computedAt`, `firstSeenAt`, `lastSeenAt`,
`dismissedBy/dismissedReason/dismissedAt`. Upsert by dedupeKey; detectors
resolve their own signals when the condition clears; **a dismissed signal
reopens only after the condition clears and then recurs** (dismissal maps
to the condition instance, not the detector). Dismissal is audited with
reason. Signals are pointers: acting deep-links to the real entity.

UI: **Today** becomes `/`: grouped by severity then dossier; severity dot,
one-sentence signal (i18n), mono provenance (detector · version · basis),
action link. My Day keeps the task list. EmptyState: "Nothing needs you
right now."

### W2. Intake pipeline → boedelbeschrijving + plan van aanpak

1. **AI proposals.** `ai_proposals`: `dossierId`, `sourceDocumentId`,
   `kind (budget_line | debt | contact | account_opening_balance)`, typed
   `payload`, `confidence`, `status (proposed|accepted|rejected)`,
   `decidedBy/At`, **[R1-scope] `extractorVersion` (model + prompt
   version), field-level provenance (source snippet/page per extracted
   field), and idempotency: unique on (sourceDocumentId, kind, payloadHash,
   extractorVersion)** — re-running extraction never duplicates proposals.
   Accepting materializes the real row through the same server actions as
   manual entry (same validation + audit), audit carrying proposal id +
   document hash. Rejection audited. AI never writes to real tables;
   chokepoint/redaction/fallback unchanged (manual entry always works).
2. **Intake tab**: proposal review cards (accept / edit-then-accept /
   reject), completeness checklist toward the boedelbeschrijving.
3. **Boedelbeschrijving werkdocument** — printable, code-computed,
   watermarked (filing via official form/Mijn CBM): personalia/measure,
   accounts + opening balances at start date, income, fixed lasten, debts,
   inboedel/valuables note, signature block. Linked to the statutory
   4-month task.
4. **Plan van aanpak werkdocument [R1-3]** — due with the boedel-
   beschrijving for professional bewindvoerders per LOVT: goals of the
   measure, budget summary, actions planned, client agreements; **plus the
   supplemental debt plan section when `schuldenbewind`** (debt inventory,
   strategy: stabilize/regelen/MSNP-WSNP referral, leefgeld plan). Code-
   assembled from dossier data; free-text sections maintained on the
   dossier; AI may draft free-text *as a proposal* through the letters-
   style approve flow.
5. **Aanschrijfbrieven** — intake template set (gemeente, UWV/SVB, zorg-
   verzekeraar, energie, woningcorporatie, deurwaarder): batch-generate
   drafts for un-notified contacts, human approves per letter, contact
   marked `notified`.

### W3. R&V deepening — mapped to the official form **[R1-3]**

- **Explicit form mapping** (LOV R&V form): reporting period start/end
  from the dossier's court schedule (first period starts at `startDate`);
  balances per account at period start/end (bank evidence must show
  those); income/expense by category; **schuldenverloop** (begin/eind per
  debt + paid in period, from debt events — see W4); bewindvoerders-
  beloning (from fee engine, legal source shown); **client discussion /
  signature block** (bespreking met betrokkene: date, understood y/n,
  signature or reason declined — new dossier-period fields, human-entered);
  attachments checklist bound to real archived documents (afschriften per
  account covering period boundaries, beschikking on file).
- Validation additions: schuldenverloop consistency (begin − betaald ≠
  eind → amber), fee taken vs allowed (red), attachment gaps (amber).
- Remains a watermarked werkdocument; filing is Mijn CBM (T2 + evidence).

### W4. Schuldenbeheer

- **Schulden tab**: register with status chips, totals (original vs
  current), per-creditor drill-in.
- **Betalingsregeling ↔ budget line**: `budgetLines.debtId` FK; creating a
  regeling from a debt creates the linked expense line.
- **[R1-2] Debt balances change ONLY through audited `debt_events`:**
  `debtId`, `kind (payment_reconciled | creditor_statement | correction)`,
  `deltaCents`, `sourceTransactionId?`, `sourceDocumentId?`, `note`,
  `actorId`, `createdAt`. **pain.001 export never touches debt balances**
  (an export file proves nothing was executed). `payment_reconciled` is
  created by a code reconciliation step matching an *imported CAMT
  transaction* to a regeling line (IBAN exact + amount exact + date
  window); `creditor_statement` is human-entered from a saldo-opgave
  (source document required). `currentAmountCents` becomes derived state
  (original + Σ events), recomputed transactionally with each event.
  Schuldenverloop in W3 reads from debt_events.
- Creditor letters: saldo-opgave request + regeling proposal templates.
- Signal tie-in: regeling payment not reconciled within window → amber.

### W5. Office layer — tijdschrijven & the tariff-cap dashboard

- `time_entries`: `dossierId?`, `actorId`, `date`, `minutes`,
  `activityKey` (intake, betalingsverkeer, post, rechtbank, klantcontact,
  schulden, overig), `note`, `source (manual | suggested)`. Quick-log UI
  (topbar + dossier tab). Completing substantial actions (batch approve,
  R&V pack, letter approved, intake acceptance) *offers* a pre-filled
  entry — suggestion, never auto-logged.
- **[R1-5] Fee engine = versioned legal dataset**, not constants:
  `fee_schedules` records with `effectiveFrom/effectiveTo`, amounts per
  category (standard vs schuldenbewind × 1/2-person, intake fee, R&V-only,
  eindafrekening), **VAT treatment**, `legalSource` (Regeling beloning
  curatoren, bewindvoerders en mentoren — wetten.overheid.nl BWBR0035730,
  version in force from 1-1-2026) and `sourceVersion`. Amounts sourced
  from the Regeling text itself, not summary pages. Dossier `feeCategory`
  override requires an audited reason. Pure calculation functions +
  CALC_VERSION, like deadlines.
- **Office dashboard**: per-dossier hours YTD vs fee-implied capacity
  benchmark (**~17h is an internal benchmark, never presented as a legal
  norm [R1-5]**), fee revenue vs hours → effective hourly rate, capacity
  view per bewindvoerder.

## 3. Explicit non-goals (this cycle)

No real bank rails (CAMT in, demo-only pain.001 out, unchanged) · no Mijn
CBM/Aansluitpunt integration (T2 + evidence) · no client portal · no
responsive pass · **no real client data** (synthetic only; W0 defines the
boundary for when that changes) · no autonomous AI actions anywhere.

## 4. Invariants carried forward (unchanged, enforced in review)

Code computes / AI proposes / human decides · single AI chokepoint with
redaction + logging + fallback · append-only audit with provenance ·
deadline provenance with human confirmation · idempotent imports · one open
batch · server-side (never UI) enforcement · official documents always
Dutch · bilingual UI · **new: debt state changes only via provenance-
bearing debt_events; signals are materialized pointers, never authoritative
state.**

## 5. Schema changes (all additive)

`signals` (unique dedupeKey) · `ai_proposals` (unique idempotency index) ·
`debt_events` · `time_entries` · `fee_schedules` · `budget_lines.debt_id`
FK · `dossiers.fee_category`, `dossiers.inboedel_note`, R&V bespreking
fields (per-period, likely small `rv_periods` table: dossierId, periodStart/
End, besprekingDate, besprekingOutcome, signedStatus, note) · Clerk actor
mapping table if needed.

## 6. Testing & verification

- Domain tests: every detector incl. resolve/reopen semantics and
  conservative-match cases; fee engine across schedule versions ×
  categories × proration; debt_events derivation + reconciliation matching;
  boedel/PvA completeness; R&V period math from court schedule. Keep 100%
  pass; expect ~50-60 new tests.
- DOM-verified end-to-end per PR (hollow-verification lesson): e.g. upload
  loonstrook fixture → proposal (with provenance) → accept → line + audit;
  missed-income fixture → Today signal → conservative non-resolve → strong
  match resolves; regeling → export (no debt change) → CAMT import →
  reconciled debt_event → schuldenverloop; vier-ogen refusal with same
  actor as creator (once 2 users exist).
- Mid-build UX check with Temujin after W1 and after W2 are demoable.

## 7. Deliverables — four PRs **[R1-scope]**, each through full review loop

- **PR-1 Foundation**: W0 (auth, roles, vier-ogen, DB role + REVOKE, data
  boundary) + only its own auth/actor schema; later schema ships with its
  feature PR (round-2 note).
- **PR-2 Signals**: W1 (Today, detectors, lifecycle).
- **PR-3 Intake**: W2 (proposals with provenance, intake tab, boedel-
  beschrijving + plan van aanpak, aanschrijfbrieven).
- **PR-4 Court & office**: W3 + W4 + W5 (R&V form mapping, debt_events,
  tijdschrijven, fee engine, office dashboard).
BUILDLOG updated per PR.

## 8. Open questions

- **Q1 (Jerome — carried with Temujin's recommendation):** Auth goes in
  now and the deployed app goes behind login (Temujin and I both recommend
  this). Decide: do you also want a *separate* public read-only synthetic
  demo deployment, or is login-only fine for now?
- **Q2 (Jerome):** AI Gateway credits — W2 extraction is the flagship AI
  feature and will mostly hit the free-tier fallback until topped up.
  Building against fallback regardless; demo quality is materially better
  with credits. Financial action = your call.
- ~~Q3/Q4~~ resolved by Temujin round 1 (adopted above).
