"use client";

import { useLocale } from "next-intl";
import { useTransition } from "react";
import { setLocale } from "@/lib/actions/locale";
import { cn } from "@/lib/utils";

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
        "flex rounded-lg border border-neutral-200 p-0.5 text-sm",
        pending && "opacity-50"
      )}
      role="group"
      aria-label="Language"
    >
      {(["nl", "en"] as const).map((l) => (
        <button
          key={l}
          onClick={() => switchTo(l)}
          className={cn(
            "flex-1 rounded-md px-2 py-1 font-medium transition-colors",
            locale === l
              ? "bg-indigo-600 text-white"
              : "text-neutral-500 hover:text-neutral-900"
          )}
        >
          {l.toUpperCase()}
        </button>
      ))}
    </div>
  );
}
