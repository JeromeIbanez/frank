import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/format";
import { getDossier } from "@/lib/queries";
import { AddBudgetLineForm, LeefgeldForm, DeactivateLineButton } from "./budget-client";

type DossierFull = NonNullable<Awaited<ReturnType<typeof getDossier>>>;

function monthlyCents(line: { amountCents: number; frequency: string }): number {
  switch (line.frequency) {
    case "weekly":
      return Math.round((line.amountCents * 52) / 12);
    case "monthly":
      return line.amountCents;
    case "quarterly":
      return Math.round(line.amountCents / 3);
    case "yearly":
      return Math.round(line.amountCents / 12);
    default:
      return 0;
  }
}

export async function BudgetTab({ dossier }: { dossier: DossierFull }) {
  const t = await getTranslations("budget");
  const active = dossier.budgetLines.filter((b) => b.active);
  const income = active.filter((b) => b.kind === "income");
  const expenses = active.filter((b) => b.kind === "expense");
  const reserves = active.filter((b) => b.kind === "reserve");

  const incomeTotal = income.reduce((s, b) => s + monthlyCents(b), 0);
  const expenseTotal = expenses.reduce((s, b) => s + monthlyCents(b), 0);
  const reserveTotal = reserves.reduce((s, b) => s + monthlyCents(b), 0);
  const leefgeldMonthly = dossier.leefgeldAmountCents
    ? dossier.leefgeldFrequency === "weekly"
      ? Math.round((dossier.leefgeldAmountCents * 52) / 12)
      : dossier.leefgeldAmountCents
    : 0;
  const margin = incomeTotal - expenseTotal - reserveTotal - leefgeldMonthly;

  const sections: {
    key: string;
    title: string;
    lines: typeof active;
    total: number;
  }[] = [
    { key: "income", title: t("income"), lines: income, total: incomeTotal },
    { key: "expense", title: t("expenses"), lines: expenses, total: expenseTotal },
    { key: "reserve", title: t("reserves"), lines: reserves, total: reserveTotal },
  ];

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryTile label={t("monthlyIncome")} cents={incomeTotal} />
        <SummaryTile label={t("monthlyExpenses")} cents={expenseTotal + reserveTotal} />
        <SummaryTile label={t("monthlyLeefgeld")} cents={leefgeldMonthly} />
        <SummaryTile label={t("margin")} cents={margin} alert={margin < 0} />
      </div>

      <div className="grid lg:grid-cols-3 gap-6">
        {sections.map((section) => (
          <Card key={section.key}>
            <CardHeader>
              <CardTitle className="text-base flex justify-between">
                {section.title}
                <Money cents={section.total} />
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-1.5">
              {section.lines.map((line) => (
                <div
                  key={line.id}
                  className="group flex items-center justify-between text-sm rounded px-2 py-1.5 hover:bg-muted/50"
                >
                  <div className="min-w-0">
                    <div className="truncate">{line.name}</div>
                    <div className="text-xs text-muted-foreground/70">
                      {t(`freq.${line.frequency}`)}
                      {line.expectedDay ? ` · ${t("day")} ${line.expectedDay}` : ""}
                    </div>
                  </div>
                  <div className="flex items-center gap-1">
                    <Money cents={line.amountCents} />
                    <DeactivateLineButton lineId={line.id} />
                  </div>
                </div>
              ))}
              {section.lines.length === 0 && (
                <p className="text-sm text-muted-foreground/70">{t("none")}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("addLine")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AddBudgetLineForm dossierId={dossier.id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("leefgeldTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <LeefgeldForm
              dossierId={dossier.id}
              currentCents={dossier.leefgeldAmountCents}
              currentFrequency={dossier.leefgeldFrequency ?? "weekly"}
            />
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

function SummaryTile({
  label,
  cents,
  alert,
}: {
  label: string;
  cents: number;
  alert?: boolean;
}) {
  return (
    <Card className="py-4">
      <CardContent className="px-5">
        <div
          className={
            "text-xl font-semibold tabular-nums " + (alert ? "text-red-600" : "")
          }
        >
          <Money cents={cents} />
        </div>
        <div className="text-sm text-muted-foreground mt-0.5">{label}</div>
      </CardContent>
    </Card>
  );
}
