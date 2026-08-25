# Competitive teardown: Dutch bewindvoering-software suites (Aug 2026)

## 0. Regulatory context that frames everything

- **Digital procedure is now mandatory.** Since **1 January 2026** professional curatoren/bewindvoerders/mentoren MUST work digitally with the rechtbank — either via the **Aansluitpunt Toezicht** (system-to-system coupling from their software, requires a PKIoverheid certificate via the IT vendor) or via the **Mijn CBM** web portal (eHerkenning level 3 fallback). Verslagen (boedelbeschrijving, R&V, tussentijdse evaluatie), verzoeken (machtigingen, opvolging), address changes and messaging with the rechtbank all run through one digital channel. Since 17 Nov 2025 new CBM cases can also be *applied for* digitally via Mijn CBM. Source: [rechtspraak.nl digitaal toezicht](https://www.rechtspraak.nl/voor-advocaten-en-juristen/reglementen-procedures-en-formulieren/civiel/curatele-bewind-en-mentorschap/digitaal-toezicht).
- **Official Aansluitpunt Toezicht vendor table** (verified from rechtspraak.nl, status "Systeemkoppeling gereed"): **Bizon Software, eStrategy, Fineaid, Flow (Plangroep), Aigor, Mcas, OnView (Linfosys), SmartFMS, BizzXL, Van Rijn bewindvoering, 2Work, Allegro (Kred'it)**. Marked "**Stopt per 2025**": **Stratech** and **Armarium**. Note eStrategy is an *integration provider* (couples any admin system to the Aansluitpunt, incl. signalering of new cases/tasks), not a suite ([estrategy.nl](https://www.estrategy.nl/software-oplossingen/rechtspraak/)).
- **Bank-format shift.** MT940 is being phased out for **CAMT.053** (ISO 20022); Rabobank stops MT940 15 Nov 2026 ([debetaalfabriek.nl](https://www.debetaalfabriek.nl/mt940-camt-uitfasering.php)). A new internal OS should be CAMT-native from day one.
- **FinGuard is the de-facto banking rail** for the sector: a Payment Hub + its own NL-IBAN **beheer-/boedel-/leefgeldrekeningen** (live since May 2023, €4.95/account/month, account active ≤2 working days). Morning delivery of verified CAMT.053 statements straight into the suite; payment batches pushed from the suite to the Hub, approved there. Integrated with OnView, 2Work, Fineaid, Aigor a.o. ([finguard.eu](https://finguard.eu/), [FAQ](https://finguard.eu/faq/), [OnView-FinGuard](https://www.onview.nl/finguard/)).

## 1. Vendor-by-vendor

### OnView (Linfosys, Goirle) — market leader
[onview.nl](https://www.onview.nl/) · [feature page](https://www.onview.nl/onview/) · [prijzen](https://www.onview.nl/prijzen/) · [helpdesk.onview.nl](https://helpdesk.onview.nl/)
- **Modules:** bewindvoering, schuldhulp, budgetbeheer, mentorschap. Web-based ("besloten webpagina"). ~25-person family business.
- **Features (verified from vendor pages):** dossier aanmaken/beheren; inkomsten & uitgaven; **budgetplan** (forward-looking months incl. reserveringen/aflossingen); schuldregistratie; rekeningenbeheer; "Betalingen naar Bank sturen"; brieven-templates (mailing/print); documentenarchief; **automatische rechtbank-rapportages** (R&V etc.); bewaking & signalering; tijdschrijven; notities/CRM-acties; **cliënt-inkijkmodule** (mijn.onview.nl); VoIP module (call from dossier); e-factuur module.
- **Bankkoppeling:** via **FinGuard**: CAMT.053 statements auto-ingested each morning; one-click export of payment batches to the Payment Hub; roadmap includes four-eyes approval and direct account requests ([onview.nl/finguard](https://www.onview.nl/finguard/)). Without FinGuard: file-based import (formats not publicly specified — unverified).
- **Aansluitpunt Toezicht:** connected ("gereed" on the rechtspraak table).
- **DMS/OCR:** no native OCR; relies on **Anntac** (fully embedded in OnView UI per Anntac) or **OpenDIS Cloud** (R.E.D. Systemen) as paid external archives.
- **Pricing (2026, excl. VAT, per named-user license):** setup €308.20 / €302.75 / €297.30 (1st / 2nd–10th / 11th+), maintenance **€30.50 / €28.35 / €26.15 per user/month**; FinGuard koppeling **€9.50/user/month** + €4.95/account/month; VoIP & management module on quote. Monthly contract, tacit renewal.
- **AI:** none found on vendor site or news (2024–2026). A practicing bewindvoerder describes bolting ChatGPT + Outlook-VBA around OnView himself ([jsbb.nl](https://www.jsbb.nl/a-i-in-de-bewindvoering-slimmer-werken-zonder-extra-handen/)).
- **UX reputation:** no public review corpus found (no Trustpilot/Capterra presence). Marketed and generally described by customer offices as user-friendly; the only client-side friction found was end-clients complaining that offices push everything to the portal ("that's what OnView is for") instead of paper. Treat UX claims as unverified.

### 2Work (2Work Software B.V., 's-Hertogenbosch)
[2work.nl](https://www.2work.nl/) · [functionaliteiten](https://www.2work.nl/functionaliteiten) · [tarieven](https://www.2work.nl/tarieven) · [geschiedenis](https://www.2work.nl/geschiedenis)
- **Profile:** founded ~2000 by Marc Raven (still owner), bewind app since 2006, **120+ offices**. "SQL Server setup €178" on the price list strongly suggests a client-server/on-prem Windows architecture rather than SaaS (inference — not explicitly stated).
- **Features (deepest public feature list of all vendors):** budgetplan from vaste inkomsten/uitgaven/reserveringen; liquiditeit; **management-by-exception** transaction monitoring; unlimited bank accounts per dossier; **MT940/SEPA statement import**; **payment-advice generation with feestdag logic**; digital payment files to banks; **"oormerken"** (earmarked reserves with structural/one-off payouts); standard **boedelbeschrijving + R&V**; periodic mutation statements on office letterhead for clients; 80+ letter templates, WYSIWYG editor, full e-mail integration, auto-archiving to dossier; debt position + regeling proposals; intake/beëindiging workflows; **termijnbewaking with knowledge rules**; role-based authorization per dossier/action, audit trail; detentie/opname registration; own-invoice/debiteurenbeheer (office fee sweeps to business account); intranet-style kennisbank; **2Look** client portal (configurable inzage + payment requests). FinGuard automatic file exchange supported ([finguard.eu](https://finguard.eu/automatische-bestandsuitwisseling-met-finguard/)).
- **Aansluitpunt:** connected (rechtspraak table).
- **Pricing (2026, excl. VAT):** **€1,199/year per concurrent-login license** (unlimited user accounts); implementation from €945; helpdesk/training free; incident support €31/15min; consultancy €477/half-day.
- **AI:** none found. **OCR:** none native; via OpenDIS/Anntac partners.
- **UX:** no public reviews found. The feature style (knowledge rules, exception lists) reads power-user/dense; unverified.

### Smart FMS → **BlueLemon24** (rebrand/migration)
[smartfms.nl](https://www.smartfms.nl/) now 302-redirects to [bluelemon24.nl](https://bluelemon24.nl/) — factual evidence of a rebrand, though BlueLemon24's site never mentions Smart FMS (relationship otherwise unverified).
- **Features** ([bewindvoerders page](https://bluelemon24.nl/software-voor-bewindvoerders-mentorschap-financiele-hulp/), [financieel beheer](https://bluelemon24.nl/oplossingen/financieel-beheer/)): elektronisch cliëntendossier incl. familierelaties/betrokkenen; automatic bank connections ("slimme koppelingen met banken", mechanism unspecified); real-time dashboards; budgetplannen "conform wettelijke normen"; **native OCR with task-linking to the dossier**; leefgeld/huishoudgeld transfers **that also execute on Dutch public holidays**; R&V for the rechtbank; task/appointment tracking; **client mobile app (iOS + Android)** + portal; "slimme facturatie"; role-based access; claims **"AI-powered workflow automation"** (marketing claim, no substantiation found — treat as unverified); integrations with banks, gemeenten, court systems. Aansluitpunt: connected (as "SmartFMS" on the rechtspraak table). Pricing: not published.
- Historically strong with **gemeenten/instellingen** (taakapplicatie for inwoners-financieel-beheer).

### Bizon Software (Eindhoven) — IBS
[bizonsoftware.nl/producten/software-bewindvoering/](https://bizonsoftware.nl/producten/software-bewindvoering/) · [branche page](https://bizonsoftware.nl/branche/bewindvoering/)
- **Product family:** **IBS** (Inkomensbeheer & Bewindvoering Software) + **DigitaalDossier** (native DMS: digitize and handle all post, docs auto-linked to cliëntdossier/taakhouder) + **Outlook plug-in** (link mail, plan tasks) + **MijnBizonApp** (clients view dossier, ask questions, submit aanvragen) + **CliëntGelden Systeem (CGS)**, WebKasBankBoek, MobiBon (receipts), Finall (GL), WebBi (BI), hosted virtual workplace (incl. MS Office).
- **Compliance posture:** autorisatie, rollen, logging, validatie, audit trail, functiescheiding; ISO/NEN certification emphasized across the chain.
- **Aansluitpunt:** connected; blog notes **mentorschappen fully digital in the Toezicht system since 1 Feb 2024** — they track rechtspraak releases closely ([digitaal-toezicht page](https://bizonsoftware.nl/digitaal-toezicht-bewind/)).
- **Pricing:** not published. **AI:** none found; DMS is rules-based "slimme archivering".
- **UX:** case studies (Beaufin, Leijssen, Beschermingsbewind Twente) are positive but vendor-curated; no independent reviews found.

### Stratech (Perspectief) — **exited**
- **Stratech Social ended support for (Wsnp) bewindvoering and kredietverstrekking per 1 Jan 2025** (customers informed late 2023); it now focuses on schuldhulpverlening + budgetbeheer in the new Perspectief Cloud, which will *not* include bewind ([stratechsocial.nl](https://www.stratechsocial.nl/nieuws-kennis/de-toekomst-van-stratech-social)). Listed "Stopt per 2025" on the rechtspraak table. Historically it offered digital R&V/boedelbeschrijving/machtigingen submission, bank coupling "with all banks", leefgeld insight. **Implication: a cohort of ex-Stratech offices had to migrate in 2025 — the market has just been churned.**

### Second tier / adjacent
- **Fineaid** ([fineaid.nl](https://fineaid.nl/)): "by bewindvoerders for bewindvoerders", 10+ yrs; extensive **process management engine** aligned to wetgeving, backlog/achterstand management info; integrated cliëntportaal with document upload + messaging (mail notifications, explicitly pitched to cut phone hours); bank-transaction, accounting-package, **telephony** and DMS links (OpenDIS, Anntac, **Elvy**); FinGuard auto exchange; Aansluitpunt connected. Detail pages 404'd; feature claims from search snapshots.
- **Piekoo / Aigor** ([piekoo.nl](https://www.piekoo.nl/bewindvoering), [aigor.nl](https://www.aigor.nl/abonnementen)): Aigor = successor of IGOR, **the only fully transparent pricing in the market**: Basis €4/m (3 dossiers), Pro €40/m (100 dossiers, 2 users), Expert €100/m (unlimited, incl. **workflows, automated document processing, payment creation, API access**); FinGuard direct in Pro/Expert; **"Digitale koppeling (KEI)"** (Aansluitpunt) Pro/Expert only; client portal in all tiers; 14-day trial, no setup fee. Piekoo basic: from **€2.19/dossier/month**. Aansluitpunt: connected (as Aigor).
- **Anntac** ([anntac.com/bewindvoering](https://www.anntac.com/bewindvoering)): "zelflerend archief" — automatic document recognition/classification + full-text OCR search, cloud in 2 NL datacenters; embedded in OnView, auto dossier/doc-type recognition for Stratech/2Work/Smart FMS; Anntac SCANNER service from €15/m; entry **€17.50/m incl. 25GB**. Closest thing to "AI" shipped in this market, and it's classification/OCR, not generative.
- **R.E.D. Systemen / OpenDIS** ([redsystemen.nl/bewindvoering](https://www.redsystemen.nl/bewindvoering/)): scanning hardware (Canon) + OpenDIS DMS; integrates with OnView, 2Work, Fineaid, Stratech, Smart FMS, Piekoo; custom couplings on request; pricing on contact.
- **FinGuard** — see §0. Also offers saldovergoeding on beheerrekeningen.
- **New entrants:** **Bewind.app** ([bewind.app](https://bewind.app/)) — modern SaaS: automatic bankkoppeling with auto-categorization, debt module with aflossingscapaciteit and preferente/concurrente verdeling, "gebouwd voor Aansluitpunt Rechtspraak", per-client AES-256, EU hosting, ISO 27001 roadmap 2027; not on the rechtspraak table yet. **BizzXL, Mcas, Flow (Plangroep), Allegro (Kred'it), Van Rijn** are on the table but are mostly SHV/kredietbank-oriented or in-house; not torn down.

## 2. Feature-parity checklist (table stakes for an internal bewind OS)

Everything below is offered by ≥2 incumbents; missing any of these means the office can't run:

| # | Capability | Reference implementations |
|---|---|---|
| 1 | Dossier per cliënt: NAW, familierelaties/betrokkenen, rechtbankgegevens, detentie/opname-registratie, historie, audit trail | all; Bizon/2Work strongest on audit/functiescheiding |
| 2 | **Budgetplan** (vaste inkomsten/uitgaven, reserveringen/"oormerken", aflossingen) + liquiditeitsprognose | OnView, 2Work |
| 3 | Bank statement ingestion — **CAMT.053-native** (MT940 dies Nov 2026), ideally via FinGuard auto-feed; auto-categorization; management-by-exception monitoring | 2Work, OnView+FinGuard |
| 4 | **Payment initiation**: SEPA batch files (pain.001) to bank or FinGuard Payment Hub, betaaladvies with feestdag logic, four-eyes approval | 2Work, FinGuard rail |
| 5 | **Leefgeld automation** incl. execution on public holidays; leefgeldrekeningen (FinGuard) | Smart FMS/BlueLemon24, FinGuard |
| 6 | Schuldregistratie + regeling proposals + aflossingscapaciteit | 2Work, Bewind.app |
| 7 | **Boedelbeschrijving + R&V generation** in rechtbank format, plus machtigingsverzoeken | all |
| 8 | **Aansluitpunt Toezicht system coupling** (PKIo cert) — submit verslagen/verzoeken, receive beslissingen, status, berichten; Mijn CBM as fallback | 12 vendors "gereed" |
| 9 | Letter/document templates (80+ at 2Work) with merge fields; e-mail in/out archived to dossier | 2Work, OnView |
| 10 | **Post digitization/DMS**: scan → OCR → auto-classify → dossier (Anntac-class); Outlook capture | Bizon DigitaalDossier, Anntac, OpenDIS |
| 11 | **Cliëntportaal/app**: inzage rekeningen + budget, document upload, secure messaging, aanvraag indienen (extra leefgeld) | Fineaid, Bizon MijnBizonApp, 2Look, Mijn OnView |
| 12 | Task/termijnbewaking: deadlines (R&V due dates, beginverslag), knowledge rules, backlog dashboards | 2Work, Fineaid |
| 13 | Own-office billing: bewindvoerdersbeloning per LOVCK tariff, intake/eind-facturen, sweep to business account | 2Work, OnView e-factuur |
| 14 | Roles/functiescheiding, per-dossier authorization, logging — needed for **Besluit kwaliteitseisen CBM + accountant audit** | Bizon, 2Work |
| 15 | Tijdschrijven (for extra-uren machtigingen) | OnView |
| 16 | 7-year retention of statements/documents | 2Work |

Cost anchor for build-vs-buy: an 8-seat office on OnView ≈ €2.7k/yr + ~€2.4k setup, +FinGuard €9.50/user/m + €4.95/cliëntrekening/m; 2Work ≈ €1,199/concurrent seat/yr; Aigor €100/m flat.

## 3. Differentiation opportunities (what nobody does well)

1. **Generative AI: effectively absent.** Only Anntac (ML classification) and a BlueLemon24 marketing line. Practitioners hand-roll ChatGPT + VBA ([jsbb.nl](https://www.jsbb.nl/a-i-in-de-bewindvoering-slimmer-werken-zonder-extra-handen/)). Open field: LLM post-triage (read scanned letter → extract instantie, kenmerk, bedrag, deadline → draft task + response), R&V anomaly narratives, client-message drafting at B1 language level.
2. **Instantie-side automation.** No suite automates the *outbound* bureaucracy: toeslagen (huur/zorg/kindgebonden) checks and applications, **bijzondere bijstand for bewindvoerderskosten** (per-gemeente forms), kwijtschelding gemeentelijke belastingen, beslagvrije-voet recalculation. Searches surface only legal info sites, no software claims. This is the single biggest labor sink left untouched.
3. **Proactive signalering across dossiers**: incumbents do exception lists on bank mutations; none advertise entitlement detection ("client is entitled to €X huurtoeslag not being received" — the beslagvrije voet even *assumes* toeslagen are claimed).
4. **Client communication**: portals are read-mostly; messaging exists (Fineaid) but no WhatsApp-grade UX, no automated status updates, no multilingual/low-literacy support.
5. **Modern data layer**: 2Work is 2006-era client-server; OnView is closed web; APIs are rare (only Aigor Expert advertises an API). An internal OS with an event log + API beats all on composability.
6. **Banking**: nobody has PSD2 AIS/PIS direct; the whole market rides file exchange + FinGuard. FinGuard is a partner, not a moat — but replicating leefgeldrekeningen is not realistic; **use FinGuard, don't rebuild it**.
7. **Churn window**: ex-Stratech/Armarium offices migrated during 2025; standards (CAMT, Aansluitpunt) are freshly settled — good moment to define a reference architecture.

## 4. Information-architecture lessons

- **The dossier is the universe.** Every suite hangs everything (post, mail, tasks, transactions, letters, rechtbank correspondence) off the cliëntdossier, with a per-dossier phone book of betrokkenen/instanties (2Work "relatiebestand", BlueLemon24 familierelaties). Documents are auto-routed to dossier + taakhouder (Bizon).
- **Money model:** accounts (unlimited per dossier) → transactions → categories → budgetplan lines → reserveringen ("oormerken") as first-class sub-balances → R&V is a *report over the same ledger*, not a separate artifact. Leefgeld is a scheduled payment stream with holiday-shift logic.
- **Work model:** management-by-exception (only surface deviant transactions), knowledge-rule termijnbewaking, backlog views per medewerker/team; per-dossier role visibility (dossierbeheerder ± assistent, teams, admin dept.).
- **Court model:** verslagen + verzoeken as typed objects with status, synced two-way via Aansluitpunt (eStrategy even signals *new cases* arriving from the rechtbank — worth copying).
- **Ecosystem model:** suites stay thin and delegate: FinGuard (bank rail), Anntac/OpenDIS/Elvy (DMS/OCR), VoIP (telephony). An internal OS can collapse these seams — that's where incumbent friction lives (every seam is a paid module: OnView charges €9.50/user/m just for the FinGuard *koppeling*).

## 5. Honest gaps — could not verify

- **UX reputation**: no Trustpilot/Capterra/G2/forum corpus exists for any of these products; all "user-friendly" claims are vendor or customer-office marketing. No substantiated speed/clunkiness complaints found. Would require user interviews — flagged as unknown, not as "no complaints".
- OnView's non-FinGuard import formats; 2Work's actual architecture (client-server inferred from SQL-Server fee); whether 2Work ever shipped OCR; Bizon and BlueLemon24/Fineaid pricing (all on-quote); BlueLemon24's "AI-powered workflow automation" substance; the exact legal entity behind Bewind.app; Smart FMS↔BlueLemon24 corporate relationship (redirect is the only evidence); Fineaid feature pages (404) — claims sourced from search snapshots.
- Mcas, BizzXL, Flow, Allegro, Van Rijn (on the rechtspraak table) were not torn down — mostly SHV/kredietbank or in-house tools.

**Bottom line:** table stakes = §2's 16 items, with FinGuard + Anntac (or equivalents) as buy-not-build rails and Aansluitpunt coupling (or Mijn CBM manually, since the office's own OS won't be a certified leverancier on day one — realistically start on **Mijn CBM** and treat Aansluitpunt certification as a later milestone). Differentiation = AI post-triage, instantie/toeslagen automation, proactive entitlement signalering, and modern client comms — none of which any incumbent ships today.