# Handoff: Frank OS — Visual identity & key screens

## Overview
Visual identity and four key screens for **Frank**, an internal operating system for professional financial guardians (bewindvoerders) in the Netherlands. Serious, trust-critical desktop tool used all day: calm Dutch fintech. Personality comes from typography, spacing, and one accent color — no illustrations, no gradients.

## About the Design Files
The files in this bundle are **design references created in HTML** (`.dc.html` prototypes). They show intended look and behavior — they are **not production code**. Recreate these designs in the target codebase's existing environment (the live app is Next.js/React at frank-os-phi.vercel.app) using its established patterns. If no component library exists yet, plain React + CSS (or Tailwind mapped to the tokens below) is appropriate.

## Fidelity
**High-fidelity.** Colors, typography, spacing, and copy are final intent. Recreate pixel-perfectly. Data shown is synthetic demo data; wire to real data models.

## Brand: logo — "the square full stop"
- Wordmark: `Frank` in Geist 650, letter-spacing −0.03em, followed by a **square period** in indigo-600 (`#4F46E5`), border-radius ≈ 20% of its size, set on the baseline, sized ≈ 0.22× cap height, gap ≈ 0.12em.
  - Sidebar size: text 20px + 6×6px square (radius 1.5px), gap 3px, `align-items: baseline`.
- App icon: white rounded square (radius 25%), 1.5px `#E7E4DE` border, black `F` (Geist 650) + indigo square at baseline.
- Favicon 16px: the indigo square alone (6×6 in a 16 white tile).
- Rules: the square never rotates, never gets a gradient, appears only in indigo-600. Rationale: a deliberate, stamp-like full stop — direct and honest ("frank"), administration closed.

## Design Tokens

### Color
| Token | Hex | Use |
|---|---|---|
| canvas | `#F7F6F3` | App background (warm off-white) |
| surface | `#FFFFFF` | Cards, tables, inputs, modals |
| border | `#E7E4DE` | Card edges, table outer rules |
| hairline | `#EFEDE8` | Row dividers, inner rules |
| surface-hover | `#FAF9F6` | Row hover |
| surface-subtle | `#FCFBF9` | Table footers, muted cards |
| ink-900 | `#1C1B18` | Primary text |
| ink-600 | `#5B564E` | Secondary text |
| ink-400 | `#8F8A80` | Labels, meta, empty states |
| ink-300 | `#B5B0A6` / `#D6D2CA` | Disabled meta / empty-state glyph strokes |
| indigo-600 | `#4F46E5` | THE accent: primary buttons, links, active nav/tab, logo square |
| indigo-700 | `#4338CA` | Hover, active-state text |
| indigo-50 / 100 / 200 | `#EEF2FF` / `#E0E7FF` / `#C7D2FE` | Selected bg / chip border / outline-button border |
| indigo-disabled | `#C9C6EE` | Disabled primary button |
| red-600 / 700 / 50 / 100 | `#DC2626` / `#B91C1C` / `#FEF2F2` / `#FECACA` | Overdue, blocked, legal review (dot / note text / row tint / border) |
| amber-500 / text / 50 / 100 | `#F59E0B` / `#B45309` / `#FFFBEB` / `#FDE68A` | Due soon, needs check; row tint `#FFFDF5` |
| green-500 / text / 50 / 100 | `#22C55E` / `#15803D` / `#F0FDF4` / `#DCFCE7` | On track, approved, done |

**Severity rule:** red/amber/green appear ONLY as 8–9px dots, 11px chips, and row tints for deadline severity and money risk — never as decoration. Indigo means "interactive/selected", never severity.

### Typography — Geist + Geist Mono (Google Fonts)
| Style | Spec | Use |
|---|---|---|
| KPI numeral | 28/34, 600, −0.02em, tabular-nums | Stat tiles, big money |
| Page title | 22/28, 650, −0.02em | Dossier & batch titles (topbar title 16/600) |
| Card title | 14/20, 600 | Card headers, task names |
| Body | 13/19, 400 (emphasis 13.5/550) | Table cells, lists |
| Meta | 12–12.5, 400, ink-400/600 | Second lines, helper text |
| Mono | Geist Mono 11.5–12 | IBANs (grouped in 4s), dates (DD-MM-YYYY), case numbers, legal refs, counts |
| Section label | 11, 600, caps, +0.08em, ink-400 | Card section labels, table headers |
| Chip | 11, 600, 99px pill, 2px 8px padding | Status chips |

