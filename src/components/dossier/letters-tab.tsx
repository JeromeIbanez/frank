import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { EmptyState } from "@/components/format";
import { getDossier, getDossierLetters } from "@/lib/queries";
import { currentActor } from "@/lib/identity";
import { canPerform } from "@/lib/domain/authz";
import {
  AanschrijfPackButton,
  GenerateLetterForm,
  LetterCard,
} from "./letters-client";

type DossierFull = NonNullable<Awaited<ReturnType<typeof getDossier>>>;

export async function LettersTab({
  dossier,
  lettersPromise,
}: {
  dossier: DossierFull;
  lettersPromise: ReturnType<typeof getDossierLetters>;
}) {
  const t = await getTranslations("letters");
  const rows = await lettersPromise;
  const unNotified = dossier.contacts.filter((c) => !c.notified).length;
  // Same verdict the server actions enforce — the UI mirrors it, never
  // decides it (Temujin PR-4 round-2 #3).
  const actor = await currentActor();
  const mayHandle =
    canPerform(actor, "letter_approve").allowed &&
    canPerform(actor, "letter_mark_sent").allowed;

  return (
    <div className="space-y-6">
      <div className="inline-flex items-center gap-2 rounded-full border border-border bg-surface px-3 py-1 text-xs text-ink-600">
        <span className="font-mono text-[11px] font-semibold">NL</span>
        {t("officialOutput")}
      </div>
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("packTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-[12.5px] text-ink-600">
              {t("packHint", { count: unNotified })}
            </p>
            <AanschrijfPackButton dossierId={dossier.id} disabled={unNotified === 0} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-sm font-semibold">{t("generateTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateLetterForm dossierId={dossier.id} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h3 className="text-sm font-semibold">
          {t("listTitle")}{" "}
          <span className="font-mono text-xs font-normal text-ink-400 tabular-nums">
            {rows.length}
          </span>
        </h3>
        {rows.length === 0 && (
          <EmptyState title={t("emptyTitle")} sentence={t("emptySentence")} />
        )}
        {rows.map((letter) => (
          <LetterCard
            key={letter.id}
            mayHandle={mayHandle}
            letter={{
              id: letter.id,
              subject: letter.subject,
              body: letter.body,
              recipientName: letter.recipientName,
              status: letter.status,
              templateKey: letter.templateKey,
              createdAt: letter.createdAt.toISOString().slice(0, 10),
            }}
          />
        ))}
      </div>
    </div>
  );
}
