"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { activateProcessesAction } from "@/lib/actions/processes";

/**
 * Starts any process whose trigger has occurred but which has no instance
 * yet. Event-triggered, never during render — the same discipline as
 * `refreshSignals()` and the safeguarding pass.
 */
export function ActivateProcessesButton() {
  const t = useTranslations("processes");
  const [pending, start] = useTransition();

  return (
    <Button
      disabled={pending}
      onClick={() =>
        start(async () => {
          const r = await activateProcessesAction();
          if (!r.ok) toast.error(t("activateFailed"));
          else if (r.created === 0) toast.info(t("activateNothingNew"));
          else toast.success(t("activateDone", { count: r.created }));
        })
      }
    >
      {pending ? t("activating") : t("activate")}
    </Button>
  );
}
