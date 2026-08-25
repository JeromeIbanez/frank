/**
 * Demo seed: ~8 fully SYNTHETIC, composited dossiers (per Temujin review:
 * generic scenarios from the research, nothing modeled on real persons).
 * Run: npm run seed
 */
import { createHash } from "node:crypto";
import { neon } from "@neondatabase/serverless";
import { drizzle } from "drizzle-orm/neon-http";
import * as schema from "../src/lib/db/schema";
import { computeStatutoryTasks, CALC_VERSION } from "../src/lib/domain/deadlines";
import { ruleCategorize } from "../src/lib/domain/categories";
import { NIEUW_DOSSIER_PLAYBOOK, DEFAULT_INSTANTIES } from "../src/lib/playbooks";

const sql = neon(process.env.DATABASE_URL!);
const db = drizzle(sql, { schema });

const {
  dossiers,
  accounts,
  contacts,
  debts,
  budgetLines,
  transactions,
  tasks,
  documents,
  letters,
  auditEvents,
  paymentItems,
  paymentBatches,
  taskEvents,
  imports,
  aiCalls,
} = schema;

const today = new Date();
const isoToday = today.toISOString().slice(0, 10);

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}
function daysAgo(n: number): string {
  return iso(new Date(today.getTime() - n * 86400_000));
}
function monthsAgo(n: number): string {
  const d = new Date(today);
  d.setUTCMonth(d.getUTCMonth() - n);
  return iso(d);
}
function hash(...parts: (string | number | null)[]): string {
  return createHash("sha256").update(parts.join("|")).digest("hex");
}

/** Generate a checksum-valid (mod-97) Dutch IBAN for synthetic data. */
function nlIban(bank: string, accountNumber: number): string {
  const bban = bank + String(accountNumber).padStart(10, "0");
  const numeric = (bban + "NL00")
    .split("")
    .map((c) => (/[A-Z]/.test(c) ? String(c.charCodeAt(0) - 55) : c))
    .join("");
  let rem = 0;
  for (const ch of numeric) rem = (rem * 10 + Number(ch)) % 97;
  const check = String(98 - rem).padStart(2, "0");
  return `NL${check}${bban}`;
}

type SeedSpec = {
  firstName: string;
  lastName: string;
  regime: "bewind" | "curatele" | "mentorschap" | "bewind_mentorschap";
  grondslag: "geestelijk_lichamelijk" | "schulden" | "verkwisting";
  gemeente: string;
  city: string;
  startMonthsAgo: number;
  rvMonth: number | null; // null = schedule not yet recorded (red exception)
  leefgeldCents: number;
  incomeKind: "uitkering" | "salaris" | "wajong";
  incomeCents: number;
  rentCents: number;
  debts?: { creditor: string; amountCents: number; status: "open" | "regeling" }[];
  missedIncomeThisMonth?: boolean;
  lowBalance?: boolean;
};

