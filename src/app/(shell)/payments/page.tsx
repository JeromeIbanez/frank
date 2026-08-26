import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getPaymentBatches } from "@/lib/queries";
import { DateText, EmptyState, Money, StatusBadge } from "@/components/format";
import { CreateProposalsButton } from "@/components/payments-client";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const t = await getTranslations("payments");
  const batches = await getPaymentBatches();

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-end">
        <CreateProposalsButton />
      </div>

      {batches.length === 0 ? (
        <div className="rounded-[10px] border border-border bg-surface">
          <EmptyState title={t("emptyTitle")} sentence={t("empty")} />
        </div>
      ) : (
        <div className="space-y-3">
          {batches.map((batch) => {
            const included = batch.items.filter((i) => !i.excluded);
            const total = included.reduce((s, i) => s + i.amountCents, 0);
            const flagged = included.filter(
              (i) => i.machtigingFlag?.triggered && !i.machtigingFlag.resolution
            ).length;
            return (
              <Link
                key={batch.id}
                href={`/payments/${batch.id}`}
                className="flex items-center gap-4 rounded-[10px] border border-border bg-surface px-4 py-3 hover:bg-surface-hover"
              >
                <div className="flex-1 min-w-0">
                  <div className="text-[13.5px] font-[550]">{batch.name}</div>
                  <div className="text-xs text-ink-400 mt-0.5">
                    {t("execution")}: <DateText iso={batch.executionDate} /> ·{" "}
                    <span className="font-mono tabular-nums">
                      {included.length}
                    </span>{" "}
                    {t("items")}
                    {flagged > 0 && (
                      <span className="text-[#B91C1C] ml-2">
                        {t("flagged", { count: flagged })}
                      </span>
                    )}
                  </div>
                </div>
                <Money cents={total} />
                <StatusBadge
                  status={batch.status}
                  label={t(`status.${batch.status}`)}
                />
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}
