import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getDossier, getDossierLetters } from "@/lib/queries";
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

  return (
    <div className="space-y-6">
      <div className="grid lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("packTitle")}</CardTitle>
          </CardHeader>
          <CardContent className="space-y-2">
            <p className="text-sm text-neutral-500">
              {t("packHint", { count: unNotified })}
            </p>
            <AanschrijfPackButton dossierId={dossier.id} disabled={unNotified === 0} />
          </CardContent>
        </Card>
        <Card>
          <CardHeader>
            <CardTitle className="text-base">{t("generateTitle")}</CardTitle>
          </CardHeader>
          <CardContent>
            <GenerateLetterForm dossierId={dossier.id} />
          </CardContent>
        </Card>
      </div>

      <div className="space-y-3">
        <h3 className="font-medium">
          {t("listTitle")} ({rows.length})
        </h3>
        {rows.length === 0 && (
          <p className="text-sm text-neutral-500">{t("empty")}</p>
        )}
        {rows.map((letter) => (
          <LetterCard
            key={letter.id}
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
