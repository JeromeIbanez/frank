# Frank OS

Internal operating system for **Frank** — an AI-native bewindvoering/curatele agency in the Netherlands. Not SaaS: this is the production line for Frank's own bewindvoerders.

**Copilot principle:** AI prepares, drafts, monitors, and flags. A human bewindvoerder/curator decides, approves, signs, and remains legally responsible. Everything is audit-logged.

> ⚠️ **Demo-only deployment.** Until authentication lands, the deployed app carries a DEMO banner and must contain exclusively synthetic data. Never enter real personal data.

## What's in the MVP (vertical slice)

- **Dossiers** — clients under bewind/curatele/mentorschap, accounts (beheer/leefgeld), instantie contacts, debts, lifecycle.
- **Task engine** — statutory obligations generated with **deadline provenance** (legal source, basis date, calculation version, human confirmation; unconfirmed = red); "nieuw dossier" playbook; evidence-carrying state machine (open → prepared → submitted → confirmed).
- **Money** — budgetplan, CAMT.053 import (single documented profile; idempotent, immutable raw files), rule+AI categorization, exception detection (missed income, balance floor), payment proposals with feestdag-shift, **machtiging guard** (legal-review flag per LOVT April 2025, €2,000 threshold incl. same-purpose aggregation — never a legal conclusion), approval gates, **pain.001 export** (one PmtInf per beheerrekening; demo-labeled, real-bank export hard-disabled outside a configured production office).
- **Inbox** — document upload/paste, AI classify+extract (schema-validated, confidence-gated), human-approved action proposals.
- **Letters** — aanschrijfbrieven pack + core letter set, always Dutch, draft → approve → sent.
- **Court filings** — R&V **review pack** (all figures computed from the ledger by code, completeness checks, attachment checklist; filing happens in Mijn CBM), boedelbeschrijving worksheet.
- **Copilot** — read-only, tool-grounded dossier chat via a single server-side AI gateway (BSN/IBAN redaction, cost caps, graceful "AI unavailable" fallback).
- **Audit log** — append-only, every mutation, human and AI actors.
- **Bilingual** — NL/EN instant toggle; official documents always Dutch.

See [docs/PRD.md](docs/PRD.md) (approved by Claude + Temujin) and [docs/research/](docs/research/) for the legal, operational, and competitive research underneath.

## Stack

Next.js (App Router, TS) · Tailwind + shadcn/ui · Neon Postgres (Drizzle) · AI SDK v6 via Vercel AI Gateway · next-intl · Vitest.

## Development

```bash
npm install
vercel env pull .env.local   # DATABASE_URL etc. (Neon via Vercel Marketplace)
npm run db:push              # push Drizzle schema
npm run seed                 # synthetic demo data (8 dossiers)
npm run dev
npm test                     # domain unit tests (deadlines, CAMT, pain.001, machtiging…)
```

### AI models

Model routing is env-configurable (`src/lib/ai/gateway.ts`):

| Env var | Default (free tier) | Recommended after AI Gateway top-up |
|---|---|---|
| `FRANK_MODEL_STRUCTURED` | `openai/gpt-5-nano` | `anthropic/claude-haiku-4-5` |
| `FRANK_MODEL_DRAFTING` | `google/gemini-2.5-flash-lite` | `anthropic/claude-sonnet-5` |

The Vercel AI Gateway **free tier is heavily rate-limited**; the app degrades gracefully ("AI unavailable") and everything else keeps working.

### Auth & roles (plan os-v1 W0)

All identity flows through `src/lib/identity.ts` (`currentActor()`), in one of two modes decided by deployment config:

- **clerk** — `CLERK_SECRET_KEY` + `NEXT_PUBLIC_CLERK_PUBLISHABLE_KEY` set. Every route except `/sign-in` requires a Clerk session (`src/proxy.ts`). Actors are provisioned just-in-time: the first-ever sign-in becomes `bewindvoerder`; later sign-ins start as `assistent` unless allow-listed in `FRANK_BEWINDVOERDER_EMAILS` (comma-separated). Role changes happen on the Team page (audited).
- **dev** — no Clerk keys. Three seeded demo identities with a labeled switcher in the topbar. Role and vier-ogen invariants are enforced identically in both modes (`src/lib/domain/authz.ts`).

Reserved for the `bewindvoerder` role (server-enforced): batch approval, exclude/remove batch items, machtiging resolution, letter approval, team management. **Vier-ogen**: with more than one active bewindvoerder, a batch's approver must differ from its creator; a solo office degrades to the acknowledged-approve flow.

### Database roles

`DATABASE_URL` (owner) is used by migrations and scripts only. The app runs as the restricted `frank_app` role via `DATABASE_URL_APP` — it cannot `UPDATE`/`DELETE` on `audit_events`, so the audit log is append-only at the database level. Create/rotate the role with `FRANK_APP_DB_PASSWORD=... npx tsx scripts/db-extras.ts`, then set `DATABASE_URL_APP` to the same URL as `DATABASE_URL` with user `frank_app` and that password.

`FRANK_PRODUCTION_OFFICE=true` is the hard gate for real-bank exports — never set it on a demo deployment.
