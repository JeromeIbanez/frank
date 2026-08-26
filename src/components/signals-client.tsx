"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { RefreshCw, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { dismissSignal, refreshSignalsAction } from "@/lib/actions/signals";

export function RefreshSignalsButton() {
  const t = useTranslations("signals");
  const [isPending, startTransition] = useTransition();
  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await refreshSignalsAction();
          toast.success(t("refreshed", { open: res.open }));
        })
      }
      className="inline-flex items-center gap-1.5 rounded-[7px] border border-border bg-surface px-2.5 py-1 text-xs text-ink-600 hover:bg-surface-hover disabled:opacity-50"
    >
      <RefreshCw className={"h-3.5 w-3.5" + (isPending ? " animate-spin" : "")} />
      {t("refresh")}
    </button>
  );
}

/** Dismissal is a human judgment call: reason required, audited. */
export function DismissSignalButton({ signalId }: { signalId: string }) {
  const t = useTranslations("signals");
  const tm = useTranslations();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [isPending, startTransition] = useTransition();

  return (
    <>
      <button
        aria-label={t("dismiss")}
        title={t("dismiss")}
        onClick={() => {
          setReason("");
          setOpen(true);
        }}
        className="rounded p-1 text-ink-300 hover:text-ink-600 hover:bg-surface-hover"
      >
        <X className="h-3.5 w-3.5" />
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("dismissTitle")}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <p className="text-[12.5px] text-ink-600">{t("dismissHint")}</p>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("dismissReasonPlaceholder")}
            />
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setOpen(false)}>
                {tm("common.cancel")}
              </Button>
              <Button
                disabled={isPending || reason.trim() === ""}
                onClick={() =>
                  startTransition(async () => {
                    const res = await dismissSignal(signalId, reason);
                    if (res.ok) {
                      toast.success(t("dismissed"));
                      setOpen(false);
                    } else toast.error(t("dismissFailed"));
                  })
                }
              >
                {t("dismiss")}
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
