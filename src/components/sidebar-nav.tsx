"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  CalendarCheck,
  FolderOpen,
  Inbox,
  Banknote,
  ScrollText,
} from "lucide-react";
import { cn } from "@/lib/utils";

const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  dashboard: LayoutDashboard,
  myDay: CalendarCheck,
  dossiers: FolderOpen,
  inbox: Inbox,
  payments: Banknote,
  audit: ScrollText,
};

export function SidebarNav({
  items,
}: {
  items: { href: string; key: string; label: string }[];
}) {
  const pathname = usePathname();

  return (
    <nav className="flex-1 px-3 py-4 space-y-0.5">
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
              "group relative flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors",
              active
                ? "bg-accent text-accent-foreground font-medium"
                : "text-muted-foreground hover:bg-muted hover:text-foreground"
            )}
          >
            <span
              className={cn(
                "absolute left-0 top-1/2 h-4 w-0.5 -translate-y-1/2 rounded-full bg-primary transition-opacity",
                active ? "opacity-100" : "opacity-0"
              )}
            />
            {Icon && (
              <Icon
                className={cn(
                  "h-4 w-4",
                  active
                    ? "text-primary"
                    : "text-muted-foreground group-hover:text-foreground"
                )}
              />
            )}
            {item.label}
          </Link>
        );
      })}
    </nav>
  );
}
