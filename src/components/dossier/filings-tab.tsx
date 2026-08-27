import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money, SeverityDot } from "@/components/format";
import { getDossier } from "@/lib/queries";
import { buildRvPack } from "@/lib/rv";
import { getDb } from "@/lib/db";
import { rvPeriods } from "@/lib/db/schema";
import { and, eq, sql } from "drizzle-orm";
import { RvPeriodForm } from "./rv-period-form";

type DossierFull = NonNullable<Awaited<ReturnType<typeof getDossier>>>;

export async function FilingsTab({ dossier }: { dossier: DossierFull }) {
  const t = await getTranslations("filings");
  const year = new Date().getFullYear();
  const pack = await buildRvPack(dossier.id, year);
  const recordedPeriod = await getDb().query.rvPeriods.findFirst({
    where: and(
      eq(rvPeriods.dossierId, dossier.id),
      sql`extract(year from ${rvPeriods.periodEnd}) = ${year}`
    ),
  });

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-600">
        <span className="font-mono text-[11px] font-semibold">NL</span>
        {t("officialOutput")}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="type-section-label">
            {t("rvTitle", { year })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[12.5px] text-ink-600">{t("rvExplainer")}</p>

          {pack && (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-md bg-surface-subtle p-3">
                  <div className="type-section-label">{t("totalIncome")}</div>
                  <div className="mt-1 text-sm font-semibold">
                    <Money cents={pack.totalIncomeCents} />
                  </div>
                </div>
                <div className="rounded-md bg-surface-subtle p-3">
                  <div className="type-section-label">{t("totalExpenses")}</div>
                  <div className="mt-1 text-sm font-semibold">
                    <Money cents={pack.totalExpenseCents} />
                  </div>
                </div>
              </div>

              <div className="space-y-1.5">
                {pack.validations.map((v) => (
                  <div
                    key={v.key}
                    className="flex items-start gap-2 text-[12.5px]"
                  >
                    <SeverityDot
                      severity={v.level === "error" ? "red" : "amber"}
                      className="mt-[5px]"
                    />
                    <span
                      className={
                        v.level === "error" ? "text-[#B91C1C]" : "text-[#B45309]"
                      }
                    >
                      {t(`validation.${v.key}`, { detail: v.detail ?? "" })}
                    </span>
                  </div>
                ))}
                {pack.validations.length === 0 && (
                  <div className="flex items-start gap-2 text-[12.5px]">
                    <SeverityDot severity="green" className="mt-[5px]" />
                    <span className="text-ink-600">{t("validationClean")}</span>
                  </div>
                )}
              </div>
            </>
          )}

          <div className="flex gap-2">
            <Button nativeButton={false} render={<Link href={`/dossiers/${dossier.id}/rv/${year}`} />}>
              {t("openPack")}
            </Button>
            <Button
              variant="outline"
              nativeButton={false}
              render={<Link href={`/dossiers/${dossier.id}/rv/${year - 1}`} />}
            >
              {t("openPackPrev", { year: year - 1 })}
            </Button>
          </div>
          <p className="flex items-center gap-1.5 text-xs text-ink-600">
            <SeverityDot severity="amber" />
            {t("notForSubmission")}
          </p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="type-section-label">{t("boedelTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-[12.5px] text-ink-600">{t("boedelExplainer")}</p>
          <div className="divide-y divide-hairline text-[13px]">
            <div className="flex justify-between py-1.5 first:pt-0">
              <span className="text-ink-400">{t("boedelAccounts")}</span>
              <span className="font-mono tabular-nums">
                {dossier.accounts.length}
              </span>
            </div>
            <div className="flex justify-between py-1.5">
              <span className="text-ink-400">{t("boedelDebts")}</span>
              <span className="font-mono tabular-nums">
                {dossier.debts.length} (
                <Money
                  cents={dossier.debts.reduce((s, d) => s + d.currentAmountCents, 0)}
                />
                )
              </span>
            </div>
            <div className="flex justify-between py-1.5 last:pb-0">
              <span className="text-ink-400">{t("boedelIncome")}</span>
              <span>
                <span className="font-mono tabular-nums">
                  {dossier.budgetLines.filter((b) => b.kind === "income" && b.active).length}
                </span>{" "}
                {t("boedelLines")}
              </span>
            </div>
          </div>
          <p className="text-xs text-ink-400">{t("boedelHint")}</p>
          <div className="flex flex-wrap gap-3 pt-1">
            <Link
              href={`/dossiers/${dossier.id}/boedel`}
              className="text-[12.5px] font-semibold text-primary hover:underline"
            >
              {t("openBoedelDoc")} →
            </Link>
            <Link
              href={`/dossiers/${dossier.id}/pva`}
              className="text-[12.5px] font-semibold text-primary hover:underline"
            >
              {t("openPvaDoc")} →
            </Link>
          </div>
        </CardContent>
      </Card>
      <Card>
        <CardHeader>
          <CardTitle className="type-section-label">{t("rvPeriodTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <RvPeriodForm
            dossierId={dossier.id}
            current={
              recordedPeriod
                ? {
                    periodStart: recordedPeriod.periodStart,
                    periodEnd: recordedPeriod.periodEnd,
                    besprekingDate: recordedPeriod.besprekingDate,
                    besprekingOutcome: recordedPeriod.besprekingOutcome,
                    signedStatus: recordedPeriod.signedStatus,
                  }
                : null
            }
          />
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
