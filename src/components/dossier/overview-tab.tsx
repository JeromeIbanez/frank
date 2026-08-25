import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Money } from "@/components/format";
import { getDossier } from "@/lib/queries";
import { ActivateButton, RvScheduleForm, AddAccountForm } from "./overview-client";

type DossierFull = NonNullable<Awaited<ReturnType<typeof getDossier>>>;

export async function OverviewTab({
  dossier,
  balances,
}: {
  dossier: DossierFull;
  balances: Map<string, number>;
}) {
  const t = await getTranslations("overview");

  return (
    <div className="grid lg:grid-cols-2 gap-6">
      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("person")}</CardTitle>
          </CardHeader>
          <CardContent>
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-neutral-500">{t("dateOfBirth")}</dt>
              <dd>{dossier.dateOfBirth ?? "—"}</dd>
              <dt className="text-neutral-500">{t("address")}</dt>
              <dd>
                {dossier.addressStreet ?? "—"}
                {dossier.addressPostcode
                  ? `, ${dossier.addressPostcode} ${dossier.addressCity ?? ""}`
                  : ""}
              </dd>
              <dt className="text-neutral-500">{t("gemeente")}</dt>
              <dd>{dossier.gemeente ?? "—"}</dd>
              <dt className="text-neutral-500">{t("beschikking")}</dt>
              <dd>{dossier.beschikkingDate ?? "—"}</dd>
              <dt className="text-neutral-500">{t("start")}</dt>
              <dd>{dossier.startDate ?? "—"}</dd>
              <dt className="text-neutral-500">{t("leefgeld")}</dt>
              <dd>
                {dossier.leefgeldAmountCents ? (
                  <>
                    <Money cents={dossier.leefgeldAmountCents} />{" "}
                    {t(`freq.${dossier.leefgeldFrequency ?? "weekly"}`)}
                  </>
                ) : (
                  "—"
                )}
              </dd>
            </dl>
            {dossier.status !== "actief" && (
              <div className="mt-4">
                <ActivateButton
                  dossierId={dossier.id}
                  disabled={!dossier.startDate}
                />
                {!dossier.startDate && (
                  <p className="text-xs text-amber-600 mt-1.5">
                    {t("needStartDate")}
                  </p>
                )}
              </div>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("rvSchedule")}</CardTitle>
          </CardHeader>
          <CardContent>
            {dossier.rvScheduleConfirmed && dossier.rvScheduleMonth ? (
              <p className="text-sm">
                {t("rvConfirmed", { month: String(dossier.rvScheduleMonth) })}
              </p>
            ) : (
              <>
                <p className="text-sm text-red-600 mb-3">{t("rvMissing")}</p>
                <RvScheduleForm dossierId={dossier.id} />
              </>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="space-y-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("accounts")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2.5">
            {dossier.accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between rounded-md border border-neutral-100 px-3 py-2 text-sm"
              >
                <div>
                  <div className="font-medium">{t(`accountType.${acc.type}`)}</div>
                  <div className="text-neutral-500 font-mono text-xs">
                    {acc.iban} {acc.bankName ? `· ${acc.bankName}` : ""}
                  </div>
                </div>
                <Money cents={balances.get(acc.id) ?? 0} />
              </div>
            ))}
            {dossier.accounts.length === 0 && (
              <p className="text-sm text-neutral-500">{t("noAccounts")}</p>
            )}
            <AddAccountForm dossierId={dossier.id} />
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base">
              {t("contacts")} ({dossier.contacts.filter((c) => c.notified).length}/
              {dossier.contacts.length} {t("notified")})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex flex-wrap gap-1.5">
              {dossier.contacts.map((c) => (
                <span
                  key={c.id}
                  className={
                    "text-xs rounded-full px-2.5 py-1 " +
                    (c.notified
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-neutral-100 text-neutral-600")
                  }
                >
                  {c.name}
                </span>
              ))}
            </div>
          </CardContent>
        </Card>

        {dossier.debts.length > 0 && (
          <Card>
            <CardHeader>
              <CardTitle className="text-base">{t("debts")}</CardTitle>
            </CardHeader>
            <CardContent className="space-y-2">
              {dossier.debts.map((debt) => (
                <div
                  key={debt.id}
                  className="flex items-center justify-between text-sm"
                >
                  <div>
                    <span className="font-medium">{debt.creditor}</span>
                    <span className="text-neutral-400 ml-2 text-xs uppercase">
                      {debt.status}
                    </span>
                  </div>
                  <Money cents={debt.currentAmountCents} />
                </div>
              ))}
              <div className="border-t border-neutral-100 pt-2 flex justify-between text-sm font-medium">
                <span>{t("debtTotal")}</span>
                <Money
                  cents={dossier.debts.reduce(
                    (s, d) => s + d.currentAmountCents,
                    0
                  )}
                />
              </div>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}
