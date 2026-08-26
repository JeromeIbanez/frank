import Link from "next/link";
import { and, desc, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/db";
import { aiProposals, documents } from "@/lib/db/schema";
import { getDossier } from "@/lib/queries";
import {
  boedelChecklist,
  completeness,
  type IntakeSnapshot,
} from "@/lib/domain/intake";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/format";
import {
  ExtractButton,
  IntakeNotesForm,
  ProposalCard,
} from "./intake-client";

type DossierFull = NonNullable<Awaited<ReturnType<typeof getDossier>>>;

/**
 * Intake (plan os-v1 W2): AI proposals under human decision, completeness
 * toward the boedelbeschrijving, and the werkdocument free-text sections.
 */
export async function IntakeTab({ dossier }: { dossier: DossierFull }) {
  const t = await getTranslations("intake");
  const db = getDb();
  const [pending, decidedRecent, linkedDocs] = await Promise.all([
    db.query.aiProposals.findMany({
      // `accepting` = a crashed accept — still needs the human, retryable.
      where: and(
        eq(aiProposals.dossierId, dossier.id),
        inArray(aiProposals.status, ["proposed", "accepting"])
      ),
      with: { sourceDocument: true },
      orderBy: desc(aiProposals.createdAt),
    }),
    db.query.aiProposals.findMany({
      where: and(
        eq(aiProposals.dossierId, dossier.id),
        inArray(aiProposals.status, ["accepted", "rejected"])
      ),
      orderBy: desc(aiProposals.decidedAt),
      limit: 5,
    }),
    db.query.documents.findMany({
      where: eq(documents.dossierId, dossier.id),
    }),
  ]);

  const snapshot: IntakeSnapshot = {
    accounts: dossier.accounts.map((a) => ({
      type: a.type,
      openingBalanceCents: a.openingBalanceCents,
      openingBalanceDate: a.openingBalanceDate,
    })),
    incomeLines: dossier.budgetLines.filter(
      (b) => b.kind === "income" && b.active
    ).length,
    expenseLines: dossier.budgetLines.filter(
      (b) => b.kind === "expense" && b.active
    ).length,
    debts: dossier.debts.length,
    schuldenbewind: dossier.schuldenbewind,
    contactsTotal: dossier.contacts.length,
    contactsNotified: dossier.contacts.filter((c) => c.notified).length,
    inboedelNoteSet: !!dossier.inboedelNote,
    leefgeldSet: !!dossier.leefgeldAmountCents,
    pvaGoalsSet: !!dossier.pvaGoals,
    pvaDebtStrategySet: !!dossier.pvaDebtStrategy,
  };
  const items = boedelChecklist(snapshot);
  const progress = completeness(items);
  const extractableDocs = linkedDocs.filter(
    (d) =>
      d.textContent &&
      !pending.some((p) => p.sourceDocumentId === d.id)
  );

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-[5fr_7fr] gap-6 items-start">
        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between">
            <CardTitle className="text-sm font-semibold">
              {t("checklistTitle")}
            </CardTitle>
            <span className="font-mono text-xs tabular-nums text-ink-400">
              {progress.done}/{progress.total}
            </span>
          </CardHeader>
          <CardContent className="space-y-1.5">
            <p className="text-[12px] text-ink-400 mb-2">{t("checklistHint")}</p>
            {items
              .filter((i) => i.applies)
              .map((i) => (
                <div key={i.key} className="flex items-center gap-2 text-[13px]">
                  <span
                    className={
                      "inline-block h-3.5 w-3.5 rounded border shrink-0 " +
                      (i.done
                        ? "bg-[#22C55E] border-[#22C55E]"
                        : "border-border")
                    }
                  />
                  <span className={i.done ? "text-ink-600" : "text-ink-900"}>
                    {t(`check.${i.key}`)}
                  </span>
                </div>
              ))}
            <div className="pt-3 flex flex-wrap gap-3">
              <Link
                href={`/dossiers/${dossier.id}/boedel`}
                className="text-[12.5px] font-semibold text-primary hover:underline"
              >
                {t("openBoedel")} →
              </Link>
              <Link
                href={`/dossiers/${dossier.id}/pva`}
                className="text-[12.5px] font-semibold text-primary hover:underline"
              >
                {t("openPva")} →
              </Link>
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-baseline justify-between">
            <CardTitle className="text-sm font-semibold">
              {t("proposalsTitle")}
            </CardTitle>
            <span className="font-mono text-xs tabular-nums text-ink-400">
              {pending.length}
            </span>
          </CardHeader>
          <CardContent className="space-y-3">
            <p className="text-[12px] text-ink-400">{t("proposalsHint")}</p>
            {pending.length === 0 && (
              <EmptyState
                title={t("proposalsEmptyTitle")}
                sentence={t("proposalsEmptySentence")}
              />
            )}
            {pending.map((p) => (
              <ProposalCard
                key={p.id}
                proposal={{
                  id: p.id,
                  kind: p.kind,
                  payload: p.payload as Record<string, unknown>,
                  provenance: p.fieldProvenance ?? {},
                  confidence: p.confidence,
                  sourceFilename: p.sourceDocument?.filename ?? "?",
                  extractorVersion: p.extractorVersion,
                }}
              />
            ))}
            {extractableDocs.length > 0 && (
              <div className="border-t border-hairline pt-3 space-y-1.5">
                <p className="text-[12px] text-ink-400">{t("extractHint")}</p>
                {extractableDocs.map((d) => (
                  <div
                    key={d.id}
                    className="flex items-center justify-between gap-3 text-[12.5px]"
                  >
                    <span className="truncate text-ink-600 font-mono text-[12px]">
                      {d.filename}
                    </span>
                    <ExtractButton documentId={d.id} />
                  </div>
                ))}
              </div>
            )}
            {decidedRecent.length > 0 && (
              <p className="text-[11.5px] text-ink-400 border-t border-hairline pt-2">
                {t("recentlyDecided", {
                  accepted: decidedRecent.filter((d) => d.status === "accepted")
                    .length,
                  rejected: decidedRecent.filter((d) => d.status === "rejected")
                    .length,
                })}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            {t("notesTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent>
          <IntakeNotesForm
            dossierId={dossier.id}
            schuldenbewind={dossier.schuldenbewind}
            values={{
              inboedelNote: dossier.inboedelNote ?? "",
              pvaGoals: dossier.pvaGoals ?? "",
              pvaAgreements: dossier.pvaAgreements ?? "",
              pvaDebtStrategy: dossier.pvaDebtStrategy ?? "",
            }}
          />
        </CardContent>
      </Card>
    </div>
  );
}
