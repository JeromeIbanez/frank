"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
import { FormSelect } from "@/components/form-select";
import { StatusBadge } from "@/components/format";
import {
  acceptProposedAction,
  linkDocumentToDossier,
  setDocumentClassification,
} from "@/lib/actions/documents";
import { formatEuro } from "@/lib/domain/money";

const CLASSIFICATIONS = [
  "factuur",
  "aanmaning",
  "beschikking_toeslag",
  "beschikking_gemeente",
  "exploot",
  "polis",
  "loonstrook",
  "bankafschrift",
  "brief_rechtbank",
  "overig",
];

export type DocForCard = {
  id: string;
  filename: string;
  classification: string | null;
  classificationSource: string | null;
  classificationConfidence: number | null;
  extracted: {
    sender?: string;
    date?: string;
    amountCents?: number;
    iban?: string;
    kenmerk?: string;
    deadline?: string;
    summary?: string;
  } | null;
  proposedAction: string | null;
  status: string;
  uploadedAt: string;
  sha256: string;
  dossierId: string | null;
  dossierName: string | null;
};

export function DocumentCard({
  doc,
  dossierOptions,
}: {
  doc: DocForCard;
  dossierOptions: { id: string; name: string }[];
}) {
  const t = useTranslations("documents");
  const [isPending, startTransition] = useTransition();
  const [selectedDossier, setSelectedDossier] = useState("");

  return (
    <div className="rounded-[10px] border border-border bg-card p-4">
      <div className="flex items-start gap-3">
        <FileText className="h-5 w-5 text-ink-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-[13.5px] font-[550]">{doc.filename}</span>
            <StatusBadge status={doc.status} label={t(`status.${doc.status}`)} />
            <FormSelect
              value={doc.classification ?? undefined}
              onValueChange={(v) =>
                startTransition(async () => {
                  await setDocumentClassification(doc.id, v);
                })
              }
              size="sm"
              placeholder={t("classify")}
              className="h-6 w-auto text-xs"
              options={CLASSIFICATIONS.map((c) => ({
                value: c,
                label: t(`class.${c}`),
              }))}
            />
            {doc.classificationSource === "ai" && (
              <span className="text-[10px] text-ink-400">
                ✦ {doc.classificationConfidence}%
              </span>
            )}
            {doc.dossierName && (
              <span className="text-xs text-ink-400">{doc.dossierName}</span>
            )}
          </div>

          {doc.extracted && (
            <div className="text-xs text-ink-400 flex flex-wrap gap-x-3">
              {doc.extracted.sender && <span>{doc.extracted.sender}</span>}
              {doc.extracted.amountCents != null && (
                <span className="font-mono tabular-nums">
                  {formatEuro(doc.extracted.amountCents)}
                </span>
              )}
              {doc.extracted.kenmerk && (
                <span className="font-mono">{doc.extracted.kenmerk}</span>
              )}
              {doc.extracted.deadline && (
                <span className="text-[#DC2626]">
                  {t("deadline")}:{" "}
                  <span className="font-mono tabular-nums">
                    {doc.extracted.deadline}
                  </span>
                </span>
              )}
            </div>
          )}
          {doc.extracted?.summary && (
            <p className="text-[12.5px] text-ink-600">{doc.extracted.summary}</p>
          )}

          {doc.proposedAction && doc.status !== "linked" && (
            <div className="flex items-center gap-2 rounded-md bg-accent/60 px-3 py-2 mt-1">
              <span className="text-[13px] text-accent-foreground flex-1">
                <span className="mr-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[#4F46E5]">
                  {t("aiProposal")}
                </span>
                {doc.proposedAction}
              </span>
              {doc.dossierId ? (
                <Button
                  size="sm"
                  disabled={isPending}
                  onClick={() =>
                    startTransition(async () => {
                      await acceptProposedAction(doc.id, doc.dossierId!);
                      toast.success(t("proposalAccepted"));
                    })
                  }
                >
                  {t("accept")}
                </Button>
              ) : (
                selectedDossier && (
                  <Button
                    size="sm"
                    disabled={isPending}
                    onClick={() =>
                      startTransition(async () => {
                        await acceptProposedAction(doc.id, selectedDossier);
                        toast.success(t("proposalAccepted"));
                      })
                    }
                  >
                    {t("accept")}
                  </Button>
                )
              )}
            </div>
          )}

          {!doc.dossierId && dossierOptions.length > 0 && (
            <div className="flex items-center gap-2 pt-1">
              <FormSelect
                value={selectedDossier || undefined}
                onValueChange={setSelectedDossier}
                placeholder={t("chooseDossier")}
                className="h-8 w-auto"
                options={dossierOptions.map((d) => ({
                  value: d.id,
                  label: d.name,
                }))}
              />
              <Button
                size="sm"
                variant="outline"
                disabled={!selectedDossier || isPending}
                onClick={() =>
                  startTransition(async () => {
                    await linkDocumentToDossier(doc.id, selectedDossier);
                    toast.success(t("linked"));
                  })
                }
              >
                {t("link")}
              </Button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
