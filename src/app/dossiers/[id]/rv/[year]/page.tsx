import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getDossier } from "@/lib/queries";
import { buildRvPack } from "@/lib/rv";
import { Money } from "@/components/format";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

/**
 * R&V review pack — a printable werkdocument. All figures computed by code
 * from the ledger (never by an LLM). Watermarked: not for court submission;
 * completion happens in Mijn CBM (T2).
 */
export default async function RvPackPage({
  params,
}: {
  params: Promise<{ id: string; year: string }>;
}) {
  const { id, year: yearStr } = await params;
  const year = Number(yearStr);
  if (!Number.isInteger(year) || year < 2000 || year > 2100) notFound();

  const t = await getTranslations("rvPack");
  const dossier = await getDossier(id);
  const pack = await buildRvPack(id, year);
  if (!dossier || !pack) notFound();

  return (
    <div className="max-w-3xl mx-auto space-y-6 print:text-black">
      <div className="flex items-center justify-between print:hidden">
        <Link
          href={`/dossiers/${id}?tab=filings`}
          className="text-sm text-indigo-700 hover:underline"
        >
          ← {t("back")}
        </Link>
        <PrintButton label={t("print")} />
      </div>

      <div className="border-2 border-amber-400 bg-amber-50 text-amber-900 text-center text-sm font-semibold py-2 px-4 rounded">
        {t("watermark")}
      </div>

      <header className="space-y-1">
        <h1 className="text-xl font-semibold">
          {t("title", { year })}
        </h1>
        <p className="text-sm text-neutral-600">
          {dossier.firstName} {dossier.lastName}
          {dossier.zaaknummer ? ` · ${dossier.zaaknummer}` : ""}
          {dossier.rechtbank ? ` · ${dossier.rechtbank}` : ""}
        </p>
        <p className="text-sm text-neutral-500">
          {t("period")}: {pack.periodStart} — {pack.periodEnd}
        </p>
      </header>

      <section>
        <h2 className="font-medium mb-2">{t("balances")}</h2>
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b border-neutral-300 text-left text-neutral-500">
              <th className="py-1.5">{t("account")}</th>
              <th className="py-1.5 text-right">{t("opening")}</th>
              <th className="py-1.5 text-right">{t("closing")}</th>
            </tr>
          </thead>
          <tbody>
            {pack.accounts.map((acc) => (
              <tr key={acc.iban} className="border-b border-neutral-100">
                <td className="py-1.5">
                  <span className="font-mono">{acc.iban}</span>{" "}
                  <span className="text-neutral-400">({acc.type})</span>
                  {acc.leefgeldOnly && (
                    <span className="text-xs text-neutral-400 block">
                      {t("leefgeldNote")}
                    </span>
                  )}
                </td>
                <td className="py-1.5 text-right">
                  <Money cents={acc.openingCents} />
                </td>
                <td className="py-1.5 text-right">
                  <Money cents={acc.closingCents} />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <div className="grid grid-cols-2 gap-8">
        <section>
          <h2 className="font-medium mb-2">{t("income")}</h2>
          <table className="w-full text-sm">
            <tbody>
              {pack.incomeByCategory.map((c) => (
                <tr key={c.key} className="border-b border-neutral-100">
                  <td className="py-1">{c.nl}</td>
                  <td className="py-1 text-right">
                    <Money cents={c.cents} />
                  </td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1.5">{t("total")}</td>
                <td className="py-1.5 text-right">
                  <Money cents={pack.totalIncomeCents} />
                </td>
              </tr>
            </tbody>
          </table>
        </section>
        <section>
          <h2 className="font-medium mb-2">{t("expenses")}</h2>
          <table className="w-full text-sm">
            <tbody>
              {pack.expenseByCategory.map((c) => (
                <tr key={c.key} className="border-b border-neutral-100">
                  <td className="py-1">{c.nl}</td>
                  <td className="py-1 text-right">
                    <Money cents={c.cents} />
                  </td>
                </tr>
              ))}
              <tr className="font-medium">
                <td className="py-1.5">{t("total")}</td>
                <td className="py-1.5 text-right">
                  <Money cents={pack.totalExpenseCents} />
                </td>
              </tr>
            </tbody>
          </table>
        </section>
      </div>

      {pack.largeExpenses.length > 0 && (
        <section>
          <h2 className="font-medium mb-2">{t("largeExpenses")}</h2>
          <p className="text-xs text-neutral-500 mb-2">{t("largeExpensesHint")}</p>
          <table className="w-full text-sm">
            <tbody>
              {pack.largeExpenses.map((e, i) => (
                <tr key={i} className="border-b border-neutral-100">
                  <td className="py-1 tabular-nums">{e.date}</td>
                  <td className="py-1">{e.counterparty ?? "—"}</td>
                  <td className="py-1 text-right">
                    <Money cents={e.cents} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>
      )}

      <section>
        <h2 className="font-medium mb-2">{t("validations")}</h2>
        <ul className="space-y-1 text-sm">
          {pack.validations.length === 0 && (
            <li className="text-emerald-700">{t("clean")}</li>
          )}
          {pack.validations.map((v) => (
            <li
              key={v.key}
              className={v.level === "error" ? "text-red-700" : "text-amber-700"}
            >
              • {t(`validation.${v.key}`, { detail: v.detail ?? "" })}
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h2 className="font-medium mb-2">{t("attachments")}</h2>
        <ul className="space-y-1 text-sm">
          {pack.attachments.map((a) => (
            <li key={a.key} className="flex items-center gap-2">
              <span
                className={
                  "inline-block h-3.5 w-3.5 rounded border " +
                  (a.done
                    ? "bg-emerald-500 border-emerald-500"
                    : "border-neutral-300")
                }
              />
              {t(`attachment.${a.key}`)}
            </li>
          ))}
        </ul>
        <p className="text-xs text-neutral-500 mt-3">{t("mijnCbmNote")}</p>
      </section>
    </div>
  );
}