### Spacing / shape
- Card: white, 1px border, **radius 10px**; padding 18–20px. Modal radius 12px. Buttons/inputs radius 7–8px. Chips 99px.
- Page padding 24–28px top, 32px sides; content max-width 1180px; shell min-width 1280px (horizontal scroll below that).
- Sidebar 216px fixed; topbar 54px; grid gaps 12–16px.
- Row height ≈ 40px (10–13px vertical padding).
- Shadows: none, except modal `0 20px 50px rgba(28,27,24,0.25)` over `rgba(28,27,24,0.4)` backdrop.

### Table treatment
- Hairline `#EFEDE8` dividers, **no zebra striping**; headers 11px caps ink-400, no header background.
- Amounts right-aligned, Geist Mono, tabular-nums, `white-space: nowrap`.
- Row states: hover `#FAF9F6`; attention = amber tint `#FFFDF5`; blocked = red tint `#FEF2F2` + **3px left rule** in red-600.

### Empty states
Centered: 30–36px circle (1.5px `#D6D2CA` stroke, no fill), 13.5/600 ink-600 title, one 12.5–13px ink-400 sentence stating what will appear, at most one secondary (outline) action. No illustrations.

## App shell
- Left sidebar 216px on canvas (no card): logo top; nav items 13.5px, 7px 12px padding, radius 7px; active = indigo-50 bg + indigo-700 text 600; hover `#EFEDE8`; right-aligned mono count badges. Bottom: "Foundations"-style secondary link, then user row (28px indigo circle avatar with initials, name 12.5/550, role 11 ink-400) above a hairline.
- Topbar 54px, hairline bottom border, canvas bg: page title left; right: NL/EN segmented toggle (white, 1px border, radius 7px; active segment indigo-50/indigo-700), mono caption "Demo · synthetic data".
- Bilingual: every chrome string exists in NL and EN (see `t` dictionary in `Frank OS.dc.html` logic). Domain terms (leefgeld, beheerrekening, kwijtschelding…) stay Dutch in both.

## Screens

### 1. Dashboard
- 4 KPI tiles in a 4-col grid (gap 14): 11px caps label, 28px numeral, 12px ink-400 subline. Overdue tile: numeral in red-600 + 8px red dot beside it.
- Below, 7fr/5fr grid: **Exceptions** card (header row: 14/600 title + mono count + "View all" link; rows 8px severity dot / name 13.5 550 + issue 12.5 ink-600 / right-aligned mono amount — red-600 when money is missing) and **Upcoming deadlines** card (dot / task 13 550 + client 12 ink-400 / right mono date + severity tag: red "Overdue", amber "N days", nothing when green).

### 2. Client dossier
- Breadcrumb 12px ink-400 → name 22/650 + chips: Active (green), measure type (neutral outline), "5 need attention · 4 overdue" (red tint). Subline 13 ink-600 with mono case number.
- 8 tabs (Overview, Tasks, Budget plan, Transactions, Documents, Letters, Court filings, Copilot): 13.5px, 9px 13px, active = indigo-700 text 600 + 2px indigo-600 underline sitting on the 1px tab-row border. Non-overview tabs show the empty state pattern.
- Overview 2×2 grid: **Client** card (150px label column dl-grid, mono for dates; inset note on `#FAF9F6` about the unrecorded R&V schedule with "Record schedule" link), **Accounts** (rows: account name 13.5 550, mono IBAN·bank 12 ink-400, right balance Geist Mono 15/600; "+ Add account" indigo text button), **Agencies** (header with "7/9 notified" mono; chips: notified = indigo-50 bg, indigo-700 text, ✓ prefix; pending = white, ink-400), **Debts** (rows with status chips: `open` amber, `regeling` indigo; right mono amounts; footer "Total debt" + mono 14/600 total).

