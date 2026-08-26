import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";
import { formatEuro } from "@/lib/domain/money";

export function Money({ cents, signed = false }: { cents: number; signed?: boolean }) {
  return (
    <span
      className={cn(
        "tabular-nums",
        signed && cents > 0 && "text-emerald-700",
        signed && cents < 0 && "text-foreground"
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
  open: "bg-muted text-foreground/80",
  prepared: "bg-blue-50 text-blue-700",
  submitted: "bg-accent text-accent-foreground",
  confirmed: "bg-emerald-50 text-emerald-700",
  done: "bg-emerald-50 text-emerald-700",
  cancelled: "bg-muted text-muted-foreground/70 line-through",
  draft: "bg-muted text-foreground/80",
  approved: "bg-blue-50 text-blue-700",
  sent: "bg-emerald-50 text-emerald-700",
  exported: "bg-emerald-50 text-emerald-700",
  actief: "bg-emerald-50 text-emerald-700",
  aanmelding: "bg-muted text-foreground/80",
  intake: "bg-blue-50 text-blue-700",
  aangevraagd: "bg-accent text-accent-foreground",
  uitstroom: "bg-amber-50 text-amber-700",
  overleden: "bg-muted text-muted-foreground",
  afgesloten: "bg-muted text-muted-foreground",
  new: "bg-amber-50 text-amber-700",
  triaged: "bg-blue-50 text-blue-700",
  linked: "bg-emerald-50 text-emerald-700",
  archived: "bg-muted text-muted-foreground",
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
