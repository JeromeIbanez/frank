"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { receiveSimulatedPost } from "@/lib/actions/inbox";

/**
 * "Ontvang post" — replays the SIMULATED mailbox (plan os-v2 N6).
 *
 * Labelled as simulation everywhere it appears. There is no real mailbox in
 * this build, and the button must not imply otherwise.
 */
export function ReceivePostButton() {
  const t = useTranslations("inbox");
  const [pending, start] = useTransition();

  return (
    <div className="flex items-center gap-3">
      <Button
        disabled={pending}
        onClick={() =>
          start(async () => {
            const r = await receiveSimulatedPost();
            if (!r.ok) toast.error(t("receiveFailed"));
            else if (r.created === 0) toast.info(t("receiveNothingNew"));
            else toast.success(t("receiveDone", { count: r.created }));
          })
        }
      >
        {pending ? t("receiving") : t("receive")}
      </Button>
      <span className="text-[12px] text-ink-400">{t("simulatedNote")}</span>
    </div>
  );
}
