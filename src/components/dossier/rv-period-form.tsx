"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FormSelect } from "@/components/form-select";
import { recordRvPeriod } from "@/lib/actions/rv";

/** Court-set R&V period + bespreking facts (official LOV form fields) —
 *  explicit dossier facts, human-entered, audited. */
export function RvPeriodForm({
  dossierId,
  current,
}: {
  dossierId: string;
  current: {
    periodStart: string;
    periodEnd: string;
    besprekingDate: string | null;
    besprekingOutcome: string | null;
    signedStatus: string;
  } | null;
}) {
  const t = useTranslations("rvPeriod");
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="space-y-2"
      action={(fd) =>
        startTransition(async () => {
          const res = await recordRvPeriod(dossierId, fd);
          if (!res.ok) toast.error(t("invalid"));
          else toast.success(t("saved"));
        })
      }
    >
      <p className="text-[12px] text-ink-400">{t("hint")}</p>
      <div className="grid grid-cols-2 gap-2">
        <label className="block text-[11px] text-ink-400">
          {t("periodStart")}
          <Input
            name="periodStart"
            type="date"
            defaultValue={current?.periodStart ?? ""}
            required
            className="mt-0.5"
          />
        </label>
        <label className="block text-[11px] text-ink-400">
          {t("periodEnd")}
          <Input
            name="periodEnd"
            type="date"
            defaultValue={current?.periodEnd ?? ""}
            required
            className="mt-0.5"
          />
        </label>
        <label className="block text-[11px] text-ink-400">
          {t("besprekingDate")}
          <Input
            name="besprekingDate"
            type="date"
            defaultValue={current?.besprekingDate ?? ""}
            className="mt-0.5"
          />
        </label>
        <label className="block text-[11px] text-ink-400">
          {t("besprekingOutcome")}
          <FormSelect
            name="besprekingOutcome"
            defaultValue={current?.besprekingOutcome ?? undefined}
            placeholder={t("choose")}
            options={[
              { value: "understood", label: t("outcome.understood") },
              { value: "not_understood", label: t("outcome.not_understood") },
              { value: "not_possible", label: t("outcome.not_possible") },
            ]}
            className="mt-0.5"
          />
        </label>
        <label className="block text-[11px] text-ink-400">
          {t("signedStatus")}
          <FormSelect
            name="signedStatus"
            defaultValue={current?.signedStatus ?? "pending"}
            options={[
              { value: "pending", label: t("signed.pending") },
              { value: "signed", label: t("signed.signed") },
              { value: "declined", label: t("signed.declined") },
            ]}
            className="mt-0.5"
          />
        </label>
      </div>
      <Button size="sm" type="submit" disabled={isPending}>
        {t("save")}
      </Button>
    </form>
  );
}
