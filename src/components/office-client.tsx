"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Timer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/form-select";
import { logTime } from "@/lib/actions/time";
import { ACTIVITY_KEYS } from "@/lib/domain/fees";

export function LogTimeForm({
  dossiers,
  fixedDossierId,
}: {
  dossiers?: { id: string; name: string }[];
  fixedDossierId?: string;
}) {
  const t = useTranslations("office");
  const [isPending, startTransition] = useTransition();
  const today = new Date().toISOString().slice(0, 10);
  return (
    <form
      className="space-y-2"
      action={(fd) =>
        startTransition(async () => {
          if (fixedDossierId) fd.set("dossierId", fixedDossierId);
          const res = await logTime(fd);
          if (!res.ok) toast.error(t(`error.${res.error ?? "unknown"}`));
          else toast.success(t("timeLogged"));
        })
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <Input name="date" type="date" defaultValue={today} />
        <Input name="minutes" placeholder={t("minutes")} required />
      </div>
      {!fixedDossierId && dossiers && (
        <FormSelect
          name="dossierId"
          placeholder={t("officeLevel")}
          options={dossiers.map((d) => ({ value: d.id, label: d.name }))}
        />
      )}
      <FormSelect
        name="activityKey"
        defaultValue="overig"
        options={ACTIVITY_KEYS.map((k) => ({
          value: k,
          label: t(`activity.${k}`),
        }))}
      />
      <Input name="note" placeholder={t("note")} />
      <Button size="sm" type="submit" disabled={isPending}>
        {t("log")}
      </Button>
    </form>
  );
}

/**
 * Post-action time suggestion: Frank OFFERS a pre-filled entry after
 * substantial work; the human accepts or dismisses. Never auto-logged
 * (plan os-v1 W5).
 */
export function TimeSuggestion({
  dossierId,
  activityKey,
  minutes,
  labelKey,
}: {
  dossierId?: string;
  activityKey: string;
  minutes: number;
  labelKey: string;
}) {
  const t = useTranslations("office");
  const [dismissed, setDismissed] = useState(false);
  const [logged, setLogged] = useState(false);
  const [isPending, startTransition] = useTransition();
  if (dismissed || logged) return null;

  return (
    <div className="flex items-center gap-2.5 rounded-[8px] border border-hairline bg-surface-subtle px-3 py-2 text-[12.5px]">
      <Timer className="h-3.5 w-3.5 shrink-0 text-ink-400" />
      <span className="flex-1 text-ink-600">
        {t("suggestion", { work: t(labelKey), minutes })}
      </span>
      <button
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            const fd = new FormData();
            if (dossierId) fd.set("dossierId", dossierId);
            fd.set("minutes", String(minutes));
            fd.set("activityKey", activityKey);
            fd.set("source", "suggested");
            fd.set("date", new Date().toISOString().slice(0, 10));
            const res = await logTime(fd);
            if (res.ok) {
              setLogged(true);
              toast.success(t("timeLogged"));
            } else toast.error(t(`error.${res.error ?? "unknown"}`));
          })
        }
        className="font-semibold text-primary hover:underline"
      >
        {t("logIt")}
      </button>
      <button
        onClick={() => setDismissed(true)}
        className="text-ink-400 hover:text-ink-600"
      >
        {t("dismissSuggestion")}
      </button>
    </div>
  );
}
