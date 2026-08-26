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
import { DateText, EmptyState, StatusBadge } from "@/components/format";
import { Plus } from "lucide-react";

export const dynamic = "force-dynamic";

const HEAD_CLASS =
  "h-10 px-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-ink-400";

export default async function DossiersPage() {
  const t = await getTranslations("dossiers");
  const rows = await listDossiers();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-end">
        <Button nativeButton={false} render={<Link href="/dossiers/new" />}>
          <Plus className="h-4 w-4" /> {t("new")}
        </Button>
      </div>

      <div className="rounded-[10px] border border-border bg-surface overflow-hidden">
        {rows.length === 0 ? (
          <EmptyState
            title={t("emptyTitle")}
            sentence={t("empty")}
            action={
              <Button
                nativeButton={false}
                variant="outline"
                render={<Link href="/dossiers/new" />}
              >
                {t("new")}
              </Button>
            }
          />
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-hairline hover:bg-transparent">
                <TableHead className={HEAD_CLASS}>{t("cols.name")}</TableHead>
                <TableHead className={HEAD_CLASS}>{t("cols.regime")}</TableHead>
                <TableHead className={HEAD_CLASS}>{t("cols.status")}</TableHead>
                <TableHead className={HEAD_CLASS}>{t("cols.start")}</TableHead>
                <TableHead className={HEAD_CLASS}>{t("cols.gemeente")}</TableHead>
                <TableHead className={HEAD_CLASS + " text-right"}>
                  {t("cols.accounts")}
                </TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows.map((d) => (
                <TableRow
                  key={d.id}
                  className="h-10 border-hairline hover:bg-surface-hover"
                >
                  <TableCell className="px-4 py-2.5">
                    <Link
                      href={`/dossiers/${d.id}`}
                      className="text-[13.5px] font-[550] text-[#4338CA] hover:underline"
                    >
                      {d.lastName}, {d.firstName}
                    </Link>
                    {d.schuldenbewind && (
                      <span className="ml-2 inline-flex items-center rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[11px] font-semibold text-[#B45309] whitespace-nowrap">
                        {t("schulden")}
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-[13px] text-ink-600">
                    {t(`regime.${d.regime}`)}
                  </TableCell>
                  <TableCell className="px-4 py-2.5">
                    <StatusBadge status={d.status} label={t(`status.${d.status}`)} />
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-ink-600">
                    {d.startDate ? <DateText iso={d.startDate} /> : "—"}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-[13px] text-ink-600">
                    {d.gemeente ?? "—"}
                  </TableCell>
                  <TableCell className="px-4 py-2.5 text-right font-mono text-xs tabular-nums text-ink-600">
                    {d.accounts.length}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
