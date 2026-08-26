import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDossier } from "@/lib/queries";
import { DateText, Money } from "@/components/format";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

/**
 * Boedelbeschrijving werkdocument (art. 1:436 BW — within 4 months of the
 * start of the measure). Code-assembled from dossier data; watermarked:
 * filing happens via the official rechtspraak form. All figures computed —
 * never by an LLM.
 */
export default async function BoedelPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const t = await getTranslations("boedel");
  const dossier = await getDossier(id);
  if (!dossier) notFound();

  const income = dossier.budgetLines.filter(
    (b) => b.kind === "income" && b.active
  );
  const expenses = dossier.budgetLines.filter(
    (b) => b.kind === "expense" && b.active
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
          {dossier.dateOfBirth && (
            <>
              {" · "}
              <DateText iso={dossier.dateOfBirth} />
            </>
          )}
          {dossier.zaaknummer && (
            <>
              {" · "}
              <span className="font-mono">{dossier.zaaknummer}</span>
            </>
          )}
          {dossier.rechtbank ? ` · ${dossier.rechtbank}` : ""}
        </p>
        {dossier.startDate && (
          <p className="text-[13px] text-ink-600">
            {t("perDate")}: <DateText iso={dossier.startDate} />
          </p>
        )}
      </header>

      <section>
        <h2 className="type-section-label mb-2">{t("accounts")}</h2>
        <table className="w-full text-sm border-collapse">
          <tbody>
            {dossier.accounts.map((acc) => (
              <tr key={acc.id} className="border-b border-hairline">
                <td className="py-1.5">
                  <span className="font-mono">{acc.iban}</span>{" "}
                  <span className="text-ink-400">
                    ({acc.type}
                    {acc.bankName ? ` · ${acc.bankName}` : ""})
                  </span>
                </td>
                <td className="py-1.5 text-right">
                  <Money cents={acc.openingBalanceCents} />
                  {acc.openingBalanceDate && (
                    <span className="ml-2 text-xs text-ink-400">
                      {t("perShort")} <DateText iso={acc.openingBalanceDate} />
                    </span>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-2 gap-8">
        <section>
          <h2 className="type-section-label mb-2">{t("income")}</h2>
          <table className="w-full text-sm">
            <tbody>
              {income.map((l) => (
                <tr key={l.id} className="border-b border-hairline">
                  <td className="py-1">
                    {l.name}
                    <span className="block text-xs text-ink-400">
                      {t(`freq.${l.frequency}`)}
                    </span>
                  </td>
                  <td className="py-1 text-right align-top">
                    <Money cents={l.amountCents} />
                  </td>
                </tr>
              ))}
              {income.length === 0 && (
                <tr>
                  <td className="py-1 text-ink-400">{t("none")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="type-section-label mb-2">{t("expenses")}</h2>
          <table className="w-full text-sm">
            <tbody>
              {expenses.map((l) => (
                <tr key={l.id} className="border-b border-hairline">
                  <td className="py-1">
                    {l.name}
                    <span className="block text-xs text-ink-400">
                      {t(`freq.${l.frequency}`)}
                    </span>
                  </td>
                  <td className="py-1 text-right align-top">
                    <Money cents={l.amountCents} />
                  </td>
                </tr>
              ))}
              {expenses.length === 0 && (
                <tr>
                  <td className="py-1 text-ink-400">{t("none")}</td>
                </tr>
              )}
            </tbody>
          </table>
        </section>
      </div>

      <section>
        <h2 className="type-section-label mb-2">{t("debts")}</h2>
        <table className="w-full text-sm">
          <tbody>
            {dossier.debts.map((d) => (
              <tr key={d.id} className="border-b border-hairline">
                <td className="py-1">
                  {d.creditor}
                  {d.reference && (
                    <span className="ml-2 font-mono text-xs text-ink-400">
                      {d.reference}
                    </span>
                  )}
                </td>
                <td className="py-1 text-right">
                  <Money cents={d.currentAmountCents} />
                </td>
              </tr>
            ))}
            {dossier.debts.length === 0 && (
              <tr>
                <td className="py-1 text-ink-400">{t("noDebts")}</td>
              </tr>
            )}
          </tbody>
        </table>
      </section>

      <section>
        <h2 className="type-section-label mb-2">{t("inboedel")}</h2>
        <p className="text-sm whitespace-pre-wrap">
          {dossier.inboedelNote ?? (
            <span className="text-ink-400">{t("inboedelMissing")}</span>
          )}
        </p>
      </section>

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
