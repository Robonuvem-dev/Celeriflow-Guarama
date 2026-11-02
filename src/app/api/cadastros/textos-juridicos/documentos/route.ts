import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { legalTexts, legalTextVersions } from "@/db/schema/master-data";
import { legalTextDocuments } from "@/db/schema/legal-documents";
import { documentVersions } from "@/db/schema/document-workflow";
import { bindLegalDocument, listLegalDocuments, requireLegalDocumentSchema } from "@/db/repositories/registry/legal-documents";
import { listManagedDocuments, requireManagedDocument } from "@/db/repositories/documents/ged";
import { getGedContext } from "@/lib/documents/ged-access";
import { gedQuerySchema } from "@/lib/documents/ged-policy";
import { AccessError, getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { LegalDocumentError, legalDocumentInput } from "@/lib/cadastros/legal-document-policy";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" };
async function context(write = false) {
  const legal = write ? await getTenantContextForModuleOperation("CADASTROS", "update") : await getTenantContextForModule("CADASTROS");
  const ged = await getGedContext("read");
  if (ged.user.id !== legal.user.id || (ged.database && ged.database !== databaseConnection.db) || (legal.database && legal.database !== databaseConnection.db)) throw new AccessError("Contexto documental incompatível.", 403);
  return ged;
}
function failure(error: unknown) {
  if (error instanceof AccessError || error instanceof LegalDocumentError) return Response.json({ error: error.message }, { status: error.status, headers });
  if (error instanceof z.ZodError) return Response.json({ error: "Confira os campos informados." }, { status: 400, headers });
  console.error("[CF33 documento]", { name: error instanceof Error ? error.name : "Unknown" });
  return Response.json({ error: "Não foi possível concluir a operação documental." }, { status: 400, headers });
}
export async function GET(request: Request) {
  try {
    const actor = await context();
    const p = new URL(request.url).searchParams;
    const legalTextId = z.string().min(1).max(100).parse(p.get("legalTextId"));
    const page = z.coerce.number().int().positive().max(100000).parse(p.get("page") || 1);
    const number = p.get("version") ? z.coerce.number().int().positive().max(Number.MAX_SAFE_INTEGER).parse(p.get("version")) : undefined;
    const view = z.enum(["linked", "available"]).parse(p.get("view") || "linked");
    const data = await withDatabaseTransaction(databaseConnection, async tx => {
      await requireLegalDocumentSchema(tx);
      const [legal] = await tx.select({ id: legalTexts.id, type: legalTexts.type, number: legalTexts.number, summary: legalTexts.summary }).from(legalTexts).where(eq(legalTexts.id, legalTextId));
      if (!legal) throw new LegalDocumentError("Texto jurídico não encontrado.", 404);
      const [current] = await tx.select().from(legalTextVersions).where(eq(legalTextVersions.legalTextId, legalTextId)).orderBy(desc(legalTextVersions.versionNumber)).limit(1);
      const selected = number ? (await tx.select().from(legalTextVersions).where(and(eq(legalTextVersions.legalTextId, legalTextId), eq(legalTextVersions.versionNumber, number))).limit(1))[0] : current;
      if (!selected || !current) throw new LegalDocumentError("Versão jurídica não encontrada.", 404);
      if (p.get("download")) {
        const [link] = await tx.select({ documentId: documentVersions.documentId, versionId: documentVersions.id }).from(legalTextDocuments).innerJoin(documentVersions, eq(documentVersions.id, legalTextDocuments.documentVersionId)).where(and(eq(legalTextDocuments.id, z.string().max(100).parse(p.get("download"))), eq(legalTextDocuments.legalTextVersionId, selected.id))).limit(1);
        if (!link) throw new LegalDocumentError("Vínculo não encontrado.", 404);
        await requireManagedDocument(actor, link.documentId, tx);
        return { download: link };
      }
      const linked = view === "linked" ? await listLegalDocuments(tx, actor, selected.id, page) : null;
      const [original] = selected.documentId ? await tx.select({ id: legalTextDocuments.id }).from(legalTextDocuments).where(and(eq(legalTextDocuments.legalTextVersionId, selected.id), eq(legalTextDocuments.role, "ORIGINAL"))).limit(1) : [];
      return { legal, version: { id: selected.id, number: selected.versionNumber }, currentVersion: current.versionNumber, legacyOriginal: !!selected.documentId && !original, linked };
    }, { isolationLevel: "repeatable read", accessMode: "read only" });
    if ("download" in data && data.download) {
      const url = new URL("/api/assinatura-digital/ged/download", request.url);
      url.searchParams.set("items", JSON.stringify([{ id: data.download.documentId, versionId: data.download.versionId }]));
      return new Response(null, { status: 303, headers: { ...headers, Location: url.toString() } });
    }
    const available = view === "available" ? await listManagedDocuments(actor, gedQuerySchema.parse({ text: p.get("q") || "", mode: "fragment" }), page) : null;
    return Response.json({ ...data, available }, { headers });
  } catch (error) { return failure(error); }
}
export async function POST(request: Request) {
  try {
    if (request.headers.get("origin") !== new URL(request.url).origin) throw new AccessError("Origem não permitida.", 403);
    const actor = await context(true);
    const body = await request.text(); if (body.length > 4096) throw new LegalDocumentError("Dados excedem o limite da operação.");
    const input = legalDocumentInput.parse(JSON.parse(body));
    const id = await withDatabaseTransaction(databaseConnection, tx => bindLegalDocument(tx, actor, input));
    return Response.json({ id }, { headers });
  } catch (error) { return failure(error); }
}
