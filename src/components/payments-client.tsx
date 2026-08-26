"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, ShieldAlert, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  approveBatch,
  createPaymentProposals,
  removePaymentItem,
  resolveMachtigingFlag,
} from "@/lib/actions/payments";

export function CreateProposalsButton() {
  const t = useTranslations("payments");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await createPaymentProposals();
          if (res.error === "open_batch_exists") {
            toast.warning(t("openBatchExists"));
          } else {
            toast.success(t("proposalsCreated", { count: res.items }));
          }
          if (res.batchId) router.push(`/payments/${res.batchId}`);
        })
      }
    >
      {isPending ? t("generating") : t("createProposals")}
    </Button>
  );
}

export function ApproveBatchButton({
  batchId,
  blocked,
  summary,
}: {
  batchId: string;
  blocked: boolean;
  summary: {
    totalCents: number;
    itemCount: number;
    dossierCount: number;
    accountCount: number;
    executionDate: string;
    unresolvedCount: number;
  };
}) {
  const t = useTranslations("payments");
  const tm = useTranslations();
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();
  return (
    <>
      <Button
        disabled={blocked || isPending}
        title={blocked ? t("approveBlocked") : undefined}
        onClick={() => setOpen(true)}
      >
        {t("approve")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("approveSummaryTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-sm">
              <dt className="text-muted-foreground">{t("approveSummary.total")}</dt>
              <dd className="font-medium tabular-nums">
                {(summary.totalCents / 100).toLocaleString("nl-NL", {
                  style: "currency",
                  currency: "EUR",
                })}
              </dd>
              <dt className="text-muted-foreground">{t("approveSummary.items")}</dt>
              <dd>{summary.itemCount}</dd>
              <dt className="text-muted-foreground">{t("approveSummary.dossiers")}</dt>
              <dd>
                {summary.dossierCount} / {summary.accountCount}{" "}
                {t("approveSummary.accounts")}
              </dd>
              <dt className="text-muted-foreground">{t("approveSummary.execution")}</dt>
              <dd className="tabular-nums">{summary.executionDate}</dd>
              <dt className="text-muted-foreground">
                {t("approveSummary.unresolved")}
              </dt>
              <dd className={summary.unresolvedCount > 0 ? "text-red-600" : ""}>
                {summary.unresolvedCount}
              </dd>
            </dl>
            <p className="text-xs rounded-md bg-amber-50 text-amber-800 px-3 py-2">
              {t("approveSummary.demoWarning")}
            </p>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tm("common.cancel")}
              </Button>
              <Button
                disabled={isPending || summary.unresolvedCount > 0}
                onClick={() =>
                  startTransition(async () => {
                    const res = await approveBatch(batchId);
                    if (res.ok) {
                      toast.success(t("approved"));
                      setOpen(false);
                    } else toast.error(t("approveBlocked"));
                  })
                }
              >
                {t("approveConfirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}


export function ExportBatchButton({ batchId }: { batchId: string }) {
  const t = useTranslations("payments");
  return (
    <Button
      variant="outline"
      nativeButton={false}
      render={<a href={`/api/payments/${batchId}/export`} download />}
    >
      <Download className="h-4 w-4" /> {t("exportPain")}
    </Button>
  );
}

export function RemoveItemButton({ itemId }: { itemId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      className="text-muted-foreground/40 hover:text-red-600"
      disabled={isPending}
      onClick={() => startTransition(async () => removePaymentItem(itemId))}
      aria-label="remove"
    >
      <X className="h-4 w-4" />
    </button>
  );
}

type Flag = {
  triggered: boolean;
  reasons: string[];
  resolution?: string;
  rationale?: string;
};

export function MachtigingResolver({
  itemId,
  flag,
  editable,
}: {
  itemId: string;
  flag: Flag;
  editable: boolean;
}) {
  const t = useTranslations("payments");
  const tm = useTranslations();
  const [open, setOpen] = useState(false);
  const [resolution, setResolution] = useState<
    "consent_recorded" | "court_authorization" | "not_applicable"
  >("consent_recorded");
  const [rationale, setRationale] = useState("");
  const [isPending, startTransition] = useTransition();

  if (flag.resolution) {
    return (
      <span className="text-xs text-emerald-700">
        {t(`resolution.${flag.resolution}`)}
        {flag.rationale && (
          <span className="text-muted-foreground/70 block truncate max-w-40">
            {flag.rationale}
          </span>
        )}
      </span>
    );
  }

  return (
    <>
      <button
        className="inline-flex items-center gap-1 text-xs text-red-600 hover:underline"
        onClick={() => editable && setOpen(true)}
      >
        <ShieldAlert className="h-3.5 w-3.5" />
        {t("machtigingReview")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("machtigingTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-md bg-red-50 px-3 py-2 text-sm text-red-700 space-y-0.5">
              {flag.reasons.map((r) => (
                <div key={r}>• {tm(r)}</div>
              ))}
            </div>
            <p className="text-xs text-muted-foreground">{t("machtigingDisclaimer")}</p>
            <div className="space-y-1.5">
              {(
                [
                  "consent_recorded",
                  "court_authorization",
                  "not_applicable",
                ] as const
              ).map((r) => (
                <label key={r} className="flex items-center gap-2 text-sm">
                  <input
                    type="radio"
                    name="resolution"
                    checked={resolution === r}
                    onChange={() => setResolution(r)}
                  />
                  {t(`resolution.${r}`)}
                </label>
              ))}
            </div>
            <Input
              value={rationale}
              onChange={(e) => setRationale(e.target.value)}
              placeholder={t("rationalePlaceholder")}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tm("common.cancel")}
              </Button>
              <Button
                disabled={isPending || rationale.trim() === ""}
                onClick={() =>
                  startTransition(async () => {
                    const res = await resolveMachtigingFlag(
                      itemId,
                      resolution,
                      rationale
                    );
                    if (res.ok) {
                      toast.success(t("machtigingResolved"));
                      setOpen(false);
                    } else toast.error(res.error);
                  })
                }
              >
                {tm("common.confirm")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
