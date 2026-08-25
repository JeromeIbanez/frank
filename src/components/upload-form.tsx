"use client";

import { useRef, useState, useTransition } from "react";
import { useTranslations } from "next-intl";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { uploadDocument } from "@/lib/actions/documents";

export function UploadForm() {
  const t = useTranslations("inbox");
  const [mode, setMode] = useState<"file" | "paste">("paste");
  const [isPending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  return (
    <form
      ref={formRef}
      className="space-y-3"
      action={(fd) =>
        startTransition(async () => {
          await uploadDocument(fd);
          formRef.current?.reset();
          toast.success(t("uploaded"));
        })
      }
    >
      <div className="flex gap-1 text-sm">
        <button
          type="button"
          onClick={() => setMode("paste")}
          className={
            "rounded-md px-3 py-1.5 " +
            (mode === "paste"
              ? "bg-indigo-50 text-indigo-700 font-medium"
              : "text-neutral-500 hover:bg-neutral-50")
          }
        >
          {t("pasteMode")}
        </button>
        <button
          type="button"
          onClick={() => setMode("file")}
          className={
            "rounded-md px-3 py-1.5 " +
            (mode === "file"
              ? "bg-indigo-50 text-indigo-700 font-medium"
              : "text-neutral-500 hover:bg-neutral-50")
          }
        >
          {t("fileMode")}
        </button>
      </div>

      {mode === "paste" ? (
        <Textarea
          name="text"
          placeholder={t("pastePlaceholder")}
          className="min-h-28"
        />
      ) : (
        <Input type="file" name="file" accept=".txt,.pdf,.png,.jpg" />
      )}

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={isPending}>
          {isPending ? t("processing") : t("upload")}
        </Button>
        <span className="text-xs text-neutral-400">{t("aiTriageNote")}</span>
      </div>
    </form>
  );
}
