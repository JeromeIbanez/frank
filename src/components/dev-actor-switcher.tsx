"use client";

import { useTransition } from "react";
import { useTranslations } from "next-intl";
import { Check, ChevronDown } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { switchDevActor } from "@/lib/actions/identity";
import { cn } from "@/lib/utils";

/**
 * Dev-mode identity picker. Deliberately labeled as demo identities in the
 * trigger AND the menu — this control does not exist in clerk mode.
 */
export function DevActorSwitcher({
  actors,
  currentId,
}: {
  actors: { id: string; name: string; role: "bewindvoerder" | "assistent" }[];
  currentId: string;
}) {
  const t = useTranslations("nav");
  const ts = useTranslations("shell");
  const [pending, startTransition] = useTransition();
  const current = actors.find((a) => a.id === currentId);

  return (
    <DropdownMenu>
      <DropdownMenuTrigger
        className={cn(
          "flex items-center gap-1.5 rounded-[7px] border border-border bg-surface px-2.5 py-1 text-xs text-ink-900 hover:bg-surface-hover",
          pending && "opacity-50"
        )}
      >
        <span className="font-[550]">{current?.name ?? "—"}</span>
        <span className="font-mono text-[10px] text-ink-400 uppercase">
          {ts("devIdentity")}
        </span>
        <ChevronDown className="h-3.5 w-3.5 text-ink-400" />
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="min-w-56">
        <DropdownMenuGroup>
          <DropdownMenuLabel className="text-[11px] text-ink-400 font-normal">
            {ts("devIdentityHint")}
          </DropdownMenuLabel>
          {actors.map((a) => (
            <DropdownMenuItem
              key={a.id}
              onClick={() => startTransition(() => switchDevActor(a.id))}
            >
              <span className="flex-1">
                <span className="block text-[12.5px]">{a.name}</span>
                <span className="block text-[11px] text-ink-400">
                  {t(`role.${a.role}`)}
                </span>
              </span>
              {a.id === currentId && <Check className="h-3.5 w-3.5" />}
            </DropdownMenuItem>
          ))}
        </DropdownMenuGroup>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
