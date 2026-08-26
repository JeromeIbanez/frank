import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/domain/money";

/** Amounts: Geist Mono, tabular, right-alignment is the caller's concern. */
export function Money({ cents, signed = false }: { cents: number; signed?: boolean }) {
  return (
    <span
      className={cn(
        "font-mono tabular-nums whitespace-nowrap",
        signed && cents > 0 && "text-[#15803D]",
        signed && cents < 0 && "text-ink-900"
      )}
    >
      {signed && cents > 0 ? "+" : ""}
      {formatEuro(cents)}
    </span>
  );
}

/** ISO (storage) → DD-MM-YYYY (display), mono per handoff. Never feed the
 *  output back into forms — inputs stay ISO. */
export function formatDateNL(iso: string): string {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
  return m ? `${m[3]}-${m[2]}-${m[1]}` : iso;
}

export function DateText({ iso, className }: { iso: string; className?: string }) {
  return (
    <span className={cn("font-mono text-xs tabular-nums whitespace-nowrap", className)}>
      {formatDateNL(iso)}
    </span>
  );
}

/** Severity: 8px dot — red/amber/green appear ONLY for deadline severity
 *  and money risk (handoff rule). */
export function SeverityDot({
  severity,
  className,
}: {
  severity: "red" | "amber" | "green";
  className?: string;
}) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        severity === "red" && "bg-[#DC2626]",
        severity === "amber" && "bg-[#F59E0B]",
        severity === "green" && "bg-[#22C55E]",
        className
      )}
    />
  );
}

/** Status chip taxonomy (handoff): 11/600, pill, 2px 8px.
 *  green = done/approved/on-track · amber = needs attention · indigo tint =
 *  in progress/selected-adjacent · neutral outline = open/idle ·
 *  solid red = blocking legal state. */
const CHIP: Record<string, string> = {
  // task statuses
  open: "border border-border bg-surface text-ink-600",
  prepared: "bg-indigo-50 text-[#4338CA]",
  submitted: "bg-indigo-50 text-[#4338CA]",
  confirmed: "bg-[#F0FDF4] text-[#15803D]",
  done: "bg-[#F0FDF4] text-[#15803D]",
  cancelled: "border border-border bg-surface text-ink-300 line-through",
  // letters / batches
  draft: "border border-border bg-surface text-ink-600",
  approved: "bg-[#F0FDF4] text-[#15803D]",
  sent: "bg-[#F0FDF4] text-[#15803D]",
  exported: "bg-[#F0FDF4] text-[#15803D]",
  // dossier lifecycle
  actief: "bg-[#F0FDF4] text-[#15803D]",
  aanmelding: "border border-border bg-surface text-ink-600",
  intake: "bg-indigo-50 text-[#4338CA]",
  aangevraagd: "bg-indigo-50 text-[#4338CA]",
  uitstroom: "bg-[#FFFBEB] text-[#B45309]",
  overleden: "border border-border bg-surface text-ink-400",
  afgesloten: "border border-border bg-surface text-ink-400",
  // documents
  new: "bg-[#FFFBEB] text-[#B45309]",
  triaged: "bg-indigo-50 text-[#4338CA]",
  linked: "bg-[#F0FDF4] text-[#15803D]",
  archived: "border border-border bg-surface text-ink-400",
};

export function StatusBadge({
  status,
  label,
  className,
}: {
  status: string;
  label: string;
  className?: string;
}) {
  const check = ["confirmed", "done", "sent", "exported", "linked"].includes(status);
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
        CHIP[status] ?? "border border-border bg-surface text-ink-600",
        className
      )}
    >
      {check && <span aria-hidden>✓</span>}
      {label}
    </span>
  );
}

/** Empty state per handoff: stroked circle, short title, one sentence. */
export function EmptyState({
  title,
  sentence,
  action,
}: {
  title: string;
  sentence: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col items-center text-center py-12 gap-3">
      <span
        aria-hidden
        className="h-9 w-9 rounded-full border-[1.5px] border-ink-200"
      />
      <div>
        <div className="text-[13.5px] font-semibold text-ink-600">{title}</div>
        <p className="text-[12.5px] text-ink-400 mt-1 max-w-sm">{sentence}</p>
      </div>
      {action}
    </div>
  );
}
