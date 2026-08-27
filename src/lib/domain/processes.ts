/**
 * Processes — the OS claim made literal (plan os-v2 W3 / PR-11). Pure, no I/O.
 *
 * WHAT A PROCESS IS
 * -----------------
 * A bewindvoerder's obligations are not a to-do list; they are procedures
 * with an order, deadlines that derive from law, and steps that cannot start
 * until earlier ones finish. os-v1 modelled the *tasks* but not the
 * *procedure*: `playbooks.ts` instantiated a flat set of tasks with fixed
 * offsets, so nothing knew that a boedelbeschrijving needs a budgetplan
 * first, and nothing could say WHY a dossier was stuck.
 *
 * This module supplies the missing half: a dependency graph, evaluated
 * against facts about the dossier, producing per-step state and — the part
 * that matters operationally — a reason when a step is blocked.
 *
 * TWO DISCIPLINES CARRIED OVER
 * ----------------------------
 *  1. EVENT-TRIGGERED, NEVER DURING RENDER. Same rule as `refreshSignals()`.
 *     This module is pure so it CAN be called from anywhere, but the
 *     persistence layer only writes on an event.
 *  2. DEADLINES ARE DERIVED, NOT INVENTED. A step that carries a legal
 *     source names it, and a step whose deadline Frank cannot derive gets
 *     no deadline rather than a plausible-looking guess.
 */

export const PROCESS_DEFINITION_VERSION = "processes-v1";

/**
 * `einde_bewind` is deliberately ABSENT (Temujin PR-11 r1 #4).
 *
 * Its only step is the eindrekening, and Frank has no source for whether one
 * has been drawn up. A process that can only ever report "not done", from a
 * hard-coded false, tells a curator nothing and quietly accuses them of
 * being behind on work the system cannot see. It returns when there is
 * something real to read.
 */
export type ProcessDefinitionKey =
  | "intake"
  | "rv_jaarlijks"
  | "machtiging"
  | "schuldtraject";

/**
 * The facts a step can depend on.
 *
 * Deliberately a closed set: a step may only ask about things Frank actually
 * records. Adding a fact means adding a way to observe it, which is the
 * point — a dependency on something unobservable would silently never
 * satisfy, and the process would sit blocked with no honest explanation.
 */
export type ProcessFactKey =
  | "beheerrekening_geopend"
  | "leefgeldrekening_geopend"
  | "instanties_aangeschreven"
  | "budgetplan_opgesteld"
  | "schulden_geinventariseerd"
  | "boedelbeschrijving_vastgelegd"
  | "plan_van_aanpak_vastgelegd"
  | "regelingen_getroffen"
  | "rv_periode_vastgelegd"
  | "transacties_gecategoriseerd"
  | "rv_bespreking_vastgelegd"
  | "rv_ondertekend"
  | "machtiging_drempel_bereikt"
  | "machtiging_afgehandeld";

export type ProcessFacts = Readonly<Partial<Record<ProcessFactKey, boolean>>>;

/**
 * WHO the step is waiting on once its dependencies are met.
 *
 * This is the difference between "you have work to do" and "you are waiting
 * for the kantonrechter", and without it the distinction is invisible.
 *
 * It also makes the `blocked` process status reachable at all. In a pure
 * dependency graph it is not: the earliest not-done step always has all its
 * dependencies done, so something is always actionable and nothing is ever
 * blocked. What actually stalls a bewindvoerder is not the graph — it is a
 * court that has not ruled, a client who has not come in, a creditor who has
 * not replied. That is what `blocked` has to mean to be worth counting.
 */
export type StepOwner = "office" | "court" | "client" | "third_party";

export type StepDefinition = {
  readonly key: string;
  /** Steps that must be `done` before this one can become `ready`. */
  readonly dependsOn: readonly string[];
  /** The fact whose truth marks this step complete. */
  readonly satisfiedBy: ProcessFactKey;
  /** Days from process start. Null = no derivable deadline; see the note. */
  readonly dueOffsetDays: number | null;
  /** Whose move it is. Defaults to the office. */
  readonly owner?: StepOwner;
  /** Cited verbatim in the UI when present. */
  readonly legalSource?: string;
};

export type ProcessDefinition = {
  readonly key: ProcessDefinitionKey;
  readonly version: string;
  readonly steps: readonly StepDefinition[];
};

export const PROCESS_DEFINITIONS: Record<
  ProcessDefinitionKey,
  ProcessDefinition
