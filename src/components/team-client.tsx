"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { setActorActive, setActorRole } from "@/lib/actions/identity";

/** Role/active controls for one actor row. The server re-verifies every
 *  change; guard flags here only explain refusals up front. */
export function ActorControls({
  actorId,
  role,
  active,
  lastBewindvoerderGuard,
}: {
  actorId: string;
  role: "bewindvoerder" | "assistent";
  active: boolean;
  lastBewindvoerderGuard: boolean;
}) {
  const t = useTranslations("team");
  const [pending, startTransition] = useTransition();

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    startTransition(async () => {
      const res = await fn();
      if (!res.ok) toast.error(t(`error.${res.error ?? "unknown"}`));
      else toast.success(t("updated"));
    });
  }

  const otherRole = role === "bewindvoerder" ? "assistent" : "bewindvoerder";

  return (
    <span className="inline-flex items-center gap-3">
      <button
        disabled={pending || (lastBewindvoerderGuard && otherRole === "assistent")}
        title={
          lastBewindvoerderGuard && otherRole === "assistent"
            ? t("error.last_bewindvoerder")
            : undefined
        }
        onClick={() => run(() => setActorRole(actorId, otherRole))}
        className="text-[12px] font-semibold text-primary hover:text-accent-foreground disabled:text-ink-300 disabled:cursor-not-allowed"
      >
        {role === "bewindvoerder" ? t("makeAssistent") : t("makeBewindvoerder")}
      </button>
      <button
        disabled={pending || (lastBewindvoerderGuard && active)}
        title={
          lastBewindvoerderGuard && active
            ? t("error.last_bewindvoerder")
            : undefined
        }
        onClick={() => run(() => setActorActive(actorId, !active))}
        className={
          active
            ? "text-[12px] font-semibold text-[#B91C1C] hover:underline disabled:text-ink-300 disabled:cursor-not-allowed disabled:no-underline"
            : "text-[12px] font-semibold text-primary hover:text-accent-foreground"
        }
      >
        {active ? t("deactivate") : t("reactivate")}
      </button>
    </span>
  );
}
