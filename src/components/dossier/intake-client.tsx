"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  decideProposal,
  extractIntakeProposals,
  updateIntakeNotes,
} from "@/lib/actions/intake";
import { parseEuro } from "@/lib/domain/money";

export function ExtractButton({ documentId }: { documentId: string }) {
  const t = useTranslations("intake");
  const [isPending, startTransition] = useTransition();
  return (
    <button
      disabled={isPending}
      onClick={() =>
        startTransition(async () => {
          const res = await extractIntakeProposals(documentId);
          if (res.unavailable) toast.warning(t("aiUnavailable"));
          else if (!res.ok) toast.error(t("extractFailed"));
          else toast.success(t("extracted", { count: res.created ?? 0 }));
        })
      }
      className="inline-flex shrink-0 items-center gap-1 rounded-[7px] border border-border bg-surface px-2 py-0.5 text-[11.5px] font-semibold text-ink-600 hover:bg-surface-hover disabled:opacity-50"
    >
      <Sparkles className="h-3 w-3" />
      {isPending ? t("extracting") : t("extract")}
    </button>
  );
}

const KIND_CHIP: Record<string, string> = {
  budget_line: "bg-indigo-50 text-[#4338CA]",
  debt: "bg-[#FEF2F2] text-[#B91C1C]",
  contact: "bg-surface-subtle text-ink-600",
  account_opening_balance: "bg-[#F0FDF4] text-[#15803D]",
};

/** Fields the human may edit before accepting, rendered generically from
 *  the payload. Numbers stay numbers (cents); the server re-validates the
 *  edited payload against the same contract before materializing. */
export function ProposalCard({
  proposal,
}: {
  proposal: {
    id: string;
    kind: string;
    payload: Record<string, unknown>;
    provenance: Record<string, string>;
    confidence: number | null;
    sourceFilename: string;
    extractorVersion: string;
  };
}) {
  const t = useTranslations("intake");
  const [values, setValues] = useState<Record<string, unknown>>(
    proposal.payload
  );
  const [edited, setEdited] = useState(false);
  const [isPending, startTransition] = useTransition();

  function decide(decision: "accept" | "reject") {
    startTransition(async () => {
      const res = await decideProposal(
        proposal.id,
        decision,
        decision === "accept" && edited ? values : undefined
      );
      if (!res.ok) toast.error(t(`decideError.${res.error ?? "unknown"}`));
      else
        toast.success(
          decision === "accept" ? t("accepted") : t("rejected")
        );
    });
  }

  const fields = Object.entries(proposal.payload).filter(
    ([k]) => k !== "kind"
  );

  // Cents fields are edited as euro amounts ("486,30") and parsed back to
  // integer cents by the shared locale-aware parser — the final separator
  // is the decimal, so "486.30" is €486,30, never €48.630 (Temujin PR-6
  // r2 #3). The server contract stays cents and re-validates.
  const isCents = (key: string) => key.endsWith("Cents");
  const centsToEuro = (v: unknown) =>
    typeof v === "number" ? (v / 100).toFixed(2).replace(".", ",") : "";
  const euroToCents = (raw: string): number | null => parseEuro(raw);

  return (
    <div className="rounded-[10px] border border-border bg-surface p-3 space-y-2.5">
      <div className="flex items-center gap-2">
        <span
          className={
            "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold " +
            (KIND_CHIP[proposal.kind] ?? "bg-surface-subtle text-ink-600")
          }
        >
          {t(`kind.${proposal.kind}`)}
        </span>
        <span className="flex-1 truncate font-mono text-[11px] text-ink-400">
          {proposal.sourceFilename}
          {proposal.confidence !== null && ` · ${proposal.confidence}%`}
        </span>
      </div>
      <div className="grid sm:grid-cols-2 gap-x-4 gap-y-2">
        {fields.map(([key, value]) => (
          <label key={key} className="block">
            <span className="block text-[11px] text-ink-400 mb-0.5">
              {t(`field.${key}`)}
            </span>
            <Input
              defaultValue={
                isCents(key) ? centsToEuro(values[key]) : String(values[key] ?? "")
              }
              onChange={(e) => {
                const raw = e.target.value;
                setValues((v) => ({
                  ...v,
                  [key]: isCents(key)
                    ? euroToCents(raw)
                    : typeof value === "number"
                      ? raw === ""
                        ? null
                        : Number(raw)
                      : raw === ""
                        ? null
                        : raw,
                }));
                setEdited(true);
              }}
              className="h-7 text-[12.5px] font-mono tabular-nums"
            />
            {proposal.provenance[key] && (
              <span className="mt-0.5 block truncate font-mono text-[10.5px] text-ink-300">
                “{proposal.provenance[key]}”
              </span>
            )}
          </label>
        ))}
      </div>
      <div className="flex items-center justify-between pt-1">
        <span className="font-mono text-[10.5px] text-ink-300">
          {proposal.extractorVersion}
        </span>
        <div className="flex gap-2">
          <button
            disabled={isPending}
            onClick={() => decide("reject")}
            className="text-[12px] font-semibold text-ink-400 hover:text-ink-600"
          >
            {t("reject")}
          </button>
          <Button size="sm" disabled={isPending} onClick={() => decide("accept")}>
            {edited ? t("acceptEdited") : t("accept")}
          </Button>
        </div>
      </div>
    </div>
  );
}

export function IntakeNotesForm({
  dossierId,
  schuldenbewind,
  values,
}: {
  dossierId: string;
  schuldenbewind: boolean;
  values: {
    inboedelNote: string;
    pvaGoals: string;
    pvaAgreements: string;
    pvaDebtStrategy: string;
  };
}) {
  const t = useTranslations("intake");
  const [isPending, startTransition] = useTransition();
  return (
    <form
      className="space-y-3"
      action={(fd) =>
        startTransition(async () => {
          await updateIntakeNotes(dossierId, fd);
          toast.success(t("notesSaved"));
        })
      }
    >
      <div className="grid lg:grid-cols-2 gap-4">
        {(
          [
            ["inboedelNote", values.inboedelNote],
            ["pvaGoals", values.pvaGoals],
            ["pvaAgreements", values.pvaAgreements],
            ...(schuldenbewind
              ? ([["pvaDebtStrategy", values.pvaDebtStrategy]] as const)
              : []),
          ] as const
        ).map(([name, value]) => (
          <label key={name} className="block">
            <span className="block text-[12px] font-semibold text-ink-600 mb-1">
              {t(`notes.${name}`)}
            </span>
            <Textarea
              name={name}
              defaultValue={value}
              rows={4}
              placeholder={t(`notes.${name}Hint`)}
              className="text-[13px]"
            />
          </label>
        ))}
      </div>
      <Button size="sm" disabled={isPending} type="submit">
        {t("saveNotes")}
      </Button>
    </form>
  );
}
