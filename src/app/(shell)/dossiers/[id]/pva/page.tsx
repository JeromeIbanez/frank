import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDossier, getDossierTasks } from "@/lib/queries";
import { DateText, Money } from "@/components/format";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

/**
 * Plan van aanpak werkdocument — due with the boedelbeschrijving for a
 * professional bewindvoerder (LOVT), with a debt supplement when the
 * measure is schuldenbewind. Figures computed by code; free-text sections
 * maintained on the dossier (intake tab). Watermarked werkdocument.
 */
export default async function PvaPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("pva");
  const tAll = await getTranslations();
  const dossier = await getDossier(id);
  if (!dossier) notFound();
  const tasks = (await getDossierTasks(id)).filter((task) =>
    ["open", "prepared", "submitted"].includes(task.status)
  );

  const monthly = (kind: "income" | "expense") =>
    dossier.budgetLines
      .filter((b) => b.kind === kind && b.active)
      .reduce((s, b) => {
        const f =
          b.frequency === "weekly"
            ? (52 / 12)
            : b.frequency === "monthly"
              ? 1
              : b.frequency === "quarterly"
                ? 1 / 3
                : b.frequency === "yearly"
                  ? 1 / 12
                  : 0;
        return s + Math.round(b.amountCents * f);
      }, 0);
  const incomeMonthly = monthly("income");
  const expenseMonthly = monthly("expense");
  const totalDebt = dossier.debts.reduce(
    (s, d) => s + d.currentAmountCents,
    0
  );

  return (
    <div className="max-w-3xl mx-auto space-y-6 print:text-black">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/dossiers/${id}?tab=intake`}
          className="text-sm text-primary hover:underline"
        >
          ← {t("back")}
        </Link>
        <PrintButton label={t("print")} />
      </div>

      <div className="rounded-md border border-[#FDE68A] bg-[#FFFBEB] px-4 py-2 text-center text-[12px] font-semibold text-[#B45309]">
        {t("watermark")}
      </div>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold">{t("title")}</h1>
        <p className="text-[13px] text-ink-600">
          {dossier.firstName} {dossier.lastName}
          {dossier.zaaknummer && (
            <>
              {" · "}
              <span className="font-mono">{dossier.zaaknummer}</span>
            </>
          )}
          {dossier.rechtbank ? ` · ${dossier.rechtbank}` : ""}
        </p>
      </header>

      <section>
        <h2 className="type-section-label mb-2">{t("goals")}</h2>
        <p className="text-sm whitespace-pre-wrap">
          {dossier.pvaGoals ?? (
            <span className="text-ink-400">{t("sectionMissing")}</span>
          )}
        </p>
      </section>

      <section>
        <h2 className="type-section-label mb-2">{t("budgetSummary")}</h2>
        <table className="w-full max-w-sm text-sm">
          <tbody>
            <tr className="border-b border-hairline">
              <td className="py-1">{t("incomeMonthly")}</td>
              <td className="py-1 text-right">
                <Money cents={incomeMonthly} />
              </td>
            </tr>
            <tr className="border-b border-hairline">
              <td className="py-1">{t("expenseMonthly")}</td>
              <td className="py-1 text-right">
                <Money cents={expenseMonthly} />
              </td>
            </tr>
            <tr className="font-medium">
              <td className="py-1.5">{t("margin")}</td>
              <td
                className={
                  "py-1.5 text-right " +
                  (incomeMonthly - expenseMonthly < 0 ? "text-[#B91C1C]" : "")
                }
              >
                <Money cents={incomeMonthly - expenseMonthly} />
              </td>
            </tr>
          </tbody>
        </table>
        {dossier.leefgeldAmountCents && (
          <p className="mt-2 text-[12.5px] text-ink-600">
            {t("leefgeldLine", {
              amount: (dossier.leefgeldAmountCents / 100).toLocaleString(
                "nl-NL",
                { style: "currency", currency: "EUR" }
              ),
              frequency: t(`freq.${dossier.leefgeldFrequency ?? "weekly"}`),
            })}
          </p>
        )}
      </section>

      <section>
        <h2 className="type-section-label mb-2">{t("plannedActions")}</h2>
        <table className="w-full text-sm">
          <tbody>
            {tasks.slice(0, 12).map((task) => (
              <tr key={task.id} className="border-b border-hairline">
                <td className="py-1">
                  {task.titleFree ?? tAll(task.titleKey)}
                </td>
                <td className="py-1 text-right text-ink-600">
                  {task.dueDate ? <DateText iso={task.dueDate} /> : "—"}
                </td>
              </tr>
            ))}
            {tasks.length === 0 && (
              <tr>
                <td className="py-1 text-ink-400">{t("noTasks")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="type-section-label mb-2">{t("agreements")}</h2>
        <p className="text-sm whitespace-pre-wrap">
          {dossier.pvaAgreements ?? (
            <span className="text-ink-400">{t("sectionMissing")}</span>
          )}
        </p>
      </section>

      {dossier.schuldenbewind && (
        <section className="rounded-[10px] border border-border bg-surface-subtle p-4 space-y-3">
          <h2 className="type-section-label">{t("debtSupplement")}</h2>
          <table className="w-full text-sm">
            <tbody>
              {dossier.debts.map((d) => (
                <tr key={d.id} className="border-b border-hairline">
                  <td className="py-1">{d.creditor}</td>
                  <td className="py-1 text-ink-600">{t(`debtStatus.${d.status}`)}</td>
                  <td className="py-1 text-right">
                    <Money cents={d.currentAmountCents} />
                  </td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1.5">{t("debtTotal")}</td>
                <td />
                <td className="py-1.5 text-right">
                  <Money cents={totalDebt} />
                </td>
              </tr>
            </tbody>
          </table>
          <div>
            <h3 className="text-[12px] font-semibold text-ink-600 mb-1">
              {t("debtStrategy")}
            </h3>
            <p className="text-sm whitespace-pre-wrap">
              {dossier.pvaDebtStrategy ?? (
                <span className="text-ink-400">{t("sectionMissing")}</span>
              )}
            </p>
          </div>
        </section>
      )}

      <section className="pt-6 grid grid-cols-2 gap-8 text-sm">
        <div>
          <p className="mb-10">{t("signBewindvoerder")}</p>
          <div className="border-t border-ink-300 pt-1 text-xs text-ink-400">
            {t("signatureDate")}
          </div>
        </div>
        <div>
          <p className="mb-10">{t("signClient")}</p>
          <div className="border-t border-ink-300 pt-1 text-xs text-ink-400">
            {t("signatureDate")}
          </div>
        </div>
      </section>
    </div>
  );
}
