import { getTranslations } from "next-intl/server";
import { getNavCounts } from "@/lib/queries";
import { currentActor } from "@/lib/identity";
import { LogoWordmark } from "./logo";
import { SidebarNav } from "./sidebar-nav";

export async function AppSidebar() {
  const t = await getTranslations("nav");
  const [counts, actor] = await Promise.all([getNavCounts(), currentActor()]);

  const items = [
    { href: "/", key: "dashboard", label: t("dashboard") },
    { href: "/my-day", key: "myDay", label: t("myDay"), count: counts.openTasks },
    { href: "/dossiers", key: "dossiers", label: t("dossiers"), count: counts.dossiers },
    { href: "/inbox", key: "inbox", label: t("inbox"), count: counts.inboxNew },
    { href: "/payments", key: "payments", label: t("payments") },
    { href: "/office", key: "office", label: t("office") },
    { href: "/audit", key: "audit", label: t("audit") },
    { href: "/team", key: "team", label: t("team") },
  ];

  const initials = actor.name
    .split(/\s+/)
    .map((p) => p[0])
    .slice(0, 2)
    .join("")
    .toUpperCase();

  return (
    <aside className="w-[216px] shrink-0 flex flex-col print:hidden">
      <div className="px-5 pt-5 pb-4">
        <LogoWordmark size={20} />
      </div>
      <SidebarNav items={items} />
      <div className="mt-auto px-4 pb-4">
        <div className="border-t border-hairline pt-3 flex items-center gap-2.5 px-1">
          <span className="h-7 w-7 shrink-0 rounded-full bg-primary text-primary-foreground text-[11px] font-semibold inline-flex items-center justify-center">
            {initials}
          </span>
          <span className="min-w-0">
            <span className="block text-[12.5px] font-[550] text-ink-900 truncate">
              {actor.name}
            </span>
            <span className="block text-[11px] text-ink-400 truncate">
              {t(`role.${actor.role}`)}
            </span>
          </span>
        </div>
      </div>
    </aside>
  );
}
