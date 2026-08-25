# Frank OS — Build Log

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
