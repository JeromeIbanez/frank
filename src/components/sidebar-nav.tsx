"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  FolderOpen,
  Inbox,
  Banknote,
  Workflow,
  ShieldAlert,
  Building2,
  Users,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

/** Every nav destination. Adding one here forces an icon below, so a new
 *  section can never ship icon-less (which silently breaks row alignment). */
export type NavKey =
  | "dashboard"
  | "myDay"
  | "dossiers"
  | "inbox"
  | "payments"
  | "processes"
  | "safeguarding"
  | "office"
  | "audit"
  | "team";

const ICONS: Record<NavKey, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  myDay: CalendarCheck,
  dossiers: FolderOpen,
  inbox: Inbox,
  payments: Banknote,
  processes: Workflow,
  safeguarding: ShieldAlert,
  office: Building2,
  audit: ScrollText,
  team: Users,
};

export function SidebarNav({
  items,
}: {
  items: { href: string; key: NavKey; label: string; count?: number }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 min-h-0 overflow-y-auto px-3 space-y-px">
      {items.map((item) => {
        const Icon = ICONS[item.key];
        const active =
          item.href === "/"
            ? pathname === "/"
            : pathname.startsWith(item.href);
        return (
          <Link
            key={item.key}
            href={item.href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "flex items-center gap-2.5 rounded-[7px] px-3 py-[7px] text-[13.5px]",
              active
                ? "bg-accent text-accent-foreground font-semibold"
                : "text-ink-600 hover:bg-hairline hover:text-ink-900"
            )}
          >
            <Icon
              className={cn(
                "h-4 w-4 shrink-0",
                active ? "text-primary" : "text-ink-400"
              )}
            />

            <span className="flex-1">{item.label}</span>
            {item.count != null && item.count > 0 && (
              <span className="font-mono text-[11px] text-ink-400 tabular-nums">
                {item.count}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );
}
