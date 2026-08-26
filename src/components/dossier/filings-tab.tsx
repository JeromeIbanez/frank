import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Money } from "@/components/format";
import { getDossier } from "@/lib/queries";
import { buildRvPack } from "@/lib/rv";

type DossierFull = NonNullable<Awaited<ReturnType<typeof getDossier>>>;

export async function FilingsTab({ dossier }: { dossier: DossierFull }) {
  const t = await getTranslations("filings");
  const year = new Date().getFullYear();
  const pack = await buildRvPack(dossier.id, year);

  return (
    <div className="space-y-4">
      <div className="inline-flex items-center gap-1.5 rounded-full bg-muted text-muted-foreground text-xs px-3 py-1">
        {t("officialOutput")}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
      <Card>
        <CardHeader>
          <CardTitle className="text-base">
            {t("rvTitle", { year })}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-muted-foreground">{t("rvExplainer")}</p>

          {pack && (
            <>
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="text-muted-foreground text-xs">{t("totalIncome")}</div>
                  <Money cents={pack.totalIncomeCents} />
                </div>
                <div className="rounded-md bg-muted/40 p-3">
                  <div className="text-muted-foreground text-xs">{t("totalExpenses")}</div>
                  <Money cents={pack.totalExpenseCents} />
                </div>
              </div>

              <div className="space-y-1.5">
                {pack.validations.map((v) => (
                  <div
                    key={v.key}
                    className={
                      "text-sm rounded-md px-3 py-2 " +
                      (v.level === "error"
                        ? "bg-red-50 text-red-700"
                        : "bg-amber-50 text-amber-700")
                    }
                  >
                    {t(`validation.${v.key}`, { detail: v.detail ?? "" })}
                  </div>
                ))}
                {pack.validations.length === 0 && (
                  <div className="text-sm rounded-md px-3 py-2 bg-emerald-50 text-emerald-700">
                    {t("validationClean")}
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
          <p className="text-xs text-amber-600">{t("notForSubmission")}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("boedelTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <p className="text-sm text-muted-foreground">{t("boedelExplainer")}</p>
          <div className="text-sm space-y-1.5">
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("boedelAccounts")}</span>
              <span>{dossier.accounts.length}</span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("boedelDebts")}</span>
              <span>
                {dossier.debts.length} (
                <Money
                  cents={dossier.debts.reduce((s, d) => s + d.currentAmountCents, 0)}
                />
                )
              </span>
            </div>
            <div className="flex justify-between">
              <span className="text-muted-foreground">{t("boedelIncome")}</span>
              <span>
                {dossier.budgetLines.filter((b) => b.kind === "income" && b.active).length}{" "}
                {t("boedelLines")}
              </span>
            </div>
          </div>
          <p className="text-xs text-muted-foreground/70">{t("boedelHint")}</p>
        </CardContent>
      </Card>
      </div>
    </div>
  );
}
