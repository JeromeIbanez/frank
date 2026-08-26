# Frank OS — Build Log

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
