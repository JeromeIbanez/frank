# Frank OS — Build Log

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
