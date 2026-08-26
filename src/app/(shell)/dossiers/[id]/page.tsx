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
import { IntakeTab } from "@/components/dossier/intake-tab";
import { getDb } from "@/lib/db";
import { aiProposals } from "@/lib/db/schema";
import { and, eq, inArray } from "drizzle-orm";
import { boedelChecklist, completeness } from "@/lib/domain/intake";

export const dynamic = "force-dynamic";

const TABS = [
  "overview",
  "intake",
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

  // Intake collapses once onboarding is done (Temujin PR-6 UX): checklist
  // complete, no pending proposals, dossier active. The werkdocumenten stay
  // reachable from the Filings tab.
  const [pendingProposal] = await getDb()
    .select({ id: aiProposals.id })
    .from(aiProposals)
    .where(
      and(
        eq(aiProposals.dossierId, id),
        inArray(aiProposals.status, ["proposed", "accepting"])
      )
    )
    .limit(1);
  const intakeItems = boedelChecklist({
    accounts: dossier.accounts.map((a) => ({
      type: a.type,
      openingBalanceCents: a.openingBalanceCents,
      openingBalanceDate: a.openingBalanceDate,
    })),
    incomeLines: dossier.budgetLines.filter(
      (b) => b.kind === "income" && b.active
    ).length,
    expenseLines: dossier.budgetLines.filter(
      (b) => b.kind === "expense" && b.active
    ).length,
    debts: dossier.debts.length,
    schuldenbewind: dossier.schuldenbewind,
    contactsTotal: dossier.contacts.length,
    contactsNotified: dossier.contacts.filter((c) => c.notified).length,
    inboedelNoteSet: !!dossier.inboedelNote,
    leefgeldSet: !!dossier.leefgeldAmountCents,
    pvaGoalsSet: !!dossier.pvaGoals,
    pvaDebtStrategySet: !!dossier.pvaDebtStrategy,
  });
  const intakeProgress = completeness(intakeItems);
  const intakeDone =
    intakeProgress.done === intakeProgress.total &&
    !pendingProposal &&
    dossier.status === "actief";
  const visibleTabs = TABS.filter((k) => k !== "intake" || !intakeDone);
  const effectiveTab: Tab =
    tab === "intake" && intakeDone ? "overview" : tab;

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
        {visibleTabs.map((tabKey) => (
          <Link
            key={tabKey}
            href={`/dossiers/${id}?tab=${tabKey}`}
            className={cn(
              "px-[13px] py-[9px] text-[13.5px] whitespace-nowrap border-b-2 -mb-px",
              effectiveTab === tabKey
                ? "border-[#4F46E5] text-[#4338CA] font-semibold"
                : "border-transparent text-ink-600 hover:text-ink-900"
            )}
          >
            {t(`tabs.${tabKey}`)}
          </Link>
        ))}
      </nav>

      {effectiveTab === "overview" && <OverviewTab dossier={dossier} balances={balances} />}
      {effectiveTab === "intake" && <IntakeTab dossier={dossier} />}
      {effectiveTab === "tasks" && <TasksTab dossierId={id} tasksPromise={getDossierTasks(id)} />}
      {effectiveTab === "budget" && <BudgetTab dossier={dossier} />}
      {effectiveTab === "transactions" && (
        <TransactionsTab
          dossier={dossier}
          transactionsPromise={getDossierTransactions(id)}
        />
      )}
      {effectiveTab === "documents" && (
        <DocumentsTab dossierId={id} documentsPromise={getDossierDocuments(id)} />
      )}
      {effectiveTab === "letters" && (
        <LettersTab dossier={dossier} lettersPromise={getDossierLetters(id)} />
      )}
      {effectiveTab === "filings" && <FilingsTab dossier={dossier} />}
      {effectiveTab === "copilot" && <CopilotChat dossierId={id} />}
    </div>
  );
}
