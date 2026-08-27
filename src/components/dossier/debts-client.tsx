"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { FormSelect } from "@/components/form-select";
import { addDebt } from "@/lib/actions/intake";
import { createRegeling, recordCreditorStatement } from "@/lib/actions/debts";

export function AddDebtForm({ dossierId }: { dossierId: string }) {
  const t = useTranslations("debtsTab");
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="grid gap-2 sm:grid-cols-[2fr_1fr_1fr_1fr_auto]"
      action={(fd) =>
        startTransition(async () => {
          const res = await addDebt(dossierId, fd);
          if (!res.ok) toast.error(t(`error.${res.error ?? "unknown"}`));
          else toast.success(t("added"));
        })
      }
    >
      <Input name="creditor" placeholder={t("form.creditor")} required />
      <Input name="reference" placeholder={t("form.reference")} />
      <Input name="currentAmount" placeholder={t("form.amount")} required />
      <Input name="viaDeurwaarder" placeholder={t("form.deurwaarder")} />
      <Button size="sm" type="submit" disabled={isPending}>
        {t("form.add")}
      </Button>
    </form>
  );
}

export function DebtActions({
  debtId,
  hasRegeling,
  documents,
}: {
  debtId: string;
  hasRegeling: boolean;
  documents: { id: string; filename: string }[];
}) {
  const t = useTranslations("debtsTab");
  const tm = useTranslations();
  const [openRegeling, setOpenRegeling] = useState(false);
  const [openStatement, setOpenStatement] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="flex gap-3 border-t border-hairline pt-2">
      {!hasRegeling && (
        <button
          onClick={() => setOpenRegeling(true)}
          className="text-[12px] font-semibold text-primary hover:underline"
        >
          {t("startRegeling")}
        </button>
      )}
      <button
        onClick={() => setOpenStatement(true)}
        className="text-[12px] font-semibold text-primary hover:underline"
      >
        {t("recordStatement")}
      </button>

      <Dialog open={openRegeling} onOpenChange={setOpenRegeling}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("regelingTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            action={(fd) =>
              startTransition(async () => {
                const res = await createRegeling(debtId, fd);
                if (!res.ok) toast.error(t(`error.${res.error ?? "unknown"}`));
                else {
                  toast.success(t("regelingCreated"));
                  setOpenRegeling(false);
                }
              })
            }
          >
            <p className="text-[12.5px] text-ink-600">{t("regelingHint")}</p>
            <Input name="amount" placeholder={t("form.monthlyAmount")} required />
            <Input
              name="counterpartyIban"
              placeholder={t("form.iban")}
              className="font-mono"
              required
            />
            <Input name="expectedDay" placeholder={t("form.expectedDay")} />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setOpenRegeling(false)}
              >
                {tm("common.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {tm("common.confirm")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={openStatement} onOpenChange={setOpenStatement}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{t("statementTitle")}</DialogTitle>
          </DialogHeader>
          <form
            className="space-y-3"
            action={(fd) =>
              startTransition(async () => {
                const res = await recordCreditorStatement(debtId, fd);
                if (!res.ok) toast.error(t(`error.${res.error ?? "unknown"}`));
                else {
                  toast.success(t("statementRecorded"));
                  setOpenStatement(false);
                }
              })
            }
          >
            <p className="text-[12.5px] text-ink-600">{t("statementHint")}</p>
            <Input
              name="statedAmount"
              placeholder={t("form.statedAmount")}
              required
            />
            <FormSelect
              name="sourceDocumentId"
              placeholder={t("form.document")}
              options={documents.map((d) => ({
                value: d.id,
                label: d.filename,
              }))}
            />
            <Input name="note" placeholder={t("form.note")} />
            <div className="flex justify-end gap-2">
              <Button
                variant="outline"
                type="button"
                onClick={() => setOpenStatement(false)}
              >
                {tm("common.cancel")}
              </Button>
              <Button type="submit" disabled={isPending}>
                {tm("common.confirm")}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
