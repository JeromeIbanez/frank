# Frank OS v2 — "The office runs itself"

Status: **rev 3** — revised after Temujin rounds 1 (6 findings) and 2 (3 findings); all 9 accepted, none waived
Author: Claude, 2026-08-27
Predecessor: `docs/plans/os-v1.md` (COMPLETE — 4 PRs, 12 review rounds)

---

## 1. Why this plan exists

OS v1 shipped a **system of record with AI assists**. The AI only ever acts
inside a screen a human already opened, which means the human is still the
scheduler: you decide what to work on, you navigate to the tab, Frank helps
once you are there. That is the definition of SaaS, and it is what Jerome
correctly diagnosed when he said the product "looks like a traditional SaaS
product" despite the AI-native pitch.

OS v2 inverts the loop: **the system schedules, the human approves.** Work
arrives pre-done, batched by decision type, with evidence attached. The
curator's day becomes a queue of decisions instead of a tour of tabs.

### What v1 already gave us (the kernel)

| OS concept | v1 artefact | State |
|---|---|---|
| Durable state | event-sourced `debt_events`, `transactions`, `documents` | solid |
| Permission model | `src/lib/domain/authz.ts` — roles, vier-ogen | solid |
| Audit / traceability | `audit_events`, DB-enforced append-only, `actorType` already allows `"agent"` | solid |
| Provenance | `ai_proposals` + verified field snippets | solid |
| Primitive scheduler | `signals` detectors → Today | partial — advisory only |
| Primitive process | `tasks` state machine + `playbooks.ts` | partial — no dependencies, no auto-advance |
| Primitive driver | document upload → `intake.ts` | partial — nothing *arrives*, a human uploads |

### What is missing (this plan)

1. **Drivers** — nothing arrives on its own. Curators live in email; Frank has
   an upload form. `inbox/page.tsx` is 58 lines and lists documents.
2. **Processes** — legal procedures are remembered by humans, not run by the
   system. `tasks` has the machinery but no dependency graph and no
   event-driven advancement.
3. **Ceilings** — AI calls carry a `purpose` but no *identity* and no declared
   capability limit. "Agent" is not a modelled concept.
4. **A safeguarding function** — nothing watches for financial abuse of the
   client, or by the office.
5. **A measurable autonomy story** — no way to answer "how much of the work
   does Frank arrive at on its own, and is that number going up?"

---

## 2. Non-negotiable invariants

Carried forward from v1 (see memory `frank-os-v1-architecture`), unchanged:

- **A fully autonomous AI agent CANNOT replace a curator or bewindvoerder.**
  Frank is a copilot. Nothing in this plan changes that.
- Debt balances change ONLY via `debt_events` through the single CTE chokepoint.
- AI proposes, humans dispose; materialization runs through the SAME server
  actions as manual entry.
- Provenance is enforced, not asserted.
- Signals are materialized pointers, never truth.
- Fees are a versioned legal dataset; court facts are recorded, never inferred.
- Official documents are always Dutch; UI is bilingual NL/EN.

New invariants introduced by v2:

- **N1 — Every AI action has a named agent and a capability ceiling enforced in
  code**, not in a prompt. A prompt is not a permission system. The ceiling is
  checked server-side at the mutating action boundary, and an agent literally
  cannot call an action outside its grant.
