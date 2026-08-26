import { getTranslations } from "next-intl/server";
import { getAuditTrail } from "@/lib/queries";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";

export const dynamic = "force-dynamic";

export default async function AuditPage() {
  const t = await getTranslations("audit");
  const rows = await getAuditTrail(200);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <div className="rounded-lg border border-border bg-card overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("cols.time")}</TableHead>
              <TableHead>{t("cols.actor")}</TableHead>
              <TableHead>{t("cols.action")}</TableHead>
              <TableHead>{t("cols.entity")}</TableHead>
              <TableHead>{t("cols.detail")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((e) => (
              <TableRow key={e.id}>
                <TableCell className="whitespace-nowrap tabular-nums text-muted-foreground text-xs">
                  {e.createdAt.toISOString().replace("T", " ").slice(0, 19)}
                </TableCell>
                <TableCell>
                  <Badge
                    variant="secondary"
                    className={
                      e.actorType === "agent"
                        ? "bg-violet-50 text-violet-700"
                        : e.actorType === "system"
                          ? "bg-muted text-muted-foreground"
                          : "bg-blue-50 text-blue-700"
                    }
                  >
                    {e.actorId}
                  </Badge>
                </TableCell>
                <TableCell className="text-sm">{e.action}</TableCell>
                <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                  {e.entityType}{" "}
                  <span className="text-muted-foreground/40 font-mono text-xs">
                    {e.entityId.slice(0, 8)}
                  </span>
                </TableCell>
                <TableCell className="text-xs text-muted-foreground max-w-md truncate">
                  {e.reason ??
                    (e.versionAfter ? JSON.stringify(e.versionAfter) : "")}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>
      <p className="text-xs text-muted-foreground/70">{t("appendOnlyNote")}</p>
    </div>
  );
}
