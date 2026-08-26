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
import { Money } from "@/components/format";
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
            <CardTitle className="text-base">{t("importTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <ImportCamtForm
              accounts={dossier.accounts.map((a) => ({
                id: a.id,
                iban: a.iban,
                type: a.type,
              }))}
            />
            <p className="text-xs text-muted-foreground/70 mt-2">{t("importHint")}</p>
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("manualTitle")}</CardTitle>
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
        <h3 className="font-medium">
          {t("ledger")} ({rows.length})
          {uncategorized > 0 && (
            <span className="ml-2 text-sm text-amber-600">
              {t("uncategorized", { count: uncategorized })}
            </span>
          )}
        </h3>
        {uncategorized > 0 && <AiCategorizeButton dossierId={dossier.id} />}
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("cols.date")}</TableHead>
              <TableHead>{t("cols.counterparty")}</TableHead>
              <TableHead>{t("cols.description")}</TableHead>
              <TableHead>{t("cols.category")}</TableHead>
              <TableHead className="text-right">{t("cols.amount")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((tx) => (
              <TableRow key={tx.id}>
                <TableCell className="tabular-nums text-muted-foreground whitespace-nowrap">
                  {tx.bookingDate}
                </TableCell>
                <TableCell className="max-w-44 truncate">
                  {tx.counterpartyName ?? "—"}
                </TableCell>
                <TableCell className="max-w-56 truncate text-muted-foreground">
                  {tx.description ?? ""}
                </TableCell>
                <TableCell>
                  <CategorySelect
                    transactionId={tx.id}
                    current={tx.categoryKey}
                    source={tx.categorySource}
                    confidence={tx.categoryConfidence}
                  />
                </TableCell>
                <TableCell className="text-right">
                  <Money cents={tx.amountCents} signed />
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-muted-foreground py-8">
                  {t("empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
