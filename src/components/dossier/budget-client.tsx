"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/form-select";
import { Input } from "@/components/ui/input";
import {
  addBudgetLine,
  deactivateBudgetLine,
  setLeefgeld,
} from "@/lib/actions/budget";
import { CATEGORIES } from "@/lib/domain/categories";

export function AddBudgetLineForm({ dossierId }: { dossierId: string }) {
  const t = useTranslations("budget");
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="grid grid-cols-2 gap-2"
      action={(fd) =>
        startTransition(async () => {
          await addBudgetLine(dossierId, fd);
          toast.success(t("lineAdded"));
        })
      }
    >
      <FormSelect
        name="kind"
        defaultValue="expense"
        options={[
          { value: "income", label: t("income") },
          { value: "expense", label: t("expenses") },
          { value: "reserve", label: t("reserves") },
        ]}
      />
      <Input name="name" placeholder={t("lineName")} required />
      <FormSelect
        name="categoryKey"
        defaultValue="overige_uitgaven"
        options={CATEGORIES.map((c) => ({
          value: c.key,
          label: locale === "nl" ? c.nl : c.en,
        }))}
      />
      <Input name="amount" placeholder={t("amountPlaceholder")} required />
      <FormSelect
        name="frequency"
        defaultValue="monthly"
        options={(["weekly", "monthly", "quarterly", "yearly"] as const).map((f) => ({
          value: f,
          label: t(`freq.${f}`),
        }))}
      />
      <Input name="expectedDay" placeholder={t("expectedDayPlaceholder")} type="number" min={1} max={28} />
      <Input name="counterpartyName" placeholder={t("counterpartyName")} />
      <Input name="counterpartyIban" placeholder="NL00BANK0000000000" className="font-mono" />
      <Input
        name="purposeTag"
        placeholder={t("purposeTagPlaceholder")}
        title={t("purposeTagHint")}
        className="col-span-2"
      />
      <Button type="submit" disabled={isPending} className="col-span-2">
        {t("add")}
      </Button>
    </form>
  );
}

export function DeactivateLineButton({ lineId }: { lineId: string }) {
  const [isPending, startTransition] = useTransition();
  return (
    <button
      className="opacity-0 group-hover:opacity-100 text-ink-400 hover:text-[#DC2626]"
      disabled={isPending}
      onClick={() => startTransition(async () => deactivateBudgetLine(lineId))}
      aria-label="remove"
    >
      <X className="h-3.5 w-3.5" />
    </button>
  );
}

export function LeefgeldForm({
  dossierId,
  currentCents,
  currentFrequency,
}: {
  dossierId: string;
  currentCents: number | null;
  currentFrequency: string;
}) {
  const t = useTranslations("budget");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="flex gap-2 items-center"
      action={(fd) =>
        startTransition(async () => {
          await setLeefgeld(dossierId, fd);
          toast.success(t("leefgeldSaved"));
        })
      }
    >
      <Input
        name="amount"
        defaultValue={currentCents ? (currentCents / 100).toFixed(2) : ""}
        placeholder="65,00"
        className="w-28"
      />
      <FormSelect
        name="frequency"
        defaultValue={currentFrequency}
        className="w-36"
        options={[
          { value: "weekly", label: t("freq.weekly") },
          { value: "monthly", label: t("freq.monthly") },
        ]}
      />
      <Button type="submit" variant="outline" disabled={isPending}>
        {t("save")}
      </Button>
    </form>
  );
}
