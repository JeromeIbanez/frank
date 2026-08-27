import { describe, expect, it } from "vitest";
import {
  categoryFor,
  computeFee,
  dossierEconomics,
  FEE_SCHEDULES,
  scheduleFor,
  VAT_RATE,
} from "../fees";

describe("fee schedules as a versioned dataset", () => {
  it("every schedule records its legal source, version and VAT treatment", () => {
    for (const s of FEE_SCHEDULES) {
      expect(s.legalSource).toMatch(/Regeling beloning/);
      expect(s.sourceUrl).toContain("wetten.overheid.nl");
      expect(s.sourceVersion).toBeTruthy();
      expect(s.vatTreatment).toBe("excl_vat_applicability_varies");
    }
  });

  it("schedules do not overlap and cover their own ranges", () => {
    expect(scheduleFor("2025-06-01")?.sourceVersion).toBe("2025");
    expect(scheduleFor("2026-01-01")?.sourceVersion).toBe("2026-01-01");
    expect(scheduleFor("2026-12-31")?.sourceVersion).toBe("2026-01-01");
    expect(scheduleFor("2024-12-31")).toBeNull(); // before the dataset
  });

  it("2026 amounts match the transcribed Regeling (excl. BTW)", () => {
    const s = scheduleFor("2026-03-01")!;
    expect(s.yearlyCents.bewind_standaard).toBe(163_000);
    expect(s.yearlyCents.bewind_schulden).toBe(210_700);
    // Two-person and mixed rates (independently verified, Temujin PR-7)
    expect(s.yearlyCents.bewind_standaard_2p).toBe(195_400);
    expect(s.yearlyCents.bewind_schulden_2p).toBe(252_800);
    expect(s.yearlyCents.bewind_gemengd_2p).toBe(224_300);
  });

  it("2025 amounts match the transcribed Regeling (excl. VAT)", () => {
    const s = scheduleFor("2025-06-01")!;
    expect(s.yearlyCents.bewind_standaard).toBe(140_300);
    expect(s.yearlyCents.bewind_schulden).toBe(181_400);
    expect(s.yearlyCents.bewind_standaard_2p).toBe(168_100);
    expect(s.yearlyCents.bewind_schulden_2p).toBe(217_600);
    expect(s.yearlyCents.bewind_gemengd_2p).toBe(193_000);
  });
});

describe("categoryFor", () => {
  it("derives from regime and schuldenbewind", () => {
    expect(categoryFor({ regime: "bewind", schuldenbewind: false })).toBe(
      "bewind_standaard"
    );
    expect(categoryFor({ regime: "bewind", schuldenbewind: true })).toBe(
      "bewind_schulden"
    );
    expect(categoryFor({ regime: "curatele", schuldenbewind: false })).toBe(
      "curatele_standaard"
    );
    expect(categoryFor({ regime: "mentorschap", schuldenbewind: true })).toBe(
      "mentorschap_standaard"
    );
  });

  it("an explicit override wins over the derived category", () => {
    expect(
      categoryFor({
        regime: "bewind",
        schuldenbewind: false,
        feeCategory: "bewind_schulden_2p",
      })
    ).toBe("bewind_schulden_2p");
  });

  it("an unknown override is ignored (falls back to derived)", () => {
    expect(
      categoryFor({
        regime: "bewind",
        schuldenbewind: true,
        feeCategory: "nonsense",
      })
    ).toBe("bewind_schulden");
  });
});

