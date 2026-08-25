"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { FileText } from "lucide-react";
import { Button } from "@/components/ui/button";
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
    <div className="rounded-lg border border-neutral-200 bg-white p-4">
      <div className="flex items-start gap-3">
        <FileText className="h-5 w-5 text-neutral-400 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0 space-y-1.5">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-sm">{doc.filename}</span>
            <StatusBadge status={doc.status} label={t(`status.${doc.status}`)} />
            <select
              value={doc.classification ?? ""}
              onChange={(e) =>
                startTransition(async () => {
                  await setDocumentClassification(doc.id, e.target.value);
                })
              }
              className="h-6 rounded border border-neutral-200 bg-white px-1 text-xs"
            >
              <option value="" disabled>
                {t("classify")}
              </option>
              {CLASSIFICATIONS.map((c) => (
                <option key={c} value={c}>
                  {t(`class.${c}`)}
                </option>
              ))}
            </select>
            {doc.classificationSource === "ai" && (
              <span className="text-[10px] text-neutral-400">
                ✦ {doc.classificationConfidence}%
              </span>
            )}
            {doc.dossierName && (
              <span className="text-xs text-neutral-500">{doc.dossierName}</span>
            )}
          </div>

          {doc.extracted && (
            <div className="text-xs text-neutral-500 flex flex-wrap gap-x-3">
              {doc.extracted.sender && <span>{doc.extracted.sender}</span>}
              {doc.extracted.amountCents != null && (
                <span>{formatEuro(doc.extracted.amountCents)}</span>
              )}
              {doc.extracted.kenmerk && <span>{doc.extracted.kenmerk}</span>}
              {doc.extracted.deadline && (
                <span className="text-red-600">
                  {t("deadline")}: {doc.extracted.deadline}
                </span>
              )}
            </div>
          )}
          {doc.extracted?.summary && (
            <p className="text-sm text-neutral-600">{doc.extracted.summary}</p>
          )}

          {doc.proposedAction && doc.status !== "linked" && (
            <div className="flex items-center gap-2 rounded-md bg-indigo-50 px-3 py-2 mt-1">
              <span className="text-sm text-indigo-900 flex-1">
                <span className="text-[10px] uppercase tracking-wide text-indigo-400 mr-1.5">
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
              <select
                value={selectedDossier}
                onChange={(e) => setSelectedDossier(e.target.value)}
                className="h-8 rounded-md border border-neutral-200 bg-white px-2 text-sm"
              >
                <option value="">{t("chooseDossier")}</option>
                {dossierOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
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
