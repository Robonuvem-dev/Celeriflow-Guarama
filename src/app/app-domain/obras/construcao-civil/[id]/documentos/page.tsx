import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSignature } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { db } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { and, asc, count, desc, eq, gte, inArray, lte, sql } from "drizzle-orm";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { constructionProjectDocumentCondition, listConstructionDocumentSigners, listConstructionGedVersions, listConstructionProjectDocuments } from "@/db/repositories/infrastructure/construction-documents";
import { constructionIssuedDocuments, constructionDocumentRequests, constructionDocumentTemplateVersions, constructionPdfAnnotations } from "@/db/schema/construction-documents";
import { digitalCertificates } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import ConstructionDocumentsClient from "./ConstructionDocumentsClient";
import ConstructionPdfEditor from "@/components/construction/ConstructionPdfEditor";
import { listConstructionProjectStamps } from "@/lib/obras/construction-project-stamp";

export default async function ConstructionCaseDocumentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string; projectsPage?: string }> }) {
  const { id } = await params; const query = await searchParams; const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
  const database = context.database ?? db;
  const record = await findConstructionCaseForAccess(database, id, access); if (!record) notFound();
  const total = (await database.select({ value: count() }).from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.caseId, id)))[0].value; const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const issuedIds = await database.select({ documentId: constructionIssuedDocuments.documentId }).from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.caseId, id));
  const stampedProjects = await listConstructionProjectStamps(database, id);
  const excludedIds = [...issuedIds.map(item => item.documentId), ...stampedProjects.map(item => item.documentId)];
  const projectTotal = (await database.select({ value: count() }).from(documents).where(constructionProjectDocumentCondition(database, record.processId, excludedIds)))[0].value; const projectsPage = Math.min(Math.max(1, Math.ceil(projectTotal / 20)), Math.max(1, Number.parseInt(query.projectsPage || "1", 10) || 1));
  const [issued, templates, requests, completions, projects, signers, certificates, revisions] = await Promise.all([
    database.select().from(constructionIssuedDocuments).where(eq(constructionIssuedDocuments.caseId, id)).orderBy(desc(constructionIssuedDocuments.createdAt), desc(constructionIssuedDocuments.id)).offset((page - 1) * 20).limit(20),
    database.select().from(constructionDocumentTemplateVersions).orderBy(desc(constructionDocumentTemplateVersions.version)).then(rows => rows.filter((row, index) => rows.findIndex(item => item.kind === row.kind) === index)),
    database.select().from(constructionDocumentRequests).where(and(eq(constructionDocumentRequests.caseId, id), eq(constructionDocumentRequests.status, "PENDING"))).orderBy(asc(constructionDocumentRequests.createdAt)).limit(20),
    database.execute<{ id: string; number: string; kind: string; area: string }>(sql`SELECT id, number, kind, area::text FROM "ConstructionCompletion" WHERE "caseId"=${id} ORDER BY "createdAt" DESC`).then(result => result.rows.map(row => ({ ...row, area: new Decimal(row.area) }))),
    listConstructionProjectDocuments(database, record.processId, excludedIds, (projectsPage - 1) * 20, 20),
    listConstructionDocumentSigners(database, access),
    database.select({ id: digitalCertificates.id, alias: digitalCertificates.alias }).from(digitalCertificates).where(and(eq(digitalCertificates.status, "ACTIVE"), gte(digitalCertificates.validTo, new Date()), lte(digitalCertificates.validFrom, new Date()))).orderBy(asc(digitalCertificates.alias)),
    database.select().from(constructionPdfAnnotations).where(eq(constructionPdfAnnotations.caseId, id)).orderBy(desc(constructionPdfAnnotations.createdAt)).limit(20),
  ]);
  const versions = await listConstructionGedVersions(database, issued.map(item => item.documentVersionId));
  const versionMap = new Map(versions.map((version) => [version.id, version]));
  const sourceIds = [...new Set(requests.map((request) => request.sourceIssuedDocumentId))]; const sources = await database.select({ id: constructionIssuedDocuments.id, number: constructionIssuedDocuments.number, kind: constructionIssuedDocuments.kind, completionId: constructionIssuedDocuments.completionId }).from(constructionIssuedDocuments).where(inArray(constructionIssuedDocuments.id, sourceIds));
  const canManage = access.administrator || access.roles.includes("MANAGER"); const canAnnotate = canManage || (access.roles.includes("ANALYST") && record.assignedEmployeeId === access.employeeId);
  return <PageFrame className="space-y-4 p-4"><PageHeader title={`Documentos — ${record.process.protocolNumber}`} icon={<FileSignature className="size-4" />} /><nav className="flex gap-4 text-sm"><Link className="underline" href={`/obras/construcao-civil/${id}`}>Solicitação</Link><Link className="underline" href="/obras/construcao-civil/documentos">Editar modelos</Link></nav><ConstructionDocumentsClient caseId={id} actorId={context.user.id} canManage={canManage} templates={templates.map((t) => ({ id: t.id, kind: t.kind, title: t.title, version: t.version }))} issued={issued.map((item) => { const version = versionMap.get(item.documentVersionId); return { id: item.id, number: item.number, kind: item.kind, status: item.status, versionStatus: version?.status || "", signaturePolicy: version?.document.documentClass?.signaturePolicy || "", signatures: version?.signatures || [], hash: item.hashSha256, publishedAt: item.publishedAt?.toISOString() || null, sourceId: item.sourceIssuedDocumentId, requestType: item.requestType }; })} requests={requests.map((r) => ({ id: r.id, type: r.type, reason: r.reason, source: sources.find((s) => s.id === r.sourceIssuedDocumentId) || null }))} completions={completions.map((c) => ({ id: c.id, name: `${c.number} — ${c.kind} — ${c.area} m²` }))} signers={signers.map((s) => ({ id: s.id, name: s.nome }))} certificates={certificates} /><nav className="flex gap-4 text-sm">{page > 1 && <Link href={`?page=${page - 1}&projectsPage=${projectsPage}`}>Anterior</Link>}<span>Página {page} — {total} documentos</span>{page * 20 < total && <Link href={`?page=${page + 1}&projectsPage=${projectsPage}`}>Próxima</Link>}</nav><ConstructionPdfEditor key={projectsPage} caseId={id} canAnnotate={canAnnotate} projects={projects.filter((p) => p.versions[0] && ["FINAL", "SIGNED"].includes(p.versions[0].status)).map((p) => ({ id: p.id, title: p.title, versionId: p.versions[0].id, version: p.versions[0].versionNumber }))} /><nav className="flex gap-4 text-sm">{projectsPage > 1 && <Link href={`?page=${page}&projectsPage=${projectsPage - 1}`}>Projetos anteriores</Link>}<span>{projectTotal} projetos — página {projectsPage}</span>{projectsPage * 20 < projectTotal && <Link href={`?page=${page}&projectsPage=${projectsPage + 1}`}>Próximos projetos</Link>}</nav><section className="rounded border p-4"><h2 className="font-semibold">Últimas 20 revisões PDF — originais preservados</h2>{revisions.map((r) => <div key={r.id} className="break-all border-b py-3 text-xs"><p>{r.createdAt.toISOString()} — {Array.isArray(r.annotations) ? r.annotations.length : 0} anotações</p><p>Original: {r.originalHash}</p><p>Revisão: {r.revisionHash}</p><div className="flex gap-4"><a className="underline" href={`/api/construcao-civil/documentos/projeto?caseId=${id}&versionId=${r.sourceVersionId}`}>Original</a><a className="underline" href={`/api/construcao-civil/documentos/projeto?caseId=${id}&versionId=${r.revisionVersionId}`}>Revisão</a></div></div>)}</section></PageFrame>;
}
