import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateText, Money } from "@/components/format";
import { getDossier } from "@/lib/queries";
import { ActivateButton, RvScheduleForm, AddAccountForm } from "./overview-client";

type DossierFull = NonNullable<Awaited<ReturnType<typeof getDossier>>>;

/** Debt status chips (handoff §2): open → amber, regeling → indigo; small inline. */
function DebtStatusChip({ status }: { status: string }) {
  const cls =
    status === "regeling"
      ? "bg-indigo-50 text-[#4338CA]"
      : status === "open"
        ? "bg-[#FFFBEB] text-[#B45309]"
        : "border border-border bg-surface text-ink-600";
  return (
    <span
      className={`inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap ${cls}`}
    >
      {status}
    </span>
  );
}

export async function OverviewTab({
  dossier,
  balances,
}: {
  dossier: DossierFull;
  balances: Map<string, number>;
}) {
  const t = await getTranslations("overview");
  const notified = dossier.contacts.filter((c) => c.notified).length;
  const rvRecorded = dossier.rvScheduleConfirmed && dossier.rvScheduleMonth;

  return (
    <div className="grid lg:grid-cols-2 gap-4">
      {/* Client card — dl-grid with ~150px label column */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{t("person")}</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-[150px_1fr] gap-x-4 gap-y-2">
            <dt className="text-[12.5px] text-ink-400">{t("dateOfBirth")}</dt>
            <dd className="text-[13px]">
              {dossier.dateOfBirth ? <DateText iso={dossier.dateOfBirth} /> : "—"}
            </dd>
            <dt className="text-[12.5px] text-ink-400">{t("address")}</dt>
            <dd className="text-[13px]">
              {dossier.addressStreet ?? "—"}
              {dossier.addressPostcode
                ? `, ${dossier.addressPostcode} ${dossier.addressCity ?? ""}`
                : ""}
            </dd>
            <dt className="text-[12.5px] text-ink-400">{t("gemeente")}</dt>
            <dd className="text-[13px]">{dossier.gemeente ?? "—"}</dd>
            <dt className="text-[12.5px] text-ink-400">{t("beschikking")}</dt>
            <dd className="text-[13px]">
              {dossier.beschikkingDate ? (
                <DateText iso={dossier.beschikkingDate} />
              ) : (
                "—"
              )}
            </dd>
            <dt className="text-[12.5px] text-ink-400">{t("start")}</dt>
            <dd className="text-[13px]">
              {dossier.startDate ? <DateText iso={dossier.startDate} /> : "—"}
            </dd>
            <dt className="text-[12.5px] text-ink-400">{t("leefgeld")}</dt>
            <dd className="text-[13px]">
              {dossier.leefgeldAmountCents ? (
                <>
                  <Money cents={dossier.leefgeldAmountCents} />{" "}
                  {t(`freq.${dossier.leefgeldFrequency ?? "weekly"}`)}
                </>
              ) : (
                "—"
              )}
            </dd>
            {rvRecorded && (
              <>
                <dt className="text-[12.5px] text-ink-400">{t("rvSchedule")}</dt>
                <dd className="text-[13px]">
                  {t("rvConfirmed", { month: String(dossier.rvScheduleMonth) })}
                </dd>
              </>
            )}
          </dl>

          {!rvRecorded && (
            <div className="mt-4 rounded-md bg-surface-hover px-3 py-2.5 space-y-2.5">
              <p className="flex items-start gap-2 text-[12.5px] text-ink-600">
                <span
                  aria-hidden
                  className="mt-[5px] inline-block h-2 w-2 shrink-0 rounded-full bg-[#DC2626]"
                />
                <span>{t("rvMissing")}</span>
              </p>
              <RvScheduleForm dossierId={dossier.id} />
            </div>
          )}

          {dossier.status !== "actief" && (
            <div className="mt-4">
              <ActivateButton
                dossierId={dossier.id}
                disabled={!dossier.startDate}
              />
              {!dossier.startDate && (
                <p className="mt-1.5 flex items-center gap-1.5 text-xs text-ink-600">
                  <span
                    aria-hidden
                    className="inline-block h-2 w-2 shrink-0 rounded-full bg-[#F59E0B]"
                  />
                  {t("needStartDate")}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Accounts card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{t("accounts")}</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-hairline">
            {dossier.accounts.map((acc) => (
              <div
                key={acc.id}
                className="flex items-center justify-between gap-3 py-2.5 first:pt-0"
              >
                <div className="min-w-0">
                  <div className="text-[13.5px] font-[550]">
                    {t(`accountType.${acc.type}`)}
                  </div>
                  <div className="font-mono text-xs text-ink-400">
                    {acc.iban}
                    {acc.bankName ? ` · ${acc.bankName}` : ""}
                  </div>
                </div>
                <span className="text-[15px] font-semibold">
                  <Money cents={balances.get(acc.id) ?? 0} />
                </span>
              </div>
            ))}
          </div>
          {dossier.accounts.length === 0 && (
            <p className="text-[12.5px] text-ink-400">{t("noAccounts")}</p>
          )}
          <div className="mt-3">
            <AddAccountForm dossierId={dossier.id} />
          </div>
        </CardContent>
      </Card>

      {/* Agencies card */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold flex items-baseline gap-2">
            {t("contacts")}
            <span className="font-mono text-xs font-normal text-ink-400 tabular-nums">
              {notified}/{dossier.contacts.length} {t("notified")}
            </span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap gap-1.5">
            {dossier.contacts.map((c) => (
              <span
                key={c.id}
                className={
                  "inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-semibold " +
                  (c.notified
                    ? "bg-indigo-50 text-[#4338CA]"
                    : "border border-border bg-surface text-ink-400")
                }
              >
                {c.notified && <span aria-hidden>✓</span>}
                {c.name}
              </span>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Debts card */}
      {dossier.debts.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("debts")}</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="divide-y divide-hairline">
              {dossier.debts.map((debt) => (
                <div
                  key={debt.id}
                  className="flex items-center justify-between gap-3 py-2 first:pt-0"
                >
                  <div className="flex min-w-0 items-center gap-2">
                    <span className="truncate text-[13.5px] font-[550]">
                      {debt.creditor}
                    </span>
                    <DebtStatusChip status={debt.status} />
                  </div>
                  <Money cents={debt.currentAmountCents} />
                </div>
              ))}
            </div>
            <div className="mt-2 flex items-center justify-between border-t border-hairline pt-2.5">
              <span className="text-[13px] font-medium">{t("debtTotal")}</span>
              <span className="text-sm font-semibold">
                <Money
                  cents={dossier.debts.reduce(
                    (s, d) => s + d.currentAmountCents,
                    0
                  )}
                />
              </span>
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