describe("computeFee", () => {
  const fullYear = { periodStart: "2026-01-01", periodEnd: "2026-12-31" };

  it("full year → full yearly amount, VAT computed separately", () => {
    const fee = computeFee({
      dossier: {
        regime: "bewind",
        schuldenbewind: false,
        startDate: "2020-01-01",
      },
      ...fullYear,
    })!;
    expect(fee.proratedCents).toBe(163_000);
    // VAT is never assumed: reported "if applicable", never as a total.
    expect(fee.vatApplicability).toBe("varies_by_office");
    expect(fee.vatIfApplicableCents).toBe(Math.round(163_000 * VAT_RATE));
    expect(fee.benchmarkHours).toBe(17);
  });

  it("schuldenbewind uses its own amount and benchmark", () => {
    const fee = computeFee({
      dossier: { regime: "bewind", schuldenbewind: true, startDate: "2020-01-01" },
      ...fullYear,
    })!;
    expect(fee.proratedCents).toBe(210_700);
    expect(fee.benchmarkHours).toBe(22);
  });

  it("a measure starting mid-year is pro-rated by active days", () => {
    const fee = computeFee({
      dossier: {
        regime: "bewind",
        schuldenbewind: false,
        startDate: "2026-07-01",
      },
      ...fullYear,
    })!;
    expect(fee.periodDays).toBe(365);
    expect(fee.activeDays).toBe(184); // 1 July – 31 Dec inclusive
    expect(fee.proratedCents).toBe(Math.round((163_000 * 184) / 365));
    expect(fee.proratedCents).toBeLessThan(163_000);
  });

  it("a measure ending mid-year is pro-rated too", () => {
    const fee = computeFee({
      dossier: {
        regime: "bewind",
        schuldenbewind: false,
        startDate: "2020-01-01",
        endDate: "2026-03-31",
      },
      ...fullYear,
    })!;
    expect(fee.activeDays).toBe(90);
    expect(fee.proratedCents).toBe(Math.round((163_000 * 90) / 365));
  });

  it("a measure ending before the period yields zero, not a negative", () => {
    const fee = computeFee({
      dossier: {
        regime: "bewind",
        schuldenbewind: false,
        startDate: "2020-01-01",
        endDate: "2025-06-30",
      },
      ...fullYear,
    })!;
    expect(fee.activeDays).toBe(0);
    expect(fee.proratedCents).toBe(0);
  });

  it("no schedule for the period → null, never a silent zero", () => {
    expect(
      computeFee({
        dossier: { regime: "bewind", schuldenbewind: false, startDate: null },
        periodStart: "2019-01-01",
        periodEnd: "2019-12-31",
      })
    ).toBeNull();
  });

  it("carries provenance: legal source, schedule version, calc version", () => {
    const fee = computeFee({
      dossier: { regime: "bewind", schuldenbewind: false, startDate: "2020-01-01" },
      ...fullYear,
    })!;
    expect(fee.legalSource).toMatch(/Regeling beloning/);
    expect(fee.scheduleVersion).toBe("2026-01-01");
    expect(fee.calcVersion).toMatch(/^fees-/);
  });
});

describe("periods crossing a schedule boundary (Temujin PR-7 gate B)", () => {
  const dossier = {
    regime: "bewind",
    schuldenbewind: false,
    startDate: "2020-01-01",
  };

  it("a court year Jul 2025 – Jun 2026 is split per schedule", () => {
    const fee = computeFee({
      dossier,
      periodStart: "2025-07-01",
      periodEnd: "2026-06-30",
    })!;
    expect(fee.scheduleVersions).toEqual(["2025", "2026-01-01"]);
    expect(fee.segments).toHaveLength(2);
    const [s25, s26] = fee.segments;
    expect(s25.yearlyCents).toBe(140_300); // 2025 rate for 2025 days
    expect(s26.yearlyCents).toBe(163_000); // 2026 rate afterwards
    // segments sum to the total, and the total sits between the two rates
    expect(s25.cents + s26.cents).toBe(fee.proratedCents);
    expect(fee.proratedCents).toBeGreaterThan(140_300);
    expect(fee.proratedCents).toBeLessThan(163_000);
  });

  it("segment days cover the period exactly once", () => {
    const fee = computeFee({
      dossier,
      periodStart: "2025-07-01",
      periodEnd: "2026-06-30",
    })!;
    const covered = fee.segments.reduce((s, seg) => s + seg.activeDays, 0);
    expect(covered).toBe(fee.activeDays);
  });

  it("a period entirely inside one schedule yields a single segment", () => {
    const fee = computeFee({
      dossier,
      periodStart: "2026-01-01",
      periodEnd: "2026-12-31",
    })!;
    expect(fee.segments).toHaveLength(1);
    expect(fee.proratedCents).toBe(163_000);
  });

  it("a period starting before the dataset still earns its covered part", () => {
    const fee = computeFee({
      dossier,
      periodStart: "2024-07-01",
      periodEnd: "2025-06-30",
    })!;
    // only the 2025 half is covered by a schedule
    expect(fee.scheduleVersions).toEqual(["2025"]);
    expect(fee.proratedCents).toBeLessThan(140_300);
  });
});

describe("dossierEconomics (internal benchmark only)", () => {
  const fee = computeFee({
    dossier: { regime: "bewind", schuldenbewind: false, startDate: "2020-01-01" },
    periodStart: "2026-01-01",
    periodEnd: "2026-12-31",
  })!;

  it("effective rate = fee ÷ hours logged", () => {
    const e = dossierEconomics({ fee, minutesLogged: 17 * 60 });
    expect(e.hoursLogged).toBe(17);
    expect(e.hoursOverBenchmark).toBe(0);
    expect(e.effectiveHourlyCents).toBe(Math.round(163_000 / 17));
  });

  it("hours over the benchmark are surfaced as a positive delta", () => {
    const e = dossierEconomics({ fee, minutesLogged: 27 * 60 });
    expect(e.hoursOverBenchmark).toBe(10);
    expect(e.effectiveHourlyCents).toBe(Math.round(163_000 / 27));
  });

  it("no time logged → no rate claimed (null, not Infinity)", () => {
    const e = dossierEconomics({ fee, minutesLogged: 0 });
    expect(e.effectiveHourlyCents).toBeNull();
  });
});
