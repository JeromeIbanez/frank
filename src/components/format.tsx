import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/domain/money";

export function Money({ cents, signed = false }: { cents: number; signed?: boolean }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        signed && cents > 0 && "text-emerald-700",
        signed && cents < 0 && "text-neutral-900"
      )}
    >
      {signed && cents > 0 ? "+" : ""}
      {formatEuro(cents)}
    </span>
  );
}

export function SeverityDot({
  severity,
}: {
  severity: "red" | "amber" | "green";
}) {
  return (
    <span
      className={cn(
        "inline-block h-2 w-2 rounded-full shrink-0",
        severity === "red" && "bg-red-500",
        severity === "amber" && "bg-amber-500",
        severity === "green" && "bg-emerald-500"
      )}
    />
  );
}

const STATUS_STYLES: Record<string, string> = {
  open: "bg-neutral-100 text-neutral-700",
  prepared: "bg-blue-50 text-blue-700",
  submitted: "bg-indigo-50 text-indigo-700",
  confirmed: "bg-emerald-50 text-emerald-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-neutral-100 text-neutral-400 line-through",
  draft: "bg-neutral-100 text-neutral-700",
  approved: "bg-blue-50 text-blue-700",
  sent: "bg-emerald-50 text-emerald-700",
  exported: "bg-emerald-50 text-emerald-700",
  actief: "bg-emerald-50 text-emerald-700",
  aanmelding: "bg-neutral-100 text-neutral-700",
  intake: "bg-blue-50 text-blue-700",
  aangevraagd: "bg-indigo-50 text-indigo-700",
  uitstroom: "bg-amber-50 text-amber-700",
  overleden: "bg-neutral-200 text-neutral-600",
  afgesloten: "bg-neutral-200 text-neutral-500",
  new: "bg-amber-50 text-amber-700",
  triaged: "bg-blue-50 text-blue-700",
  linked: "bg-emerald-50 text-emerald-700",
  archived: "bg-neutral-100 text-neutral-500",
};

export function StatusBadge({ status, label }: { status: string; label: string }) {
  return (
    <Badge
      variant="secondary"
      className={cn("font-normal", STATUS_STYLES[status] ?? "")}
    >
      {label}
    </Badge>
  );
}
