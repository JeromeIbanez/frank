import { getTranslations } from "next-intl/server";
import { listSafeguardingCases } from "@/lib/actions/safeguarding";
import { currentActor } from "@/lib/identity";
import { SafeguardingCard } from "@/components/safeguarding-card";
import { RefreshSafeguardingButton } from "@/components/refresh-safeguarding-button";
import { EmptyState } from "@/components/format";

export const dynamic = "force-dynamic";

/**
 * Safeguarding (plan os-v2 W2).
 *
 * Office-scope cases come FIRST, deliberately. Frank monitoring its own
 * operators is the part a kantonrechter would care about most, and burying it
 * under client cases would make it decorative. It is also the part that must
 * not be quietly closable: a case concerning the only bewindvoerder stays
 * open and visible rather than disappearing.
 */
export default async function SafeguardingPage() {
  const t = await getTranslations("safeguarding");
  const [cases, actor] = await Promise.all([
    listSafeguardingCases(),
    currentActor(),
  ]);

  const office = cases.filter((c) => c.scope === "office");
  const client = cases.filter((c) => c.scope === "client");

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <RefreshSafeguardingButton />
        <p className="max-w-2xl text-[12.5px] text-ink-600">{t("intro")}</p>
      </div>

      {cases.length === 0 && (
        <EmptyState title={t("emptyTitle")} sentence={t("emptySentence")} />
      )}

      {office.length > 0 && (
        <section className="space-y-3">
          <h2 className="type-section-label">
            {t("group.office")} · {office.length}
          </h2>
          <p className="max-w-2xl text-[12px] text-ink-400">{t("officeNote")}</p>
          {office.map((row) => (
            <SafeguardingCard key={row.id} row={row} viewerActorId={actor.id} />
          ))}
        </section>
      )}

      {client.length > 0 && (
        <section className="space-y-3">
          <h2 className="type-section-label">
            {t("group.client")} · {client.length}
          </h2>
          {client.map((row) => (
            <SafeguardingCard key={row.id} row={row} viewerActorId={actor.id} />
          ))}
        </section>
      )}
    </div>
  );
}
