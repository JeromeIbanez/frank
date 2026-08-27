"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { refreshSafeguarding } from "@/lib/actions/safeguarding";

/**
 * Runs the detectors on demand.
 *
 * Detection is event-triggered and never happens during render — same
 * discipline as `refreshSignals()`. This button is the explicit trigger.
 */
export function RefreshSafeguardingButton() {
  const t = useTranslations("safeguarding");
  const [pending, start] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await refreshSafeguarding();
          if (!r.ok) toast.error(t("refreshFailed"));
          else if (r.opened === 0) toast.info(t("refreshNothingNew"));
          else toast.success(t("refreshDone", { count: r.opened }));
        })
      }
    >
      {pending ? t("refreshing") : t("refresh")}
    </Button>
  );
}
