import Link from "next/link";
import { notFound } from "next/navigation";
import { getTranslations } from "next-intl/server";
import {
  accountBalance,
  dossierUrgency,
  getDossier,
  getDossierDocuments,
  getDossierLetters,
  getDossierTasks,
  getDossierTransactions,
} from "@/lib/queries";
import { cn } from "@/lib/utils";
import { StatusBadge } from "@/components/format";
import { OverviewTab } from "@/components/dossier/overview-tab";
import { TasksTab } from "@/components/dossier/tasks-tab";
import { BudgetTab } from "@/components/dossier/budget-tab";
import { TransactionsTab } from "@/components/dossier/transactions-tab";
import { DocumentsTab } from "@/components/dossier/documents-tab";
import { LettersTab } from "@/components/dossier/letters-tab";
import { FilingsTab } from "@/components/dossier/filings-tab";
import { CopilotChat } from "@/components/dossier/copilot-chat";

export const dynamic = "force-dynamic";

const TABS = [
  "overview",
  "tasks",
  "budget",
  "transactions",
  "documents",
  "letters",
  "filings",
  "copilot",
] as const;
type Tab = (typeof TABS)[number];

export default async function DossierPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ tab?: string }>;
}) {
  const { id } = await params;
  const { tab: tabParam } = await searchParams;
  const tab: Tab = TABS.includes(tabParam as Tab) ? (tabParam as Tab) : "overview";

  const t = await getTranslations("dossierDetail");
  const td = await getTranslations("dossiers");
  const dossier = await getDossier(id);
  if (!dossier) notFound();
  const urgency = await dossierUrgency(id);

  const balances = new Map<string, number>();
  for (const acc of dossier.accounts) {
    balances.set(acc.id, await accountBalance(acc.id));
  }

  return (
    <div className="space-y-5">
      <div>
        <div className="text-xs text-ink-400">
          <Link href="/dossiers" className="hover:underline">
            {td("title")}
          </Link>{" "}
          /
        </div>
        <div className="mt-1 flex flex-wrap items-center gap-3">
          <h1 className="type-page-title text-ink-900">
            {dossier.firstName} {dossier.lastName}
          </h1>
          <div className="flex flex-wrap items-center gap-1.5">
            <StatusBadge
              status={dossier.status}
              label={td(`status.${dossier.status}`)}
            />
            <span className="inline-flex items-center rounded-full border border-border bg-surface px-2 py-0.5 text-[11px] font-semibold text-ink-600 whitespace-nowrap">
              {td(`regime.${dossier.regime}`)}
            </span>
            {dossier.schuldenbewind && (
              <span className="inline-flex items-center rounded-full bg-[#FFFBEB] px-2 py-0.5 text-[11px] font-semibold text-[#B45309] whitespace-nowrap">
                {td("schulden")}
              </span>
            )}
            {(urgency.overdue > 0 ||
              urgency.unconfirmed > 0 ||
              urgency.dueSoon > 0) && (
              <Link
                href={`/dossiers/${id}?tab=tasks`}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
                  urgency.overdue > 0 || urgency.unconfirmed > 0
                    ? "bg-[#FEF2F2] text-[#B91C1C]"
                    : "bg-[#FFFBEB] text-[#B45309]"
                )}
              >
                <span
                  className={cn(
                    "h-2 w-2 rounded-full",
                    urgency.overdue > 0 || urgency.unconfirmed > 0
                      ? "bg-[#DC2626]"
                      : "bg-[#F59E0B]"
                  )}
                />
                {t("urgency.summary", {
                  count: urgency.overdue + urgency.unconfirmed + urgency.dueSoon,
                })}
                <span className="font-normal text-current/80">
                  {[
                    urgency.overdue > 0
                      ? t("urgency.overdue", { count: urgency.overdue })
                      : null,
                    urgency.unconfirmed > 0
                      ? t("urgency.unconfirmed", { count: urgency.unconfirmed })
                      : null,
                    urgency.dueSoon > 0
                      ? t("urgency.dueSoon", { count: urgency.dueSoon })
                      : null,
                  ]
                    .filter(Boolean)
                    .join(" · ")}
                </span>
              </Link>
            )}
          </div>
        </div>
        {(dossier.rechtbank || dossier.zaaknummer) && (
          <p className="mt-1 text-[13px] text-ink-600">
            {dossier.rechtbank}
            {dossier.rechtbank && dossier.zaaknummer && " · "}
            {dossier.zaaknummer && (
              <span className="font-mono">{dossier.zaaknummer}</span>
            )}
          </p>
        )}
      </div>

      <nav className="flex gap-1 border-b border-hairline overflow-x-auto">
        {TABS.map((tabKey) => (
          <Link
            key={tabKey}
            href={`/dossiers/${id}?tab=${tabKey}`}
            className={cn(
              "px-[13px] py-[9px] text-[13.5px] whitespace-nowrap border-b-2 -mb-px",
              tab === tabKey
                ? "border-[#4F46E5] text-[#4338CA] font-semibold"
                : "border-transparent text-ink-600 hover:text-ink-900"
            )}
          >
            {t(`tabs.${tabKey}`)}
          </Link>
        ))}
      </nav>

      {tab === "overview" && <OverviewTab dossier={dossier} balances={balances} />}
      {tab === "tasks" && <TasksTab dossierId={id} tasksPromise={getDossierTasks(id)} />}
      {tab === "budget" && <BudgetTab dossier={dossier} />}
      {tab === "transactions" && (
        <TransactionsTab
          dossier={dossier}
          transactionsPromise={getDossierTransactions(id)}
        />
      )}
      {tab === "documents" && (
        <DocumentsTab dossierId={id} documentsPromise={getDossierDocuments(id)} />
      )}
      {tab === "letters" && (
        <LettersTab dossier={dossier} lettersPromise={getDossierLetters(id)} />
      )}
      {tab === "filings" && <FilingsTab dossier={dossier} />}
      {tab === "copilot" && <CopilotChat dossierId={id} />}
    </div>
  );
}
