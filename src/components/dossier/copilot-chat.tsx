"use client";

import { useState } from "react";
import { useChat } from "@ai-sdk/react";
import { DefaultChatTransport } from "ai";
import { useTranslations } from "next-intl";
import { Send, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/lib/utils";

export function CopilotChat({ dossierId }: { dossierId: string }) {
  const t = useTranslations("copilot");
  const [input, setInput] = useState("");
  const { messages, sendMessage, status, error } = useChat({
    transport: new DefaultChatTransport({
      api: "/api/copilot",
      body: { dossierId },
    }),
  });

  const busy = status === "submitted" || status === "streaming";

  const suggestions = [
    t("suggestion1"),
    t("suggestion2"),
    t("suggestion3"),
  ];

  return (
    <div className="max-w-3xl space-y-4">
      <div className="rounded-lg border border-neutral-200 bg-white min-h-96 max-h-[32rem] overflow-y-auto p-4 space-y-4">
        {messages.length === 0 && (
          <div className="text-center py-12 space-y-4">
            <Sparkles className="h-8 w-8 text-indigo-300 mx-auto" />
            <p className="text-sm text-neutral-500 max-w-md mx-auto">
              {t("intro")}
            </p>
            <div className="flex flex-wrap justify-center gap-2">
              {suggestions.map((s) => (
                <button
                  key={s}
                  className="text-xs rounded-full border border-neutral-200 px-3 py-1.5 hover:bg-neutral-50"
                  onClick={() => sendMessage({ text: s })}
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        )}
        {messages.map((message) => (
          <div
            key={message.id}
            className={cn(
              "text-sm rounded-lg px-3.5 py-2.5 max-w-[85%] whitespace-pre-wrap",
              message.role === "user"
                ? "bg-indigo-600 text-white ml-auto"
                : "bg-neutral-100 text-neutral-900"
            )}
          >
            {message.parts.map((part, i) => {
              if (part.type === "text") return <span key={i}>{part.text}</span>;
              if (part.type.startsWith("tool-")) {
                return (
                  <span
                    key={i}
                    className="block text-[11px] text-neutral-400 italic"
                  >
                    ⚙ {part.type.replace("tool-", "")}
                  </span>
                );
              }
              return null;
            })}
          </div>
        ))}
        {busy && (
          <div className="text-sm text-neutral-400 italic">{t("thinking")}</div>
        )}
        {error && (
          <div className="text-sm rounded-md bg-amber-50 text-amber-800 px-3 py-2">
            {t("unavailable")}
          </div>
        )}
      </div>

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          if (!input.trim() || busy) return;
          sendMessage({ text: input });
          setInput("");
        }}
      >
        <Input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={t("placeholder")}
          disabled={busy}
        />
        <Button type="submit" disabled={busy || !input.trim()}>
          <Send className="h-4 w-4" />
        </Button>
      </form>
      <p className="text-xs text-neutral-400">{t("readOnlyNote")}</p>
    </div>
  );
}
