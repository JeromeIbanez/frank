# Frank OS — Build Log / Resume Checkpoint

Purpose: if this session is interrupted (usage limit, crash), resume from here.

## Mission (from Jerome, 2026-08-25 night)
Build + deploy the Frank OS MVP overnight. Process: PRD → Temujin plan review (iterate until BOTH approve) → implement (consult Temujin along the way, incl. UX opinions; periodic UX checks on running app) → deploy to Vercel → push branch, open PR on https://github.com/JeromeIbanez/frank → Temujin code review loop. I decide when done. Jerome asleep; wake to working MVP.

How to reach Temujin: `openclaw agent --agent main --session-key agent:main:frank-dev --message "..." --json` (or --message-file). Reply in .result.payloads[].text.

## Status
- [x] Research: docs/research/{legal,operations,competitive}-research.md — DONE
- [x] PRD v0.1: docs/PRD.md — DONE (incl. competitive insights)
- [x] Next.js scaffold (create-next-app, TS/Tailwind/App Router/src-dir) in repo root
- [ ] ← NEXT: send PRD + context to Temujin (session frank-dev), iterate to mutual approval
- [ ] Implement MVP per PRD §6 (10 scope items; bilingual next-intl NL/EN; no auth but auth-ready stub)
- [ ] DB: try Vercel Marketplace (Neon Postgres) via marketplace skill; fallback: seeded SQLite/local or demo-mode data layer behind a repository interface
- [ ] UX checks (browser preview) + Temujin UX critique at UI milestones
- [ ] Deploy to Vercel (vercel:deploy skill)
- [ ] Commit to feature branch, push, open PR, Temujin code review loop, merge
- [ ] Morning report to Jerome

## Key decisions so far
- Stack: Next.js App Router + TS + Tailwind + shadcn/ui, Drizzle, next-intl, AI SDK v6 via AI Gateway.
- Repo currently has scaffold uncommitted (empty upstream repo, no branches yet). First commit → main (scaffold+docs), then feature branch `feature/frank-os-mvp` for the build → PR.
- Watchdog: background sleep (task bv70zrhmr, ~3h15m) fires in case of usage-limit pause. If it fires and nothing else is pending, re-read this file and continue the next unchecked item.
- €2,000 machtiging threshold (LOVT April 2025), NOT €1,500. CAMT.053-native. Mijn CBM-first for court filings.
