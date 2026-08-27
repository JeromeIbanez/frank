import { getTranslations, getLocale } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { SeverityDot } from "@/components/format";
import { agentActivity, agentCeilings } from "@/lib/agent-report";
import { agentCharter } from "@/lib/agent-context";
import { ACTION_CATEGORY } from "@/lib/domain/agents";

/**
 * The Agents panel (plan os-v2 PR-8): read-only, on purpose.
 *
 * There is nothing to configure here because there is nothing to configure
 * anywhere — under invariant N3 an agent may record what arrived and draft
 * what might follow, and every consequential act needs a human decision. A
 * toggle on this page would be a lie about what the system can do.
 *
 * What it shows instead is the ceiling itself: what each agent may do, what
 * it may never do, and what it has actually done. That is the auditable
 * claim.
 */
export async function AgentsPanel() {
  const t = await getTranslations("agents");
  const locale = await getLocale();
  const activity = await agentActivity();

  return (
    <Card>
      <CardHeader>
        <CardTitle className="text-sm font-semibold text-ink-900">
          {t("title")}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-[12px] text-ink-400">{t("ceilingNote")}</p>

        <div className="space-y-2.5">
          {activity.map((a) => {
            const { grants, neverGrants } = agentCeilings(a.key);
            return (
              <div
                key={a.key}
                className="rounded-[8px] border border-hairline px-3 py-2.5"
              >
                <div className="flex items-baseline justify-between gap-3">
                  <span className="text-[13.5px] font-semibold text-ink-900">
                    {t(`name.${a.key}`)}
                  </span>
                  <span className="font-mono text-[11px] tabular-nums text-ink-400">
                    {a.calls > 0
                      ? t("callCount", { count: a.calls })
                      : t("noActivity")}
                    {a.acceptRate !== null &&
                      ` · ${t("acceptRate", {
                        pct: Math.round(a.acceptRate * 100),
                      })}`}
                  </span>
                </div>

                <p className="mt-1 text-[12.5px] text-ink-600">
                  {agentCharter(a.key, locale)}
                </p>

                {/* Labelled groups: a strikethrough alone leaves the reader
                    guessing which half is which, and this panel's whole job
                    is to make the ceiling legible at a glance. */}
                <div className="mt-2 space-y-1">
                  <div className="flex flex-wrap items-baseline gap-1">
                    <span className="type-section-label mr-0.5">
                      {t("mayLabel")}
                    </span>
                    {grants.map((g) => (
                      <span
                        key={g}
                        title={t(`category.${ACTION_CATEGORY[g]}`)}
                        className="rounded-[5px] bg-surface-subtle px-1.5 py-0.5 font-mono text-[10.5px] text-ink-600"
                      >
                        {g}
                      </span>
                    ))}
                  </div>
                  {neverGrants.length > 0 && (
                    <div className="flex flex-wrap items-baseline gap-1">
                      <span className="type-section-label mr-0.5">
                        {t("neverLabel")}
                      </span>
                      {neverGrants.map((n) => (
                        <span
                          key={n}
                          title={t("neverTitle")}
                          className="rounded-[5px] border border-hairline px-1.5 py-0.5 font-mono text-[10.5px] text-ink-400 line-through"
                        >
                          {n}
                        </span>
                      ))}
                    </div>
                  )}
                </div>

                {a.denials > 0 && (
                  <p className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-ink-600">
                    <SeverityDot severity="red" />
                    {t("denials", { count: a.denials })}
                  </p>
                )}
              </div>
            );
          })}
        </div>

        <p className="text-[12px] text-ink-400">{t("neverNote")}</p>
      </CardContent>
    </Card>
  );
}