const SPECS: SeedSpec[] = [
  {
    firstName: "Willem", lastName: "de Groot", regime: "bewind",
    grondslag: "geestelijk_lichamelijk", gemeente: "Amsterdam", city: "Amsterdam",
    startMonthsAgo: 26, rvMonth: 3, leefgeldCents: 6500,
    incomeKind: "uitkering", incomeCents: 129500, rentCents: 72500,
  },
  {
    firstName: "Fatima", lastName: "el Amrani", regime: "bewind",
    grondslag: "schulden", gemeente: "Rotterdam", city: "Rotterdam",
    startMonthsAgo: 14, rvMonth: 6, leefgeldCents: 7500,
    incomeKind: "salaris", incomeCents: 168000, rentCents: 68900,
    debts: [
      { creditor: "Wehkamp", amountCents: 234500, status: "regeling" },
      { creditor: "CJIB", amountCents: 87600, status: "regeling" },
      { creditor: "Zorgverzekeraar CZ (premieachterstand)", amountCents: 145200, status: "open" },
    ],
  },
  {
    firstName: "Johannes", lastName: "Bakker", regime: "curatele",
    grondslag: "geestelijk_lichamelijk", gemeente: "Utrecht", city: "Utrecht",
    startMonthsAgo: 38, rvMonth: 1, leefgeldCents: 5500,
    incomeKind: "wajong", incomeCents: 137800, rentCents: 61000,
  },
  {
    firstName: "Sandra", lastName: "Vermeulen", regime: "bewind",
    grondslag: "schulden", gemeente: "Den Haag", city: "Den Haag",
    startMonthsAgo: 8, rvMonth: null, leefgeldCents: 8000,
    incomeKind: "uitkering", incomeCents: 121700, rentCents: 74300,
    debts: [
      { creditor: "Vattenfall (eindafrekening)", amountCents: 68400, status: "open" },
      { creditor: "KPN", amountCents: 42300, status: "regeling" },
    ],
    missedIncomeThisMonth: true,
  },
  {
    firstName: "Ahmed", lastName: "Yilmaz", regime: "bewind",
    grondslag: "geestelijk_lichamelijk", gemeente: "Eindhoven", city: "Eindhoven",
    startMonthsAgo: 20, rvMonth: 9, leefgeldCents: 7000,
    incomeKind: "salaris", incomeCents: 195400, rentCents: 79800,
  },
  {
    firstName: "Anneke", lastName: "van Dijk", regime: "bewind_mentorschap",
    grondslag: "geestelijk_lichamelijk", gemeente: "Groningen", city: "Groningen",
    startMonthsAgo: 50, rvMonth: 11, leefgeldCents: 6000,
    incomeKind: "uitkering", incomeCents: 125600, rentCents: 58700,
    lowBalance: true,
  },
  {
    firstName: "Dennis", lastName: "Smit", regime: "bewind",
    grondslag: "verkwisting", gemeente: "Tilburg", city: "Tilburg",
    startMonthsAgo: 5, rvMonth: 12, leefgeldCents: 9000,
    incomeKind: "salaris", incomeCents: 214500, rentCents: 82500,
    debts: [{ creditor: "Santander Consumer Finance", amountCents: 512300, status: "regeling" }],
  },
  {
    firstName: "Maria", lastName: "Jansen", regime: "bewind",
    grondslag: "geestelijk_lichamelijk", gemeente: "Nijmegen", city: "Nijmegen",
    startMonthsAgo: 1, rvMonth: null, leefgeldCents: 6500,
    incomeKind: "uitkering", incomeCents: 127300, rentCents: 69900,
  },
];

const INCOME_PARTY: Record<string, { name: string; iban: string }> = {
  uitkering: { name: "Gemeente Sociale Zaken", iban: nlIban("BNGH", 285001234) },
  salaris: { name: "Werkgever Facilitair BV", iban: nlIban("RABO", 300123456) },
  wajong: { name: "UWV", iban: nlIban("INGB", 2445588) },
};

