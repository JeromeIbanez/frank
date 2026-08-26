import { getTranslations } from "next-intl/server";
import { getDossierDocuments } from "@/lib/queries";
import { DocumentCard } from "@/components/document-card";

export async function DocumentsTab({
  dossierId,
  documentsPromise,
}: {
  dossierId: string;
  documentsPromise: ReturnType<typeof getDossierDocuments>;
}) {
  const t = await getTranslations("documents");
  const docs = await documentsPromise;

  return (
    <div className="space-y-3">
      {docs.length === 0 && (
        <p className="text-sm text-muted-foreground">{t("emptyDossier")}</p>
      )}
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
            dossierId,
            dossierName: null,
          }}
          dossierOptions={[]}
        />
      ))}
    </div>
  );
}