### 3. Payments batch review
- Header: breadcrumb, title + status chip ("Awaiting review" neutral → "Approved" green), meta line with execution date, count, mono total.
- Table grid columns 150px / 1fr / 170px / 110px / 190px: Dossier ("Surname, I." 13/550) · Creditor (name 13 + mono IBAN 11.5 ink-400) · Description 12.5 ink-600 · Amount (right, mono) · Review chip.
- Review states: **OK** green chip; **Check amount** amber chip on `#FFFDF5` row + 11.5px amber note ("Deviates from budget plan: € 168,00"); **Legal review required** solid red-600 chip, white text, on `#FEF2F2` row with 3px red left rule, amount in red-600 600, note citing `art. 1:441 lid 2 BW`, and an "Exclude from batch" outline-red action.
- **Deliberate approve flow:** footer shows count + mono total; while legal row pending → red dot note "1 payment blocked on legal review" and disabled button (`#C9C6EE`, not-allowed cursor). Excluding the row → row goes struck-through gray with "Excluded — held for court authorisation · Undo"; totals update (11 / € 4.347,83 → 10 / € 2.497,83). "Approve batch…" opens a modal: summary rows (payments, total, execution, excluded), warning copy (approval locks the batch, recorded in audit log, revoke-only), an acknowledgment checkbox gating the "Approve & lock batch" button (disabled indigo until checked). On approve: green banner "Batch approved by … — locked and recorded in the audit log. The OS never moves money itself.", chip flips to Approved, footer button becomes outline "Export pain.001".
- Microcopy next to the button: "Approval is recorded in the audit log under your name."

### 4. Task list (My day)
- Filter pills: active = ink-900 bg white text; rest white outline.
- Task cards: 9px severity dot (top-aligned), title 14/600, second line "Client · <mono legal provenance>" (e.g. `art. 1:436 BW · LOVT B.B1 · basis 25-12-2025`), right column: status chip (Open = neutral outline; In preparation = indigo tint; Done/Confirmed = green tint with ✓) over mono due date + severity note (red "Overdue" / amber "N days").
- Sub-checklists: indented 21px, hairline-topped; native checkboxes (15px, `accent-color` indigo-600); checked items ink-400. Long lists collapse behind a `<details>` summary "7 / 9 subtasks done" in indigo 12.5/550.
- Completed section: 11px caps divider "4 completed or closed", rows on `#FCFBF9` with struck-through ink-400 titles and green Confirmed/Done chips.

## Interactions & Behavior
- Nav/tab switching: instant, no transitions. Hover states as listed; no animations anywhere (calm tool).
- Approve flow state machine: `legalExcluded` (bool) → gates `approve` button; `confirmOpen` → modal; `ack` (bool) → gates confirm button; `approved` → chip/banner/export button. `Undo` resets `legalExcluded` and `approved`.
- Language: `lang: 'nl' | 'en'` swaps the chrome-string dictionary; persists per user in the real app.
- Numbers: Dutch formatting (`€ 1.273,00`), dates `DD-MM-YYYY` in mono.

## State Management (reference)
See the `Component` class in `Frank OS.dc.html`: `screen`, `lang`, `tab`, `legalExcluded`, `confirmOpen`, `ack`, `approved`, plus the full NL/EN dictionary `D`.

## Assets
No image assets. Fonts: Geist (400–700) and Geist Mono (400–600) from Google Fonts. Logo is rendered live (text + a rounded square div/SVG rect) — do not export it as a bitmap.

## Files
- `Frank OS.dc.html` — app shell + all 4 screens + Foundations (tokens, type scale, table rules, empty states, logo spec). Open in a browser; the `<x-dc>` template holds the markup, the logic class holds state and the NL/EN dictionary.
- `Frank Logo.dc.html` — logo exploration; option **1b** (square full stop) is the chosen direction.
- `claude-code-prompt.md` — paste-ready implementation prompt for Claude Code.
