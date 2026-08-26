import { asc } from "drizzle-orm";
import { getTranslations } from "next-intl/server";
import { getDb } from "@/lib/db";
import { authMode, countActiveBewindvoerders, currentActor } from "@/lib/identity";
import { canPerform } from "@/lib/domain/authz";
import { actors } from "@/lib/db/schema";
import { StatusBadge } from "@/components/format";
import { ActorControls } from "@/components/team-client";

export const dynamic = "force-dynamic";

/**
 * Team management (plan os-v1 W0). Roles decide who may perform legal-
 * responsibility acts; every change here is audited. Server actions
 * re-verify — this page only reflects what the server will allow.
 */
export default async function TeamPage() {
  const t = await getTranslations("team");
  const db = getDb();
  const [rows, me, bwCount] = await Promise.all([
    db.query.actors.findMany({ orderBy: asc(actors.createdAt) }),
    currentActor(),
    countActiveBewindvoerders(),
  ]);
  const mayManage = canPerform(me, "actor_manage").allowed;

  return (
    <div className="space-y-4">
      <p className="text-[13px] text-ink-600 max-w-xl">{t("intro")}</p>
      {authMode() === "dev" && (
        <p className="text-[12px] text-ink-400 border border-hairline rounded-[8px] bg-surface-subtle px-3 py-2 max-w-xl">
          {t("devModeNote")}
        </p>
      )}
      <div className="rounded-[10px] border border-border bg-surface">
        <table className="w-full text-[13px]">
          <thead>
            <tr className="border-b border-hairline text-left">
              <th className="px-4 py-2.5 type-section-label">{t("name")}</th>
              <th className="px-4 py-2.5 type-section-label">{t("email")}</th>
              <th className="px-4 py-2.5 type-section-label">{t("roleHeader")}</th>
              <th className="px-4 py-2.5 type-section-label">{t("status")}</th>
              <th className="px-4 py-2.5" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.id} className="border-b border-hairline last:border-0">
                <td className="px-4 py-2.5 font-[550] text-ink-900">
                  {a.name}
                  {a.id === me.id && (
                    <span className="ml-2 text-[11px] text-ink-400">
                      {t("you")}
                    </span>
                  )}
                </td>
                <td className="px-4 py-2.5 font-mono text-[12px] text-ink-600">
                  {a.email}
                </td>
                <td className="px-4 py-2.5">{t(`role.${a.role}`)}</td>
                <td className="px-4 py-2.5">
                  <StatusBadge
                    status={a.active ? "active" : "inactive"}
                    label={a.active ? t("active") : t("inactive")}
                  />
                </td>
                <td className="px-4 py-2.5 text-right">
                  {mayManage && a.id !== me.id && (
                    <ActorControls
                      actorId={a.id}
                      role={a.role}
                      active={a.active}
                      lastBewindvoerderGuard={
                        a.role === "bewindvoerder" && a.active && bwCount <= 1
                      }
                    />
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-[12px] text-ink-400 max-w-xl">{t("vierOgenNote")}</p>
    </div>
  );
}
