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
      <div className="flex items-start justify-between gap-4">
        <div>
          <div className="text-sm text-muted-foreground">
            <Link href="/dossiers" className="hover:underline">
              {td("title")}
            </Link>{" "}
            /
          </div>
          <h1 className="text-2xl font-semibold tracking-tight flex items-center gap-3">
            {dossier.firstName} {dossier.lastName}
            <StatusBadge
              status={dossier.status}
              label={td(`status.${dossier.status}`)}
            />
            {dossier.schuldenbewind && (
              <span className="text-[10px] uppercase tracking-wide bg-amber-50 text-amber-700 rounded px-1.5 py-0.5">
                {td("schulden")}
              </span>
            )}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            {td(`regime.${dossier.regime}`)}
            {dossier.rechtbank ? ` · ${dossier.rechtbank}` : ""}
            {dossier.zaaknummer ? ` · ${dossier.zaaknummer}` : ""}
          </p>
        </div>
      </div>

      {(urgency.overdue > 0 || urgency.unconfirmed > 0 || urgency.dueSoon > 0) && (
        <Link
          href={`/dossiers/${id}?tab=tasks`}
          className={cn(
            "inline-flex items-center gap-2 rounded-full text-xs px-3 py-1 transition-colors",
            urgency.overdue > 0 || urgency.unconfirmed > 0
              ? "bg-red-50 text-red-700 hover:bg-red-100"
              : "bg-amber-50 text-amber-700 hover:bg-amber-100"
          )}
        >
          <span
            className={cn(
              "h-1.5 w-1.5 rounded-full",
              urgency.overdue > 0 || urgency.unconfirmed > 0
                ? "bg-red-500"
                : "bg-amber-500"
            )}
          />
          {t("urgency.summary", {
            count: urgency.overdue + urgency.unconfirmed + urgency.dueSoon,
          })}
          <span className="text-current/70">
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

      <nav className="flex gap-1 border-b border-border overflow-x-auto">
        {TABS.map((tabKey) => (
          <Link
            key={tabKey}
            href={`/dossiers/${id}?tab=${tabKey}`}
            className={cn(
              "px-3.5 py-2 text-sm whitespace-nowrap border-b-2 -mb-px transition-colors",
              tab === tabKey
                ? "border-primary text-primary font-medium"
                : "border-transparent text-muted-foreground hover:text-foreground"
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
