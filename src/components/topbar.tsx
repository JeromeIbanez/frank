"use client";

import { usePathname } from "next/navigation";
import { useTranslations } from "next-intl";
import { LanguageToggle } from "./language-toggle";

const SECTION_BY_PREFIX: [string, string][] = [
  ["/my-day", "myDay"],
  ["/dossiers", "dossiers"],
  ["/inbox", "inbox"],
  ["/payments", "payments"],
  ["/audit", "audit"],
];

/** 54px topbar: section title left; NL/EN segmented toggle + demo caption right. */
export function Topbar() {
  const pathname = usePathname();
  const t = useTranslations("nav");
  const ts = useTranslations("shell");
  const sectionKey =
    SECTION_BY_PREFIX.find(([prefix]) => pathname.startsWith(prefix))?.[1] ??
    "dashboard";

  return (
    <header className="h-[54px] shrink-0 border-b border-hairline flex items-center justify-between px-8 print:hidden">
      <div className="text-base font-semibold text-ink-900">{t(sectionKey)}</div>
      <div className="flex items-center gap-4">
        <LanguageToggle />
        <span
          tabIndex={0}
          role="note"
          aria-label={ts("demoBanner")}
          title={ts("demoBanner")}
          className="font-mono text-[11px] text-ink-400 rounded focus-visible:outline-2 focus-visible:outline-ring"
        >
          {ts("demoShort")}
        </span>
      </div>
    </header>
  );
}