async function main() {
  // Guard (Temujin code review finding 4): this script WIPES every table,
  // including the audit log. It must never run against anything but an
  // explicitly-marked demo database.
  if (process.env.FRANK_PRODUCTION_OFFICE === "true") {
    throw new Error("Refusing to seed: FRANK_PRODUCTION_OFFICE is set.");
  }
  if (process.env.FRANK_DEMO_SEED !== "true") {
    throw new Error(
      "Refusing to seed: set FRANK_DEMO_SEED=true to confirm this DATABASE_URL is a demo database that may be wiped."
    );
  }
  console.log("Clearing existing data…");
  await db.delete(taskEvents);
  await db.delete(tasks);
  await db.delete(paymentItems);
  await db.delete(paymentBatches);
  await db.delete(transactions);
  await db.delete(imports);
  await db.delete(letters);
  await db.delete(documents);
  await db.delete(budgetLines);
  await db.delete(debts);
  await db.delete(contacts);
  await db.delete(accounts);
  await db.delete(auditEvents);
  await db.delete(aiCalls);
  await db.delete(dossiers);

  let ibanCounter = 100;

  for (const [idx, spec] of SPECS.entries()) {
    const startDate = monthsAgo(spec.startMonthsAgo);
    const beschikkingDate = daysAgo(spec.startMonthsAgo * 30 + 1);
    const isNew = spec.startMonthsAgo <= 1;

    const [d] = await db
      .insert(dossiers)
      .values({
        firstName: spec.firstName,
        lastName: spec.lastName,
        dateOfBirth: `19${55 + idx * 4}-0${(idx % 9) + 1}-1${idx}`,
        addressStreet: `Demostraat ${10 + idx * 7}`,
        addressPostcode: `10${10 + idx} AB`,
        addressCity: spec.city,
        gemeente: spec.gemeente,
        regime: spec.regime,
        grondslag: spec.grondslag,
        schuldenbewind: spec.grondslag !== "geestelijk_lichamelijk",
        rechtbank: `Rechtbank ${spec.city}`,
        zaaknummer: `C/${13 + idx}/65${400 + idx * 13}`,
        beschikkingDate,
        startDate,
        rvScheduleMonth: spec.rvMonth,
        rvScheduleConfirmed: spec.rvMonth != null,
        status: isNew ? "intake" : "actief",
        leefgeldAmountCents: spec.leefgeldCents,
        leefgeldFrequency: "weekly",
      })
      .returning();

    const [beheer] = await db
      .insert(accounts)
      .values({
        dossierId: d.id,
        type: "beheer",
        iban: nlIban("ABNA", 417164000 + ibanCounter),
        bankName: "ABN AMRO",
        openingBalanceCents: spec.lowBalance ? 21000 : 84500 + idx * 12100,
        openingBalanceDate: monthsAgo(4),
      })
      .returning();
    ibanCounter += 7;
    const [leefgeldAcc] = await db
      .insert(accounts)
      .values({
        dossierId: d.id,
        type: "leefgeld",
        iban: nlIban("RABO", 123456000 + ibanCounter),
        bankName: "Rabobank",
        openingBalanceCents: 3400,
        openingBalanceDate: monthsAgo(4),
      })
      .returning();
    ibanCounter += 7;

    // Contacts: default instanties, most notified for older dossiers
    await db.insert(contacts).values(
      DEFAULT_INSTANTIES.map((c, ci) => ({
        dossierId: d.id,
        kind: c.kind,
        name: c.name,
        notified: !isNew && ci < (isNew ? 0 : 7 + (idx % 3)),
      }))
    );

    if (spec.debts) {
      await db.insert(debts).values(
        spec.debts.map((debt) => ({
          dossierId: d.id,
          creditor: debt.creditor,
          reference: `REF-${debt.creditor.slice(0, 3).toUpperCase()}-${1000 + idx}`,
          originalAmountCents: Math.round(debt.amountCents * 1.15),
          currentAmountCents: debt.amountCents,
          status: debt.status,
          monthlyPaymentCents: debt.status === "regeling" ? 5000 : null,
        }))
      );
    }

    // Budget lines
    const income = INCOME_PARTY[spec.incomeKind];
    const lines = [
      {
        kind: "income" as const,
        name: spec.incomeKind === "salaris" ? "Salaris" : spec.incomeKind === "wajong" ? "Wajong-uitkering" : "Bijstandsuitkering",
        categoryKey: spec.incomeKind === "salaris" ? "salaris" : "uitkering",
        amountCents: spec.incomeCents,
        frequency: "monthly" as const,
        expectedDay: spec.incomeKind === "salaris" ? 25 : 3,
        counterpartyName: income.name,
        counterpartyIban: income.iban,
      },
      {
        kind: "income" as const,
        name: "Huurtoeslag",
        categoryKey: "huurtoeslag",
        amountCents: 36200,
        frequency: "monthly" as const,
        expectedDay: 20,
        counterpartyName: "Belastingdienst Toeslagen",
        counterpartyIban: nlIban("INGB", 2445599),
      },
      {
        kind: "income" as const,
        name: "Zorgtoeslag",
        categoryKey: "zorgtoeslag",
        amountCents: 12300,
        frequency: "monthly" as const,
        expectedDay: 20,
        counterpartyName: "Belastingdienst Toeslagen",
        counterpartyIban: nlIban("INGB", 2445599),
      },
      {
        kind: "expense" as const,
        name: "Huur",
        categoryKey: "huur",
        amountCents: spec.rentCents,
        frequency: "monthly" as const,
        expectedDay: 1,
        counterpartyName: "Woningcorporatie Thuis",
        counterpartyIban: nlIban("TRIO", 212345678),
      },
      {
        kind: "expense" as const,
        name: "Zorgverzekering",
        categoryKey: "zorgverzekering",
        amountCents: 14750,
        frequency: "monthly" as const,
        expectedDay: 28,
        counterpartyName: "Zilveren Kruis",
        counterpartyIban: nlIban("INGB", 8888),
      },
      {
        kind: "expense" as const,
        name: "Energie",
        categoryKey: "energie",
        amountCents: 16800,
        frequency: "monthly" as const,
        expectedDay: 5,
        counterpartyName: "Vattenfall",
        counterpartyIban: nlIban("INGB", 123456),
      },
      {
        kind: "expense" as const,
        name: "Bewindvoerderskosten",
        categoryKey: "bewindvoerderskosten",
        amountCents: spec.grondslag === "geestelijk_lichamelijk" ? 13583 : 17558,
        frequency: "monthly" as const,
        expectedDay: 15,
        counterpartyName: "Frank Bewindvoering",
        counterpartyIban: nlIban("BUNQ", 123456789),
      },
      {
        kind: "reserve" as const,
        name: "Reservering inboedel",
        categoryKey: "overige_uitgaven",
        amountCents: 5000,
        frequency: "monthly" as const,
        expectedDay: null,
        counterpartyName: null,
        counterpartyIban: null,
      },
    ];
    await db.insert(budgetLines).values(
      lines.map((l) => ({ dossierId: d.id, ...l, expectedDay: l.expectedDay ?? undefined }))
    );

    // Transactions: last 3 months of realistic traffic on the beheerrekening
    if (!isNew) {
      const txs: Omit<typeof transactions.$inferInsert, "dedupeHash">[] = [];
      for (let m = 2; m >= 0; m--) {
        const monthDate = new Date(today);
        monthDate.setUTCMonth(monthDate.getUTCMonth() - m);
        const ym = monthDate.toISOString().slice(0, 7);
        const inMonth = (day: number) => `${ym}-${String(day).padStart(2, "0")}`;

        const skipIncome = m === 0 && spec.missedIncomeThisMonth;
        if (!skipIncome) {
          txs.push({
            accountId: beheer.id, dossierId: d.id,
            bookingDate: inMonth(lines[0].expectedDay ?? 3),
            amountCents: spec.incomeCents,
            counterpartyName: income.name, counterpartyIban: income.iban,
            description: lines[0].name,
          });
        }
        txs.push(
          {
            accountId: beheer.id, dossierId: d.id, bookingDate: inMonth(20),
            amountCents: 36200, counterpartyName: "Belastingdienst Toeslagen",
            counterpartyIban: nlIban("INGB", 2445599), description: "Huurtoeslag",
          },
          {
            accountId: beheer.id, dossierId: d.id, bookingDate: inMonth(20),
            amountCents: 12300, counterpartyName: "Belastingdienst Toeslagen",
            counterpartyIban: nlIban("INGB", 2445599), description: "Zorgtoeslag",
          },
          {
            accountId: beheer.id, dossierId: d.id, bookingDate: inMonth(1),
            amountCents: -spec.rentCents, counterpartyName: "Woningcorporatie Thuis",
            counterpartyIban: nlIban("TRIO", 212345678), description: "Huur " + ym,
          },
          {
            accountId: beheer.id, dossierId: d.id, bookingDate: inMonth(28),
            amountCents: -14750, counterpartyName: "Zilveren Kruis",
            counterpartyIban: nlIban("INGB", 8888), description: "Premie zorgverzekering",
          },
          {
            accountId: beheer.id, dossierId: d.id, bookingDate: inMonth(5),
            amountCents: -16800, counterpartyName: "Vattenfall",
            counterpartyIban: nlIban("INGB", 123456), description: "Termijnbedrag energie",
          },
          {
            accountId: beheer.id, dossierId: d.id, bookingDate: inMonth(15),
            amountCents: -(spec.grondslag === "geestelijk_lichamelijk" ? 13583 : 17558),
            counterpartyName: "Frank Bewindvoering",
            counterpartyIban: nlIban("BUNQ", 123456789), description: "Beloning bewindvoerder",
          }
        );
        // Weekly leefgeld
        for (const day of [4, 11, 18, 25]) {
          txs.push({
            accountId: beheer.id, dossierId: d.id, bookingDate: inMonth(day),
            amountCents: -spec.leefgeldCents,
            counterpartyName: `${spec.firstName} ${spec.lastName}`,
            counterpartyIban: leefgeldAcc.iban,
            description: "Leefgeld",
          });
        }
        // Some noise: a pharmacy bill and an unknown one (stays uncategorized)
        if (m === 0) {
          txs.push({
            accountId: beheer.id, dossierId: d.id, bookingDate: inMonth(9),
            amountCents: -(1250 + idx * 137),
            counterpartyName: "Apotheek De Linde",
            counterpartyIban: nlIban("ABNA", 417100011),
            description: "Eigen bijdrage medicatie",
          });
        }
        // Debt regeling payments
        if (spec.debts?.some((x) => x.status === "regeling")) {
          txs.push({
            accountId: beheer.id, dossierId: d.id, bookingDate: inMonth(16),
            amountCents: -5000, counterpartyName: spec.debts[0].creditor,
            counterpartyIban: nlIban("DEUT", 265186420),
            description: `Betalingsregeling ${spec.debts[0].creditor}`,
          });
        }
      }
      for (const tx of txs) {
        const cat = ruleCategorize(
          tx.counterpartyName ?? null,
          tx.description ?? null,
          tx.amountCents
        );
        await db.insert(transactions).values({
          ...tx,
          categoryKey: tx.description === "Leefgeld" ? "leefgeld" : cat?.categoryKey ?? null,
          categorySource: tx.description === "Leefgeld" || cat ? "rule" : null,
          categoryConfidence: cat?.confidence ?? (tx.description === "Leefgeld" ? 95 : null),
          dedupeHash: hash(beheer.iban, tx.bookingDate!, tx.amountCents!, tx.counterpartyIban ?? "", tx.description ?? ""),
        });
      }
    }

    // Statutory + playbook tasks for active dossiers
    if (!isNew) {
      const specs2 = computeStatutoryTasks({
        startDate,
        beschikkingDate,
        schuldenbewind: d.schuldenbewind,
        rvScheduleMonth: spec.rvMonth,
        today: isoToday,
      });
      for (const s of specs2) {
        // older dossiers: boedelbeschrijving long done
        const isDone =
          (s.key === "boedelbeschrijving" || s.key === "plan_van_aanpak") &&
          spec.startMonthsAgo > 6;
        await db.insert(tasks).values({
          dossierId: d.id,
          titleKey: s.titleKey,
          kind: "statutory",
          tier: s.tier,
          legalSource: s.legalSource,
          basisDate: s.basisDate,
          calculationVersion: s.calculationVersion,
          dueDate: s.dueDate,
          deadlineConfirmed: spec.rvMonth != null || s.key !== "rekening_verantwoording"
            ? spec.startMonthsAgo > 6
            : false,
          status: isDone ? "confirmed" : "open",
        });
      }
      // A couple of playbook leftovers for mid-age dossiers
      if (spec.startMonthsAgo <= 9) {
        for (const def of NIEUW_DOSSIER_PLAYBOOK.slice(0, 6)) {
          const done = Math.random() > 0.5;
          await db.insert(tasks).values({
            dossierId: d.id,
            titleKey: def.titleKey,
            kind: "playbook",
            tier: def.tier,
            playbookKey: def.key,
            basisDate: startDate,
            calculationVersion: CALC_VERSION,
            dueDate: daysAgo(spec.startMonthsAgo * 30 - def.offsetDays),
            deadlineConfirmed: true,
            status: done ? "done" : "open",
            checklist: def.checklist?.map((c) => ({
              key: c.key,
              label: c.labelKey,
              done,
            })),
          });
        }
      }
    }

    console.log(`Seeded dossier: ${spec.firstName} ${spec.lastName}`);
  }

  // A few inbox documents (synthetic letters as text)
  const allDossiers = await db.select().from(dossiers);
  const fatima = allDossiers.find((x) => x.lastName === "el Amrani")!;
  const docTexts = [
    {
      filename: "aanmaning-vattenfall.txt",
      dossierId: null,
      text: `Vattenfall Klantenservice\nBetreft: Herinnering openstaand bedrag\nKenmerk: VF-2026-887744\n\nGeachte heer/mevrouw S. Vermeulen,\n\nOns termijnbedrag van EUR 168,00 voor augustus 2026 is nog niet ontvangen. Wij verzoeken u het bedrag binnen 14 dagen, uiterlijk 2026-09-08, over te maken op NL43INGB0000123456 onder vermelding van VF-2026-887744.\n\nBij uitblijven van betaling kunnen incassokosten in rekening worden gebracht.`,
    },
    {
      filename: "beschikking-zorgtoeslag-2027.txt",
      dossierId: fatima.id,
      text: `Belastingdienst Toeslagen\nBeschikking zorgtoeslag 2027\nKenmerk: TSL-2027-1122334\n\nGeachte mevrouw F. el Amrani,\n\nU ontvangt vanaf 1 januari 2027 zorgtoeslag: EUR 127,00 per maand. Het bedrag wordt maandelijks rond de 20e uitbetaald op de bij ons bekende rekening.\n\nControleer uw gegevens. Wijzigingen geeft u door via Mijn toeslagen.`,
    },
  ];
  for (const doc of docTexts) {
    const bytes = Buffer.from(doc.text, "utf-8");
    await db.insert(documents).values({
      dossierId: doc.dossierId,
      filename: doc.filename,
      mime: "text/plain",
      sizeBytes: bytes.length,
      sha256: createHash("sha256").update(bytes).digest("hex"),
      contentBase64: bytes.toString("base64"),
      textContent: doc.text,
      status: "new",
    });
  }

  await db.insert(auditEvents).values({
    actorId: "system",
    actorType: "system",
    action: "create",
    entityType: "seed",
    entityId: "demo-seed",
    reason: "synthetic demo data seeded",
    versionAfter: { dossiers: SPECS.length },
  });

  console.log("Seed complete.");
}

main().then(() => process.exit(0)).catch((e) => {
  console.error(e);
  process.exit(1);
});
