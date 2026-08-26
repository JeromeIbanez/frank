"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Download, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  approveBatch,
  createPaymentProposals,
  resolveMachtigingFlag,
  setItemExcluded,
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

/**
 * Deliberate approve flow (design handoff §3): summary + warning + explicit
 * acknowledgment checkbox gating the confirm. The server re-checks the same
 * invariants; the checkbox state is passed and recorded in the audit log.
 */
export function ApproveBatchFooterButton({
  batchId,
  blocked,
  summary,
}: {
  batchId: string;
  blocked: boolean;
  summary: {
    totalCents: number;
    itemCount: number;
    excludedCount: number;
    dossierCount: number;
    executionDate: string;
    unresolvedCount: number;
  };
}) {
  const t = useTranslations("payments");
  const tm = useTranslations();
  const [open, setOpen] = useState(false);
  const [ack, setAck] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <Button
        disabled={blocked || isPending}
        title={blocked ? t("approveBlocked") : undefined}
        className="disabled:bg-indigo-disabled disabled:opacity-100 disabled:cursor-not-allowed"
        onClick={() => {
          setAck(false);
          setOpen(true);
        }}
      >
        {t("approveEllipsis")}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("approveSummaryTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <dl className="grid grid-cols-2 gap-x-4 gap-y-2 text-[13px]">
              <dt className="text-ink-400">{t("approveSummary.items")}</dt>
              <dd className="font-mono tabular-nums">{summary.itemCount}</dd>
              <dt className="text-ink-400">{t("approveSummary.total")}</dt>
              <dd className="font-mono tabular-nums font-semibold">
                {(summary.totalCents / 100).toLocaleString("nl-NL", {
                  style: "currency",
                  currency: "EUR",
                })}
              </dd>
              <dt className="text-ink-400">{t("approveSummary.execution")}</dt>
              <dd className="font-mono tabular-nums">
                {summary.executionDate.split("-").reverse().join("-")}
              </dd>
              <dt className="text-ink-400">{t("approveSummary.excluded")}</dt>
              <dd className="font-mono tabular-nums">{summary.excludedCount}</dd>
            </dl>
            <p className="text-[12.5px] text-ink-600 rounded-[8px] bg-surface-subtle border border-hairline px-3 py-2.5">
              {t("approveSummary.lockWarning")}
            </p>
            <label className="flex items-start gap-2.5 text-[13px] cursor-pointer">
              <Checkbox
                checked={ack}
                onCheckedChange={(v) => setAck(v === true)}
                className="mt-0.5"
              />
              {t("approveSummary.ack")}
            </label>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tm("common.cancel")}
              </Button>
              <Button
                disabled={isPending || !ack}
                className="disabled:bg-indigo-disabled disabled:opacity-100"
                onClick={() =>
                  startTransition(async () => {
                    const res = await approveBatch(batchId, ack);
                    if (res.ok) {
                      toast.success(t("approved"));
                      setOpen(false);
                    } else if (
                      res.error === "vier_ogen" ||
                      res.error === "role_required" ||
                      res.error === "inactive_actor"
                    ) {
                      toast.error(t(`approveRefused.${res.error}`));
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

/** Exclude / undo (soft, audited, draft-only — "held for court authorisation"). */
export function ExcludeItemButton({
  itemId,
  excluded,
}: {
  itemId: string;
  excluded: boolean;
}) {
  const t = useTranslations("payments");
  const [isPending, startTransition] = useTransition();
  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await setItemExcluded(itemId, !excluded);
          if (!res.ok)
            toast.error(
              res.error === "role_required" || res.error === "inactive_actor"
                ? t(`approveRefused.${res.error}`)
                : t("excludeLocked")
            );
        })
      }
      className={
        excluded
          ? "text-[12px] font-semibold text-primary hover:text-accent-foreground"
          : "text-[12px] font-semibold text-[#B91C1C] border border-[#FECACA] rounded-[7px] px-2 py-1 hover:bg-[#FEF2F2]"
      }
    >
      {excluded ? t("undo") : t("excludeFromBatch")}
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
      <span className="text-[11px] font-semibold text-[#15803D]">
        ✓ {t(`resolution.${flag.resolution}`)}
      </span>
    );
  }

  return (
    <>
      <button
        className="inline-flex items-center gap-1 rounded-full bg-[#DC2626] text-white text-[11px] font-semibold px-2 py-0.5 hover:bg-[#B91C1C]"
        onClick={() => editable && setOpen(true)}
      >
        <ShieldAlert className="h-3 w-3" />
        {t("machtigingReview")}
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("machtigingTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-[8px] bg-[#FEF2F2] border border-[#FECACA] px-3 py-2 text-[12.5px] text-[#B91C1C] space-y-0.5">
              {flag.reasons.map((r) => (
                <div key={r}>• {tm(r)}</div>
              ))}
            </div>
            <p className="text-xs text-ink-400">{t("machtigingDisclaimer")}</p>
            <div className="space-y-1.5">
              {(
                [
                  "consent_recorded",
                  "court_authorization",
                  "not_applicable",
                ] as const
              ).map((r) => (
                <label key={r} className="flex items-center gap-2 text-[13px]">
                  <input
                    type="radio"
                    name="resolution"
                    className="accent-[#4F46E5]"
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
                    } else if (
                      res.error === "role_required" ||
                      res.error === "inactive_actor"
                    ) {
                      toast.error(t(`approveRefused.${res.error}`));
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
