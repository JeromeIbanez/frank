import { desc, eq, inArray } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/db";
import { budgetLines, debtEvents, documents } from "@/lib/db/schema";
import { getDossier } from "@/lib/queries";
import { currentActor } from "@/lib/identity";
import { canPerform } from "@/lib/domain/authz";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { DateText, EmptyState, Money, StatusBadge } from "@/components/format";
import { AddDebtForm, DebtActions } from "./debts-client";

type DossierFull = NonNullable<Awaited<ReturnType<typeof getDossier>>>;

/**
 * Schuldenbeheer (plan os-v1 W4). Balances change only via provenance-
 * bearing debt events: reconciled CAMT payments (system) or creditor
 * statements (human, document required). The event trail renders here.
 */
export async function DebtsTab({ dossier }: { dossier: DossierFull }) {
  const t = await getTranslations("debtsTab");
  const db = getDb();
  const debtIds = dossier.debts.map((d) => d.id);
  const [events, regelingen, dossierDocs, actor] = await Promise.all([
    debtIds.length
      ? db.query.debtEvents.findMany({
          where: inArray(debtEvents.debtId, debtIds),
          orderBy: desc(debtEvents.createdAt),
        })
      : Promise.resolve([]),
    db.query.budgetLines.findMany({
      where: eq(budgetLines.dossierId, dossier.id),
    }),
    db.query.documents.findMany({
      where: eq(documents.dossierId, dossier.id),
    }),
    currentActor(),
  ]);
  const mayAdjust = canPerform(actor, "debt_adjust").allowed;
  const totalCurrent = dossier.debts.reduce(
    (s, d) => s + d.currentAmountCents,
    0
  );
  const totalOriginal = dossier.debts.reduce(
    (s, d) => s + d.originalAmountCents,
    0
  );

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3.5">
        <Card>
          <CardContent>
            <div className="type-section-label">{t("kpiCount")}</div>
            <div className="type-kpi mt-1">{dossier.debts.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="type-section-label">{t("kpiCurrent")}</div>
            <div className="type-kpi mt-1">
              <Money cents={totalCurrent} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="type-section-label">{t("kpiOriginal")}</div>
            <div className="type-kpi mt-1 text-ink-600">
              <Money cents={totalOriginal} />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent>
            <div className="type-section-label">{t("kpiRegelingen")}</div>
            <div className="type-kpi mt-1">
              {dossier.debts.filter((d) => d.status === "regeling").length}
            </div>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">{t("register")}</CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-[12px] text-ink-400">{t("invariantNote")}</p>
          {dossier.debts.length === 0 && (
            <EmptyState title={t("emptyTitle")} sentence={t("emptySentence")} />
          )}
          {dossier.debts.map((debt) => {
            const debtEventsRows = events.filter((e) => e.debtId === debt.id);
            const regeling = regelingen.find(
              (l) => l.debtId === debt.id && l.active
            );
            return (
              <div
                key={debt.id}
                className="rounded-[10px] border border-border bg-surface p-3.5 space-y-2.5"
              >
                <div className="flex flex-wrap items-center gap-2.5">
                  <span className="text-[13.5px] font-[550] text-ink-900">
                    {debt.creditor}
                  </span>
                  {debt.reference && (
                    <span className="font-mono text-[11.5px] text-ink-400">
                      {debt.reference}
                    </span>
                  )}
                  <StatusBadge
                    status={debt.status}
                    label={t(`status.${debt.status}`)}
                  />
                  {debt.viaDeurwaarder && (
                    <span className="text-[11px] text-ink-400">
                      {t("via")} {debt.viaDeurwaarder}
                    </span>
                  )}
                  <span className="ml-auto font-mono tabular-nums text-[13.5px] font-semibold">
                    <Money cents={debt.currentAmountCents} />
                  </span>
                </div>
                {regeling && (
                  <p className="text-[12px] text-ink-600">
                    {t("regelingLine", {
                      amount: (regeling.amountCents / 100).toLocaleString(
                        "nl-NL",
                        { style: "currency", currency: "EUR" }
                      ),
                    })}{" "}
                    <span className="font-mono text-[11px] text-ink-400">
                      {regeling.counterpartyIban}
                    </span>
                  </p>
                )}
                {debtEventsRows.length > 0 && (
                  <div className="border-t border-hairline pt-2 space-y-1">
                    <div className="type-section-label">{t("events")}</div>
                    {debtEventsRows.slice(0, 6).map((e) => (
                      <div
                        key={e.id}
                        className="flex items-center gap-2 text-[12px]"
                      >
                        <DateText
                          iso={e.createdAt.toISOString().slice(0, 10)}
                          className="text-ink-400"
                        />
                        <span className="text-ink-600">
                          {t(`eventKind.${e.kind}`)}
                        </span>
                        <span
                          className={
                            "ml-auto font-mono tabular-nums " +
                            (e.deltaCents < 0
                              ? "text-[#15803D]"
                              : "text-[#B45309]")
                          }
                        >
                          {e.deltaCents > 0 ? "+" : ""}
                          <Money cents={e.deltaCents} />
                        </span>
                      </div>
                    ))}
                  </div>
                )}
                {mayAdjust && (
                  <DebtActions
                    debtId={debt.id}
                    hasRegeling={!!regeling}
                    documents={dossierDocs.map((d) => ({
                      id: d.id,
                      filename: d.filename,
                    }))}
                  />
                )}
              </div>
            );
          })}
          <div className="border-t border-hairline pt-4">
            <div className="type-section-label mb-2">{t("addTitle")}</div>
            <AddDebtForm dossierId={dossier.id} />
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
