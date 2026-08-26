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
              <CardTitle className="flex items-baseline justify-between">
                <span className="type-section-label">{section.title}</span>
                <span className="text-xs text-ink-600">
                  <Money cents={section.total} />
                </span>
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="divide-y divide-hairline">
                {section.lines.map((line) => (
                  <div
                    key={line.id}
                    className="group flex items-center justify-between gap-3 py-2 first:pt-0 last:pb-0 hover:bg-surface-hover"
                  >
                    <div className="min-w-0">
                      <div className="truncate text-[13px]">{line.name}</div>
                      <div className="text-xs text-ink-400">
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
              </div>
              {section.lines.length === 0 && (
                <p className="text-[12.5px] text-ink-400">{t("none")}</p>
              )}
            </CardContent>
          </Card>
        ))}
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="type-section-label">{t("addLine")}</CardTitle>
          </CardHeader>
          <CardContent>
            <AddBudgetLineForm dossierId={dossier.id} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="type-section-label">{t("leefgeldTitle")}</CardTitle>
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
        <div className="type-section-label">{label}</div>
        <div className={"type-kpi mt-1 " + (alert ? "text-[#DC2626]" : "")}>
          <Money cents={cents} />
        </div>
      </CardContent>
    </Card>
  );
}
