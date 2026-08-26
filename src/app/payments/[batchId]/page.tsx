import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import { getPaymentBatch } from "@/lib/queries";
import { DateText, Money, StatusBadge } from "@/components/format";
import {
  ApproveBatchFooterButton,
  ExcludeItemButton,
  ExportBatchButton,
  MachtigingResolver,
} from "@/components/payments-client";
import { cn } from "@/lib/utils";

export const dynamic = "force-dynamic";

/**
 * Payments batch review (design handoff §3). Row states: OK · legal review
 * required (red chip, tinted row, 3px left rule) · excluded (struck-through,
 * undo). The footer approve flow is deliberately slow: blocked note →
 * summary modal → acknowledgment → locked + audit banner. All gates are
 * re-checked server-side; this page only renders the same facts.
 */
export default async function PaymentBatchPage({
  params,
}: {
  params: Promise<{ batchId: string }>;
}) {
  const { batchId } = await params;
  const t = await getTranslations("payments");
  const tAll = await getTranslations();
  const batch = await getPaymentBatch(batchId);
  if (!batch) notFound();

  const included = batch.items.filter((i) => !i.excluded);
  const total = included.reduce((s, i) => s + i.amountCents, 0);
  const blockers = included.filter(
    (i) =>
      (i.validationErrors && i.validationErrors.length > 0) ||
      (i.machtigingFlag?.triggered && !i.machtigingFlag.resolution)
  ).length;
  const isDraft = batch.status === "draft";

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-ink-400">
          <Link href="/payments" className="hover:text-ink-600">
            {t("title")}
          </Link>{" "}
          /
        </div>
        <h1 className="type-page-title mt-1 flex items-center gap-3">
          {batch.name}
          <StatusBadge
            status={batch.status}
            label={t(`status.${batch.status}`)}
          />
        </h1>
        <p className="text-[13px] text-ink-600 mt-1">
          {t("execution")}: <DateText iso={batch.executionDate} /> ·{" "}
          <span className="font-mono tabular-nums">{included.length}</span>{" "}
          {t("items")} · <Money cents={total} />
        </p>
      </div>

      {batch.status !== "draft" && (
        <div className="rounded-[8px] bg-[#F0FDF4] border border-[#DCFCE7] text-[#15803D] text-[12.5px] px-4 py-2.5">
          {t("approvedBanner", {
            name: batch.approvedBy ?? "—",
          })}
        </div>
      )}
      {batch.status === "exported" && (
        <div className="rounded-[8px] bg-[#FFFBEB] border border-[#FDE68A] text-[#B45309] text-[12.5px] px-4 py-2.5">
          {t("demoExportNote", { filename: batch.exportFilename ?? "" })}
        </div>
      )}

      <div className="rounded-[10px] border border-border bg-surface overflow-x-auto">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="text-left">
              {[
                t("cols.dossier"),
                t("cols.creditor"),
                t("cols.remittance"),
                t("cols.amount"),
                t("cols.review"),
              ].map((h, i) => (
                <th
                  key={h}
                  className={cn(
                    "type-section-label font-semibold px-4 py-2.5 border-b border-hairline",
                    i === 3 && "text-right"
                  )}
                >
                  {h}
                </th>
              ))}
              {isDraft && <th className="border-b border-hairline" />}
            </tr>
          </thead>
          <tbody>
            {batch.items.map((item) => {
              const legalOpen =
                item.machtigingFlag?.triggered && !item.machtigingFlag.resolution;
              const legalRow = legalOpen && !item.excluded;
              return (
                <tr
                  key={item.id}
                  className={cn(
                    "border-b border-hairline last:border-0 hover:bg-surface-hover",
                    legalRow &&
                      "bg-[#FEF2F2] [&>td:first-child]:relative [&>td:first-child]:before:absolute [&>td:first-child]:before:inset-y-0 [&>td:first-child]:before:left-0 [&>td:first-child]:before:w-[3px] [&>td:first-child]:before:bg-[#DC2626] [&>td:first-child]:before:content-['']",
                    item.excluded && "text-ink-300"
                  )}
                >
                  <td className="px-4 py-2.5 whitespace-nowrap align-top">
                    <span
                      className={cn(
                        "font-[550]",
                        item.excluded && "line-through"
                      )}
                    >
                      {item.dossier.lastName},{" "}
                      {item.dossier.firstName.slice(0, 1)}.
                    </span>
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    <div className={cn(item.excluded && "line-through")}>
                      {item.creditorName}
                    </div>
                    <div className="font-mono text-[11.5px] text-ink-400">
                      {item.creditorIban.replace(/(.{4})/g, "$1 ").trim()}
                    </div>
                    {legalRow && item.machtigingFlag && (
                      <div className="text-[11.5px] text-[#B91C1C] mt-1">
                        {item.machtigingFlag.reasons
                          .map((r) => tAll(r))
                          .join(" · ")}
                      </div>
                    )}
                    {item.excluded && (
                      <div className="text-[11.5px] text-ink-400 mt-1 no-underline">
                        {t("excludedHeld")}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2.5 text-[12.5px] text-ink-600 align-top max-w-44 truncate">
                    {item.remittanceInfo}
                  </td>
                  <td
                    className={cn(
                      "px-4 py-2.5 text-right align-top",
                      legalRow && "text-[#DC2626] font-semibold",
                      item.excluded && "line-through"
                    )}
                  >
                    <Money cents={item.amountCents} />
                  </td>
                  <td className="px-4 py-2.5 align-top">
                    {item.excluded ? (
                      <ExcludeItemButton itemId={item.id} excluded />
                    ) : item.validationErrors?.length ? (
                      <span className="text-[11px] font-semibold text-[#B91C1C]">
                        {item.validationErrors.join(", ")}
                      </span>
                    ) : item.machtigingFlag?.triggered ? (
                      <MachtigingResolver
                        itemId={item.id}
                        flag={item.machtigingFlag}
                        editable={isDraft}
                      />
                    ) : (
                      <span className="text-[11px] font-semibold text-[#15803D]">
                        ✓ {t("reviewOk")}
                      </span>
                    )}
                  </td>
                  {isDraft && (
                    <td className="px-4 py-2.5 align-top text-right">
                      {!item.excluded && legalOpen && (
                        <ExcludeItemButton itemId={item.id} excluded={false} />
                      )}
                    </td>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        <div className="flex items-center justify-between gap-4 border-t border-hairline bg-surface-subtle px-4 py-3">
          <div className="text-[12.5px] text-ink-600">
            <span className="font-mono tabular-nums">{included.length}</span>{" "}
            {t("items")} ·{" "}
            <span className="font-mono tabular-nums font-semibold">
              <Money cents={total} />
            </span>
            {blockers > 0 && (
              <span className="ml-3 inline-flex items-center gap-1.5 text-[#B91C1C]">
                <span className="h-2 w-2 rounded-full bg-[#DC2626]" />
                {t("blockedNote", { count: blockers })}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3">
            {isDraft && (
              <>
                <span className="text-[11.5px] text-ink-400 max-w-56 text-right">
                  {t("auditMicrocopy")}
                </span>
                <ApproveBatchFooterButton
                  batchId={batch.id}
                  blocked={blockers > 0 || included.length === 0}
                  summary={{
                    totalCents: total,
                    itemCount: included.length,
                    excludedCount: batch.items.length - included.length,
                    dossierCount: new Set(included.map((i) => i.dossierId)).size,
                    executionDate: batch.executionDate,
                    unresolvedCount: blockers,
                  }}
                />
              </>
            )}
            {(batch.status === "approved" || batch.status === "exported") && (
              <ExportBatchButton batchId={batch.id} />
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
