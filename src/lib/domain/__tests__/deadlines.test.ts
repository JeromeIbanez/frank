import { describe, expect, it } from "vitest";
import {
  CALC_VERSION,
  computeStatutoryTasks,
  severity,
  type StatutoryTaskSpec,
} from "../deadlines";

const baseInput = {
  startDate: "2026-05-15",
  beschikkingDate: "2026-05-01",
  schuldenbewind: false,
  rvScheduleMonth: 3,
  today: "2026-08-25",
};

function byKey(tasks: StatutoryTaskSpec[], key: string): StatutoryTaskSpec | undefined {
  return tasks.find((t) => t.key === key);
}

describe("computeStatutoryTasks", () => {
  it("puts boedelbeschrijving at startDate + 4 months", () => {
    const t = byKey(computeStatutoryTasks(baseInput), "boedelbeschrijving");
    expect(t).toBeDefined();
    expect(t?.dueDate).toBe("2026-09-15");
    expect(t?.basisKind).toBe("startDate");
    expect(t?.basisDate).toBe("2026-05-15");
    expect(t?.tier).toBe("T2");
  });

  it("clamps month-end overflow (31 Oct + 4 months -> 28 Feb)", () => {
    const t = byKey(
      computeStatutoryTasks({ ...baseInput, startDate: "2026-10-31" }),
      "boedelbeschrijving",
    );
    expect(t?.dueDate).toBe("2027-02-28");
  });

  it("generates plan van aanpak due with the boedelbeschrijving", () => {
    const tasks = computeStatutoryTasks(baseInput);
    const plan = byKey(tasks, "plan_van_aanpak");
    expect(plan?.dueDate).toBe(byKey(tasks, "boedelbeschrijving")?.dueDate);
    // Schuldenbewind keeps the stable key; the debt supplement shows in the source.
    const schulden = byKey(
      computeStatutoryTasks({ ...baseInput, schuldenbewind: true }),
      "plan_van_aanpak",
    );
    expect(schulden?.legalSource).toContain("schuldenplan");
  });

  it("generates the 5-yearly evaluation at startDate + 5 years", () => {
    const t = byKey(computeStatutoryTasks(baseInput), "vijfjaarlijkse_evaluatie");
    expect(t?.dueDate).toBe("2031-05-15");
    expect(t?.legalSource).toContain("1:446a");
  });

  describe("R&V next occurrence", () => {
    it("uses next year when the schedule month has passed", () => {
      // today 2026-08-25, schedule month March -> 2027-03-31.
      const t = byKey(computeStatutoryTasks(baseInput), "rekening_verantwoording");
      expect(t?.dueDate).toBe("2027-03-31");
      expect(t?.recurring).toBe("yearly");
      expect(t?.basisKind).toBe("rvSchedule");
    });

    it("uses this year when the schedule month is still ahead", () => {
      const t = byKey(
        computeStatutoryTasks({ ...baseInput, today: "2026-02-01" }),
        "rekening_verantwoording",
      );
      expect(t?.dueDate).toBe("2026-03-31");
    });

    it("uses this year when today IS the last day of the schedule month", () => {
      const t = byKey(
        computeStatutoryTasks({ ...baseInput, today: "2026-03-31" }),
        "rekening_verantwoording",
      );
      expect(t?.dueDate).toBe("2026-03-31");
    });

    it("generates NO R&V task when the court schedule is unconfirmed (null)", () => {
      const tasks = computeStatutoryTasks({ ...baseInput, rvScheduleMonth: null });
      expect(byKey(tasks, "rekening_verantwoording")).toBeUndefined();
    });
  });

  it("generates the monthly client overview at next month-end, tier internal", () => {
    const t = byKey(computeStatutoryTasks(baseInput), "maandoverzicht_client");
    expect(t?.dueDate).toBe("2026-08-31");
    expect(t?.tier).toBe("internal");
    expect(t?.recurring).toBe("monthly");
    expect(t?.legalSource).toBe("Besluit kwaliteitseisen art. 5 lid 6");
  });

  it("falls back to beschikkingDate when startDate is missing", () => {
    const t = byKey(
      computeStatutoryTasks({ ...baseInput, startDate: null }),
      "boedelbeschrijving",
    );
    expect(t?.basisKind).toBe("beschikkingDate");
    expect(t?.dueDate).toBe("2026-09-01");
  });

  it("populates provenance on every task", () => {
    for (const t of computeStatutoryTasks(baseInput)) {
      expect(t.key.length).toBeGreaterThan(0);
      expect(t.titleKey).toBe(`tasks.${t.key}`);
      expect(t.legalSource.length).toBeGreaterThan(0);
      expect(t.basisDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(["startDate", "beschikkingDate", "rvSchedule", "endDate", "deathDate"]).toContain(
        t.basisKind,
      );
      expect(t.dueDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      expect(t.calculationVersion).toBe(CALC_VERSION);
    }
  });
});

describe("severity", () => {
  it("is red for any unconfirmed deadline, even far in the future", () => {
    expect(severity("2099-01-01", "2026-08-25", false)).toBe("red");
  });

  it("is red when overdue", () => {
    expect(severity("2026-08-24", "2026-08-25", true)).toBe("red");
  });

  it("is amber within 14 days", () => {
    expect(severity("2026-09-05", "2026-08-25", true)).toBe("amber");
    expect(severity("2026-09-08", "2026-08-25", true)).toBe("amber"); // exactly 14 days
    expect(severity("2026-08-25", "2026-08-25", true)).toBe("amber"); // due today
  });

  it("is green beyond 14 days", () => {
    expect(severity("2026-09-09", "2026-08-25", true)).toBe("green");
  });
});