- **N1b — Agent identity is constructed server-side only.** An `AgentContext`
  is never built from a client-supplied or model-supplied actor field. A model
  that could name its own actor has no ceiling at all. *(Temujin r1 #2)*
- **N2 — Outbound communication is never sent by an agent.** Agents draft;
  a human with the right role approves; sending is audited. (In this build,
  sending is *simulated* — see §8.)
- **N3 — Agents may persist immutable inbound facts and attributable
  drafts/proposals; no agent may materialize or alter consequential domain
  state without a human decision.** There is no `auto_apply` mode and no
  configuration that can create one. Autonomy is **measured and reported**,
  never granted. *(Temujin r1 #1 and r2 #1 — rev 2's wording was internally
  contradictory, since Postbode plainly does write. The permitted pre-decision
  writes are enumerated exhaustively in §2.1; see §7 for reporting.)*
- **N4 — The safeguarding module never asserts fraud, and never asserts a
  legal conclusion it cannot evidence.** It reports *unexplained* patterns and
  *possible* legal positions requiring review. The client's own explanation is
  first-class evidence. Escalation is a human act with a recorded ground.
- **N4b — Absence of a record in Frank is not evidence of absence in the
  world.** Any detector whose finding depends on something Frank has not seen
  must say so in its own wording. *(Temujin r1 #4, #5)*
- **N5 — The office is in scope for monitoring, and every office-scope case has
  a disposition path that does not run through the actor it concerns.**
- **N6 — Synthetic data only.** No real mailbox, no real bank, no real client
  contact in this build. Channel adapters are architected but the only
  implementation is a simulated one, labelled as such in the UI.

### 2.1 What an agent may write before a human decides *(Temujin r2 #1)*

N3 draws the line at **consequential domain state**. The permitted
pre-decision writes are exhaustive — anything not on this list requires a
human decision, and the `AgentActionClass` union in §4.1 is what enforces it.

**Category A — immutable inbound facts.** Recording what arrived. These
cannot be wrong in a way that misstates the dossier, because they assert only
that a message or file was received.
`message_ingest`, `document_create`.

**Category B — attributable, reversible interpretations.** Frank's *reading*
of a fact, always stamped with the agent, always visibly revisable, never
presented as confirmed.
`document_classify` — carries `classificationSource: "ai"` and a confidence,
exactly as v1 already does.
`dossier_link` — **provisional only.** A link written by an agent sets
`linkSource: "agent"` and `linkReviewed: false`, and the obligation card shows
it as awaiting confirmation. Below the confidence floor no link is written at
all and the message goes to `needs_dossier`. No downstream action that depends
on dossier identity may proceed on an unreviewed link — which in practice
means every obligation carries the link confirmation as part of its decision.

**Category C — drafts and proposals.** Inert by construction: a row in
`ai_proposals` or a `letters` row with status `draft` changes nothing until a
human accepts or approves it.
`proposal_create`, `letter_draft`, `clarification_draft`, `escalation_draft`,
`task_suggest`, `process_step_suggest`, `batch_draft`.

**Category D — protective work items.** `safeguarding_case_open` alone.
*(Temujin r3)*: a safeguarding case is neither a draft nor inert in the
ordinary sense — opening one creates a real work item with consequences for a
real person, and it is deliberately **not** modelled as a proposal row. It is
an explicitly permitted, **non-conclusive** protective record: the detector
evidence it carries is immutable, its wording asserts nothing (N4), and it
cannot be disposed of by an agent. Opening a case is permitted precisely
because *failing* to open one is the more dangerous error; everything that
follows from it is a human decision.

**Never, at any autonomy level:** applying a debt event, moving money,
approving anything, filing with a court, sending outbound communication,
disposing of a safeguarding case, or writing to `audit_events` other than as
the audited actor of a permitted action above.

---

## 3. Timebox and cut lines

Four PRs, in dependency order. Each PR has an explicit **cut line**: the first
thing dropped if it overruns. The plan is deliberately front-loaded so that if
we ship only PR-8 and PR-9, the YC demo still works.

| PR | Workstream | Demo value | Cut line (drop first) |
|---|---|---|---|
| PR-8 | W0 Agent runtime | none directly (foundation) | agent panel UI → CLI/test only |
| PR-9 | W1 Channels + Obligation Inbox | **the demo** | multi-channel → email channel only |
| PR-10 | W2 Safeguarding + clarification loop | high (differentiator) | office self-monitoring → client-side only |
| PR-11 | W3 Processes + autonomy reporting | high (the "OS" claim) | reporting → processes view only |

**Stop rule:** if PR-9 is not demo-complete, PR-10 and PR-11 do not start.
A working single motion beats four half-motions in a YC demo. PR-9 must
demonstrate the full motion without depending on PR-10 or PR-11.

---

## 4. PR-8 / W0 — Agent runtime (the syscall table)

Foundation first, mirroring v1's decision to put auth in PR-1. Every AI
surface added later is then *born* with an identity and a ceiling; retrofitting
permissions onto existing agents is how you get a system that cannot be audited.

### 4.1 A distinct agent action vocabulary *(Temujin r1 #2)*

`PrivilegedAction` describes **human-reserved** acts (approve a batch, resolve a
machtiging, mark a letter sent). It is the wrong vocabulary for agents, which
need mundane write capabilities that no human role gate currently names.

So v2 introduces a separate, **exhaustive** union covering every mutating entry
point an agent can reach:

```ts
export type AgentActionClass =
  // Postbode
  | "message_ingest" | "document_create" | "document_classify"
  | "dossier_link" | "proposal_create" | "letter_draft"
  // Waakhond
  | "safeguarding_case_open" | "clarification_draft" | "escalation_draft"
  // Griffier / Kassier (later PRs)
  | "task_suggest" | "process_step_suggest" | "batch_draft";
```

Rules:

- The union is exhaustive by construction: a `Record<AgentActionClass, …>` in
  the registry makes a missing entry a **compile error** (same technique that
  fixed the sidebar icon bug — a silent gap is worse than a loud one).
- Every mutating agent entry point calls `assertAgentMay(ctx, action)` as its
  first statement. Outside the grant it **throws** and writes a security audit
  row. It is never a silent no-op — v1 PR-4 R2 found exactly that failure mode
  in `markLetterSent` and we do not repeat it.
- `neverGrants` is a static per-agent list that overrides any grant. Money
  movement, court filings and outbound sending are on every agent's list.

### 4.2 Server-side context construction (N1b)

```ts
// The ONLY constructor. Takes a registry key, not a request field.
export function agentContext(key: AgentKey): AgentContext
```

No route handler, tool result, or model output can supply an actor. The
`AgentContext` type is not constructible from JSON.

### 4.3 Model

```
agents — static registry in CODE, not a table (charters are reviewed like code)
  key         postbode | waakhond | griffier | kassier | rechtenjager
  charterNl / charterEn   what it may do and why, shown in the UI
  grants      AgentActionClass[]
  neverGrants AgentActionClass[]   ← overrides grants, always wins

agent_activity — per (agentKey, actionClass) counters for §7 reporting
```

There is deliberately **no policy table with a mode column** in rev 2. Under
N3 there is nothing for it to configure.

### 4.4 Also in PR-8

- `ai_proposals` gains `agentKey`; `ai_calls` gains `agentKey` (cost per agent).
- Agent-originated audit rows carry `actorType: "agent"`, `actorId:
  "agent:<key>"` and the correlation id of the triggering event.
- `/office` gains a read-only **Agents** panel: charter, grants, never-grants,
  volume and accept-rate to date.

### 4.5 Tests
Ceiling verdicts including the `neverGrants` override; exhaustiveness; an
integration test that a non-granted agent call throws and audits; a test that
`AgentContext` cannot be produced from a plain object.

---

## 5. PR-9 / W1 — Channels and the Obligation Inbox (the demo)

### The reframe

An inbox item is not a document. It is a **pending obligation**: someone
outside is demanding a response, and there is a right answer and a deadline.

### Model

```
channels
  id, kind (email | post | portal | bank | client_app), label,
  adapter (simulated only in this build), active, lastSyncAt

messages                       ← every inbound item, any channel
  id, channelId, externalId (unique per channel — idempotent ingest),
  threadKey, direction (inbound|outbound), fromName, fromAddress,
  subject, bodyText, receivedAt, rawSha256,
  dossierId (nullable until resolved),
  resolutionConfidence, resolutionEvidence jsonb,   ← why we think it's this dossier
  linkSource (agent | human), linkReviewed boolean, ← §2.1 category B: an
                                                    agent link is provisional
  status (new | resolved | needs_dossier | archived)

message_attachments  → creates rows in the existing `documents` table

obligations                    ← the unit of work
  id, dossierId, sourceMessageId, sourceDocumentId,
  kind (payment_demand | information_request | court_filing | decision_notice |
        client_request | appointment | other),
  summaryNl, summaryEn,
  dueDate, dueDateSource,
  agentKey, findings jsonb,
  proposedLetterId, proposedProposalIds text[],
  status (open | in_review | actioned | dismissed | escalated),
  decidedBy, decidedAt, dismissReason

obligation_links               ← Temujin r1: link, do not duplicate task state
  obligationId, targetType (task | process_step), targetId
```

**Obligations vs tasks** *(Temujin r1, confirmed)*: an obligation is
externally sourced and evidential — it has a source message and a counterparty.
A task is internal work. An obligation links to zero-or-more tasks or process
steps through `obligation_links`; it never duplicates their state.

### Pipeline (Postbode agent)

1. **Ingest** — adapter pulls messages; idempotent on `(channelId, externalId)`.
2. **Resolve to dossier** — deterministic matchers first (dossiernummer, BSN,
   IBAN, creditor reference, exact contact email), model only as a tiebreak.
   Evidence recorded per matcher. Below a confidence floor the item goes to
   `needs_dossier` and a human picks — never a silent guess.
3. **Extract** — reuse the existing `intake.ts` provenance-verified extraction.
4. **Check** — run the rule checks in §5.1.
5. **Propose** — build the obligation and, where the answer is knowable, draft
   the reply into the existing `letters` table as `draft`.

Postbode grants: `message_ingest`, `document_create`, `document_classify`,
`dossier_link`, `proposal_create`, `letter_draft`. Never-grants: everything
else, explicitly including any letter approval or send.

### 5.1 Rule checks as versioned legal datasets

Same treatment as `fees.ts` — effective dates, source URL, version string, and
tests asserting the table against the cited source. Temujin has committed to
**independently verifying the WIK table and every implemented verjaring rule
before merge**, as he did for the fee schedule in PR-7.

Source of record: Besluit vergoeding voor buitengerechtelijke incassokosten
(BIK), https://wetten.overheid.nl/BWBR0031432/ — statutory scale with a €40
minimum and €6,775 maximum, which Temujin confirmed in review round 1.

**Every check abstains by default.** A finding is produced only when all of its
preconditions are evidenced; otherwise the obligation simply carries no finding.
Abstention is the correct behaviour, not a failure.

The WIK check is split into two findings with different preconditions
*(Temujin r1 #3)*, because conflating them produces claims the data cannot
support:

- **`wik_amount_exceeds_cap`** — the charged collection costs exceed the
  statutory maximum for this principal. Preconditions: principal, charged
  costs, and a consumer-applicability basis, all evidenced. Computation is
  deterministic over the versioned scale; the **cent-rounding rule is
  documented in the dataset** (half-up to the cent), and a finding requires
  the excess to exceed a de-minimis threshold so that a rounding difference
  never becomes an allegation.
- **`wik_notice_missing`** — no compliant 14-day notice is evidenced.
  Preconditions: the notice content *and* receipt/delivery evidence. **The
  period runs from receipt, not dispatch.** Without delivery evidence this
  check abstains entirely; Frank not having seen a notice is not evidence that
  none was sent (N4b).

- **`verjaring_possible`** — wording is fixed: *"mogelijke verjaring —
  juridische toetsing vereist"*, never "verjaard" *(Temujin r1 #4)*. Requires
  debt type and an evidenced accrual/due date. The finding text states
  explicitly that interruptions, acknowledgements or proceedings unknown to
  Frank would change the answer.
- **`duplicate_claim`** — same creditor + reference already present, or the
  same underlying debt sold on to a new party.

### UI

`/inbox` becomes the obligation queue: grouped by decision type, keyboard-first
(`j/k` move, `Enter` open, `a` approve, `e` edit draft, `x` dismiss with
reason), each card showing the finding, the evidence snippet, and the drafted
response. Zero-inbox is a real state, not an empty list.

A **"Ontvang post"** control seeds the synthetic mailbox for demos, clearly
labelled as simulation.

### Tests
Idempotent ingest; the resolution-confidence floor; the WIK scale, rounding
rule, de-minimis, and both abstention paths; verjaring wording; the Postbode
ceiling; obligation lifecycle transitions.

---

## 6. PR-10 / W2 — Safeguarding (Waakhond agent)

The bewindvoerder holds a duty of care over a vulnerable adult's money.
Financial abuse — by third parties, by scammers, and sometimes by the
bewindvoerder — is the failure mode with the worst consequences and the least
tooling.

### Detectors (pure, versioned `safeguarding-v1`)

**Client-side**
- `cash_withdrawal_spike` — cash out well above this client's own baseline
- `structuring` — repeated just-under-threshold withdrawals
- `rapid_in_out` — credit followed by a near-equal debit within a short window
- `new_payee_high_value` — first-ever transfer to an unknown IBAN above a floor
- `high_risk_merchant` — gambling / crypto / pawn, from a **curated versioned
  list**, never model guesswork
- `leefgeld_diversion` — leefgeld drained immediately on arrival
- `direct_debit_without_recorded_mandate` — a new SEPA mandate with no mandate
  on file. Renamed from `unmandated_direct_debit` *(Temujin r1 #5)*: Frank's
  missing record cannot prove no mandate exists, and the name must not claim
  otherwise. Finding text says "no recorded mandate", not "unauthorised".
- `beneficiary_name_mismatch` — the IBAN on an incoming demand does not match
  the creditor on file. Finding text: *"tenaamstelling wijkt af — verificatie
  vereist"*. It is **never** described as invoice fraud *(Temujin r2 #3)*;
  a mismatch is a reason to verify, and legitimate mismatches are common
  (factoring, name changes, incasso-intermediairs).

**Cut in rev 2:** `payment_to_related_contact` *(Temujin r1 #5)*. A
family-relation label is not suspicious evidence, and normal support between
relatives is common in exactly these households; the false-positive harm
outweighs the yield. If it ever returns it needs a provenance-bearing
relationship record **plus** an unusual-pattern threshold — not an IBAN match
against a CRM label.

**Office-side (N5).** Names and finding text are neutral: these describe what
was observed, not what it means *(Temujin r2 #3)*.
- `office_linked_beneficiary_outside_fee_basis` — a payment whose beneficiary
  is an office actor or the office, outside the recorded fee basis. Renamed
  from `self_dealing`, which was a conclusion, not an observation.
- `fee_above_schedule` — office charged more than `fees.ts` permits for the
  period. Deterministic against the versioned dataset.
- `four_eyes_violation` — fires **only on an evidenced violation of the actual
  approval rule** (the same-actor approval that `canApproveBatch` forbids),
  never on an "unusual pattern". Renamed from `four_eyes_bypass`. If it cannot
  point at the rule and the two audit rows that breach it, it does not fire.

### Casework model

Signals stay pointers (invariant preserved). Durable casework lives in its own
table:

```
safeguarding_cases
  id, dossierId, detectorKey, detectorVersion, dedupeKey (unique),
  scope (client | office), concernsActorId,     ← set for office scope
  severity, openedAt,
  evidence jsonb           ← transaction ids, amounts, the computed baseline
  status: open → clarifying → explained → resolved | escalated
  clarificationMessageId, clientResponseMessageId,
  dispositionReason, dispositionBy, dispositionAt,
  escalationGround, escalationDestination, escalationDocumentId
```

### The loop

1. **Flag** — the detector opens a case. UI language is *"onverklaarde
   transactie"* / *"aandachtspunt"*. The word **fraude never appears** in a
   generated artefact (N4).
2. **Clarify** — Waakhond drafts a plain-language Dutch question to the client
   (B1 reading level, non-accusatory, explaining why we ask). A human approves
   it before it goes out. The client's reply is captured and attached.
3. **Decide** — a human resolves with a reason code, or escalates. Escalation
   records a ground and a destination (kantonrechter, bank, Veilig Thuis,
   aangifte) and generates the accompanying Dutch document as a draft.

### Independent disposition for office-scope cases *(Temujin r1 #6)*

"Not dismissible by the concerned actor" prevents self-clearance but, for a
solo bewindvoerder, creates a case nobody can close. So:

- An office-scope case is **immutable to `concernsActorId`** — that actor
  cannot dismiss, resolve, edit, or dispose of it, and an attempt is audited.
- The office configures an **independent reviewer** (a second bewindvoerder) or,
  where there is none, a **named external escalation destination** — the
  kantonrechter who appointed the bewindvoerder is the natural default.
- Where neither exists the case stays open and visible rather than being
  quietly closable. An unresolvable open case is the honest state.
- The demo seeds an independent reviewer so the path is demonstrable.

**Decided by Jerome, 2026-08-27:** for a solo office the independent
destination is **the kantonrechter** who appointed the bewindvoerder. That is
now the default rather than an open question.

**Future direction (NOT in v2, recorded so it is not lost):** an LLM acting
as a standing independent inspector — reviewing office-scope cases, and more
broadly auditing the office's own work as it happens, rather than only when a
detector fires. Worth noting that this does not replace the kantonrechter: an
inspector that reports to the same office it inspects is not independent in
the sense that matters legally. The plausible shape is that it *prepares* what
a kantonrechter or an external reviewer then reads, which is the same
copilot-not-replacement rule applied to oversight itself.

### Ethical guardrails

- The UI presents a **question**, never a conclusion.
- Baselines are per-client, so a client who ordinarily prefers cash is not
  flagged for being themselves.
- Every case shows the client's explanation beside the finding once given.
- The client retains dignity and rights as an adult; monitoring is bounded to
  the mandate and stated in the dossier.

### Tests
Each detector against fixtures including deliberate false-positive shapes;
baseline computation; the immutability rule for `concernsActorId`; the case
state machine.

---

## 7. PR-11 / W3 — Processes and autonomy *reporting*

### Processes (the OS claim, made literal)

```
processes
  id, dossierId, definitionKey, definitionVersion,
  status (running | blocked | done | cancelled), startedAt, dueAt
process_steps
  id, processId, stepKey, dependsOn text[],
  status (pending | ready | in_progress | blocked | done | skipped),
  taskId (bridges to the existing tasks table),
  blockedReason, dueAt, completedAt
```

Definitions in code (versioned, like playbooks): `intake` (incl. the art. 1:436
four-month clock), `rv_jaarlijks`, `machtiging`, `schuldtraject`,
`einde_bewind`.

Steps advance on **events**, not on render — same discipline as
`refreshSignals()`. A step becomes `ready` when its dependencies are `done`;
completing a task completes its step; a missing precondition sets `blocked`
with a reason.

`/processes` is the task-manager view: *47 running, 3 blocked, 2 overdue,
12 waiting on you* — with the blocking reason spelled out per row.

### Autonomy reporting, not a ratchet *(Temujin r1 #1)*

Rev 1 proposed promoting proven action classes to `auto_apply`. **Cut.** Under
N3 and §2.1, agents record what arrived and draft what might follow; **no agent
materializes or alters consequential domain state without a human decision**,
and there is no mode that would let one. *(Temujin r3: the earlier shorthand
here — "nothing in v2 writes without a human decision" — contradicted §2.1 and
is corrected.)* The reasoning I accept: the
static ineligibility list is necessary but not sufficient, because
technically-reversible acts like dossier linking and document filing still
create durable, privacy-sensitive downstream errors — and "the system
schedules, the human approves" is the stronger claim anyway.

What ships instead, which carries the same pitch weight without the risk:

- Per `(agentKey, actionClass)`: proposals made, accepted unedited, accepted
  with edits, rejected — with the edit distance where meaningful.
- **Time-to-decision** and **work-arrived-ready**: what share of the curator's
  day showed up pre-drafted rather than being hunted down. This, not
  write-autonomy, is the number that maps to the tariff cap.
- A human-facing **eligibility analysis**: "this class has been accepted
  unedited 214 times — it is a candidate for future automation." A
  recommendation to a human, with no switch behind it.
- `/office` shows the curve over time.

---

## 8. Scope limits and honesty (N6)

- **No real mailbox, bank, or client contact.** Channels ship with a single
  simulated adapter over seeded synthetic data. The UI says so.
- **Outbound is simulated**, exactly as pain.001 remains demo-only: approving a
  send marks the message `sent` and writes audit; nothing leaves the system.
- The `17/22h` figure remains an internal benchmark, never a legal norm.
- Clerk keys and AI Gateway credits remain Jerome's actions; the build degrades
  gracefully without either.

---

## 9. The demo (what this is all for)

One motion, ~90 seconds:

1. Curator opens Frank. Today says: *"Vier dingen hebben je vandaag nodig."*
2. Click **Ontvang post**. Three messages arrive.
3. Within seconds each is classified, routed to a dossier with visible
   evidence, extracted, and checked. One card carries a `wik_amount_exceeds_cap`
   finding — charged collection costs above the statutory maximum for that
   principal, with the scale, the computed cap and the excess shown — beside
   the drafted Dutch dispute letter. *(The rev-1 example figures were wrong;
   Temujin recomputed them. Demo fixtures must be built so the excess is
   unambiguous and well clear of the de-minimis threshold, and the fixture test
   asserts the arithmetic.)*
4. Curator confirms the dossier link and presses **a**. The letter is
   approved. **The money is not touched.** The proposed debt adjustment stays
   pending, and the obligation stays open, until the bewindvoerder records it
   as a separate decision through the existing provenance-bearing debt-event
   action — which is one more keystroke, and is the point.
   *(Temujin r2 #2: rev 2's demo had letter approval also applying the debt
   event, which breaks the v1 invariant that balances change only through an
   explicit audited decision. The corrected flow is a better demo anyway —
   pausing to say "notice it did not move the money on its own" is the
   safety story made visible.)*
5. Only after that second decision does the obligation close and its linked
   process step advance.
6. A Waakhond card: *€800 cash withdrawn in three days against a €120
   baseline.* Curator approves the clarification question to the client.
7. Cut to `/office`: 47 processes running, 3 blocked — and the curve of work
   that arrived ready.

Closing line, which is true and is the whole company:
**every dossier makes every other dossier better.**

---

## 10. Review history

**Round 1 — Temujin: REVISE, 6 findings. All accepted, none waived.**

1. Cut `auto_apply` from v2 → N3 rewritten; §7 is now reporting only.
2. Agent action vocabulary must be its own exhaustive union, and
   `AgentContext` must be server-constructed → §4.1, §4.2, N1b.
3. The WIK demo example was arithmetically wrong, and the check needs
   preconditions → §5.1 splits the check in two, adds abstention-by-default,
   a documented rounding rule and a de-minimis threshold; §9 corrected.
4. Verjaring must say "possible limitation — legal review required" → §5.1,
   plus the general rule N4b.
5. Cut `payment_to_related_contact`; rename `unmandated_direct_debit` → §6.
6. Office-scope cases need an independent disposition path → §6.

Confirmed by Temujin in the same round: keep office self-monitoring; keep the
obligation/task separation (link, don't duplicate); he will independently
verify the WIK table and every verjaring rule before merge.

**Round 2 — Temujin: REVISE, 3 findings. All accepted, none waived.**

1. N3 as written was internally contradictory — it forbade agent writes while
   the plan granted Postbode five of them. Rewritten to draw the line at
   *consequential domain state*, with §2.1 enumerating the permitted
   pre-decision writes in three categories and making agent-written dossier
   links explicitly provisional (`linkSource`, `linkReviewed`).
2. Demo step 4 broke the debt invariant: approving a letter cannot also apply
   a debt event. The flow now requires a separate, explicit bewindvoerder
   decision through the existing debt-event action, and the obligation stays
   open until then → §9.
3. Safeguarding labels tightened to meet N4: `beneficiary_name_mismatch` is
   never called invoice fraud; `self_dealing` renamed to
   `office_linked_beneficiary_outside_fee_basis`; `four_eyes_bypass` renamed
   to `four_eyes_violation` and fires only on an evidenced breach of the
   actual approval rule → §6.

Also noted by Temujin in round 2: the throughput framing that replaced the
autonomy ratchet is *stronger*, not weaker — "work arrives ready; the human
holds the pen" is credible and appropriate to the domain.

**Open item for Jerome (not a code decision):** the production governance
policy for office-scope safeguarding cases in a solo-bewindvoerder office —
who is the independent reviewer, and what is the standing escalation
destination.
