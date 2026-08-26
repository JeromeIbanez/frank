"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/form-select";
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
      <FormSelect
        value={month}
        onValueChange={setMonth}
        options={Array.from({ length: 12 }, (_, i) => ({
          value: String(i + 1),
          label: t(`months.${i + 1}`),
        }))}
      />
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
      className="space-y-2 border-t border-border/60 pt-3"
      action={(fd) =>
        startTransition(async () => {
          const res = await addAccount(dossierId, fd);
          if (!res.ok) {
            toast.error(t(`accountError.${res.error}`));
            return;
          }
          setOpen(false);
          toast.success(t("accountAdded"));
        })
      }
    >
      <div className="grid grid-cols-2 gap-2">
        <FormSelect
          name="type"
          defaultValue="beheer"
          options={[
            { value: "beheer", label: t("accountType.beheer") },
            { value: "leefgeld", label: t("accountType.leefgeld") },
            { value: "spaar", label: t("accountType.spaar") },
          ]}
        />
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
