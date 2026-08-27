# Frank OS — Build Log

## OS v2 PR-11: processes + autonomy reporting — 2026-08-27 (plan COMPLETE)
- The "OS" claim made literal (PR #11, six review rounds → APPROVE): five
  legal procedures as a dependency graph, with what each is waiting on.
- Three modelling errors caught by building it: `blocked` was UNREACHABLE
  in a pure DAG (the earliest not-done step always has its deps met), so
  steps gained an OWNER and `awaiting` — what stalls a bewindvoerder is a
  court, not the graph; a blocked step was marked overdue (you cannot be
  late for work you cannot start — office overdue 23 → 14, all real); and
  machtiging ran for every dossier though it is event-started.
- ACTIVATION persisted, STEP STATUS derived. A stored step status is a
  second copy that drifts; a step is done because the work is done. But
  activation cannot be derived — dating every process from 1 January
  fabricated deadlines — so `process_instances` is immutable and records
  the date AND its source.
- Six rounds of tightening, each closing a hole where a write succeeded but
  its provenance did not: NULLs are DISTINCT in a unique index so
  "idempotent" activation was silently duplicating; instance + audit are
  now ONE CTE (a `$defaultFn` id is generated in JS, not by the DB — that
  bug made every insert fail behind a caught exception); activation is
  wired to the actions that cause it, not a button; failures surface as a
  non-dismissible shell alert; and reconciliation evidence is PER DOSSIER
  compared on `evaluatedAt`, so one client's repair cannot clear another's.
- Evidence tightened: completion now rests on playbook TASKS being done —
  one notified contact is not "instanties aangeschreven", one budget line
  is not a plan. R&V bound to ONE court-set period. Machtiging reduced to
  what Frank records (a `court_authorization` resolution is not a
  beschikking on file). `einde_bewind` removed — a process that can only
  report a hard-coded "not done" accuses a curator of invisible work.
- Autonomy REPORTING, never a ratchet: accepted-unedited vs edited from the
  existing `humanOverrides` audit, median time-to-decision, and a candidacy
  observation with no switch behind it. The copy says it measures agreement,
  not correctness.
- 471 tests. **Plan os-v2 complete**: PR-8 agent runtime → PR-9 obligation
  inbox → PR-10 safeguarding → PR-11 processes. 4 PRs, 14 review rounds,
  0 findings waived.

## OS v2 PR-10: safeguarding shipped — 2026-08-27
- Waakhond (PR #10, three review rounds → APPROVE): ten pure detectors,
  safeguarding-v1, watching for financial abuse of the client AND by the
  office. Guardrails are structural, not wording: per-client baselines
  (someone who lives in cash is never flagged for being themselves), a
  detector with too little history ABSTAINS, and no relationship-based
  detector exists.
- **Two detectors cut in review, both for false-positive harm.**
  `high_risk_merchant` (Temujin, answering my own question): a single
  lawful payment with no baseline, frequency or affordability signal does
  not justify filing a casino/crypto/pawn transaction as a safeguarding
  signal about someone whose money is already administered by another
  person — "info" severity and gentle copy do not undo that. Earlier,
  `payment_to_related_contact` in plan rev 2.
- Found while testing: the structuring detector's €250 threshold fired on
  ordinary €200 withdrawals — what living on leefgeld looks like.
- Clarification questions are B1 Dutch with the rules ENCODED and tested:
  never fraude/misbruik/verdacht, always say why we ask, always offer "ik
  weet het niet meer", always affirm the money is the client's own and
  needs no permission. A name mismatch has NO client question (they cannot
  know whose account a company uses); nor does any office case.
- N5 enforcement took two rounds: `four_eyes_violation` was citing
  synthesised audit ids (evidence-shaped, not evidence) and now verifies
  the real rows; and *availability* of an independent reviewer was confused
  with *assignment* — an actorless office case (fee_above_schedule) now
  cannot be resolved inside the office at all. The concerned actor MAY
  escalate: self-reporting is not self-clearance.
- Jerome's decision recorded: solo office escalates to the appointing
  kantonrechter. Future direction noted (LLM as standing inspector).
- 423 tests; office and client scenarios verified live.

## OS v2 PR-9: obligation inbox shipped — 2026-08-27 (the demo motion)
- Inbox is now the OBLIGATION QUEUE (PR #9, three review rounds → APPROVE).
  An inbound item is not a document: someone outside demands a response,
  there is a deadline and a right answer. Grouped by decision, not arrival.
- Legal datasets versioned like fees.ts: WIK/BIK staffel (15/10/5/1/0.5%,
  €40 min, €6.775 max — Temujin verified against art. 2 BIK) computed in
  integer basis points with a DOCUMENTED half-up rule and a €1 de-minimis,
  so a rounding difference can never become an allegation. Split into two
  checks: the fee cap turns on evidenced contractual applicability, the
  14-day notice on documented CONSUMER status (period runs from receipt).
  Verjaring says "mogelijke verjaring — juridische toetsing vereist",
  restarts the day AFTER a stuiting (art. 3:319), and drops art. 3:310 and
  3:324 because a generic clock cannot honestly model their prerequisites.
- Every check ABSTAINS by default. A regression test strips the creditor's
  WIK line and asserts the finding vanishes though the arithmetic is
  identical — the guard against inference dressed as evidence.
- Routing refuses to guess: deterministic matchers with recorded per-matcher
  evidence, a name alone far below the floor, a top-two tie resolving to
  needs_dossier, confidence never 100, BSN never echoed back.
- **Nothing dossier-bound exists before a human confirms** (Temujin r2 #1,
  my own §2.1 rule broken in my own code): ingest yields a message with a
  provisional link plus an obligation attached only to that message.
  Confirmation is what materializes the dossier link AND drafts the reply.
- Reply drafting in deterministic Dutch templates, not generation: the
  dispute letter states the arithmetic exactly, disputes ONLY the excess,
  and offers the undisputed total. Approval runs through approveLetter (one
  approval path) and re-reads to verify, since it refuses silently.
- Verified live: approve → letter approved, sent_at null, obligation
  actioned, debt balance unchanged and no debt event. 318 tests.

## OS v2 PR-8: agent runtime shipped — 2026-08-27
- Plan docs/plans/os-v2.md approved at rev 3 (Temujin rounds 1–3, 9 findings,
  0 waived). v1's diagnosis: a system of record with AI assists, where the
  human is still the scheduler. v2 inverts it — the system schedules, the
  human approves.
- Agent runtime (PR #8, three code-review rounds → APPROVE): five charters as
  CODE, an exhaustive AgentActionClass vocabulary kept separate from
  PrivilegedAction, and a pure agentMay() ceiling where neverGrants beats
  grants so overlap fails safe.
- The guarantee is structural, not a deny-list: debt events, money movement,
  approval, court filing and sending are not IN the vocabulary, so an agent
  cannot ask. ASSERT_NO_CONSEQUENTIAL_LEAK makes a leak a compile error;
  ACTION_CATEGORY is a Record over the union so nothing ships unclassified.
- Identity is nominal AT RUNTIME (module-private WeakSet), not a structural
  type that erases: literals, casts, spreads, Object.create, JSON and
  structuredClone are all rejected. **Temujin r2 found that authentic
  identity still is not authorization** — so assertAgentMay now mints an
  opaque, frozen, action-scoped AgentGrant, and the gateway requires the
  grant, not the context. Attribution needs proof the gate ran.
- Denials throw and write a security_denied audit row (never a silent
  no-op, per os-v1 PR-4 R2); a failed audit on a refusal is reported rather
  than swallowed, and refusal never depends on DB availability.
- Bug found while testing: isAgentKey used `in`, so "constructor" and
  "__proto__" were valid agent keys via the prototype chain.
- Intake extraction runs as Postbode behind the gate; /office Agents panel
  is read-only by design (nothing to configure under N3).
- 233 tests (was 194); tsc, lint, build clean.

## OS v1 PR-4: Court & office layer shipped — 2026-08-27 (plan COMPLETE)
- Debts (PR #7, three Temujin rounds, two separate gates → both APPROVE):
  `debt_events` is the only path to a balance, applied in ONE SQL CTE
  (FOR UPDATE lock + conditional insert + relative update + audit) —
  verified live: 3 concurrent events applied exactly once each, duplicate
  transaction wrote nothing, overpayment clamps to 0 with the true prior
  balance and `clampedCents` recorded. pain.001 export never touches debt
  state. Exact-match reconciliation after imports/manual entry;
  `sourceProvenance` records camt_import vs manual_entry vs document.
  Betalingsregeling ↔ budget line; Schulden tab with event history.
- R&V: `rv_periods` records the COURT-set period + bespreking/signature
  (LOV form); schuldenverloop from debt events; attachments bound to real
  documents; calendar-year fallback flagged.
- Office: fee schedules as a versioned legal dataset (2025 + 2026, source
  URL + version + VAT treatment). **Temujin independently verified the
  amounts and caught transcription errors in the two-person rows** —
  corrected, and the previously unmodelled mixed 2p rate added. VAT is no
  longer assumed (applicability varies by office; shown "if applicable").
  Fees split across schedule boundaries for court years. Tijdschrijven
  with offered-not-automatic suggestions; /office shows fee vs hours,
  effective rate, and an honest time-coverage caveat. The 17/22h figure
  is labelled an internal benchmark everywhere, never a legal norm.
- 194 tests; production deployed.

**Plan os-v1 complete**: W0 foundation → W1 signals → W2 intake → W3/W4/W5
court + office, 4 PRs, 12 Temujin review rounds, 0 findings waived.

## OS v1 PR-3: Intake pipeline shipped — 2026-08-26
- AI proposals under human decision (PR #6, four Temujin rounds → APPROVE):
  typed contracts, field provenance verified against the source (signed
  amounts, creditor↔amount locality binding, IBAN/day evidence or strip),
  idempotent per (doc, kind, payloadHash, extractorVersion); flat model
  schema mapped into the strict union (strict structured-output modes
  reject oneOf/record).
- Accept = exclusive token lease (accepting state, 2-min expiry) +
  idempotent materialization via source_proposal_id unique keys through
  the SAME actions as manual entry; decision audit carries doc sha256 +
  human before/after overrides. Verified live end-to-end with real model
  extraction (loonstrook → budget line; aanmaning → debt).
- Intake tab (completeness checklist, proposal cards, werkdocument
  sections) collapses when done; boedelbeschrijving + plan van aanpak
  printables (opening-evidence mismatch flags; schuldenbewind supplement).
- UX: Today per-severity caps, euro-facing proposal editing (parseEuro).
- 159 tests; production deployed.

## OS v1 PR-2: Signals + Today shipped — 2026-08-26
- 11 pure detectors (signals-v2) over an office-TZ snapshot; conservative
  income matching with month-clamped due dates and a bounded credit window
  [due month start, due+grace]; unexpected_debit never suppressed by
  category alone; rv_window = filing DUE month (court schedule), period
  model deferred to W3.
- Materialized signal lifecycle (never authoritative): event-triggered
  refresh from 17 actions + explicit refresh, per-row writes only on
  change/version bump, batched freshness touch; dismissed-stays-dismissed,
  reopen only after clear-then-recur; audited dismissal with reason.
- Today (/) replaces render-time exceptions: severity-ordered signal card
  with i18n sentences, mono provenance, deep links.
- PR #5, three Temujin rounds → APPROVE (round 3 accepted the due+grace
  bound over his month-end suggestion); 129 tests; production deployed.

## OS v1 PR-1: Foundation shipped — 2026-08-26
- Plan docs/plans/os-v1.md approved by Temujin (round 2); four-PR cycle.
- Auth foundation (PR #4, three review rounds → APPROVE): identity
  chokepoint with clerk/dev modes (single fail-fast config predicate in
  src/lib/auth-config.ts), JIT provisioning from the verified-email
  allowlist FRANK_BEWINDVOERDER_EMAILS (required in clerk mode), pure
  authz domain module (role gates, vier-ogen batch approval, team
  guardrails), audited Team page, (shell) route group + /sign-in.
- DB-enforced append-only audit: app runs as restricted frank_app role
  (DATABASE_URL_APP, fail-closed on Vercel); UPDATE/DELETE on audit_events
  refused by Postgres. Role setup via FRANK_APP_DB_PASSWORD + db-extras.
- Clerk mode implemented but awaits Jerome's Clerk keys (account creation
  is his action); until then deployments run labeled dev-identity mode on
  synthetic data. Owed: one clerk-mode smoke test when keys land.
- 94/94 tests; deployed to production.

## Claude Design identity implemented — 2026-08-26
- Full visual identity from Claude Design's handoff (docs/design/): handoff
  palette/type tokens, "square full stop" logo + favicon, 216px sidebar +
  54px topbar shell, all screens to spec, EmptyState pattern.
- Payments "deliberate approve" flow: audited soft-exclude (held for court
  authorisation), ack-gated approve (server invariant + audit), locked
  batches immutable (incl. legal resolutions), export skips held items.
- LOVT B.D3 correction (Temujin): machtiging aggregation strictly per
  identifiable purpose via budget_lines.purposeTag; the guard is now
  reachable through the real product flow (was dead code for generated
  batches). Deferred: check-amount row state, My-day filter pills,
  Foundations page, responsive.
- PR #3, three Temujin review rounds → APPROVE; production deployed.

## MVP shipped — 2026-08-26 (overnight build)

- Research (legal / operations / competitive) → docs/research/
- PRD v0.2 approved by Claude + Temujin (2 rounds) → docs/PRD.md
- MVP implemented per PRD §6; Temujin code review round 1 (REVISE, 8 findings + UX) fully addressed; round 2 APPROVE (1 minor + 2 nits, also fixed)
- PR #1 squash-merged to main: https://github.com/JeromeIbanez/frank/pull/1
- **Production: https://frank-os-phi.vercel.app** (public, DEMO banner, synthetic data only)
- Quality: 72/72 domain tests, lint clean, build green; CAMT idempotency and single-open-batch constraint verified against the live DB; pain.001 export XML-validated (35 tx / 7 PmtInf / exact control sum)

## Open items (next session candidates)
- AI Gateway credits: free tier is rate-limited → AI features usually show the graceful fallback. Small top-up + set FRANK_MODEL_STRUCTURED / FRANK_MODEL_DRAFTING to Claude models (README). Topping up is Jerome's call (financial action).
- P1 (per PRD §7): auth (Clerk) + dedicated DB role (audit REVOKE becomes enforceable), FinGuard, Aansluitpunt certification path, evidence-grade document storage, action-level integration-test harness, batch exception queries at scale, tijdschrijven + office billing.
- Vercel CLI outdated (58.7.1 → 59.5.0): recommend `npm i -g vercel@latest`.

Process references: memory files frank-workflow-temujin-review, temujin-contact, frank-product-requirements.