> = {
  intake: {
    key: "intake",
    version: PROCESS_DEFINITION_VERSION,
    steps: [
      {
        key: "beheerrekening",
        dependsOn: [],
        satisfiedBy: "beheerrekening_geopend",
        dueOffsetDays: 3,
      },
      {
        key: "leefgeldrekening",
        dependsOn: ["beheerrekening"],
        satisfiedBy: "leefgeldrekening_geopend",
        dueOffsetDays: 7,
      },
      {
        key: "aanschrijven_instanties",
        dependsOn: ["beheerrekening"],
        satisfiedBy: "instanties_aangeschreven",
        dueOffsetDays: 14,
      },
      {
        key: "budgetplan",
        dependsOn: ["beheerrekening", "leefgeldrekening"],
        satisfiedBy: "budgetplan_opgesteld",
        dueOffsetDays: 30,
      },
      {
        key: "schulden_inventariseren",
        dependsOn: ["aanschrijven_instanties"],
        satisfiedBy: "schulden_geinventariseerd",
        dueOffsetDays: 60,
      },
      {
        // The statutory one. Four months from the start of the measure.
        key: "boedelbeschrijving",
        dependsOn: ["budgetplan", "schulden_inventariseren"],
        satisfiedBy: "boedelbeschrijving_vastgelegd",
        dueOffsetDays: 120,
        legalSource: "art. 1:436 lid 4 BW",
      },
      {
        key: "plan_van_aanpak",
        dependsOn: ["budgetplan"],
        satisfiedBy: "plan_van_aanpak_vastgelegd",
        dueOffsetDays: 120,
      },
    ],
  },

  rv_jaarlijks: {
    key: "rv_jaarlijks",
    version: PROCESS_DEFINITION_VERSION,
    steps: [
      {
        // Court-set, never inferred (os-v1 invariant).
        key: "periode_vastleggen",
        dependsOn: [],
        satisfiedBy: "rv_periode_vastgelegd",
        dueOffsetDays: null,
        owner: "court",
      },
      {
        key: "transacties_compleet",
        dependsOn: ["periode_vastleggen"],
        satisfiedBy: "transacties_gecategoriseerd",
        dueOffsetDays: null,
      },
      {
        key: "bespreking",
        dependsOn: ["transacties_compleet"],
        satisfiedBy: "rv_bespreking_vastgelegd",
        dueOffsetDays: null,
        owner: "client",
        legalSource: "art. 1:445 BW",
      },
      {
        key: "ondertekenen_indienen",
        dependsOn: ["bespreking"],
        satisfiedBy: "rv_ondertekend",
        dueOffsetDays: null,
      },
    ],
  },

  /**
   * Machtiging, reduced to what Frank can actually evidence
   * (Temujin PR-11 r1 #3).
   *
   * An earlier version claimed three steps: threshold reached, verzoek
   * drafted, beschikking recorded. Only the first and last had a source, and
   * the last was wrong — a `court_authorization` resolution on the payment
   * guard records that a human resolved the guard on that ground, which is
   * not the same as a beschikking being on file. Frank does not store
   * beschikkingen, so it must not imply that it does.
   *
   * What remains is true: the guard fired, and a human recorded how it was
   * resolved with a ground and a timestamp.
   */
  machtiging: {
    key: "machtiging",
    version: PROCESS_DEFINITION_VERSION,
    steps: [
      {
        key: "drempel_geconstateerd",
        dependsOn: [],
        satisfiedBy: "machtiging_drempel_bereikt",
        dueOffsetDays: null,
        legalSource: "LOVT Aanbevelingen B.D2/B.D3",
      },
      {
        key: "afhandelen",
        dependsOn: ["drempel_geconstateerd"],
        satisfiedBy: "machtiging_afgehandeld",
        dueOffsetDays: 14,
      },
    ],
  },

  schuldtraject: {
    key: "schuldtraject",
    version: PROCESS_DEFINITION_VERSION,
    steps: [
      {
        key: "inventariseren",
        dependsOn: [],
        satisfiedBy: "schulden_geinventariseerd",
        dueOffsetDays: 60,
      },
      {
        key: "regelingen_treffen",
        dependsOn: ["inventariseren"],
        satisfiedBy: "regelingen_getroffen",
        dueOffsetDays: 120,
        owner: "third_party",
      },
    ],
  },

};

// ---------------------------------------------------------------------------
// Evaluation
// ---------------------------------------------------------------------------

export type StepStatus =
  /** Dependencies unmet — cannot be started yet. */
  | "blocked"
  /** Dependencies met and it is the office's move. */
  | "ready"
  /** Dependencies met, but someone outside the office has to act first. */
  | "awaiting"
  /** Its fact is true. */
  | "done";

export type EvaluatedStep = {
  readonly key: string;
  readonly status: StepStatus;
  readonly dueDate: string | null;
  readonly overdue: boolean;
  readonly legalSource?: string;
  readonly owner: StepOwner;
  /**
   * Why this step is blocked, in terms of the steps it waits on. Populated
   * only for `blocked`. The whole reason a process view beats a task list is
   * that it can answer this without a human reconstructing it.
   */
  readonly blockedBy: readonly string[];
};

