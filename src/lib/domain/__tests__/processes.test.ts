import { describe, it, expect } from "vitest";
import {
  PROCESS_DEFINITIONS,
  PROCESS_DEFINITION_VERSION,
  evaluateProcess,
  applicableProcesses,
  summariseProcesses,
  type ProcessFacts,
  type ProcessDefinitionKey,
} from "../processes";

const START = "2026-01-01";
const TODAY = "2026-08-27";

const intake = PROCESS_DEFINITIONS.intake;
const evalIntake = (facts: ProcessFacts, today = TODAY) =>
  evaluateProcess({ definition: intake, facts, startDate: START, today });
const step = (facts: ProcessFacts, key: string, today = TODAY) =>
  evalIntake(facts, today).steps.find((s) => s.key === key)!;

describe("process definitions", () => {
  const keys = Object.keys(PROCESS_DEFINITIONS) as ProcessDefinitionKey[];

  it("keys every definition consistently and stamps the version", () => {
    for (const k of keys) {
      expect(PROCESS_DEFINITIONS[k].key).toBe(k);
      expect(PROCESS_DEFINITIONS[k].version).toBe(PROCESS_DEFINITION_VERSION);
      expect(PROCESS_DEFINITIONS[k].steps.length).toBeGreaterThan(0);
    }
  });

  it("only ever depends on steps that exist in the same process", () => {
    // A dependency on a step that does not exist would block forever with no
    // honest explanation — the exact failure this module exists to prevent.
    for (const k of keys) {
      const def = PROCESS_DEFINITIONS[k];
      const own = new Set(def.steps.map((s) => s.key));
      for (const s of def.steps) {
        for (const d of s.dependsOn) {
          expect(own, `${k}.${s.key} depends on unknown "${d}"`).toContain(d);
        }
      }
    }
  });

  it("has no dependency cycles", () => {
    for (const k of keys) {
      const def = PROCESS_DEFINITIONS[k];
      const byKey = new Map(def.steps.map((s) => [s.key, s]));
      const state = new Map<string, "visiting" | "done">();
      const visit = (key: string, trail: string[]): void => {
        if (state.get(key) === "done") return;
        expect(
          state.get(key),
          `cycle in ${k}: ${[...trail, key].join(" → ")}`
        ).not.toBe("visiting");
        state.set(key, "visiting");
        for (const d of byKey.get(key)?.dependsOn ?? []) visit(d, [...trail, key]);
        state.set(key, "done");
      };
      for (const s of def.steps) visit(s.key, []);
    }
  });

  it("cites a statutory source where one exists, verbatim", () => {
    const boedel = intake.steps.find((s) => s.key === "boedelbeschrijving")!;
    expect(boedel.legalSource).toBe("art. 1:436 lid 4 BW");
    // Four months from the start of the measure.
    expect(boedel.dueOffsetDays).toBe(120);
  });

  it("gives no deadline where Frank cannot derive one", () => {
    // The court's pace is not ours to predict. A plausible-looking invented
    // date is worse than an absent one.
    const rv = PROCESS_DEFINITIONS.rv_jaarlijks;
    expect(rv.steps.every((s) => s.dueOffsetDays === null)).toBe(true);
    // The threshold being reached is an event, not something with a deadline.
    const drempel = PROCESS_DEFINITIONS.machtiging.steps.find(
      (s) => s.key === "drempel_geconstateerd"
    )!;
    expect(drempel.dueOffsetDays).toBeNull();
  });
});

describe("evaluateProcess — dependency graph", () => {
  it("starts with only the dependency-free step ready", () => {
    const p = evalIntake({});
    expect(p.steps.filter((s) => s.status === "ready").map((s) => s.key)).toEqual([
      "beheerrekening",
    ]);
    expect(p.readyCount).toBe(1);
  });

  it("opens the next steps as a dependency completes", () => {
    const p = evalIntake({ beheerrekening_geopend: true });
    const ready = p.steps.filter((s) => s.status === "ready").map((s) => s.key);
    expect(ready).toContain("leefgeldrekening");
    expect(ready).toContain("aanschrijven_instanties");
    expect(ready).not.toContain("budgetplan"); // still needs leefgeld
  });

  it("names WHAT a blocked step is waiting on", () => {
    // The whole reason this beats a task list: it can answer "why is this
    // stuck" without a human reconstructing the chain.
    const s = step({ beheerrekening_geopend: true }, "boedelbeschrijving");
    expect(s.status).toBe("blocked");
    expect([...s.blockedBy].sort()).toEqual([
      "budgetplan",
      "schulden_inventariseren",
    ]);
  });

  it("requires ALL dependencies, not just one", () => {
    const s = step(
      {
        beheerrekening_geopend: true,
        leefgeldrekening_geopend: true,
        budgetplan_opgesteld: true,
      },
      "boedelbeschrijving"
    );
    expect(s.status).toBe("blocked");
    expect(s.blockedBy).toEqual(["schulden_inventariseren"]);
  });

  it("marks a step done from its fact alone", () => {
    expect(step({ budgetplan_opgesteld: true }, "budgetplan").status).toBe("done");
  });

  it("treats a step done out of order as done, and unblocks what follows", () => {
    // Reality does not always follow the graph. If the fact is true the step
    // IS done, and pretending otherwise would block real work.
    const p = evalIntake({
      budgetplan_opgesteld: true,
      schulden_geinventariseerd: true,
    });
    expect(p.steps.find((s) => s.key === "boedelbeschrijving")!.status).toBe(
      "ready"
    );
  });
});

