"use client";

import { useState, useTransition } from "react";
import { useTranslations, useLocale } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeverityDot } from "@/components/format";
import {
  actionObligation,
  dismissObligation,
  confirmDossierLink,
} from "@/lib/actions/inbox";
import type { ObligationRow } from "@/lib/inbox";

function euro(cents: number): string {
  return (cents / 100).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * One pending obligation: what someone outside demands, what Frank found,
 * and the decision that is waiting.
 *
 * Deliberate design choices worth keeping:
 *  - the provisional dossier link is shown AS provisional, with the evidence
 *    that produced it, and must be confirmed before the obligation can be
 *    actioned (plan os-v2 §2.1 category B);
 *  - a finding shows its arithmetic and its source, so the curator can check
 *    Frank rather than trust it;
 *  - dismissing requires a reason. There is no silent close.
 */
export function ObligationCard({
  row,
  dossierOptions,
}: {
  row: ObligationRow;
  dossierOptions: { id: string; name: string }[];
}) {
  const t = useTranslations("obligations");
  const locale = useLocale();
  const [pending, start] = useTransition();
  const [expanded, setExpanded] = useState(false);
  const [showDraft, setShowDraft] = useState(false);
  const [dismissing, setDismissing] = useState(false);
  const [reason, setReason] = useState("");
  const [pickDossier, setPickDossier] = useState(
    row.dossier?.id ?? dossierOptions[0]?.id ?? ""
  );

  const summary = locale.startsWith("nl") ? row.summaryNl : row.summaryEn;
  // Confirmed is the only state in which anything dossier-bound exists
  // (Temujin PR-9 r2 #1): before it, the link lives on the message and is
  // shown as Frank's proposal, not as a fact about this client.
  const confirmed = row.message.linkReviewed && row.dossier !== null;
  const unrouted = row.message.status === "needs_dossier";
  const needsConfirm = !confirmed && !unrouted;
  const shown = row.dossier ?? row.proposedDossier;

  return (
    <Card>
      <CardContent className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="text-[14px] font-semibold text-ink-900">
              {summary}
            </div>
            <div className="mt-0.5 text-[12.5px] text-ink-600">
              {row.message.subject}
            </div>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-ink-400">
            {t(`kind.${row.kind}`)}
            {row.dueDate && ` · ${t("due", { date: row.dueDate })}`}
          </span>
        </div>

        {/* Findings: the reason this card is worth a curator's attention. */}
        {row.findings.map((f, i) => {
          if (f.finding !== "wik_amount_exceeds_cap") return null;
          return (
            <div
              key={i}
              className="rounded-[8px] border border-hairline bg-surface-subtle px-3 py-2"
            >
              <p className="flex items-center gap-1.5 text-[13px] font-medium text-ink-900">
                <SeverityDot severity="amber" />
                {t("wik.title")}
              </p>
              <p className="mt-1 text-[12.5px] text-ink-600">
                {t("wik.detail", {
                  charged: euro(Number(f.chargedCostsCents)),
                  max: euro(Number(f.maximumCents)),
                  principal: euro(Number(f.principalCents)),
                  excess: euro(Number(f.excessCents)),
                })}
              </p>
              <p className="mt-1 font-mono text-[11px] text-ink-400">
                {String(f.datasetVersion)} ·{" "}
                <a
                  href={String(f.sourceUrl)}
                  target="_blank"
                  rel="noreferrer"
                  className="underline"
                >
                  {t("wik.source")}
                </a>
              </p>
            </div>
          );
        })}

        {/* Dossier routing — provisional until a human says otherwise. */}
        <div className="flex flex-wrap items-center gap-2 text-[12.5px]">
          {unrouted ? (
            <>
              <span className="flex items-center gap-1.5 text-ink-600">
                <SeverityDot severity="amber" />
                {t("unrouted")}
              </span>
              <select
                value={pickDossier}
                onChange={(e) => setPickDossier(e.target.value)}
                className="rounded-[6px] border border-hairline bg-canvas px-2 py-1 text-[12.5px]"
              >
                {dossierOptions.map((d) => (
                  <option key={d.id} value={d.id}>
                    {d.name}
                  </option>
                ))}
              </select>
            </>
          ) : (
            <>
              <span className="text-ink-600">
                {confirmed ? t("routedTo") : t("proposedDossier")}{" "}
                <Link
                  href={`/dossiers/${shown?.id}`}
                  className="font-medium text-ink-900 hover:underline"
                >
                  {shown?.name}
                </Link>
              </span>
              {row.message.resolutionConfidence !== null && (
                <span className="font-mono text-[11px] text-ink-400">
                  {row.message.resolutionEvidence
                    .map((e) => t(`matcher.${e.matcher}`))
                    .join(" + ")}{" "}
                  · {row.message.resolutionConfidence}%
                </span>
              )}
            </>
          )}
        </div>

        {needsConfirm && (
          <p className="rounded-[8px] border border-hairline px-3 py-2 text-[12.5px] text-ink-600">
            {t("provisional")}
          </p>
        )}

        {/* The drafted reply — the thing that actually saves the hour. */}
        {row.draftLetter && (
          <div className="rounded-[8px] border border-hairline px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ink-900">
                {t("draftReady")}
              </span>
              <span className="font-mono text-[11px] text-ink-400">
                {t("draftStatus")}
              </span>
            </div>
            <p className="mt-0.5 text-[12.5px] text-ink-600">
              {row.draftLetter.subject}
            </p>
            <button
              type="button"
              onClick={() => setShowDraft((v) => !v)}
              className="mt-1 text-[12px] text-ink-400 underline"
            >
              {showDraft ? t("hideDraft") : t("showDraft")}
            </button>
            {showDraft && (
              <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap rounded-[6px] bg-surface-subtle p-2.5 font-mono text-[11.5px] text-ink-600">
                {row.draftLetter.body}
              </pre>
            )}
          </div>
        )}

        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="text-[12px] text-ink-400 underline"
        >
          {expanded ? t("hideSource") : t("showSource")}
        </button>
        {expanded && (
          <pre className="max-h-64 overflow-auto whitespace-pre-wrap rounded-[8px] border border-hairline bg-surface-subtle p-3 font-mono text-[11.5px] text-ink-600">
            {row.message.bodyText}
          </pre>
        )}

        {/* Decisions */}
        {!dismissing ? (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {!confirmed && (
              <Button
                size="sm"
                disabled={pending || !pickDossier}
                onClick={() =>
                  start(async () => {
                    const r = await confirmDossierLink(
                      row.message.id,
                      unrouted ? pickDossier : shown!.id
                    );
                    toast[r.ok ? "success" : "error"](
                      r.ok ? t("linkConfirmed") : t("failed")
                    );
                  })
                }
              >
                {unrouted ? t("assign") : t("confirmLink")}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={pending || !confirmed}
              title={!confirmed ? t("confirmFirst") : undefined}
              onClick={() =>
                start(async () => {
                  const r = await actionObligation(row.id);
                  if (!r.ok) toast.error(t(`error.${r.error}`));
                  else
                    toast.success(
                      r.approvedLetter ? t("actionedWithLetter") : t("actioned")
                    );
                })
              }
            >
              {t("action")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setDismissing(true)}
            >
              {t("dismiss")}
            </Button>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <input
              autoFocus
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder={t("reasonPlaceholder")}
              className="min-w-56 flex-1 rounded-[6px] border border-hairline bg-canvas px-2 py-1 text-[12.5px]"
            />
            <Button
              size="sm"
              disabled={pending || reason.trim().length < 3}
              onClick={() =>
                start(async () => {
                  const r = await dismissObligation(row.id, reason);
                  if (r.ok) toast.success(t("dismissed"));
                  else toast.error(t("failed"));
                  setDismissing(false);
                  setReason("");
                })
              }
            >
              {t("confirmDismiss")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              onClick={() => setDismissing(false)}
            >
              {t("cancel")}
            </Button>
          </div>
        )}

        {/* The safety property, said out loud rather than assumed. */}
        <p className="text-[11.5px] text-ink-400">{t("noMoneyNote")}</p>
      </CardContent>
    </Card>
  );
}
