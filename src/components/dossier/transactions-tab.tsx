import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { DateText, EmptyState, Money, SeverityDot } from "@/components/format";
import { getDossier, getDossierTransactions } from "@/lib/queries";
import {
  AiCategorizeButton,
  CategorySelect,
  ImportCamtForm,
  ManualTransactionForm,
} from "./transactions-client";

type DossierFull = NonNullable<Awaited<ReturnType<typeof getDossier>>>;

export async function TransactionsTab({
  dossier,
  transactionsPromise,
}: {
  dossier: DossierFull;
  transactionsPromise: ReturnType<typeof getDossierTransactions>;
}) {
  const t = await getTranslations("transactions");
  const rows = await transactionsPromise;
  const uncategorized = rows.filter((r) => !r.categoryKey).length;

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("importTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportCamtForm
              accounts={dossier.accounts.map((a) => ({
                id: a.id,
                iban: a.iban,
                type: a.type,
              }))}
            />
            <p className="text-xs text-ink-400 mt-2">{t("importHint")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("manualTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ManualTransactionForm
              accounts={dossier.accounts.map((a) => ({
                id: a.id,
                iban: a.iban,
                type: a.type,
              }))}
            />
          </CardContent>
        </Card>
      </div>

      <div className="flex items-center justify-between">
        <h3 className="flex items-center gap-2 text-sm font-semibold">
          {t("ledger")}{" "}
          <span className="font-mono text-xs font-normal text-ink-400 tabular-nums">
            {rows.length}
          </span>
          {uncategorized > 0 && (
            <span className="ml-1 inline-flex items-center gap-1.5 text-xs font-normal text-ink-600">
              <SeverityDot severity="amber" />
              {t("uncategorized", { count: uncategorized })}
            </span>
          )}
        </h3>
        {uncategorized > 0 && <AiCategorizeButton dossierId={dossier.id} />}
      </div>

      <div className="rounded-[10px] border border-border bg-card overflow-x-auto">
        {rows.length === 0 ? (
          <EmptyState title={t("emptyTitle")} sentence={t("empty")} />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-hairline hover:bg-transparent">
                <TableHead className="type-section-label h-9 px-3">
                  {t("cols.date")}
                </TableHead>
                <TableHead className="type-section-label h-9 px-3">
                  {t("cols.counterparty")}
                </TableHead>
                <TableHead className="type-section-label h-9 px-3">
                  {t("cols.description")}
                </TableHead>
                <TableHead className="type-section-label h-9 px-3">
                  {t("cols.category")}
                </TableHead>
                <TableHead className="type-section-label h-9 px-3 text-right">
                  {t("cols.amount")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((tx) => (
                <TableRow
                  key={tx.id}
                  className="border-hairline hover:bg-surface-hover"
                >
                  <TableCell className="px-3">
                    <DateText iso={tx.bookingDate} className="text-ink-600" />
                  </TableCell>
                  <TableCell className="max-w-44 truncate px-3 text-[13px] font-[550]">
                    {tx.counterpartyName ?? "—"}
                  </TableCell>
                  <TableCell className="max-w-56 truncate px-3 text-[12.5px] text-ink-600">
                    {tx.description ?? ""}
                  </TableCell>
                  <TableCell className="px-3">
                    <CategorySelect
                      transactionId={tx.id}
                      current={tx.categoryKey}
                      source={tx.categorySource}
                      confidence={tx.categoryConfidence}
                    />
                  </TableCell>
                  <TableCell className="px-3 text-right">
                    <Money cents={tx.amountCents} signed />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
