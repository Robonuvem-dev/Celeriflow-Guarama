import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { and, count, desc, eq } from "drizzle-orm";
import { findConstructionCaseForPortal } from "@/db/repositories/infrastructure/construction-access";
import { constructionIssuedDocuments, constructionDocumentRequests } from "@/db/schema/construction-documents";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import ConstructionPortalDocuments from "@/components/construction/ConstructionPortalDocuments";
export default async function ConstructionPortalDocumentsPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const { id } = await params; const identity = await getConstructionPortalIdentity(); const query = await searchParams;
  const record = await findConstructionCaseForPortal(db, id, identity.id); if (!record) notFound();
  const total = (await db.select({ value: count() }).from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.caseId, id), eq(constructionIssuedDocuments.status, "PUBLISHED"))))[0].value; const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const [documents, requests] = await Promise.all([db.select().from(constructionIssuedDocuments).where(and(eq(constructionIssuedDocuments.caseId, id), eq(constructionIssuedDocuments.status, "PUBLISHED"))).orderBy(desc(constructionIssuedDocuments.createdAt)).offset((page - 1) * 20).limit(20), db.select().from(constructionDocumentRequests).where(eq(constructionDocumentRequests.caseId, id)).orderBy(desc(constructionDocumentRequests.createdAt)).limit(20)]);
  return <main className="mx-auto max-w-5xl space-y-4 p-6"><h1 className="text-xl font-semibold">Documentos — {record.process.protocolNumber}</h1><Link className="text-sm underline" href={`/portal/construcao-civil/${id}`}>Voltar à solicitação</Link><ConstructionPortalDocuments caseId={id} documents={documents.map((d) => ({ id: d.id, number: d.number, kind: d.kind, validUntil: d.validUntil?.toISOString() || null, publishedAt: d.publishedAt?.toISOString() || null, validationCode: d.validationCode, hash: d.hashSha256 }))} requests={requests.map((r) => ({ id: r.id, type: r.type, reason: r.reason, status: r.status, createdAt: r.createdAt.toISOString() }))} /><nav className="flex gap-4 text-sm">{page > 1 && <Link href={`?page=${page - 1}`}>Anterior</Link>}<span>Página {page} — {total} documentos</span>{page * 20 < total && <Link href={`?page=${page + 1}`}>Próxima</Link>}</nav></main>;
}
