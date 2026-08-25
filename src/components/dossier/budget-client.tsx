"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
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
      <select
        name="kind"
        className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
        defaultValue="expense"
      >
        <option value="income">{t("income")}</option>
        <option value="expense">{t("expenses")}</option>
        <option value="reserve">{t("reserves")}</option>
      </select>
      <Input name="name" placeholder={t("lineName")} required />
      <select
        name="categoryKey"
        className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
        defaultValue="overige_uitgaven"
      >
        {CATEGORIES.map((c) => (
          <option key={c.key} value={c.key}>
            {locale === "nl" ? c.nl : c.en}
          </option>
        ))}
      </select>
      <Input name="amount" placeholder={t("amountPlaceholder")} required />
      <select
        name="frequency"
        className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
        defaultValue="monthly"
      >
        {(["weekly", "monthly", "quarterly", "yearly"] as const).map((f) => (
          <option key={f} value={f}>
            {t(`freq.${f}`)}
          </option>
        ))}
      </select>
      <Input name="expectedDay" placeholder={t("expectedDayPlaceholder")} type="number" min={1} max={28} />
      <Input name="counterpartyName" placeholder={t("counterpartyName")} />
      <Input name="counterpartyIban" placeholder="NL00BANK0000000000" className="font-mono" />
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
      className="opacity-0 group-hover:opacity-100 text-neutral-400 hover:text-red-600 transition-opacity"
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
      <select
        name="frequency"
        defaultValue={currentFrequency}
        className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
      >
        <option value="weekly">{t("freq.weekly")}</option>
        <option value="monthly">{t("freq.monthly")}</option>
      </select>
      <Button type="submit" variant="outline" disabled={isPending}>
        {t("save")}
      </Button>
    </form>
  );
}
