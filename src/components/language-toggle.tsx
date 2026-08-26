"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/lib/actions/locale";
import { cn } from "@/lib/utils";

/** Segmented NL/EN toggle per handoff: white, 1px border, radius 7px,
 *  active segment indigo-50 bg + indigo-700 text. */
export function LanguageToggle() {
  const locale = useLocale();
  const [pending, startTransition] = useTransition();

  function switchTo(l: "nl" | "en") {
    if (l === locale) return;
    startTransition(() => setLocale(l));
  }

  return (
    <div
      className={cn(
        "flex rounded-[7px] border border-border bg-surface p-0.5 text-xs",
        pending && "opacity-50"
      )}
      role="group"
      aria-label="Language"
    >
      {(["nl", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          aria-pressed={locale === l}
          className={cn(
            "rounded-[5px] px-2 py-0.5 font-semibold transition-colors",
            locale === l
              ? "bg-accent text-accent-foreground"
              : "text-ink-400 hover:text-ink-900"
          )}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
