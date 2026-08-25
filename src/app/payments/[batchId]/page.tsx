import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPaymentBatch } from "@/lib/queries";
import { Money, StatusBadge } from "@/components/format";
import {
  ApproveBatchButton,
  ExportBatchButton,
  MachtigingResolver,
  RemoveItemButton,
} from "@/components/payments-client";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

export default async function PaymentBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const t = await getTranslations("payments");
  const batch = await getPaymentBatch(batchId);
  if (!batch) notFound();

  const total = batch.items.reduce((s, i) => s + i.amountCents, 0);
  const blockers = batch.items.filter(
    (i) =>
      (i.validationErrors && i.validationErrors.length > 0) ||
      (i.machtigingFlag?.triggered && !i.machtigingFlag.resolution)
  ).length;

  return (
    <div className="space-y-6">
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-neutral-500">
            <Link href="/payments" className="hover:underline">
              {t("title")}
            </Link>{" "}
            /
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {batch.name}
            <StatusBadge status={batch.status} label={t(`status.${batch.status}`)} />
          </h1>
          <p className="text-sm text-neutral-500 mt-0.5">
            {t("execution")}: {batch.executionDate} · {batch.items.length}{" "}
            {t("items")} · <Money cents={total} />
          </p>
        </div>
        <div className="flex gap-2">
          {batch.status === "draft" && (
            <ApproveBatchButton
              batchId={batch.id}
              blocked={blockers > 0}
              summary={{
                totalCents: total,
                itemCount: batch.items.length,
                dossierCount: new Set(batch.items.map((i) => i.dossierId)).size,
                accountCount: new Set(batch.items.map((i) => i.debtorAccountId))
                  .size,
                executionDate: batch.executionDate,
                unresolvedCount: blockers,
              }}
            />
          )}
          {(batch.status === "approved" || batch.status === "exported") && (
            <ExportBatchButton batchId={batch.id} />
          )}
        </div>
      </div>

      {blockers > 0 && (
        <div className="rounded-md bg-red-50 text-red-700 text-sm px-4 py-2.5">
          {t("blockedBanner", { count: blockers })}
        </div>
      )}
      {batch.status === "exported" && (
        <div className="rounded-md bg-amber-50 text-amber-800 text-sm px-4 py-2.5">
          {t("demoExportNote", { filename: batch.exportFilename ?? "" })}
        </div>
      )}

      <div className="rounded-lg border border-neutral-200 bg-white overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("cols.dossier")}</TableHead>
              <TableHead>{t("cols.creditor")}</TableHead>
              <TableHead>{t("cols.remittance")}</TableHead>
              <TableHead className="text-right">{t("cols.amount")}</TableHead>
              <TableHead>{t("cols.review")}</TableHead>
              {batch.status === "draft" && <TableHead />}
            </TableRow>
          </TableHeader>
          <TableBody>
            {batch.items.map((item) => (
              <TableRow key={item.id}>
                <TableCell className="text-neutral-600 whitespace-nowrap">
                  {item.dossier.lastName}, {item.dossier.firstName}
                </TableCell>
                <TableCell>
                  <div className="font-medium text-sm">{item.creditorName}</div>
                  <div className="font-mono text-xs text-neutral-400">
                    {item.creditorIban}
                  </div>
                </TableCell>
                <TableCell className="text-neutral-500 max-w-44 truncate">
                  {item.remittanceInfo}
                </TableCell>
                <TableCell className="text-right">
                  <Money cents={item.amountCents} />
                </TableCell>
                <TableCell>
                  {item.validationErrors && item.validationErrors.length > 0 && (
                    <span className="text-xs text-red-600">
                      {item.validationErrors.join(", ")}
                    </span>
                  )}
                  {item.machtigingFlag?.triggered ? (
                    <MachtigingResolver
                      itemId={item.id}
                      flag={item.machtigingFlag}
                      editable={batch.status === "draft"}
                    />
                  ) : (
                    !item.validationErrors?.length && (
                      <span className="text-xs text-emerald-600">
                        {t("reviewOk")}
                      </span>
                    )
                  )}
                </TableCell>
                {batch.status === "draft" && (
                  <TableCell>
                    <RemoveItemButton itemId={item.id} />
                  </TableCell>
                )}
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
