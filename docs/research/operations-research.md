# Operations of a Dutch Bewindvoerder/Curator Office — Research Report

Research for an internal operating system for an AI-native bewindvoering (adult financial guardianship) agency. Sources are Dutch (cited inline). Legal frame: *beschermingsbewind* under art. 1:431–1:449 BW, supervised by the *kantonrechter* (subdistrict court judge); professional offices must meet the *Besluit kwaliteitseisen curatoren, beschermingsbewindvoerders en mentoren* and are vetted annually by the *Landelijk Kwaliteitsbureau CBM* (LKB).

---

## 1. End-to-end workflow per client dossier

### 1.1 Intake & aanvraag (application)
- **Aanmelding + intakegesprek** (intake interview, usually at home): map the situation (grondslag: psychological/physical condition or *problematische schulden*/verkwisting), gather ID, income, debts, existing accounts. ([MR Beschermingsbewind werkproces](https://mrbeschermingsbewind.nl/werkwijze/werkproces-bewindvoering/), [Visser Bewindvoering](https://visserbewind.nl/werkwijze/))
- **Verzoekschrift to the kantonrechter** (petition): standard Rechtspraak forms + *bereidverklaring* (declaration of willingness) of the bewindvoerder, medical/social statement supporting the grondslag, *akkoordverklaringen* of family. Court fee (griffierecht) applies. ([Rechtspraak — alle formulieren bewind](https://www.rechtspraak.nl/onderwerpen/bewind/alle-formulieren-voor-bewindvoering))
- **Zitting** (hearing) → **beschikking** (court order) naming the bewindvoerder and start date. ([Mando Bewind](https://mandobewind.nl/bewindvoering-aanvragen/))
- Judgment-based, but the paperwork assembly is highly templatable. The hearing legally requires the person (and in practice the bewindvoerder) to appear — **not automatable**.

### 1.2 Dossier opening after the beschikking
- Open **beheerrekening** (management account: all income in, all bills out) and **leefgeldrekening** (living-allowance account with debit card for the client), both in the client's name, controlled by the bewindvoerder. Banks have dedicated products for professionals: [ABN AMRO Professionele bewindvoering](https://www.abnamro.nl/nl/zakelijk/producten/zakelijke-rekening/financieel-beheer/bewindvoering.html) (price per client regardless of number of accounts; transaction import and digital payment batches), plus a leefgeldrekening product; Rabobank uses Rabo DirectPakket; ING accepts *beheerverzoeken*. ([mijncbm.nl on leefgeldrekening](https://mijncbm.nl/bewindvoerder/wat-is-een-leefgeldrekening/))
- **Aanschrijven instanties** (notify all counterparties, redirect mail/payments to the beheerrekening and correspondence address of the office): Belastingdienst/Toeslagen, gemeente (uitkering, gemeentebelastingen), UWV, SVB, zorgverzekeraar, energieleverancier, woningcorporatie, CAK, waterschap, pensioenfondsen, telecom, deurwaarders. Municipalities have dedicated bewindvoerder channels (e.g. [Rotterdam "Beschermingsbewind doorgeven"](https://www.rotterdam.nl/beschermingsbewind-doorgeven)). This is a fan-out of ~15–30 near-identical letters/forms per dossier — **prime automation target**.
- **Boedelbeschrijving** (asset/debt inventory) filed with the kantonrechter within 3–4 months of start; with a **plan van aanpak** (action plan) when the grondslag is problematic debts. ([Rechtspraak — machtiging en verantwoording](https://www.rechtspraak.nl/voor-advocaten-en-juristen/reglementen-procedures-en-formulieren/civiel/curatele-bewind-en-mentorschap/machtiging-verantwoording), [Piekoo — start van het bewind](https://www.piekoo.nl/kennisbank/202102/de_start_van_het_bewind))
- **Budgetplan** (budget plan): fixed income vs fixed charges, reserves, leefgeld amount agreed with the client — the operating contract for the dossier. ([2Work](https://www.2work.nl/))

### 1.3 Income maximization (inkomensreparatie)
- Apply for **huurtoeslag/zorgtoeslag** (rent/health-care benefit) and other toeslagen via *Mijn toeslagen* under digital representation; **bijzondere bijstand** (special municipal assistance) to cover the bewind fee itself — apply within ~3 months of the beschikking (e.g. [Nijmegen](https://www.nijmegen.nl/diensten/uitkering-schulden-laag-inkomen/bijzondere-bijstand-bewindvoerders/), [Rotterdam](https://www.rotterdam.nl/bijzondere-bijstand-voor-bewindvoerderskosten-aanvragen), [Utrecht](https://www.utrecht.nl/werk-en-inkomen/geld-en-hulp-bij-rondkomen/vergoeding-voor-bewindvoering-curatele-of-mentorschap)); **kwijtschelding** (waiver) of gemeentelijke belastingen and waterschapsbelasting ([Amsterdam bewindvoerderspagina](https://www.amsterdam.nl/sociaaldomein/werk-participatie-inkomen/schuldhulpverlening-amsterdam/bewindvoerders/), [Schuldinfo — bijzondere bijstand](https://schuldinfo.nl/bijzondere-bijstand/)). All rule-based form work, per-municipality variation is the main friction.
- **Annual belastingaangifte** (income tax return) for the client via Mijn Belastingdienst under digital representation. ([Belastingdienst — digitale vertegenwoordiging](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/aangifte_doen/praktische_informatie/digitale-vertegenwoordiging-bewindvoerders/))

### 1.4 Debt management
- Inventory debts, notify **deurwaarders** (bailiffs) of the bewind, verify/correct the **beslagvrije voet** (attachment-free threshold) on any wage/benefit garnishment; arrange **betalingsregelingen** incl. CJIB (standard/custom arrangements, 4-month *noodstopprocedure*). ([Schuldinfo — CJIB](https://schuldinfo.nl/cjib-boete), [Schuldinfo — bewind](https://schuldinfo.nl/beschermingsbewind-curatele-mentorschap))
- Stabilize, then refer to gemeentelijke schuldhulpverlening for an **MSNP** (amicable scheme) and, failing that, **WSNP** petition. The bewindvoerder does not run the sanering but delivers the paperwork and manages the budget throughout.
- The **Schuldenknooppunt** is the national standard for digital message exchange between schuldhulpverleners/bewindvoerders and creditors (debt statement requests, proposal/response flows); modules exist specifically for bewindvoerders. ([schuldenknooppunt.nl](https://schuldenknooppunt.nl/), [NVVK](https://www.nvvk.nl/schuldenknooppunt))

### 1.5 Ongoing beheer
- Pay all bills from the beheerrekening per budgetplan; transfer **leefgeld weekly** (most offices weekly, some monthly); monitor incoming income (salary, uitkering, toeslagen) and flag misses same-day.
- **Post/correspondence**: nearly all client mail is redirected to the office — scan, classify, link to dossier, act (a payment, an objection, a form). Document-recognition vendors exist just for this niche (e.g. [Anntac](https://www.anntac.com/bewindvoering), from €17.50/month, integrates with OnView/2Work/Smart FMS/Stratech; [R.E.D. Systemen DMS](https://www.redsystemen.nl/bewindvoering/)).
- **Client communication**: phone hours, client portals (software suites ship a *cliëntportaal* showing balances/leefgeld), leefgeld requests, extra-spending requests. Judgment calls (granting an extra payment) sit with the bewindvoerder; for transactions over €1,500 or special acts (selling property) a **machtiging** (court authorization) from the kantonrechter is legally required.

### 1.6 Court reporting
- **Jaarlijkse rekening & verantwoording (R&V)**: annual account to the kantonrechter (and the client); **eindrekening** at the end of the bewind; **5-jaarlijkse evaluatie** on whether bewind should continue. ([Rechtspraak — rekening en verantwoording](https://www.rechtspraak.nl/onderwerpen/rekening-en-verantwoording), [Via Juridica art. 1:445-446 BW](https://www.viajuridica.nl/informatiesoorten/wetstoelichtingen/rekening-en-verantwoording-bewindvoerder-art-1-445-1-446-bw))
- Since 2025/2026 professionals **must file digitally**, either system-to-system via the **Aansluitpunt Toezicht** or via the **Mijn CBM** portal ([Rechtspraak — digitaal toezicht](https://www.rechtspraak.nl/voor-advocaten-en-juristen/reglementen-procedures-en-formulieren/civiel/curatele-bewind-en-mentorschap/digitaal-toezicht), [NVVK on mandatory e-communication](https://www.nvvk.nl/nieuws-detail/2025/03/03/verplichte-elektronische-communicatie-voor-bewindvoerders-wat-verandert-er), [Stb. 2024, 444](https://zoek.officielebekendmakingen.nl/stb-2024-444.html)). The court's digital system auto-signals gaps in filed R&Vs.

---

## 2. Recurring tasks and cadence

| Cadence | Task |
|---|---|
| Daily | Import bank transactions; match against budgetplan; process scanned post; answer client messages; pay incoming invoices |
| Weekly | Leefgeld transfer per client; exception review (missed income, negative balance, failed direct debits) |
| Monthly | Reconciliation of every beheerrekening; check uitkering/toeslag receipts; monitor betalingsregelingen and spaardoelen |
| Quarterly | Review of stalled debt dossiers; check beslagvrije voet after income changes |
| Annual | **R&V** per dossier to the kantonrechter; **belastingaangifte** per client; toeslagen recheck after definitieve berekening; kwijtschelding applications (each tax year); bijzondere bijstand renewal (some gemeenten); energy contract check; premium/polis check zorgverzekering; indexation of leefgeld/budget; **office-level**: LKB *handhavingsverzoek* with accountant's report (verklaring/samenstellingsverklaring), jaarrekening, quality-compliance report ([LKB](https://www.rechtspraak.nl/voor-advocaten-en-juristen/reglementen-procedures-en-formulieren/civiel/curatele-bewind-en-mentorschap/landelijk-kwaliteitsbureau-cbm), [Besluit kwaliteitseisen — Stb. 2021, 469](https://zoek.officielebekendmakingen.nl/stb-2021-469.html)) |
| 5-yearly | Evaluatie of the bewind (continue / scale down / uitstroom) ([mijncbm.nl](https://mijncbm.nl/vijfjaarlijkse-evaluatie-bewindvoering-familielid/)) |
| Event-driven | Verhuizing, overlijden, PGB-beheer, woningontruiming/verkoop (each with extra court fee and machtiging), uitstroom naar budgetbeheer |

---

## 3. Where time actually goes

- **The fee system defines the time budget**: professional tariffs (Regeling beloning curatoren, bewindvoerders en mentoren) assume **17 hours/year per standard dossier, 22 hours/year with problematic debts** (forfait — flat monthly fee regardless of actual hours). 2026: **€1,630/yr standard, €2,107/yr with debts** for professionals; extra flat fees for intake (~€700), verhuizing/ontruiming, PGB, eindrekening. ([Tarieven beschermingsbewind 2026 — Rapport BI](https://rapportbi.nl/wp-content/uploads/2025/12/Tarieven-beschermingsbewind-2026.pdf), [Goedvertegenwoordigd — kosten](https://www.goedvertegenwoordigd.nl/kennisbank/04-kosten-bewindvoering/)) That is ~€95/hr gross to cover everything — the entire business case for automation is fitting real work inside 17–22 hours.
- Politics recognizes the squeeze: the 2026 tariff was raised 10.5% explicitly so bewindvoerders "can spend more time on the client", plus a *doorstroombeloning* (throughput bonus) to reward moving clients out of bewind. ([NVVK, apr 2025](https://www.nvvk.nl/nieuws-detail/2025/04/23/bewindvoerders-kunnen-meer-tijd-besteden-aan-hulpvrager), [Kamerstuk 24515-755](https://zoek.officielebekendmakingen.nl/kst-24515-755.html))
- The Kat *initiatiefnota* (2023) proposes caseloads of **40–50 dossiers per bewindvoerder** (practice is often 60–80+) and more paid contact hours — implying today's dossiers are handled largely as batch administration. ([Kamerstuk 36464-2](https://zoek.officielebekendmakingen.nl/kst-36464-2.html))
- Unbillable friction: **BelastingTelefoon waits routinely exceed an hour and calls get cut off** ([Kassa/BNNVARA](https://www.bnnvara.nl/kassa/artikelen/belastingdienst-telefonisch-slecht-bereikbaar-zo-lang-sta-je-in-de-wacht)); every gemeente has its own bijzondere-bijstand and kwijtschelding forms; deurwaarder correspondence is unstandardized. Time sinks in practitioner accounts: post processing, chasing instanties, R&V preparation, and client phone/WhatsApp traffic.
- Market size context: ~**63,500 under schuldenbewind and ~209,500 under bewind for other grounds** (per Kamerstuk 36464-2, Jan 2022) — roughly a quarter-million dossiers nationally.

---

## 4. Existing software

| Product | What it does | Notes |
|---|---|---|
| **OnView** ([onview.nl](https://www.onview.nl/)) | Market leader; web-based dossier management, income/expense administration, bankkoppeling for transactions & balances with liquidity plan, digital archive, auto-generated letters/forms/reports, VoIP module, e-factuur, FinGuard scanning integration | Pricing per user/month, on request ([prijzen](https://www.onview.nl/prijzen/)); "client connector" bank link recently added |
| **2Work / Bewind2work** ([2work.nl](https://www.2work.nl/)) | All-in-one for bewindvoerders/curatoren/mentoren/inkomensbeheerders: budgetplan from fixed income/expenses/reserves, dossier workflow, R&V | [Tarieven page](https://www.2work.nl/tarieven) exists; quote-based |
| **Smart FMS** ([smartfms.nl](https://www.smartfms.nl/financieel-beheer)) | Financial-management/task application with daily insight into client finances; payment platform character | Also serves budgetbeheer market |
| Others | **Stratech**, **Bizon Software** (publishes on [Digitaal Toezicht](https://bizonsoftware.nl/digitaal-toezicht-bewind/)), **Fineaid**, **Piekoo**, **FinGuard** (file exchange), **Anntac** (AI document recognition, from €17.50/m), **R.E.D. Systemen** (scanning/DMS) | Ecosystem is fragmented: core suite + separate scanning/OCR + separate bank tooling ([Anntac](https://www.anntac.com/bewindvoering), [redsystemen.nl](https://www.redsystemen.nl/bewindvoering/)) |

**Gaps** (relevant to a new entrant): no public pricing anywhere; bank connectivity is import/export-centric rather than real-time PSD2; instantie-notification, toeslagen/bijzondere-bijstand/kwijtschelding applications and post triage remain human work orchestrated *around* these tools; little/no AI; client communication is bolt-on portals.

---

## 5. Integration surface (verified)

**Banking**
- Dedicated bewind products at the big three: ABN AMRO ([professionele bewindvoering](https://www.abnamro.nl/nl/zakelijk/producten/zakelijke-rekening/financieel-beheer/bewindvoering.html) — per-client pricing, transaction import, digital payment batches, leefgeldrekening product; also [curatoren-boedelrekening](https://www.abnamro.nl/nl/zakelijk/producten/zakelijke-rekening/financieel-beheer/curatoren-boedelrekening.html) under the Convenant Boedelrekeningen with ING and Rabobank for WSNP/faillissement), Rabobank (Rabo DirectPakket as leefgeldrekening), ING (beheerverzoek). ([boedelrekening toelichting PDF](https://bbwsnp.nl/wp-content/uploads/2022/08/Toelichting-openen-boedelrekening-ABN-AMRO-Rabobank-en-ING.pdf))
- **PSD2 AIS/PIS** via licensed TPPs gives nightly (or realtime) transaction feeds and payment initiation on any Dutch bank ([uitleg](https://softwarewiki.nl/boekhouding/bankkoppeling/)); classic **MT940/CAMT.053** batch export plus SEPA pain.001 payment batches remain the standard exchange in this sector. **bunq** exposes a full [Open API](https://www.bunq.com/nl-nl/business/features/api) (and a PSD2 partner path), though bewind account opening at bunq is not a packaged product ([bunq Together thread](https://together.bunq.com/d/60838-bewindvoering)). Note: courts have opinions about which bank a bewindvoerder uses ([case: ontslag wegens bankkeuze](https://bewind.dewijsmaker.nl/nieuws/ontslag-bewindvoerder-en-benoeming-opvolger-omdat-deze-bankiert-bij-een-andere-bank)).

**Government / courts**
- **Aansluitpunt Toezicht (Rechtspraak)**: system-to-system filing of boedelbeschrijving, R&V, machtigingsverzoeken, correspondence — mandatory digital since 1-1-2026; your software must be certified/connected. Portal alternative: **Mijn CBM**. ([digitaal toezicht](https://www.rechtspraak.nl/voor-advocaten-en-juristen/reglementen-procedures-en-formulieren/civiel/curatele-bewind-en-mentorschap/digitaal-toezicht), [Mijn CBM](https://www.rechtspraak.nl/onderwerpen/mijn-cbm))
- **Bevoegdheidsverklaringsdienst (Logius)**: proves the bewind relationship digitally (checked live against the Rechtspraak register). Professionals log in with **eHerkenning EH3** + BSN of the client into *Mijn Belastingdienst / Mijn toeslagen* — no paper beschikking needed. ([Logius FAQ](https://www.logius.nl/diensten/bevoegdheidsverklaringsdienst/veelgestelde-vragen-bevoegdheidsverklaringsdienst), [Belastingdienst — digitale vertegenwoordiging](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/prive/aangifte_doen/praktische_informatie/digitale-vertegenwoordiging-bewindvoerders/))
- **Serviceberichten Aanslag (SBA) & Toeslagen (SBT)**: digital copies of every aanslag/toeslag beschikking delivered into SBR-capable software via Digipoort + PKIoverheid certificate — the structured alternative to opening paper post. ([Belastingdienst SBA](https://www.belastingdienst.nl/wps/wcm/connect/bldcontentnl/belastingdienst/intermediairs/aangifte_doen/serviceberichten_aanslag/serviceberichten_aanslag1), [AFAS SBT doc](https://help.afas.nl/help/NL/SE/Tax_SBT.htm)); Belastingdienst maintains a [bewindvoerders info hub](https://www.belastingdienst.nl/wps/wcm/connect/nl/intermediairs/content/informatie-voor-bewindvoerders) with online forms (DigiD/eHerkenning).
- **MijnOverheid Berichtenbox**: clients **cannot** grant bewindvoerders direct Berichtenbox access ([mijn.overheid.nl](https://mijn.overheid.nl/wat-is-de-berichtenbox/machtigen/)); the workaround is SBA/SBT service messages. A real gap your ops must design around.
- **Schuldenknooppunt**: standardized creditor messaging (debt statements, proposals) for schuldhulp and bewindvoerders; recently brought under public governance. ([schuldenknooppunt.nl](https://schuldenknooppunt.nl/), [Binnenlands Bestuur](https://www.binnenlandsbestuur.nl/sociaal/schuldhulp-en-armoedebeleid/schuldenknooppunt-genationaliseerd))
- Gemeenten: no uniform API for bijzondere bijstand/kwijtschelding; per-gemeente web forms (often eHerkenning-gated bewindvoerder portals, e.g. Amsterdam, Rotterdam). iWmo/GGk is for zorgaanbieders-gemeente traffic, not bewindvoering — not part of your surface.

---

## 6. Failure modes = quality KPIs

From complaint literature and the Kat initiatiefnota ([Schuldinfo — klachten bewindvoerder](https://schuldinfo.nl/klachten/bewindvoerder), [Kamerstuk 36464-2](https://zoek.officielebekendmakingen.nl/kst-36464-2.html), [Radar forum on Rapport BI](https://radar-forum.avrotros.nl/overig-juridisch-financieel-f93/klachten-rapport-bi-bewindvoering-t151864.html)):

1. **Late/missed payments of fixed charges** (rent, energy, premiums) → new debts created *under* bewind; documented liability cases.
2. **Toeslagen/bijzondere bijstand/kwijtschelding not (timely) applied for** → client below subsistence; established ground for damages.
3. **Unreachable, poor communication** — the single most common complaint; clients can't reach anyone about leefgeld.
4. **Beslagvrije voet not enforced/corrected** with deurwaarders.
5. **Late or poor R&V filings** frustrating court oversight; ~300 offices were still non-digital pre-2026.
6. **Not identifying themselves to creditors/instanties** at start → arrears pile up during the notification gap.
7. Escalation path: internal klachtenprocedure → kantonrechter (who can award damages and dismiss the bewindvoerder) ([SnK Juristen](https://snkjuristen.nl/klachten-bewindvoerder/)).

KPI candidates: time-to-first-payment-of-fixed-charges after beschikking; % instanties notified within X days; toeslag application lead time; leefgeld punctuality; % R&V filed on time; client response time; new-debt incidence under bewind; doorstroom (exit) rate.

---

## Automatability classification

- **Rule-based / automatable**: instantie notifications, bank transaction import & categorization, weekly leefgeld batches, bill payment against budgetplan, toeslagen/kwijtschelding/bijzondere-bijstand form filling, R&V assembly and Aansluitpunt filing, SBA/SBT ingestion, post OCR/classification, beslagvrije-voet calculation, deadline/cadence tracking, standard CJIB regelingen.
- **Judgment (human-in-the-loop AI)**: budgetplan design, extra-spending/leefgeld exceptions, debt strategy (regeling vs MSNP/WSNP), triage of anomalous post, client conversations, plan van aanpak, uitstroom decisions.
- **Legally personal to the bewindvoerder**: accepting appointment & bereidverklaring, court hearings, signing/responsibility for boedelbeschrijving, R&V and eindrekening, machtiging requests for acts >€1,500 or property transactions, the 5-yearly evaluatie, LKB accountability (plus office-level accountant's verklaring). Automation can prepare all of these; accountability cannot be delegated.
