import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { getPaymentBatches } from "@/lib/queries";
import { Money, StatusBadge } from "@/components/format";
import { CreateProposalsButton } from "@/components/payments-client";

export const dynamic = "force-dynamic";

export default async function PaymentsPage() {
  const t = await getTranslations("payments");
  const batches = await getPaymentBatches();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
        </div>
        <CreateProposalsButton />
      </div>

      <div className="space-y-3">
        {batches.map((batch) => {
          const total = batch.items.reduce((s, i) => s + i.amountCents, 0);
          const flagged = batch.items.filter(
            (i) => i.machtigingFlag?.triggered && !i.machtigingFlag.resolution
          ).length;
          return (
            <Link
              key={batch.id}
              href={`/payments/${batch.id}`}
              className="flex items-center gap-4 rounded-lg border border-border bg-card px-4 py-3 hover:bg-muted/50"
            >
              <div className="flex-1 min-w-0">
                <div className="font-medium text-sm">{batch.name}</div>
                <div className="text-xs text-muted-foreground">
                  {t("execution")}: {batch.executionDate} · {batch.items.length}{" "}
                  {t("items")}
                  {flagged > 0 && (
                    <span className="text-red-600 ml-2">
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
        {batches.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
      </div>
    </div>
  );
}