describe("evaluateProcess — deadlines", () => {
  it("derives a due date from the process start", () => {
    // 1 Jan + 120 days = 1 May.
    expect(step({}, "boedelbeschrijving").dueDate).toBe("2026-05-01");
  });

  it("flags an unmet step past its due date as overdue", () => {
    expect(step({}, "beheerrekening").overdue).toBe(true);
  });

  it("does NOT mark a completed step overdue, however late it was", () => {
    // Finishing late is a fact about the past. Leaving it red forever buries
    // the steps that still need someone.
    const s = step({ beheerrekening_geopend: true }, "beheerrekening");
    expect(s.status).toBe("done");
    expect(s.overdue).toBe(false);
  });

  it("never calls a step with no derivable deadline overdue", () => {
    const p = evaluateProcess({
      definition: PROCESS_DEFINITIONS.rv_jaarlijks,
      facts: {},
      startDate: "2020-01-01",
      today: TODAY,
    });
    expect(p.steps.every((s) => s.overdue === false)).toBe(true);
    expect(p.overdueCount).toBe(0);
  });

  it("does not flag a step whose deadline is still ahead", () => {
    expect(step({}, "boedelbeschrijving", "2026-02-01").overdue).toBe(false);
  });

  it("never marks a BLOCKED step overdue — you cannot be late for work you cannot start", () => {
    // The lateness is not lost: it lands on the blocking step, which is
    // actionable, where someone can do something about it.
    const s = step({}, "boedelbeschrijving");
    expect(s.status).toBe("blocked");
    expect(s.dueDate).toBe("2026-05-01");
    expect(s.dueDate! < TODAY).toBe(true); // the date HAS passed
    expect(s.overdue).toBe(false); // …and it is still not counted
  });

  it("attributes the lateness to the step that can actually be acted on", () => {
    const p = evalIntake({});
    const overdue = p.steps.filter((s) => s.overdue).map((s) => s.key);
    expect(overdue).toEqual(["beheerrekening"]);
    expect(p.overdueCount).toBe(1);
  });

  it("becomes overdue the moment it is unblocked and already late", () => {
    const s = step(
      {
        beheerrekening_geopend: true,
        leefgeldrekening_geopend: true,
        instanties_aangeschreven: true,
        budgetplan_opgesteld: true,
        schulden_geinventariseerd: true,
      },
      "boedelbeschrijving"
    );
    expect(s.status).toBe("ready");
    expect(s.overdue).toBe(true);
  });
});

describe("evaluateProcess — process status", () => {
  it("is running while anything is actionable", () => {
    expect(evalIntake({}).status).toBe("running");
  });

  it("is done when every step's fact is true", () => {
    const p = evalIntake({
      beheerrekening_geopend: true,
      leefgeldrekening_geopend: true,
      instanties_aangeschreven: true,
      budgetplan_opgesteld: true,
      schulden_geinventariseerd: true,
      boedelbeschrijving_vastgelegd: true,
      plan_van_aanpak_vastgelegd: true,
    });
    expect(p.status).toBe("done");
    expect(p.readyCount).toBe(0);
    expect(p.overdueCount).toBe(0);
  });

  it("is BLOCKED when the only remaining step is someone else's move", () => {
    // The period is recorded and the transactions are categorised; the
    // bespreking is the client's move. Nobody here can move it, and calling
    // that "running" would overstate what the office is doing.
    const p = evaluateProcess({
      definition: PROCESS_DEFINITIONS.rv_jaarlijks,
      facts: {
        rv_periode_vastgelegd: true,
        transacties_gecategoriseerd: true,
      },
      startDate: START,
      today: TODAY,
    });
    expect(p.status).toBe("blocked");
    expect(p.readyCount).toBe(0);
    expect(p.awaitingCount).toBe(1);
    expect(p.steps.find((s) => s.key === "bespreking")!.status).toBe("awaiting");
  });

  it("is still running while the office has anything of its own to do", () => {
    const p = evaluateProcess({
      definition: PROCESS_DEFINITIONS.machtiging,
      facts: { machtiging_drempel_bereikt: true },
      startDate: START,
      today: TODAY,
    });
    expect(p.status).toBe("running");
  });

  it("claims only what Frank records about a machtiging", () => {
    // Temujin PR-11 r1 #3: a `court_authorization` resolution on the payment
    // guard records that a human resolved the guard on that ground — not
    // that a beschikking is on file. Frank does not store beschikkingen, so
    // no step may imply that it does.
    const keys = PROCESS_DEFINITIONS.machtiging.steps.map((s) => s.key);
    expect(keys).toEqual(["drempel_geconstateerd", "afhandelen"]);
    expect(keys).not.toContain("beschikking_vastleggen");
  });
});

