import { getTranslations } from "next-intl/server";
import { SidebarNav } from "./sidebar-nav";
import { LanguageToggle } from "./language-toggle";

export async function AppSidebar() {
  const t = await getTranslations("nav");

  const items = [
    { href: "/", key: "dashboard", label: t("dashboard") },
    { href: "/my-day", key: "myDay", label: t("myDay") },
    { href: "/dossiers", key: "dossiers", label: t("dossiers") },
    { href: "/inbox", key: "inbox", label: t("inbox") },
    { href: "/payments", key: "payments", label: t("payments") },
    { href: "/audit", key: "audit", label: t("audit") },
  ];

  return (
    <aside className="w-60 shrink-0 border-r border-border bg-card flex flex-col">
      <div className="px-5 py-5 border-b border-border/60">
        <div className="text-lg font-semibold tracking-tight">
          Frank<span className="text-primary">.</span>
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">
          {t("tagline")}
        </div>
      </div>
      <SidebarNav items={items} />
      <div className="mt-auto p-4 border-t border-border/60">
        <LanguageToggle />
      </div>
    </aside>
  );
}
