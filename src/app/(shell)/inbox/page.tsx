import { getTranslations } from "next-intl/server";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getInboxDocuments, listDossiers } from "@/lib/queries";
import { listObligations } from "@/lib/inbox";
import { DocumentCard } from "@/components/document-card";
import { ObligationCard } from "@/components/obligation-card";
import { ReceivePostButton } from "@/components/receive-post-button";
import { EmptyState } from "@/components/format";
import { UploadForm } from "@/components/upload-form";

export const dynamic = "force-dynamic";

/**
 * Inbox as the OBLIGATION QUEUE (plan os-v2 W1).
 *
 * v1 listed documents. But an inbound item is not a document — it is a
 * pending obligation: someone outside is demanding a response, there is a
 * deadline, and there is a right answer. The queue is grouped by what the
 * curator has to DECIDE, not by what arrived.
 *
 * Uploads remain, because post still arrives on paper.
 */
export default async function InboxPage() {
  const t = await getTranslations("inbox");
  const [obligations, docs, dossiers] = await Promise.all([
    listObligations(),
    getInboxDocuments(),
    listDossiers(),
  ]);
  const dossierOptions = dossiers.map((d) => ({
    id: d.id,
    name: `${d.lastName}, ${d.firstName}`,
  }));

  const needsRouting = obligations.filter(
    (o) => o.message.status === "needs_dossier"
  );
  const withFindings = obligations.filter(
    (o) => o.message.status !== "needs_dossier" && o.findings.length > 0
  );
  const routine = obligations.filter(
    (o) => o.message.status !== "needs_dossier" && o.findings.length === 0
  );

  const groups = [
    { key: "needsRouting", rows: needsRouting },
    { key: "withFindings", rows: withFindings },
    { key: "routine", rows: routine },
  ].filter((g) => g.rows.length > 0);

  return (
    <div className="space-y-6">
      <ReceivePostButton />

      {groups.length === 0 && (
        <EmptyState title={t("zeroTitle")} sentence={t("zeroSentence")} />
      )}

      {groups.map((g) => (
        <section key={g.key} className="space-y-3">
          <h2 className="type-section-label">
            {t(`group.${g.key}`)} · {g.rows.length}
          </h2>
          {g.rows.map((row) => (
            <ObligationCard
              key={row.id}
              row={row}
              dossierOptions={dossierOptions}
            />
          ))}
        </section>
      ))}

      <Card>
        <CardHeader>
          <CardTitle className="text-sm font-semibold">
            {t("uploadTitle")}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <UploadForm />
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
        </CardContent>
      </Card>
    </div>
  );
}
