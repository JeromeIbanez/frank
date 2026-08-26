import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { Button } from "@/components/ui/button";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { listDossiers } from "@/lib/queries";
import { StatusBadge } from "@/components/format";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

export default async function DossiersPage() {
  const t = await getTranslations("dossiers");
  const rows = await listDossiers();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-muted-foreground mt-1">
            {t("count", { count: rows.length })}
          </p>
        </div>
        <Button nativeButton={false} render={<Link href="/dossiers/new" />}>
          <Plus className="h-4 w-4" /> {t("new")}
        </Button>
      </div>

      <div className="rounded-lg border border-border bg-card">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t("cols.name")}</TableHead>
              <TableHead>{t("cols.regime")}</TableHead>
              <TableHead>{t("cols.status")}</TableHead>
              <TableHead>{t("cols.start")}</TableHead>
              <TableHead>{t("cols.gemeente")}</TableHead>
              <TableHead>{t("cols.accounts")}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {rows.map((d) => (
              <TableRow key={d.id}>
                <TableCell>
                  <Link
                    href={`/dossiers/${d.id}`}
                    className="font-medium text-primary hover:underline"
                  >
                    {d.lastName}, {d.firstName}
                  </Link>
                  {d.schuldenbewind && (
                    <span className="ml-2 text-[10px] uppercase tracking-wide bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">
                      {t("schulden")}
                    </span>
                  )}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {t(`regime.${d.regime}`)}
                </TableCell>
                <TableCell>
                  <StatusBadge status={d.status} label={t(`status.${d.status}`)} />
                </TableCell>
                <TableCell className="tabular-nums text-muted-foreground">
                  {d.startDate ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {d.gemeente ?? "—"}
                </TableCell>
                <TableCell className="text-muted-foreground">
                  {d.accounts.length}
                </TableCell>
              </TableRow>
            ))}
            {rows.length === 0 && (
              <TableRow>
                <TableCell colSpan={6} className="text-center text-muted-foreground py-8">
                  {t("empty")}
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
