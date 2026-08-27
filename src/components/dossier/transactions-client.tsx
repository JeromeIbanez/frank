"use client";

import { useRef, useState, useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/form-select";
import { Input } from "@/components/ui/input";
import {
  aiCategorizeDossier,
  addManualTransaction,
  importCamtFile,
  setTransactionCategory,
} from "@/lib/actions/transactions";
import { CATEGORIES } from "@/lib/domain/categories";
import { cn } from "@/lib/utils";

type AccountOpt = { id: string; iban: string; type: string };

export function ImportCamtForm({ accounts }: { accounts: AccountOpt[] }) {
  const t = useTranslations("transactions");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <form
      className="flex flex-wrap items-center gap-2"
      action={(fd) =>
        startTransition(async () => {
          const res = await importCamtFile(accountId, fd);
          if (res.ok) {
            toast.success(
              t("importResult", {
                imported: res.imported ?? 0,
                duplicates: res.duplicates ?? 0,
              })
            );
            if (fileRef.current) fileRef.current.value = "";
          } else {
            toast.error((res.errors ?? ["error"]).join(", "));
          }
        })
      }
    >
      <FormSelect
        value={accountId}
        onValueChange={setAccountId}
        className="w-auto"
        options={accounts.map((a) => ({
          value: a.id,
          label: `${a.iban} (${a.type})`,
        }))}
      />
      <Input
        ref={fileRef}
        type="file"
        name="file"
        accept=".xml,.camt"
        required
        className="w-64"
      />
      <Button type="submit" disabled={isPending || !accountId}>
        {isPending ? t("importing") : t("import")}
      </Button>
    </form>
  );
}

export function ManualTransactionForm({ accounts }: { accounts: AccountOpt[] }) {
  const t = useTranslations("transactions");
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? "");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="grid grid-cols-2 gap-2"
      action={(fd) =>
        startTransition(async () => {
          await addManualTransaction(accountId, fd);
          toast.success(t("added"));
        })
      }
    >
      <FormSelect
        value={accountId}
        onValueChange={setAccountId}
        className="col-span-2"
        options={accounts.map((a) => ({
          value: a.id,
          label: `${a.iban} (${a.type})`,
        }))}
      />
      <Input name="bookingDate" type="date" required />
      <div className="flex gap-2">
        <FormSelect
          name="direction"
          defaultValue="out"
          className="w-24"
          options={[
            { value: "out", label: t("out") },
            { value: "in", label: t("in") },
          ]}
        />
        <Input name="amount" placeholder="12,34" required />
      </div>
      <Input name="counterpartyName" placeholder={t("cols.counterparty")} />
      <Input
        name="counterpartyIban"
        placeholder={t("counterpartyIban")}
        className="font-mono"
      />
      <Input name="description" placeholder={t("cols.description")} />
      <Button type="submit" disabled={isPending || !accountId} className="col-span-2">
        {t("add")}
      </Button>
    </form>
  );
}

export function CategorySelect({
  transactionId,
  current,
  source,
  confidence,
}: {
  transactionId: string;
  current: string | null;
  source: string | null;
  confidence: number | null;
}) {
  const locale = useLocale();
  const [isPending, startTransition] = useTransition();
  const lowConfidence = source === "ai" && (confidence ?? 100) < 70;

  return (
    <span className="inline-flex items-center gap-1">
      <FormSelect
        value={current ?? undefined}
        disabled={isPending}
        onValueChange={(v) =>
          startTransition(async () => {
            await setTransactionCategory(transactionId, v);
          })
        }
        size="sm"
        placeholder="—"
        className={cn(
          "h-7 min-w-32 max-w-40 text-xs",
          !current && "border-amber-300 text-amber-700",
          lowConfidence && "border-amber-300"
        )}
        options={CATEGORIES.map((c) => ({
          value: c.key,
          label: locale === "nl" ? c.nl : c.en,
        }))}
      />
      {source === "ai" && (
        <span
          title={`AI ${confidence}%`}
          className={cn(
            "text-[10px]",
            lowConfidence ? "text-amber-600" : "text-muted-foreground/70"
          )}
        >
          ✦{confidence}
        </span>
      )}
    </span>
  );
}

export function AiCategorizeButton({ dossierId }: { dossierId: string }) {
  const t = useTranslations("transactions");
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      variant="outline"
      size="sm"
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await aiCategorizeDossier(dossierId);
          if (res.ok) toast.success(t("aiDone", { count: res.categorized ?? 0 }));
          else toast.warning(t("aiUnavailable"));
        })
      }
    >
      <Sparkles className="h-3.5 w-3.5" />
      {isPending ? t("aiRunning") : t("aiCategorize")}
    </Button>
  );
}
