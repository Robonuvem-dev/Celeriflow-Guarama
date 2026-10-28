import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { and, desc, eq, exists, inArray, notInArray, or } from "drizzle-orm";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { listConstructionDocumentSigners, listConstructionGedVersions } from "@/db/repositories/infrastructure/construction-documents";
import { constructionReviews } from "@/db/schema/construction-core";
import { constructionIssuedDocuments, constructionDocumentTemplateVersions } from "@/db/schema/construction-documents";
import { documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { processDocuments } from "@/db/schema/processes";
import { listConstructionProjectStamps } from "@/lib/obras/construction-project-stamp";
import ConstructionProjectStampClient from "@/components/construction/ConstructionProjectStampClient";
import { z } from "zod";
export default async function ConstructionDocumentsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params; const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context); const database = context.database ?? db; const record = await findConstructionCaseForAccess(database, id, access); if (!record) notFound();
  const stamps = await listConstructionProjectStamps(database, id); const issued = await database.select({ documentId: constructionIssuedDocuments.documentId }).from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.caseId, id));
  const [review, templates, signers, versions] = await Promise.all([
    database.select({ decision: constructionReviews.decision, evidenceSnapshot: constructionReviews.evidenceSnapshot }).from(constructionReviews).where(and(eq(constructionReviews.caseId, id), eq(constructionReviews.revision, record.revisionCount), eq(constructionReviews.reviewType, "PROJECT"))).orderBy(desc(constructionReviews.createdAt)).limit(1).then(rows => rows[0]),
    database.select({ id: constructionDocumentTemplateVersions.id, title: constructionDocumentTemplateVersions.title, version: constructionDocumentTemplateVersions.version }).from(constructionDocumentTemplateVersions).where(and(eq(constructionDocumentTemplateVersions.kind, "PERMIT"), eq(constructionDocumentTemplateVersions.signaturePolicy, "INTERNAL_ALLOWED"))).orderBy(desc(constructionDocumentTemplateVersions.version)).limit(20),
    listConstructionDocumentSigners(database, access),
    listConstructionGedVersions(database, stamps.map(r => r.documentVersionId)),
  ]); const versionMap = new Map(versions.map((v) => [v.id, v]));
  const parsed = z.object({ documents: z.array(z.object({ id: z.string(), versions: z.array(z.object({ id: z.string() })).optional() })).optional(), documentIds: z.record(z.string(), z.string()).optional() }).passthrough().safeParse(review?.evidenceSnapshot);
  const evidence = record.reviewStatus === "APPROVED" && review?.decision === "APPROVED" && parsed.success ? parsed.data : { documents: [], documentIds: {} };
  const explicitVersionIds = (evidence.documents || []).flatMap((d) => (d.versions || []).map((v) => v.id)); const explicitlyVersionedDocs = new Set((evidence.documents || []).filter((d) => d.versions?.length).map((d) => d.id));
  const fallbackDocIds = [...new Set([...(evidence.documents || []).map((d) => d.id), ...Object.values(evidence.documentIds || {})])].filter((docId) => !explicitlyVersionedDocs.has(docId));
  const approvedVersions = await database.select({ id: documentVersions.id, documentId: documentVersions.documentId, versionNumber: documentVersions.versionNumber, document: { title: documents.title } }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(and(inArray(documentVersions.status, ["FINAL", "SIGNED"]), notInArray(documentVersions.documentId, [...issued.map(r => r.documentId), ...stamps.map(r => r.documentId)]), exists(database.select({ id: processDocuments.id }).from(processDocuments).where(and(eq(processDocuments.documentId, documents.id), eq(processDocuments.processId, record.processId)))), or(inArray(documentVersions.id, explicitVersionIds), inArray(documentVersions.documentId, fallbackDocIds)))).orderBy(desc(documentVersions.versionNumber)).limit(100);
  const projects = [...new Map(approvedVersions.map((version) => [version.documentId, { id: version.documentId, title: `${version.document.title} — versão deferida ${version.versionNumber}`, versionId: version.id }] as const).reverse()).values()];
  return <>{children}<ConstructionProjectStampClient caseId={id} actorId={context.user.id} canManage={access.administrator || access.roles.includes("MANAGER")} projects={projects} templates={templates} signers={signers.map((s) => ({ id: s.id, name: s.nome }))} stamps={stamps.map((r) => ({ id: r.id, originalHash: r.originalHash, hash: r.hashSha256, reviewId: r.reviewId, publishedAt: r.publishedAt?.toISOString() || null, versionStatus: versionMap.get(r.documentVersionId)?.status || "", signatures: versionMap.get(r.documentVersionId)?.signatures || [] }))} /></>;
}
