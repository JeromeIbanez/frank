# Claude Code prompt — implement Frank OS visual identity

Paste this into Claude Code at the root of the Frank OS repo:

---

Implement the attached design handoff (`design_handoff_frank_os/README.md`) across the Frank OS app.

Context: this repo is the Next.js/React app deployed at frank-os-phi.vercel.app. The bundled `.dc.html` files are HTML design references, not code to copy — recreate them with our existing stack and patterns.

Do the following, in order:

1. **Tokens first.** Create a single source of truth for the design tokens in the README (colors, type scale, radii, spacing, table rules) — CSS variables or the Tailwind theme, whichever this repo already uses. Replace ad-hoc values throughout the app with tokens. Fonts: Geist + Geist Mono (weights per README).
2. **Logo.** Implement the "square full stop" logo as a small React component (wordmark variant + icon variant + favicon). It is text + a rounded square — render it live, never as a bitmap. Wire it into the sidebar and the favicon.
3. **App shell.** Restyle the sidebar (216px, active = indigo-50/indigo-700, mono count badges, user row) and topbar (54px, NL/EN segmented toggle, title) to match.
4. **Screens.** Restyle/build the four screens to match the README exactly: Dashboard (KPI tiles, Exceptions, Upcoming deadlines), Client dossier (header chips, 8 tabs, overview cards: client / accounts / agencies / debts), Payments batch review (table with OK / Check amount / Legal review required states and the deliberate approve flow: exclude-or-block → confirm modal with acknowledgment checkbox → locked + audit-log banner), Task list (severity dots, status chips, mono legal-provenance lines, sub-checklists, completed section).
5. **Rules to enforce globally:** red/amber/green only for deadline severity and money risk (dots, chips, row tints — never decoration); indigo only for interactive/selected; no gradients, no illustrations, no shadows except the modal; amounts right-aligned mono tabular-nums; dates DD-MM-YYYY mono; Dutch number formatting; hairline table dividers, no zebra; empty states per the README pattern.
6. Keep the NL/EN dictionary pattern for all new chrome strings; Dutch domain terms stay Dutch in both languages.

Work screen by screen, and after each screen show me a before/after so I can verify against the reference HTML (open `Frank OS.dc.html` in a browser to compare — use the Tweaks `startScreen` prop values dashboard | dossier | payments | tasks | foundations).

---
