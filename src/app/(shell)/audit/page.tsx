import { getTranslations } from "next-intl/server";
import { getAuditTrail } from "@/lib/queries";
import { getDb } from "@/lib/db";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";

export const dynamic = "force-dynamic";

/** Actor chips: agent → indigo tint, system → neutral outline, human → subtle. */
function actorChipClass(actorType: string): string {
  if (actorType === "agent") return "bg-indigo-50 text-[#4338CA]";
  if (actorType === "system") return "border border-border bg-surface text-ink-600";
  return "bg-surface-subtle text-ink-600";
}

export default async function AuditPage() {
  const t = await getTranslations("audit");
  const [rows, actorRows] = await Promise.all([
    getAuditTrail(200),
    getDb().query.actors.findMany(),
  ]);
  // Actor ids → display names; historic ids (demo-user, system) pass through.
  const actorName = (id: string) =>
    actorRows.find((a) => a.id === id)?.name ?? id;

  return (
    <div className="space-y-6">
      <div className="rounded-[10px] border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow className="border-hairline hover:bg-transparent">
              <TableHead className="type-section-label h-9 px-3">
                {t("cols.time")}
              </TableHead>
              <TableHead className="type-section-label h-9 px-3">
                {t("cols.actor")}
              </TableHead>
              <TableHead className="type-section-label h-9 px-3">
                {t("cols.action")}
              </TableHead>
              <TableHead className="type-section-label h-9 px-3">
                {t("cols.entity")}
              </TableHead>
              <TableHead className="type-section-label h-9 px-3">
                {t("cols.detail")}
              </TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow
                key={e.id}
                className="border-hairline hover:bg-surface-hover"
              >
                <TableCell className="whitespace-nowrap px-3 font-mono text-[11.5px] tabular-nums text-ink-600">
                  {e.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </TableCell>
                <TableCell className="px-3">
                  <span
                    className={
                      "inline-flex rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap " +
                      actorChipClass(e.actorType)
                    }
                  >
                    {actorName(e.actorId)}
                  </span>
                </TableCell>
                <TableCell className="px-3 text-[13px]">{e.action}</TableCell>
                <TableCell className="whitespace-nowrap px-3 text-[13px] text-ink-600">
                  {e.entityType}{" "}
                  <span className="font-mono text-xs text-ink-400">
                    {e.entityId.slice(0, 8)}
                  </span>
                </TableCell>
                <TableCell className="max-w-md truncate px-3 text-xs text-ink-400">
                  {e.reason ??
                    (e.versionAfter ? JSON.stringify(e.versionAfter) : "")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-ink-400">{t("appendOnlyNote")}</p>
    </div>
  );
}
