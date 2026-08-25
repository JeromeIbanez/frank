"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { activateDossier, addAccount, setRvSchedule } from "@/lib/actions/dossiers";

export function ActivateButton({
  dossierId,
  disabled,
}: {
  dossierId: string;
  disabled?: boolean;
}) {
  const t = useTranslations("overview");
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      disabled={disabled || isPending}
      onClick={() =>
        startTransition(async () => {
          await activateDossier(dossierId);
          toast.success(t("activated"));
        })
      }
    >
      {t("activate")}
    </Button>
  );
}

export function RvScheduleForm({ dossierId }: { dossierId: string }) {
  const t = useTranslations("overview");
  const [month, setMonth] = useState("3");
  const [isPending, startTransition] = useTransition();
  return (
    <div className="flex items-center gap-2">
      <select
        value={month}
        onChange={(e) => setMonth(e.target.value)}
        className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
      >
        {Array.from({ length: 12 }, (_, i) => (
          <option key={i + 1} value={String(i + 1)}>
            {t(`months.${i + 1}`)}
          </option>
        ))}
      </select>
      <Button
        variant="outline"
        disabled={isPending}
        onClick={() =>
          startTransition(async () => {
            await setRvSchedule(dossierId, Number(month));
            toast.success(t("rvSaved"));
          })
        }
      >
        {t("rvSave")}
      </Button>
    </div>
  );
}

export function AddAccountForm({ dossierId }: { dossierId: string }) {
  const t = useTranslations("overview");
  const [open, setOpen] = useState(false);
  const [isPending, startTransition] = useTransition();

  if (!open) {
    return (
      <Button variant="outline" size="sm" onClick={() => setOpen(true)}>
        {t("addAccount")}
      </Button>
    );
  }

  return (
    <form
      className="space-y-2 border-t border-neutral-100 pt-3"
      action={(fd) =>
        startTransition(async () => {
          await addAccount(dossierId, fd);
          setOpen(false);
          toast.success(t("accountAdded"));
        })
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <select
          name="type"
          className="h-9 rounded-md border border-neutral-200 bg-white px-3 text-sm"
          defaultValue="beheer"
        >
          <option value="beheer">{t("accountType.beheer")}</option>
          <option value="leefgeld">{t("accountType.leefgeld")}</option>
          <option value="spaar">{t("accountType.spaar")}</option>
        </select>
        <Input name="bankName" placeholder={t("bankName")} />
        <Input name="iban" placeholder="NL00BANK0000000000" required className="col-span-2 font-mono" />
        <Input name="openingBalance" placeholder={t("openingBalance")} />
      </div>
      <div className="flex gap-2">
        <Button size="sm" type="submit" disabled={isPending}>
          {t("save")}
        </Button>
        <Button size="sm" variant="ghost" type="button" onClick={() => setOpen(false)}>
          {t("cancel")}
        </Button>
      </div>
    </form>
  );
}