describe("step ownership — waiting on you vs waiting on someone else", () => {
  it("marks a court-owned step awaiting, never ready", () => {
    const p = evaluateProcess({
      definition: PROCESS_DEFINITIONS.rv_jaarlijks,
      facts: {},
      startDate: START,
      today: TODAY,
    });
    const s = p.steps.find((x) => x.key === "periode_vastleggen")!;
    expect(s.owner).toBe("court");
    expect(s.status).toBe("awaiting");
    // "Waiting on you" must not be inflated by things nobody here can move.
    expect(p.readyCount).toBe(0);
  });

  it("marks the bespreking as the client's move", () => {
    const p = evaluateProcess({
      definition: PROCESS_DEFINITIONS.rv_jaarlijks,
      facts: { rv_periode_vastgelegd: true, transacties_gecategoriseerd: true },
      startDate: START,
      today: TODAY,
    });
    const s = p.steps.find((x) => x.key === "bespreking")!;
    expect(s.owner).toBe("client");
    expect(s.status).toBe("awaiting");
  });

  it("defaults an unlabelled step to the office", () => {
    const p = evaluateProcess({
      definition: PROCESS_DEFINITIONS.intake,
      facts: {},
      startDate: START,
      today: TODAY,
    });
    expect(p.steps.every((s) => s.owner === "office")).toBe(true);
  });

  it("still counts a not-yet-reachable external step as blocked, not awaiting", () => {
    // Ownership only matters once dependencies are met; before that it is
    // genuinely blocked by the graph.
    const p = evaluateProcess({
      definition: PROCESS_DEFINITIONS.rv_jaarlijks,
      facts: {},
      startDate: START,
      today: TODAY,
    });
    expect(p.steps.find((s) => s.key === "bespreking")!.status).toBe("blocked");
  });
});

describe("applicableProcesses — court facts are recorded, never inferred", () => {
  it("lists only the always-running processes by default", () => {
    expect(applicableProcesses({ schuldenbewind: false })).toEqual([
      "intake",
      "rv_jaarlijks",
    ]);
  });

  it("starts machtiging only once the threshold was actually reached", () => {
    // Event-started, not dossier-started. Listing it unconditionally gave
    // every dossier a permanently overdue "draw up the verzoek" for a
    // machtiging nobody ever needed.
    expect(applicableProcesses({ schuldenbewind: false })).not.toContain(
      "machtiging"
    );
    expect(
      applicableProcesses(
        { schuldenbewind: false },
        { machtiging_drempel_bereikt: true }
      )
    ).toContain("machtiging");
  });

  it("adds schuldtraject only for schuldenbewind", () => {
    expect(applicableProcesses({ schuldenbewind: true })).toContain(
      "schuldtraject"
    );
    expect(applicableProcesses({ schuldenbewind: false })).not.toContain(
      "schuldtraject"
    );
  });

  it("does not offer einde_bewind at all — Frank has no evidence for it", () => {
    // Temujin PR-11 r1 #4: its only step is the eindrekening, and there is
    // no source for whether one exists. A process that can only ever report
    // "not done", from a hard-coded false, quietly accuses a curator of
    // being behind on work the system cannot see.
    expect(Object.keys(PROCESS_DEFINITIONS)).not.toContain("einde_bewind");
    expect(applicableProcesses({ schuldenbewind: true })).not.toContain(
      "einde_bewind"
    );
  });
});

describe("summariseProcesses", () => {
  it("counts the office-wide view a curator actually opens", () => {
    const running = evalIntake({});
    const done = evalIntake({
      beheerrekening_geopend: true,
      leefgeldrekening_geopend: true,
      instanties_aangeschreven: true,
      budgetplan_opgesteld: true,
      schulden_geinventariseerd: true,
      boedelbeschrijving_vastgelegd: true,
      plan_van_aanpak_vastgelegd: true,
    });
    const blocked = evaluateProcess({
      definition: PROCESS_DEFINITIONS.rv_jaarlijks,
      facts: {
        rv_periode_vastgelegd: true,
        transacties_gecategoriseerd: true,
      },
      startDate: START,
      today: TODAY,
    });
    const s = summariseProcesses([running, running, done, blocked]);
    expect(s.running).toBe(2);
    expect(s.done).toBe(1);
    expect(s.blocked).toBe(1);
    expect(s.waitingOnYou).toBe(2); // one ready step in each running process
    expect(s.awaitingOthers).toBe(1); // the bespreking with the client
    expect(s.overdue).toBeGreaterThan(0);
  });

  it("handles an empty office without dividing by zero or throwing", () => {
    expect(summariseProcesses([])).toEqual({
      running: 0,
      blocked: 0,
      done: 0,
      overdue: 0,
      waitingOnYou: 0,
      awaitingOthers: 0,
    });
  });
});
