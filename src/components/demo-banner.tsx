import { TriangleAlert } from "lucide-react";

/**
 * Environment ribbon: must stay visible on every screen (safety requirement
 * from the PRD/Temujin review). Styled as neutral chrome — amber is reserved
 * for actionable caution states in the product itself (Temujin UX review,
 * finding 4); only the icon carries the warning hue.
 */
export function DemoBanner({ label }: { label: string }) {
  return (
    <div className="sticky top-0 z-50 flex items-center justify-center gap-1.5 border-b border-border bg-muted/60 px-4 py-1 text-center text-[11px] font-medium text-muted-foreground">
      <TriangleAlert className="h-3 w-3 shrink-0 text-amber-500" aria-hidden />
      {label}
    </div>
  );
}