export type EvaluatedProcess = {
  readonly definitionKey: ProcessDefinitionKey;
  readonly version: string;
  readonly steps: readonly EvaluatedStep[];
  /** running | blocked | done — derived, never stored as truth. */
  readonly status: "running" | "blocked" | "done";
  readonly overdueCount: number;
  /** Steps THIS OFFICE could act on right now — the honest "waiting on you"
   *  figure, which must not be inflated by things nobody here can move. */
  readonly readyCount: number;
  /** Steps where the office has done its part and someone else must act. */
  readonly awaitingCount: number;
};

function addDays(iso: string, days: number): string {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

/**
 * Evaluate a process against what is true of the dossier today.
 *
 * Note what is NOT stored: step status is derived on every evaluation from
 * the facts, so it cannot drift from reality the way a hand-maintained
 * status column does. The database keeps the process instance and its
 * timestamps; the truth of each step is recomputed.
 */
export function evaluateProcess(input: {
  definition: ProcessDefinition;
  facts: ProcessFacts;
  startDate: string;
  today: string;
}): EvaluatedProcess {
  const { definition, facts, startDate, today } = input;

  const doneKeys = new Set(
    definition.steps.filter((s) => facts[s.satisfiedBy] === true).map((s) => s.key)
  );

  const steps: EvaluatedStep[] = definition.steps.map((s) => {
    const dueDate =
      s.dueOffsetDays === null ? null : addDays(startDate, s.dueOffsetDays);
    const done = doneKeys.has(s.key);
    const owner: StepOwner = s.owner ?? "office";
    const blockedBy = s.dependsOn.filter((d) => !doneKeys.has(d));
    const status: StepStatus = done
      ? "done"
      : blockedBy.length > 0
        ? "blocked"
        : owner === "office"
          ? "ready"
          : "awaiting";
    return {
      key: s.key,
      status,
      owner,
      dueDate,
      // Overdue applies ONLY to a step someone could actually have done.
      //
      //  - A done step is never overdue: finishing late is a fact about the
      //    past, and leaving it red forever buries what still needs someone.
      //  - A BLOCKED step is never overdue either. Being late for work you
      //    are not yet able to start is not a failure, and marking it so
      //    inflates the count with rows nobody can act on. The lateness is
      //    not lost: it shows up on the blocking step, which IS actionable,
      //    where someone can do something about it.
      overdue:
        !done &&
        blockedBy.length === 0 &&
        dueDate !== null &&
        dueDate < today,
      legalSource: s.legalSource,
      blockedBy,
    };
  });

  const allDone = steps.every((s) => s.status === "done");
  const anyReady = steps.some((s) => s.status === "ready");

  return {
    definitionKey: definition.key,
    version: definition.version,
    steps,
    // Blocked means: nothing here for us to do, and not finished — we are
    // waiting on a court, a client or a creditor.
    status: allDone ? "done" : anyReady ? "running" : "blocked",
    overdueCount: steps.filter((s) => s.overdue).length,
    readyCount: steps.filter((s) => s.status === "ready").length,
    awaitingCount: steps.filter((s) => s.status === "awaiting").length,
  };
}

/**
 * Which processes apply to a dossier.
 *
 * A process that has not begun should not be listed as running. `machtiging`
 * in particular is EVENT-STARTED: it exists because a payment crossed the
 * LOVT threshold, not because the dossier exists. Listing it unconditionally
 * gave every dossier a permanently overdue "draw up the verzoek" for a
 * machtiging nobody ever needed — noise that trains people to ignore the
 * page.
 *
 * `schuldtraject` only for schuldenbewind.
 */
export function applicableProcesses(
  dossier: {
    schuldenbewind: boolean;
  },
  facts: ProcessFacts = {}
): ProcessDefinitionKey[] {
  const keys: ProcessDefinitionKey[] = ["intake", "rv_jaarlijks"];
  if (facts.machtiging_drempel_bereikt) keys.push("machtiging");
  if (dossier.schuldenbewind) keys.push("schuldtraject");
  return keys;
}

/** Office-wide counters for the task-manager view. */
export function summariseProcesses(processes: readonly EvaluatedProcess[]): {
  running: number;
  blocked: number;
  done: number;
  overdue: number;
  waitingOnYou: number;
  awaitingOthers: number;
} {
  return {
    running: processes.filter((p) => p.status === "running").length,
    blocked: processes.filter((p) => p.status === "blocked").length,
    done: processes.filter((p) => p.status === "done").length,
    overdue: processes.reduce((n, p) => n + p.overdueCount, 0),
    waitingOnYou: processes.reduce((n, p) => n + p.readyCount, 0),
    awaitingOthers: processes.reduce((n, p) => n + p.awaitingCount, 0),
  };
}
