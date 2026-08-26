"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Mails } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/form-select";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { DateText, StatusBadge } from "@/components/format";
import {
  approveLetter,
  generateAanschrijfPack,
  generateLetter,
  markLetterSent,
} from "@/lib/actions/letters";
import { LETTER_TEMPLATES } from "@/lib/letter-templates";

export function AanschrijfPackButton({
  dossierId,
  disabled,
}: {
  dossierId: string;
  disabled?: boolean;
}) {
  const t = useTranslations("letters");
  const [isPending, startTransition] = useTransition();
  return (
    <Button
      disabled={disabled || isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await generateAanschrijfPack(dossierId);
          toast.success(t("packDone", { count: res.created }));
        })
      }
    >
      <Mails className="h-4 w-4" />
      {isPending ? t("generating") : t("generatePack")}
    </Button>
  );
}

export function GenerateLetterForm({ dossierId }: { dossierId: string }) {
  const t = useTranslations("letters");
  const [templateKey, setTemplateKey] = useState("betalingsregeling");
  const [isPending, startTransition] = useTransition();

  return (
    <form
      className="space-y-2"
      action={(fd) =>
        startTransition(async () => {
          await generateLetter(dossierId, fd);
          toast.success(t("generated"));
        })
      }
    >
      <FormSelect
        name="templateKey"
        value={templateKey}
        onValueChange={setTemplateKey}
        options={LETTER_TEMPLATES.filter(
          (tpl) => tpl.key !== "aanschrijfbrief"
        ).map((tpl) => ({
          value: tpl.key,
          label: t(`templates.${tpl.key}`),
        }))}
      />
      <div className="grid grid-cols-2 gap-2">
        <Input name="recipient" placeholder={t("recipient")} />
        <Input name="kenmerk" placeholder={t("kenmerk")} />
        {templateKey === "betalingsregeling" && (
          <>
            <Input name="amount" placeholder={t("amountTotal")} />
            <Input name="monthly" placeholder={t("amountMonthly")} />
          </>
        )}
      </div>
      <Textarea
        name="context"
        placeholder={t("contextPlaceholder")}
        className="min-h-16"
      />
      <p className="text-xs text-muted-foreground/70">{t("aiNote")}</p>
      <Button type="submit" disabled={isPending}>
        {isPending ? t("generating") : t("generate")}
      </Button>
    </form>
  );
}

export function LetterCard({
  letter,
}: {
  letter: {
    id: string;
    subject: string;
    body: string;
    recipientName: string | null;
    status: string;
    templateKey: string;
    createdAt: string;
  };
}) {
  const t = useTranslations("letters");
  const [expanded, setExpanded] = useState(false);
  const [isPending, startTransition] = useTransition();

  return (
    <div className="rounded-[10px] border border-border bg-card overflow-hidden">
      <button
        className="w-full text-left px-4 py-3 flex items-center gap-3 hover:bg-surface-hover"
        onClick={() => setExpanded((e) => !e)}
      >
        <div className="flex-1 min-w-0">
          <div className="text-[13.5px] font-[550] truncate">{letter.subject}</div>
          <div className="text-xs text-ink-400">
            {letter.recipientName ?? "—"} · <DateText iso={letter.createdAt} />
          </div>
        </div>
        <StatusBadge status={letter.status} label={t(`status.${letter.status}`)} />
      </button>
      {expanded && (
        <div className="border-t border-hairline px-4 py-3 space-y-3">
          <pre className="whitespace-pre-wrap text-[13px] font-sans bg-surface-subtle rounded-md p-4 max-h-96 overflow-y-auto">
            {letter.body}
          </pre>
          <p className="text-xs text-ink-400">{t("dutchNote")}</p>
          <div className="flex gap-2">
            {letter.status === "draft" && (
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await approveLetter(letter.id);
                    toast.success(t("approved"));
                  })
                }
              >
                {t("approve")}
              </Button>
            )}
            {letter.status === "approved" && (
              <Button
                size="sm"
                disabled={isPending}
                onClick={() =>
                  startTransition(async () => {
                    await markLetterSent(letter.id);
                    toast.success(t("sentDone"));
                  })
                }
              >
                {t("markSent")}
              </Button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
