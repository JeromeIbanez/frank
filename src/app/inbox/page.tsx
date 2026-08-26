import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInboxDocuments, listDossiers } from "@/lib/queries";
import { DocumentCard } from "@/components/document-card";
import { UploadForm } from "@/components/upload-form";

export const dynamic = "force-dynamic";

export default async function InboxPage() {
  const t = await getTranslations("inbox");
  const [docs, dossiers] = await Promise.all([getInboxDocuments(), listDossiers()]);
  const dossierOptions = dossiers.map((d) => ({
    id: d.id,
    name: `${d.lastName}, ${d.firstName}`,
  }));

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{t("title")}</h1>
        <p className="text-sm text-muted-foreground mt-1">{t("subtitle")}</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">{t("uploadTitle")}</CardTitle>
        </CardHeader>
        <CardContent>
          <UploadForm />
        </CardContent>
      </Card>

      <div className="space-y-3">
        {docs.map((doc) => (
          <DocumentCard
            key={doc.id}
            doc={{
              id: doc.id,
              filename: doc.filename,
              classification: doc.classification,
              classificationSource: doc.classificationSource,
              classificationConfidence: doc.classificationConfidence,
              extracted: doc.extracted,
              proposedAction: doc.proposedAction,
              status: doc.status,
              uploadedAt: doc.uploadedAt.toISOString(),
              sha256: doc.sha256,
              dossierId: doc.dossierId,
              dossierName: doc.dossier
                ? `${doc.dossier.firstName} ${doc.dossier.lastName}`
                : null,
            }}
            dossierOptions={dossierOptions}
          />
        ))}
        {docs.length === 0 && (
          <p className="text-sm text-muted-foreground">{t("empty")}</p>
        )}
      </div>
    </div>
  );
}
