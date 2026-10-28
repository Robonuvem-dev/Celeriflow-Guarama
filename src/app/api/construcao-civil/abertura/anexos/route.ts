import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { and, desc, eq, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { constructionExternalApplications } from "@/db/schema/construction-portal";
import { constructionExternalDocuments } from "@/db/schema/construction-opening";
import { constructionDefinitionVersions } from "@/db/schema/construction-viability";
import { documentVersions } from "@/db/schema/document-workflow";
import { documents } from "@/db/schema/registry";
import { constructionActionMessage } from "@/lib/obras/construction-errors";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { assertExternalApplicationScope } from "@/lib/obras/construction-external-policy";
import { definitionSchema } from "@/lib/obras/construction-rules";
import { uploadProcessFile, getFile, downloadFilename } from "@/lib/platform/blob";
import { AccessError } from "@/lib/platform/tenant-context";
import { del } from "@vercel/blob";
import { assertConstructionExternalCompany } from "@/lib/obras/construction-external-company";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let unreferencedBlob: string | null = null;
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new AccessError("Origem inválida.", 403);
    const identity = await getConstructionPortalIdentity();
    const form = await request.formData();
    const data = z.object({ applicationId: z.string().min(1), requestKey: z.uuid(), label: z.string().trim().min(2).max(160) }).parse({ applicationId: form.get("applicationId"), requestKey: form.get("requestKey"), label: form.get("label") });
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Selecione um PDF, JPG ou PNG.");
    const [application] = await databaseConnection.db.select().from(constructionExternalApplications).where(and(eq(constructionExternalApplications.id, data.applicationId), eq(constructionExternalApplications.identityId, identity.id))).limit(1);
    if (!application) throw new AccessError("Abertura indisponível.", 404);
    assertExternalApplicationScope(application, identity.id);
    if (application.caseId) throw new Error("Abertura já protocolada. Envie complementos na solicitação.");
    const [repeated] = await databaseConnection.db.select().from(constructionExternalDocuments).where(eq(constructionExternalDocuments.requestKey, data.requestKey)).limit(1);
    if (repeated) {
      if (repeated.applicationId !== application.id || repeated.label !== data.label) throw new AccessError("Referência indisponível.", 404);
      return NextResponse.json({ id: repeated.documentId });
    }
    const [currentForm] = await databaseConnection.db.select({ definition: constructionDefinitionVersions.definition }).from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, "FORM")).orderBy(desc(constructionDefinitionVersions.version)).limit(1);
    if (!definitionSchema.parse(currentForm?.definition || { fields: [], checks: [], documents: [] }).documents.some((doc) => doc.label === data.label)) throw new Error("Documento não previsto no formulário vigente.");
    const blob = await uploadProcessFile(file);
    unreferencedBlob = blob.url;
    const hashSha256 = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
    const id = await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.execute(sql`SELECT "id" FROM "ConstructionExternalApplication" WHERE "id"=${application.id} FOR UPDATE`);
      const [current] = await tx.select().from(constructionExternalApplications).where(and(eq(constructionExternalApplications.id, application.id), eq(constructionExternalApplications.identityId, identity.id))).limit(1);
      if (!current) throw new AccessError("Abertura indisponível.", 404);
      assertExternalApplicationScope(current, identity.id);
      await assertConstructionExternalCompany(tx, identity.id, current.companyId);
      if (current.caseId) throw new Error("Abertura já protocolada.");
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`CONSTRUCTION_DOCUMENT:${data.requestKey}`}))`);
      const [existing] = await tx.select().from(constructionExternalDocuments).where(eq(constructionExternalDocuments.requestKey, data.requestKey)).limit(1);
      if (existing) { if (existing.applicationId !== application.id || existing.label !== data.label) throw new AccessError("Referência indisponível.", 404); return { id: existing.documentId, created: false }; }
      const [document] = await tx.insert(documents).values({ title: data.label, documentType: "Abertura urbanística externa", fileUrl: blob.url, status: "Válido" }).returning({ id: documents.id });
      const [version] = await tx.insert(documentVersions).values({ documentId: document.id, versionNumber: 1, fileUrl: blob.url, hashSha256, status: "FINAL" }).returning({ id: documentVersions.id });
      await tx.insert(constructionExternalDocuments).values({ ...data, documentId: document.id, documentVersionId: version.id, hashSha256, filename: file.name, mimeType: file.type });
      return { id: document.id, created: true };
    });
    if (id.created) unreferencedBlob = null;
    else { await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined); unreferencedBlob = null; }
    return NextResponse.json({ id: id.id });
  } catch (error) {
    if (unreferencedBlob) await del(unreferencedBlob, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
    return NextResponse.json({ error: constructionActionMessage(error, "Não foi possível enviar o documento.") }, { status: error instanceof AccessError ? error.status : 400 });
  }
}
export async function GET(request: NextRequest) {
  try {
    const identity = await getConstructionPortalIdentity();
    const applicationId = request.nextUrl.searchParams.get("applicationId"); const documentId = request.nextUrl.searchParams.get("documentId");
    if (!applicationId || !documentId) return NextResponse.json({ error: "Referência incompleta." }, { status: 400 });
    const [application] = await databaseConnection.db.select().from(constructionExternalApplications).where(and(eq(constructionExternalApplications.id, applicationId), eq(constructionExternalApplications.identityId, identity.id))).limit(1);
    if (!application) throw new AccessError("Abertura indisponível.", 404);
    assertExternalApplicationScope(application, identity.id);
    const [uploaded] = await databaseConnection.db.select().from(constructionExternalDocuments).where(and(eq(constructionExternalDocuments.applicationId, applicationId), eq(constructionExternalDocuments.documentId, documentId))).limit(1);
    if (!uploaded) throw new AccessError("Documento indisponível.", 404);
    const [version] = await databaseConnection.db.select({ fileUrl: documentVersions.fileUrl, status: documentVersions.status }).from(documentVersions).where(eq(documentVersions.id, uploaded.documentVersionId)).limit(1);
    if (!version || !["FINAL", "SIGNED"].includes(version.status)) throw new AccessError("Versão indisponível.", 404);
    const file = await getFile(version.fileUrl);
    if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    return new NextResponse(file.stream, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store" } });
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? error.message : constructionActionMessage(error, "Documento indisponível.") }, { status: error instanceof AccessError ? error.status : 400 }); }
}
