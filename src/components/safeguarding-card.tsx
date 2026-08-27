"use client";

import { useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { toast } from "sonner";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { SeverityDot } from "@/components/format";
import {
  prepareClarification,
  sendClarification,
  recordClientResponse,
  resolveCase,
  escalateCase,
  type SafeguardingCaseRow,
} from "@/lib/actions/safeguarding";
import { ESCALATION_DESTINATIONS } from "@/lib/domain/safeguarding";

function euro(v: unknown): string {
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return (Math.abs(n) / 100).toLocaleString("nl-NL", {
    style: "currency",
    currency: "EUR",
  });
}

/**
 * One safeguarding case.
 *
 * The whole card is built around presenting a QUESTION rather than a
 * conclusion (N4). What that means concretely:
 *  - the heading describes the observation, never a verdict;
 *  - the client's own explanation, once given, sits directly beside the
 *    finding and is never collapsed away;
 *  - an office-scope case the viewer is the subject of shows why they cannot
 *    dispose of it, rather than hiding the buttons and looking broken.
 */
export function SafeguardingCard({
  row,
  viewerActorId,
}: {
  row: SafeguardingCaseRow;
  viewerActorId: string;
}) {
  const t = useTranslations("safeguarding");
  const [pending, start] = useTransition();
  const [mode, setMode] = useState<"idle" | "resolve" | "escalate" | "respond">(
    "idle"
  );
  const [text, setText] = useState("");
  const [destination, setDestination] = useState<string>("kantonrechter");
  const [showQuestion, setShowQuestion] = useState(false);

  const concernsViewer =
    row.scope === "office" && row.concernsActorId === viewerActorId;
  const disposed = row.status === "escalated";

  const detail = (() => {
    const e = row.evidence;
    switch (row.detectorKey) {
      case "cash_withdrawal_spike":
        return t("detail.cash_withdrawal_spike", {
          recent: euro(e.recentTotalCents),
          baseline: euro(e.baselineMonthlyCents),
          days: String(e.windowDays ?? 30),
        });
      case "structuring":
        return t("detail.structuring", {
          count: String(e.count ?? 0),
          threshold: euro(e.thresholdCents),
        });
      case "rapid_in_out":
        return t("detail.rapid_in_out", {
          credit: euro(e.creditCents),
          debit: euro(e.debitCents),
          days: String(e.gapDays ?? 0),
        });
      case "new_payee_high_value":
        return t("detail.new_payee_high_value", {
          amount: euro(e.amountCents),
          counterparty: String(e.counterparty ?? ""),
        });
      case "leefgeld_diversion":
        return t("detail.leefgeld_diversion", {
          credit: euro(e.creditCents),
          outflow: euro(e.outflowCents),
        });
      case "direct_debit_without_recorded_mandate":
        return t("detail.direct_debit_without_recorded_mandate", {
          counterparty: String(e.counterparty ?? ""),
          amount: euro(e.amountCents),
        });
      case "beneficiary_name_mismatch":
        return t("detail.beneficiary_name_mismatch", {
          onFile: String(e.onFile ?? ""),
          onTransaction: String(e.onTransaction ?? ""),
        });
      case "office_linked_beneficiary_outside_fee_basis":
        return t("detail.office_linked_beneficiary_outside_fee_basis", {
          beneficiary: String(e.beneficiary ?? ""),
          amount: euro(e.amountCents),
        });
      case "fee_above_schedule":
        return t("detail.fee_above_schedule", {
          charged: euro(e.chargedCents),
          permitted: euro(e.permittedCents),
          excess: euro(e.excessCents),
        });
      case "four_eyes_violation":
        return t("detail.four_eyes_violation", { batch: String(e.batchId ?? "") });
      default:
        return "";
    }
  })();

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, ok: string) =>
    start(async () => {
      const r = await fn();
      if (r.ok) {
        toast.success(ok);
        setMode("idle");
        setText("");
      } else {
        toast.error(t(`error.${r.error}`));
      }
    });

  return (
    <Card>
      <CardContent className="space-y-2.5">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-[14px] font-semibold text-ink-900">
              <SeverityDot
                severity={row.severity === "info" ? "info" : (row.severity as "red" | "amber")}
              />
              {t(`title.${row.detectorKey}`)}
            </p>
            <p className="mt-1 text-[12.5px] text-ink-600">{detail}</p>
          </div>
          <span className="shrink-0 font-mono text-[11px] text-ink-400">
            {t(`scope.${row.scope}`)} · {t(`status.${row.status}`)}
          </span>
        </div>

        {row.dossier && (
          <p className="text-[12.5px] text-ink-600">
            <Link
              href={`/dossiers/${row.dossier.id}`}
              className="font-medium text-ink-900 hover:underline"
            >
              {row.dossier.name}
            </Link>
          </p>
        )}

        {/* The client's own words, beside the finding — never collapsed. */}
        {row.clientResponse && (
          <div className="rounded-[8px] border border-hairline bg-surface-subtle px-3 py-2">
            <p className="type-section-label">{t("clientSaid")}</p>
            <p className="mt-1 text-[12.5px] text-ink-900">{row.clientResponse}</p>
          </div>
        )}

        {row.question && (
          <div className="rounded-[8px] border border-hairline px-3 py-2">
            <div className="flex items-baseline justify-between gap-2">
              <span className="text-[12.5px] font-medium text-ink-900">
                {t("questionReady")}
              </span>
              <span className="font-mono text-[11px] text-ink-400">
                {row.questionSent ? t("questionSent") : t("questionNotSent")}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setShowQuestion((v) => !v)}
              className="mt-1 text-[12px] text-ink-400 underline"
            >
              {showQuestion ? t("hideQuestion") : t("showQuestion")}
            </button>
            {showQuestion && (
              <pre className="mt-1.5 max-h-72 overflow-auto whitespace-pre-wrap rounded-[6px] bg-surface-subtle p-2.5 font-mono text-[11.5px] text-ink-600">
                {row.question}
              </pre>
            )}
          </div>
        )}

        {row.escalationDestination && (
          <p className="text-[12.5px] text-ink-600">
            {t("escalatedTo", {
              destination: t(`destination.${row.escalationDestination}`),
            })}
          </p>
        )}

        {/* N5: say WHY the buttons are gone, rather than looking broken. */}
        {concernsViewer && (
          <p className="rounded-[8px] border border-hairline px-3 py-2 text-[12.5px] text-ink-600">
            {t("concernsYou")}
          </p>
        )}

        {!concernsViewer && !disposed && mode === "idle" && (
          <div className="flex flex-wrap gap-2 pt-0.5">
            {row.hasClientQuestion && !row.question && (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() =>
                  run(() => prepareClarification(row.id), t("questionPrepared"))
                }
              >
                {t("prepareQuestion")}
              </Button>
            )}
            {row.question && !row.questionSent && (
              <Button
                size="sm"
                disabled={pending}
                onClick={() =>
                  run(() => sendClarification(row.id), t("questionApproved"))
                }
              >
                {t("approveAndSend")}
              </Button>
            )}
            {row.status === "clarifying" && (
              <Button
                size="sm"
                variant="secondary"
                disabled={pending}
                onClick={() => setMode("respond")}
              >
                {t("recordResponse")}
              </Button>
            )}
            <Button
              size="sm"
              variant="secondary"
              disabled={pending}
              onClick={() => setMode("resolve")}
            >
              {t("resolve")}
            </Button>
            <Button
              size="sm"
              variant="ghost"
              disabled={pending}
              onClick={() => setMode("escalate")}
            >
              {t("escalate")}
            </Button>
          </div>
        )}

        {mode !== "idle" && (
          <div className="flex flex-wrap items-center gap-2 pt-0.5">
            <input
              autoFocus
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t(`placeholder.${mode}`)}
              className="min-w-56 flex-1 rounded-[6px] border border-hairline bg-canvas px-2 py-1 text-[12.5px]"
            />
            {mode === "escalate" && (
              <select
                value={destination}
                onChange={(e) => setDestination(e.target.value)}
                className="rounded-[6px] border border-hairline bg-canvas px-2 py-1 text-[12.5px]"
              >
                {ESCALATION_DESTINATIONS.map((d) => (
                  <option key={d} value={d}>
                    {t(`destination.${d}`)}
                  </option>
                ))}
              </select>
            )}
            <Button
              size="sm"
              disabled={pending || text.trim().length < 3}
              onClick={() =>
                run(
                  () =>
                    mode === "resolve"
                      ? resolveCase(row.id, text)
                      : mode === "escalate"
                        ? escalateCase(row.id, text, destination)
                        : recordClientResponse(row.id, text),
                  t(`done.${mode}`)
                )
              }
            >
              {t(`confirm.${mode}`)}
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setMode("idle")}>
              {t("cancel")}
            </Button>
          </div>
        )}

        <p className="text-[11.5px] text-ink-400">{t("neverFraudNote")}</p>
      </CardContent>
    </Card>
  );
}
