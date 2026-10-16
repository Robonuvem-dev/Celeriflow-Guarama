import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { listConstructionProjectStamps } from "@/lib/obras/construction-project-stamp";
import ConstructionProjectStampClient from "@/components/construction/ConstructionProjectStampClient";
import { z } from "zod";
export default async function ConstructionDocumentsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params; const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context); const record = await context.prisma.constructionCase.findFirst({ where: { AND: [{ id }, constructionCaseWhere(access)] }, select: { processId: true, reviewStatus: true, revisionCount: true } }); if (!record) notFound();
  const stamps = await listConstructionProjectStamps(context.prisma, id); const issued = await context.prisma.constructionIssuedDocument.findMany({ where: { caseId: id }, select: { documentId: true } });
  const [review, templates, signers, versions] = await Promise.all([
    context.prisma.constructionReview.findFirst({ where: { caseId: id, revision: record.revisionCount, reviewType: "PROJECT" }, orderBy: { createdAt: "desc" }, select: { decision: true, evidenceSnapshot: true } }),
    context.prisma.constructionDocumentTemplateVersion.findMany({ where: { kind: "PERMIT", signaturePolicy: "INTERNAL_ALLOWED" }, select: { id: true, title: true, version: true }, orderBy: { version: "desc" }, take: 20 }),
    context.prisma.usuario.findMany({ where: { ativo: true, ...(access.administrator ? {} : { employee: { departmentId: access.departmentId || "" } }) }, select: { id: true, nome: true }, orderBy: { nome: "asc" }, take: 100 }),
    context.prisma.documentVersion.findMany({ where: { id: { in: stamps.map((r) => r.documentVersionId) } }, select: { id: true, status: true, signatures: { select: { signerUsuarioId: true, signerName: true, status: true } } } }),
  ]); const versionMap = new Map(versions.map((v) => [v.id, v]));
  const parsed = z.object({ documents: z.array(z.object({ id: z.string(), versions: z.array(z.object({ id: z.string() })).optional() })).optional(), documentIds: z.record(z.string(), z.string()).optional() }).passthrough().safeParse(review?.evidenceSnapshot);
  const evidence = record.reviewStatus === "APPROVED" && review?.decision === "APPROVED" && parsed.success ? parsed.data : { documents: [], documentIds: {} };
  const explicitVersionIds = (evidence.documents || []).flatMap((d) => (d.versions || []).map((v) => v.id)); const explicitlyVersionedDocs = new Set((evidence.documents || []).filter((d) => d.versions?.length).map((d) => d.id));
  const fallbackDocIds = [...new Set([...(evidence.documents || []).map((d) => d.id), ...Object.values(evidence.documentIds || {})])].filter((docId) => !explicitlyVersionedDocs.has(docId));
  const approvedVersions = await context.prisma.documentVersion.findMany({ where: { status: { in: ["FINAL", "SIGNED"] }, documentId: { notIn: [...issued.map((r) => r.documentId), ...stamps.map((r) => r.documentId)] }, document: { processDocuments: { some: { processId: record.processId } } }, OR: [{ id: { in: explicitVersionIds } }, { documentId: { in: fallbackDocIds } }] }, select: { id: true, documentId: true, versionNumber: true, document: { select: { title: true } } }, orderBy: { versionNumber: "desc" }, take: 100 });
  const projects = [...new Map(approvedVersions.map((version) => [version.documentId, { id: version.documentId, title: `${version.document.title} — versão deferida ${version.versionNumber}`, versionId: version.id }] as const).reverse()).values()];
  return <>{children}<ConstructionProjectStampClient caseId={id} actorId={context.user.id} canManage={access.administrator || access.roles.includes("MANAGER")} projects={projects} templates={templates} signers={signers.map((s) => ({ id: s.id, name: s.nome }))} stamps={stamps.map((r) => ({ id: r.id, originalHash: r.originalHash, hash: r.hashSha256, reviewId: r.reviewId, publishedAt: r.publishedAt?.toISOString() || null, versionStatus: versionMap.get(r.documentVersionId)?.status || "", signatures: versionMap.get(r.documentVersionId)?.signatures || [] }))} /></>;
}
