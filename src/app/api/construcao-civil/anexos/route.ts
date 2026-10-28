import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { and, desc, eq, sql } from "drizzle-orm";
import { documents as documentTable } from "@/db/schema/registry";
import { documentVersions } from "@/db/schema/document-workflow";
import { processDocuments } from "@/db/schema/processes";
import { constructionMessages, constructionTerms, constructionTermAcceptances } from "@/db/schema/construction-portal";
import { findConstructionCaseForPortal } from "@/db/repositories/infrastructure/construction-access";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { uploadProcessFile, getFile, downloadFilename } from "@/lib/platform/blob";
import { AccessError } from "@/lib/platform/tenant-context";
import { del } from "@vercel/blob";
import { notifyConstructionMessageDepartment } from "@/lib/obras/construction-message-notifications";
import { assertConstructionExternalCompany } from "@/lib/obras/construction-external-company";
import { resolveConstructionComplementArtifact } from "@/lib/obras/construction-document-downloads";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let unreferencedBlob: string | null = null;
  try {
    const identity = await getConstructionPortalIdentity();
    const form = await request.formData();
    const data = z.object({ caseId: z.string().min(1), requestKey: z.uuid(), title: z.string().trim().min(2).max(160) }).parse({ caseId: form.get("caseId"), requestKey: form.get("requestKey"), title: form.get("title") });
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Selecione um arquivo PDF, JPG ou PNG.");
    const item = await findConstructionCaseForPortal(db, data.caseId, identity.id);
    if (!item) throw new AccessError("Solicitação indisponível.", 404);
    const [existing] = await db.select().from(constructionMessages).where(eq(constructionMessages.requestKey, data.requestKey)).limit(1);
    if (existing) {
      if (existing.caseId !== data.caseId || existing.identityId !== identity.id || !existing.documentId) throw new AccessError("Referência indisponível.", 404);
      return NextResponse.json({ id: existing.documentId });
    }
    const blob = await uploadProcessFile(file);
    unreferencedBlob = blob.url;
    const hash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
    const id = await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
      const current = await findConstructionCaseForPortal(tx, data.caseId, identity.id);
      if (!current) throw new AccessError("Participação encerrada.", 404);
      const [repeated] = await tx.select().from(constructionMessages).where(eq(constructionMessages.requestKey, data.requestKey)).limit(1);
      if (repeated) {
        if (repeated.caseId !== data.caseId || repeated.identityId !== identity.id || !repeated.documentId) throw new AccessError("Referência indisponível.", 404);
        return { id: repeated.documentId, newDocument: false };
      }
      if (current.process.completedAt || ["Arquivado", "Cancelado"].includes(current.process.status)) throw new Error("Processo encerrado para anexos.");
      await assertConstructionExternalCompany(tx, identity.id, current.process.companyId);
      const [term] = await tx.select({ id: constructionTerms.id, version: constructionTerms.version }).from(constructionTerms).orderBy(desc(constructionTerms.version)).limit(1);
      if (!term || !(await tx.select({ id: constructionTermAcceptances.id }).from(constructionTermAcceptances).where(and(eq(constructionTermAcceptances.caseId, data.caseId), eq(constructionTermAcceptances.identityId, identity.id), eq(constructionTermAcceptances.termId, term.id))).limit(1)).length) throw new Error("Aceite o termo vigente antes de enviar documentos.");
      const [document] = await tx.insert(documentTable).values({ title: data.title, documentType: "Projeto / complemento urbanístico", fileUrl: blob.url, status: "Válido" }).returning({ id: documentTable.id });
      const [version] = await tx.insert(documentVersions).values({ documentId: document.id, versionNumber: 1, fileUrl: blob.url, hashSha256: hash, status: "FINAL" }).returning({ id: documentVersions.id });
      await tx.insert(processDocuments).values({ processId: current.processId, documentId: document.id, purpose: "Complementação profissional" });
      const [message] = await tx.insert(constructionMessages).values({ caseId: data.caseId, requestKey: data.requestKey, identityId: identity.id, content: `Documento complementar: ${data.title}`, documentId: document.id, evidenceSnapshot: { termId: term.id, termVersion: term.version, documentVersionId: version.id, hashSha256: hash, filename: file.name, mimeType: file.type } }).returning({ id: constructionMessages.id });
      await notifyConstructionMessageDepartment(tx, data.caseId, message.id);
      return { id: document.id, newDocument: true };
    });
    if (id.newDocument) unreferencedBlob = null;
    else await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
    return NextResponse.json({ id: id.id });
  } catch (error) {
    if (unreferencedBlob) await del(unreferencedBlob, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
    return NextResponse.json({ error: error instanceof z.ZodError ? error.message : constructionActionMessage(error, "Não foi possível enviar o documento.") }, { status: error instanceof AccessError ? error.status : 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getConstructionPortalIdentity();
    const caseId = request.nextUrl.searchParams.get("caseId"); const documentId = request.nextUrl.searchParams.get("documentId");
    if (!caseId || !documentId) return NextResponse.json({ error: "Referência incompleta." }, { status: 400 });
    const item = await findConstructionCaseForPortal(db, caseId, identity.id);
    if (!item || !(await db.select({ id: constructionMessages.id }).from(constructionMessages).where(and(eq(constructionMessages.caseId, caseId), eq(constructionMessages.documentId, documentId))).limit(1)).length) throw new AccessError("Documento indisponível.", 404);
    const [version] = await db.select({ id: documentVersions.id, hashSha256: documentVersions.hashSha256, fileUrl: documentVersions.fileUrl, status: documentVersions.status }).from(documentVersions).innerJoin(documentTable, eq(documentTable.id, documentVersions.documentId)).where(eq(documentTable.id, documentId)).orderBy(desc(documentVersions.versionNumber)).limit(1);
    if (!version) throw new AccessError("Versão indisponível.", 404);
    let artifact;
    try { artifact = await resolveConstructionComplementArtifact(db, caseId, documentId, version); } catch (error) { throw new AccessError(error instanceof Error ? error.message : "Documento assinado indisponível.", 403); }
    if (artifact) return new NextResponse(Buffer.from(artifact.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${artifact.filename}"`, "Cache-Control": "private, no-store" } });
    const file = await getFile(version.fileUrl);
    if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    return new NextResponse(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível baixar o documento." }, { status: error instanceof AccessError ? error.status : 500 }); }
}
