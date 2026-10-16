import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { constructionPortalCaseWhere } from "@/lib/obras/construction-portal-policy";
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
    const scope = { AND: [{ id: data.caseId }, constructionPortalCaseWhere(identity.id)] };
    const item = await prisma.constructionCase.findFirst({ where: scope, select: { processId: true } });
    if (!item) throw new AccessError("Solicitação indisponível.", 404);
    const existing = await prisma.constructionMessage.findUnique({ where: { requestKey: data.requestKey }, select: { caseId: true, identityId: true, documentId: true } });
    if (existing) {
      if (existing.caseId !== data.caseId || existing.identityId !== identity.id || !existing.documentId) throw new AccessError("Referência indisponível.", 404);
      return NextResponse.json({ id: existing.documentId });
    }
    const blob = await uploadProcessFile(file);
    unreferencedBlob = blob.url;
    const hash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
    const id = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
      const current = await tx.constructionCase.findFirst({ where: scope, select: { id: true, processId: true, process: { select: { status: true, completedAt: true, companyId: true } } } });
      if (!current) throw new AccessError("Participação encerrada.", 404);
      const repeated = await tx.constructionMessage.findUnique({ where: { requestKey: data.requestKey }, select: { caseId: true, identityId: true, documentId: true } });
      if (repeated) {
        if (repeated.caseId !== data.caseId || repeated.identityId !== identity.id || !repeated.documentId) throw new AccessError("Referência indisponível.", 404);
        return { id: repeated.documentId, newDocument: false };
      }
      if (current.process.completedAt || ["Arquivado", "Cancelado"].includes(current.process.status)) throw new Error("Processo encerrado para anexos.");
      await assertConstructionExternalCompany(tx, identity.id, current.process.companyId);
      const term = await tx.constructionTermVersion.findFirst({ orderBy: { version: "desc" }, select: { id: true, version: true } });
      if (!term || !await tx.constructionTermAcceptance.findUnique({ where: { caseId_identityId_termId: { caseId: data.caseId, identityId: identity.id, termId: term.id } }, select: { id: true } })) throw new Error("Aceite o termo vigente antes de enviar documentos.");
      const document = await tx.document.create({ data: { title: data.title, documentType: "Projeto / complemento urbanístico", fileUrl: blob.url, status: "Válido" }, select: { id: true } });
      const version = await tx.documentVersion.create({ data: { documentId: document.id, versionNumber: 1, fileUrl: blob.url, hashSha256: hash, status: "FINAL" }, select: { id: true } });
      await tx.processDocument.create({ data: { processId: current.processId, documentId: document.id, purpose: "Complementação profissional" }, select: { id: true } });
      const message = await tx.constructionMessage.create({ data: { caseId: data.caseId, requestKey: data.requestKey, identityId: identity.id, content: `Documento complementar: ${data.title}`, documentId: document.id, evidenceSnapshot: { termId: term.id, termVersion: term.version, documentVersionId: version.id, hashSha256: hash, filename: file.name, mimeType: file.type } }, select: { id: true } });
      await notifyConstructionMessageDepartment(tx, data.caseId, message.id);
      return { id: document.id, newDocument: true };
    });
    if (id.newDocument) unreferencedBlob = null;
    else await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
    return NextResponse.json({ id: id.id });
  } catch (error) {
    if (unreferencedBlob) await del(unreferencedBlob, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
    return NextResponse.json({ error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível enviar o documento." }, { status: error instanceof AccessError ? error.status : 400 });
  }
}

export async function GET(request: NextRequest) {
  try {
    const identity = await getConstructionPortalIdentity();
    const caseId = request.nextUrl.searchParams.get("caseId"); const documentId = request.nextUrl.searchParams.get("documentId");
    if (!caseId || !documentId) return NextResponse.json({ error: "Referência incompleta." }, { status: 400 });
    const item = await prisma.constructionCase.findFirst({ where: { AND: [{ id: caseId }, constructionPortalCaseWhere(identity.id)] }, select: { id: true } });
    if (!item || !await prisma.constructionMessage.findFirst({ where: { caseId, documentId }, select: { id: true } })) throw new AccessError("Documento indisponível.", 404);
    const document = await prisma.document.findUnique({ where: { id: documentId }, select: { versions: { orderBy: { versionNumber: "desc" }, take: 1, select: { id: true, hashSha256: true, fileUrl: true, status: true } } } });
    const version = document?.versions[0];
    if (!version) throw new AccessError("Versão indisponível.", 404);
    let artifact;
    try { artifact = await resolveConstructionComplementArtifact(prisma, caseId, documentId, version); } catch (error) { throw new AccessError(error instanceof Error ? error.message : "Documento assinado indisponível.", 403); }
    if (artifact) return new NextResponse(Buffer.from(artifact.bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${artifact.filename}"`, "Cache-Control": "private, no-store" } });
    const file = await getFile(version.fileUrl);
    if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    return new NextResponse(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível baixar o documento." }, { status: error instanceof AccessError ? error.status : 500 }); }
}
