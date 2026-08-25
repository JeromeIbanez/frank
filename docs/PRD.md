# Frank OS — Product Requirements Document

**Version:** 0.2 (revised after Temujin review round 1)
**Date:** 2026-08-25
**Author:** Claude (with Jerome Ibanez); reviewed by Temujin
**Status:** APPROVED (Claude + Temujin, 2026-08-25 night, review rounds 1–2 in session `agent:main:frank-dev`)

---

## 1. What Frank is

Frank is an **AI-native bewindvoering agency** in the Netherlands: a professional curatele / beschermingsbewind / mentorschap practice that runs its own operations on software it builds for itself. This document specifies **Frank OS** — the internal operating system its bewindvoerders/curatoren use daily.

Frank OS is **not** sold as SaaS. It is the agency's production line.

**The copilot principle (non-negotiable):** a fully autonomous AI cannot replace a curator or bewindvoerder — legal responsibility (signing the boedelbeschrijving, the rekening & verantwoording, machtiging requests, court appearances, LKB accountability) is personal and non-delegable. Frank OS is a copilot: agents, workflows and automations that *prepare, draft, monitor, and flag*, while a human professional *decides, approves, signs, and remains accountable*. Every AI output is reviewable; every consequential action requires explicit human approval; everything is audit-logged.

### 1.1 The thesis (why this wins)

Revenue per dossier is **capped by law** (Regeling beloning curatoren, bewindvoerders en mentoren, 2026):

| | Fee/year (excl. BTW) | Normed hours/year |
|---|---|---|
| Standard bewind | €1,630 | ~17 h |
| Schuldenbewind | €2,107 | ~22 h |
| Curatele | €2,933–3,794 | more |

Branch research (WODC/NBBI/Horus survey) shows real work is **~27 h/year** against 17 funded — the sector structurally runs unbillable hours, which is why Jerome's partner's curator can afford ~1 hour per week-or-month on his dossier. Extra billing needs case-by-case court machtiging, so **margin comes almost entirely from cost-per-dossier efficiency**. Courts benchmark ~70 dossiers/fte as the unaided maximum; if Frank OS cuts admin time per dossier by half, the same bewindvoerder serves more clients *with better quality* — measured by the sector's documented failure modes (late payments, missed toeslagen, unreachable bewindvoerders, late R&V filings).

Market: ~254k–273k people under bewind, ~2,000+ professional offices, incumbents with no AI. Capacity strain is causing intake stops sector-wide.

