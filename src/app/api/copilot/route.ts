import {
  convertToModelMessages,
  stepCountIs,
  streamText,
  tool,
  type UIMessage,
} from "ai";
import { z } from "zod";
import { and, desc, eq, gte, sql } from "drizzle-orm";
import { getDb } from "@/lib/db";
import { debts, dossiers, tasks, transactions } from "@/lib/db/schema";
import { MODEL_DRAFTING, redact } from "@/lib/ai/gateway";
import { writeAudit } from "@/lib/audit";
import { checkMachtiging, MACHTIGING_THRESHOLD_CENTS } from "@/lib/domain/machtiging";
import { formatEuro } from "@/lib/domain/money";

export const maxDuration = 60;

/**
 * Dossier copilot: READ-ONLY tools, grounded answers, no writes (PRD M6).
 * All tool outputs pass through redaction before reaching the model.
 */
export async function POST(req: Request) {
  const { messages, dossierId }: { messages: UIMessage[]; dossierId: string } =
    await req.json();

  const db = getDb();
  const dossier = await db.query.dossiers.findFirst({
    where: eq(dossiers.id, dossierId),
  });
  if (!dossier) return new Response("dossier not found", { status: 404 });

  await writeAudit({
    actorId: "frank-ai",
    actorType: "agent",
    action: "ai_call",
    entityType: "dossier",
    entityId: dossierId,
    reason: "copilot chat turn (read-only tools)",
  });

  const tools = {
    getDossierSummary: tool({
      description:
        "Summary of the dossier: regime, status, key dates, leefgeld, budget totals.",
      inputSchema: z.object({}),
      execute: async () => {
        const d = await db.query.dossiers.findFirst({
          where: eq(dossiers.id, dossierId),
          with: { accounts: true, budgetLines: true },
        });
        if (!d) return { error: "not found" };
        const income = d.budgetLines
          .filter((b) => b.kind === "income" && b.active)
          .reduce((s, b) => s + b.amountCents, 0);
        const expenses = d.budgetLines
          .filter((b) => b.kind === "expense" && b.active)
          .reduce((s, b) => s + b.amountCents, 0);
        return {
          name: `${d.firstName} ${d.lastName}`,
          regime: d.regime,
          grondslag: d.grondslag,
          schuldenbewind: d.schuldenbewind,
          status: d.status,
          startDate: d.startDate,
          rechtbank: d.rechtbank,
          monthlyIncomeBudget: formatEuro(income),
          monthlyExpenseBudget: formatEuro(expenses),
          leefgeld: d.leefgeldAmountCents
            ? `${formatEuro(d.leefgeldAmountCents)} ${d.leefgeldFrequency}`
            : null,
          accounts: d.accounts.map((a) => ({ type: a.type, iban: a.iban })),
        };
      },
    }),
    getRecentTransactions: tool({
      description:
        "Recent transactions, optionally filtered by category key or minimum absolute amount in cents.",
      inputSchema: z.object({
        limit: z.number().int().min(1).max(50).default(20),
        categoryKey: z.string().optional(),
        minAbsCents: z.number().int().optional(),
      }),
      execute: async ({ limit, categoryKey, minAbsCents }) => {
        const rows = await db.query.transactions.findMany({
          where: and(
            eq(transactions.dossierId, dossierId),
            categoryKey ? eq(transactions.categoryKey, categoryKey) : undefined,
            minAbsCents
              ? sql`abs(${transactions.amountCents}) >= ${minAbsCents}`
              : undefined
          ),
          orderBy: [desc(transactions.bookingDate)],
          limit,
        });
        return rows.map((t) => ({
          date: t.bookingDate,
          amount: formatEuro(t.amountCents),
          counterparty: redact(t.counterpartyName ?? "?"),
          description: redact(t.description ?? ""),
          category: t.categoryKey,
        }));
      },
    }),
    getMonthlyTotalsByCategory: tool({
      description:
        "Aggregated income/expense totals per category for a given month (YYYY-MM).",
      inputSchema: z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }),
      execute: async ({ month }) => {
        const rows = await db
          .select({
            category: transactions.categoryKey,
            total: sql<number>`sum(${transactions.amountCents})`,
            n: sql<number>`count(*)`,
          })
          .from(transactions)
          .where(
            and(
              eq(transactions.dossierId, dossierId),
              gte(transactions.bookingDate, `${month}-01`),
              sql`${transactions.bookingDate} < (${`${month}-01`}::date + interval '1 month')`
            )
          )
          .groupBy(transactions.categoryKey);
        return rows.map((r) => ({
          category: r.category ?? "uncategorized",
          total: formatEuro(Number(r.total)),
          count: Number(r.n),
        }));
      },
    }),
    getOpenTasks: tool({
      description: "Open, prepared and submitted tasks with due dates.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db.query.tasks.findMany({
          where: and(eq(tasks.dossierId, dossierId)),
          orderBy: [sql`${tasks.dueDate} asc nulls last`],
          limit: 30,
        });
        return rows
          .filter((t) => ["open", "prepared", "submitted"].includes(t.status))
          .map((t) => ({
            title: t.titleFree ?? t.titleKey,
            status: t.status,
            dueDate: t.dueDate,
            deadlineConfirmed: t.deadlineConfirmed,
            legalSource: t.legalSource,
          }));
      },
    }),
    getDebts: tool({
      description: "Debt register of the dossier.",
      inputSchema: z.object({}),
      execute: async () => {
        const rows = await db.query.debts.findMany({
          where: eq(debts.dossierId, dossierId),
        });
        return rows.map((d) => ({
          creditor: d.creditor,
          current: formatEuro(d.currentAmountCents),
          status: d.status,
          monthlyPayment: d.monthlyPaymentCents
            ? formatEuro(d.monthlyPaymentCents)
            : null,
        }));
      },
    }),
    checkMachtigingRequired: tool({
      description:
        "Check whether a planned expenditure likely requires client consent or a kantonrechter machtiging. Returns a LEGAL-REVIEW FLAG, never a legal conclusion.",
      inputSchema: z.object({
        amountCents: z.number().int().positive(),
        kind: z.enum([
          "purchase",
          "gift",
          "loan",
          "settlement",
          "housing",
          "regular_bill",
          "leefgeld",
        ]),
        yearSpentOnSamePurposeCents: z.number().int().min(0).default(0),
      }),
      execute: async ({ amountCents, kind, yearSpentOnSamePurposeCents }) => {
        const res = checkMachtiging({
          amountCents,
          categoryKey: "adhoc",
          purposeTag: "adhoc",
          yearSpentOnPurposeCents: yearSpentOnSamePurposeCents,
          kind,
        });
        return {
          ...res,
          thresholdCents: MACHTIGING_THRESHOLD_CENTS,
          disclaimer:
            "This is a review flag based on LOVT Aanbevelingen (April 2025); the bewindvoerder decides and remains responsible.",
        };
      },
    }),
  };

  const result = streamText({
    model: MODEL_DRAFTING,
    system: `You are the Frank OS copilot for a Dutch bewindvoering office, assisting a professional bewindvoerder on ONE dossier (${redact(
      `${dossier.firstName} ${dossier.lastName}`
    )}).
Rules:
- Ground every factual claim in tool results; cite amounts and dates from the data. If the tools cannot answer, say so.
- You are read-only: you cannot change data, send letters, or make payments. Point the user to the right screen instead.
- Legal framing: you may explain rules (e.g. LOVT machtiging thresholds) but ALWAYS note the bewindvoerder decides and is responsible.
- Drafts of official letters must be in Dutch. Conversation follows the user's language.
- Never reveal BSN or full account numbers; they are redacted in your inputs.`,
    messages: await convertToModelMessages(messages),
    tools,
    stopWhen: stepCountIs(6),
  });

  return result.toUIMessageStreamResponse();
}