Competitive teardown confirms the wedge: **no incumbent ships generative AI** (the closest thing is Anntac's OCR/classification); nobody automates the outbound bureaucracy (toeslagen, bijzondere bijstand, kwijtschelding); portals are read-mostly; practitioners hand-roll ChatGPT+VBA around OnView. The market was also just churned (Stratech/Armarium exited bewind per 2025) and its standards freshly settled (CAMT.053, Aansluitpunt) — a good moment to define a new reference architecture. Where the sector has working rails, we ride them rather than rebuild: **FinGuard** (beheer-/leefgeldrekeningen + CAMT feeds + payment hub) is a partner, not a moat.

Full research: [legal-research.md](research/legal-research.md), [operations-research.md](research/operations-research.md), [competitive teardown](research/competitive-research.md).

### 1.2 Users

- **Bewindvoerder / curator (primary):** manages 40–80 dossiers; lives in the daily task queue, inbox, and dossier views.
- **Office admin / backoffice:** payments prep, post scanning, filings support. (Same UI, different emphasis; roles/permissions come with auth later.)
- **Client (betrokkene) — later phase:** portal for balance/leefgeld view, requests, monthly overviews (a statutory duty), and the complaint procedure.
- **Kantonrechter / LKB / accountant — indirect:** consume outputs (R&V, boedelbeschrijving, machtiging requests, quality documentation). Never log in.

**UI languages: Dutch AND English with an instant toggle** (Jerome is not yet fluent in Dutch). All *generated official documents* (court filings, letters to instanties) are always Dutch regardless of UI language. Dutch legal terms remain visible in the EN UI (e.g. "Annual account (rekening & verantwoording)") so users learn the vocabulary the courts use.

---

## 2. The job to be done (from research)

A dossier's lifecycle and its recurring obligations, with statutory deadlines the OS must track natively:

| Phase | Key tasks | Hard deadlines |
|---|---|---|
| Intake & aanvraag | Intake interview, verzoekschrift + bereidverklaring to kantonrechter, hearing | — |
| Dossier start | Open beheer- + leefgeldrekening; **aanschrijven of 15–30 instanties**; boedelbeschrijving; plan van aanpak; budgetplan; toeslagen/bijzondere bijstand/kwijtschelding applications | Boedelbeschrijving ≤ **4 months**; bijzondere bijstand ~3 months; Kadaster/Handelsregister registration on discovery |
| Ongoing beheer | Daily transaction import & matching; bill payment per budgetplan; **weekly leefgeld**; post triage; client communication; debt management (beslagvrije voet, betalingsregelingen, CJIB, MSNP/WSNP referral) | Monthly account overview to client (statutory); respond to client ≤ 2 working days |
| Court reporting | **Annual R&V** per rechtspraak model; machtiging requests (>€2,000 purchases, woning, schenkingen, vaststellingsovereenkomsten >€700, borrowing); **5-yearly evaluation** | R&V annually on court schedule; eindrekening ≤ 2 months after end (≤ 4 months after death) |
| Office-level | LKB handhavingsverzoek + accountant deliverables; klachtenregeling (≤ 6 weeks); PE hours; VOGs | Annual, April–October window |

Sector failure modes = Frank's quality KPIs: time-to-first-payment after beschikking, % instanties notified ≤ X days, toeslag application lead time, leefgeld punctuality, % R&V on time, client response time, new-debt incidence under bewind, doorstroom rate.

---

## 3. Integration reality (constraint from Jerome)

Not every system a bewindvoerder touches can be connected. Frank OS therefore classifies every external interaction into a **connectivity tier**, and the task engine treats all tiers uniformly — what differs is how much the machine can execute versus prepare:

| Tier | Meaning | Systems (today) | What the OS does |
|---|---|---|---|
| **T1 — API** | Machine-to-machine possible | Aansluitpunt Toezicht (court filings, mandatory digital since 1-1-2026; requires certified-leverancier status + PKIoverheid); **FinGuard** (sector's banking rail: morning CAMT.053 feeds, payment hub, leefgeldrekeningen); PSD2 AIS/PIS via TPP; CAMT.053 import (MT940 dies Nov 2026) + SEPA pain.001 batches; Belastingdienst SBA/SBT via Digipoort; Schuldenknooppunt (creditor messaging); bunq API | Full automation possible (with human approval gates) |
| **T2 — Portal** | Human must log in (eHerkenning EH3/DigiD), no API | Mijn CBM, Mijn LKB, Mijn Belastingdienst / Mijn toeslagen (via Bevoegdheidsverklaringsdienst), gemeente portals for bijzondere bijstand & kwijtschelding (every gemeente different), ABN AMRO bewindvoerdersportaal | OS prepares everything: prefilled data, document pack, step-by-step checklist; human clicks through; OS records completion + evidence |
| **T3 — Paper/phone/email** | No digital channel | Deurwaarders, small instanties, BelastingTelefoon, some zorgverzekeraars | OS generates letters (Dutch), call scripts, and tracks send/response; human sends/calls |
| **T0 — Closed** | Legally inaccessible | MijnOverheid Berichtenbox (clients cannot delegate access) | Designed around: mail redirection + document ingestion covers it |

**MVP consequence:** no external system is *actually* connected at launch (Aansluitpunt requires certification; PSD2 requires a TPP contract; SBA/SBT requires PKIoverheid). The MVP implements the T1 formats that work offline today — **CAMT.053 import and SEPA pain.001 export are file-based and bank-portal-compatible from day one** — and models everything else as T2/T3 prepared-work. Adapter interfaces keep T1 connections pluggable later.

---

## 4. Product architecture — modules

### M1. Dossiers (the spine)
Client record: person, regime (curatele/bewind/mentorschap), grondslag (incl. schuldenbewind flag → tariff + plan-van-aanpak requirement), beschikking details, rechtbank, key dates, accounts (beheer/leefgeld, in client's name — the OS models but never holds money), contacts (gemeente, zorgverzekeraar, werkgever/uitkeringsinstantie, deurwaarders…), documents, notes, full activity timeline. Lifecycle states: aanmelding → intake → aangevraagd → actief → (uitstroom | overdracht | overleden) → afgesloten.

### M2. Task engine (the heartbeat)
- **Auto-generated obligations** from dossier facts: boedelbeschrijving due-date on activation; R&V on court schedule; 5-yearly evaluation; eindrekening triggers; weekly leefgeld; monthly client overview; annual belastingaangifte, toeslagen recheck, kwijtschelding, bijzondere bijstand renewal; LKB cycle at office level.
- Tasks carry: dossier, connectivity tier, checklist, linked documents/drafts, deadline + escalation (amber/red), assignee, audit trail.
- **Playbooks** (workflow templates): "Nieuw dossier" (the ~25-step start sequence incl. instantie fan-out), "Verhuizing", "Overlijden", "Uitstroom", "Schuldeiser meldt zich", each instantiating tasks with correct deadlines.
- Views: my day (cross-dossier queue sorted by urgency), per-dossier plan, office calendar.

### M3. Money (budget & transactions)
- **Budgetplan** per dossier: income lines, fixed charges, **reserveringen/"oormerken"** (earmarked reserves as first-class sub-balances, per 2Work's proven model), leefgeld amount/cadence — the operating contract; versioned.
- **Transaction ledger**: CAMT.053/MT940 file import (+ CSV, + manual entry; PSD2 adapter later), deduplicated, linked to budgetplan lines.
- **Reconciliation & exceptions**: expected-vs-actual per month; *missed income* (uitkering/toeslag/salary not received by expected date), *failed/duplicate charges*, *balance floor breaches* — surfaced as tasks, same-day.
- **Payment preparation**: payment proposals from budgetplan + incoming invoices → human review → **SEPA pain.001 batch export** for upload to the bank portal + leefgeld batch, with **feestdag/weekend shift logic** (payments land on time despite holidays — 2Work-parity). The OS never initiates payments in MVP; with FinGuard/PSD2 PIS later, still human-approved per batch.
- **Machtiging guard**: any prepared outflow that trips LOVT rules (>€2,000 purchase — including *summed same-purpose spending per year*, schenking, woning-related, borrowing, vaststellingsovereenkomst >€700) is blocked until either client toestemming (wilsbekwaam) or kantonrechter machtiging is recorded — and the OS drafts the machtiging request.

### M4. Inbox & documents
- Ingestion: PDF/image upload, email-in later. **AI pipeline: OCR → classify** (aanslag, beschikking, factuur, aanmaning, deurwaarder exploot, polis, loonstrook…) **→ extract** (sender, amounts, dates, kenmerk, IBAN) **→ link to dossier → propose action** ("factuur €83,50 Eneco — schedule payment 28-08", "aanmaning — check against betalingsregeling", "toeslagbeschikking — update budgetplan income line").
- Every proposal is a task for human approval; documents land in the dossier archive (court-evidence quality: original files kept, bank-app screenshots flagged as non-compliant for R&V).

### M5. Correspondence & filings (document generation)
- **Aanschrijfbrieven**: the new-dossier instantie fan-out generated as a pack from dossier data + instantie register (address, required attachments per instantie).
- Letters/forms: betalingsregeling proposals, beslagvrije-voet objection, kwijtschelding, bijzondere bijstand, CJIB regeling, deurwaarder notification. Always Dutch; AI-drafted from dossier context; human edits/approves; PDF out; send-tracking.
- **R&V generator**: compiles the annual account from the transaction ledger in the rechtspraak model line-items (leefgeldrekening: opening/closing balance only), attachment checklist (bank exports per account, PGB beschikkingen, >€2,000 consent evidence), completeness checks, PDF matching the model form. Filing itself = T2 task (Mijn CBM) until Aansluitpunt certification.
- **Boedelbeschrijving & plan van aanpak** generators, same pattern.

### M6. AI copilot (cross-cutting)
- **Dossier chat**: ask anything about a dossier ("why did the zorgtoeslag drop?", "draft a reply to this deurwaarder", "is this purchase machtiging-plichtig?") — grounded in the dossier's data via tools, with citations to transactions/documents; answers in UI language, drafts in Dutch.
- **Client-message drafting**: B1-level Dutch (plain language) replies for client questions, tone-guarded.
- **Anomaly narration**: exception feed explained in plain language with proposed next steps.
- Guardrails in §5.

### M7. Dashboard & KPIs
Office overview: deadline health (R&V/boedelbeschrijving/evaluation due), exception counts, task backlog per bewindvoerder vs caseload norm, quality KPIs from §2, per-dossier time-spent estimate vs 17/22h norm (margin telemetry).

### M8. Audit & compliance backbone
Append-only audit log of every mutation (who — human or agent —, what, when, on whose approval); AI actions carry model+prompt-version metadata. Dossier-completeness checks mirror the Besluit kwaliteitseisen art. 7 and the accountant's annual sample audit (min. 10 files / 10%) so the LKB cycle is a report, not a scramble.

---

## 5. AI safety model

Three autonomy levels, assigned per action type — never per convenience:

| Level | Meaning | Examples |
|---|---|---|
| **A — Autonomous** | Machine does it, logged, reversible, no money/legal effect | OCR, classification, extraction, deduplication, deadline computation, exception detection, draft generation, translations |
| **B — Propose-approve** | Machine prepares; named human approves before effect | Payment batches, letters actually sent, budgetplan changes, R&V submission pack, machtiging requests, client-message sending |
| **C — Human-only** | Machine may inform, never draft-and-nudge into rubber-stamping | Signing R&V/boedelbeschrijving, court hearings, machtiging *decisions*, accepting appointments, leefgeld exception judgments, debt strategy, uitstroom decisions |

Hard rules: the OS never moves money in MVP (file export only; later PSD2 PIS still gated per batch at Level B). Machtiging guard cannot be overridden silently — override requires recorded justification. AI outputs never auto-send to clients, courts, or instanties. Prompt-injection defense: ingested documents are data, never instructions; extraction runs in constrained schemas. All financial figures in generated filings are computed by code from the ledger, **not** by an LLM — the LLM writes prose around verified numbers. PII: data stays in EU region hosting; model calls via gateway with zero-data-retention; BSN masked in prompts except where required in generated documents.

Failure honesty: classification/extraction confidence surfaces in UI; low-confidence items route to humans by default. KPI: % of AI proposals accepted unchanged (target >80% before widening any automation).

### 5a. Implementation-grade controls (from Temujin review round 1)

**AI gateway (single chokepoint):** all model calls go through one server-side module that: redacts BSN and account numbers by default (allowlist per document type where genuinely required); sends only explicitly selected document text and dossier fields, never whole-dossier dumps; exposes read-only tools to the copilot (no write tools in MVP); validates every structured output against its schema server-side before anything reaches the UI; records model, prompt version, and data classification per call; enforces cost ceilings at the gateway (future real pilot: €5/dossier/month hard cap, warn at 70%, disable at 100%; demo: low office-wide cap with visible usage). Zero-data-retention is a provider property to be verified per model route before real data ever flows — not assumed.

**Audit record (MVP definition):** `{actorId, actorType (human|agent|system), timestamp, entityType, entityId, versionBefore, versionAfter, correlationId, approvalId?, sourceDocumentHash?, reason?}`. The application role has no UPDATE/DELETE grants on audit rows. Exports and document downloads emit audit events too. Actor is `demo-user` until auth exists.

**Acceptance script (done = this passes):** create synthetic dossier → confirm legal dates (red until confirmed) → run start-playbook with evidence transitions → import the CAMT fixture twice (zero duplicates) → resolve an exception → create + approve a payment proposal (machtiging flag path exercised) → produce the R&V review pack → switch NL/EN mid-flow without losing state → inspect the audit trail for every step above. Automated tests cover: deadline calculation (incl. provenance fields), import idempotency, money invariants, approval-state transitions, and Dutch-only official document output.

---

## 6. MVP scope (build now)

**Goal:** a deployed, seeded, bilingual **vertical-slice demo** of Frank OS — every core workflow demonstrable end-to-end on synthetic data, honest about what is demo-grade versus production-grade.

**Demo-only deployment (Temujin blocker #1):** until auth lands, the deployment carries a conspicuous DEMO banner, contains exclusively synthetic data, and must not receive real personal data or real documents. The audit log's actor is `demo-user`, never a real professional's name. This is not production-ready and is not described as such.

In scope:
1. **Dossiers** (M1) — CRUD, lifecycle, accounts, contacts, notes, timeline.
2. **Task engine** (M2) — auto-generated statutory obligations with **deadline provenance**: every legal task carries `source` (statute/LOVT ref), `basisDate`, `calculationVersion`, computed `dueDate`, and a `humanConfirmed` flag; unconfirmed deadlines render red. The court's R&V schedule is an explicit required dossier field, never an inferred recurrence. Plus "Nieuw dossier" playbook, my-day and per-dossier views, escalation. Task completion has evidence semantics: states are `prepared` → `submitted/sent` → `confirmed` (not a bare "done"), each transition recording method, performed-by, timestamp, and an evidence attachment/reference.
3. **Money** (M3) — budgetplan; transaction import constrained to **one documented CAMT.053 profile + CSV + manual** with hard invariants (immutable raw import file, idempotent re-import, transaction uniqueness, opening/closing balance reconciliation, explicit approval states, export blocked while any validation error is unresolved); AI-assisted categorization (schema-validated, low-confidence → human); exception detection; payment proposals with feestdag shift; **pain.001 export behind a feature flag, single bank profile; demo labeling in UI, filename, audit event, and export metadata (the XML itself stays valid); real-bank export hard-disabled outside an explicitly configured, authenticated production environment**; leefgeld schedule; machtiging guard as a **"requires legal review" flag, never a legal conclusion** — it flags potential triggers incl. same-purpose aggregation toward €2,000, and requires the reviewer to record consent / court authorization / not-applicable with rationale; export blocks only per configured policy.
4. **Inbox** (M4) — upload, AI classify/extract (strict schemas, server-validated, confidence surfaced, low-confidence → human) → link → propose; manual metadata path always available; archive with file hash + immutable metadata from day one.
5. **Correspondence & filings** (M5) — aanschrijfbrieven pack, core letter set (all Dutch, human-approved before "sent"); **R&V review pack** — worksheet with computed line items from the ledger, validation report, attachment checklist, and a "complete in Mijn CBM" T2 task; any rendered PDF is watermarked "werkdocument — niet voor indiening". Boedelbeschrijving: same review-pack pattern. Official-form PDF fill is P1, separately tested.
6. **Copilot** (M6) — dossier chat with **read-only** tool-grounding (no writes via chat in MVP), plus drafting; served via a single server-side AI gateway (see §5a); visible "AI unavailable — demo analysis" fallback so the app demos without model access.
7. **Dashboard** (M7) — deadlines, exceptions, KPI tiles.
8. **Audit log** (M8) — spec in §5a.
9. **i18n** — NL/EN toggle, persisted; Dutch officialese in documents.
10. **Demo seed** — ~8 realistic but **fully synthetic, composited** dossiers incl. a schuldenbewind case (no resemblance to real persons — explicitly not modeled on Jerome's partner), transactions, documents, pending exceptions.

Out of scope (MVP): auth (architected-for: all data access behind a session-scoped service layer; middleware stub; roles modeled), client portal, FinGuard/Aansluitpunt/PSD2/SBA/Schuldenknooppunt live connections (adapter interfaces only), belastingaangifte automation, mentorschap care-side workflows, WSNP/MSNP case management beyond referral tasks, e-mail ingestion, mobile, tijdschrijven (time tracking) and own-office fee invoicing (parity items deferred to P1/P3 — internal agency, no external billing pressure yet).

Parity check vs the incumbent table stakes (competitive research §2): MVP covers 12 of 16 items; deferred: Aansluitpunt system coupling (Mijn CBM prepared-work instead — we can't be a certified leverancier on day one), client portal, tijdschrijven, own-office billing.

### Tech
- **Next.js (App Router, TS) on Vercel**, Tailwind + shadcn/ui.
- **Postgres** (Vercel Marketplace: Neon) + Drizzle ORM; EU region.
- **AI SDK v6 via Vercel AI Gateway** (`anthropic/claude-*` models); structured outputs for classification/extraction; tool-calling for copilot.
- File storage: Vercel Blob (documents).
- i18n: `next-intl` (locale in cookie, instant toggle, no locale-prefixed routes needed for an internal tool).
- No auth: single implicit "office" tenant; `auth()` stub returns a fixed bewindvoerder identity so real auth (e.g. Clerk) drops in later without refactoring.

### Done means
Deployed on Vercel (DEMO banner, synthetic data only); the §5a acceptance script passes; automated tests green; NL/EN toggle everywhere; UX pass done (self + Temujin); PR reviewed by Temujin and merged.

### File storage
Vercel Blob for **synthetic demo assets only**. Court-evidence-grade storage (authenticated access, tested recovery, retention classes) is a P1 gate before any real dossier enters the system; file hashing, immutable metadata, and access logging start now so the model doesn't need retrofitting.

---

## 7. Later phases (direction, not commitment)

- **P1 — Connect**: **FinGuard** (accounts, morning CAMT feeds, payment hub — buy, don't build); Aansluitpunt Toezicht certification; PSD2 AIS then PIS; SBA/SBT via Digipoort; Schuldenknooppunt membership; email-in for post; tijdschrijven + office fee invoicing.
- **P2 — Client surface**: portal/app (balance, leefgeld, requests, monthly overview, klachten), WhatsApp/SMS notifications, B1 communication throughout.
- **P3 — Scale ops**: multi-bewindvoerder roles + separation-of-duties (Besluit art. 8), LKB/accountant workspace, belastingaangifte prep, per-gemeente form knowledge base, beslagvrije-voet calculator, doorstroom (uitstroom) program tooling.
- **P4 — Intelligence**: cross-dossier pattern detection (energy contract optimization, toeslag entitlement sweeps), time-per-dossier analytics vs forfait, intake triage scoring.

## 8. Resolved questions (Temujin review round 1)

1. Demo seeds: **all generic and synthetic**, composited from research scenarios; nothing modeled on Jerome's partner.
2. R&V: **canonical versioned data mapping + review pack** for human completion in Mijn CBM; if PDF support is needed later, fill the official versioned Rechtspraak form rather than recreate it.
3. Models: **low-cost structured-output model by default; stronger model only for explicit human-invoked drafting/chat**; cost ceilings enforced at the AI gateway (§5a).
4. Storage: Blob demo-only; hashing/immutable metadata/access logging from day one; evidence-grade storage is a P1 gate (§6).
