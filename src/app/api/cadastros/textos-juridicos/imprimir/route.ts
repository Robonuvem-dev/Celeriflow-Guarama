import { and, desc, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "@/db/client";
import { legalTexts, legalTextVersions } from "@/db/schema/master-data";
import { AccessError, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { renderLegalTextPrint } from "@/lib/cadastros/legal-text-print";

import { listLegalTextComments } from "@/db/repositories/registry/legal-text-comments";
import { listLegalTextRelations } from "@/db/repositories/registry/legal-text-relations";

export const dynamic = "force-dynamic";
const headers = { "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff", "Content-Security-Policy": "default-src 'none'; style-src 'unsafe-inline'; base-uri 'none'; frame-ancestors 'none'; form-action 'none'" };
export async function GET(request: Request) {
  try {
    const context = await getTenantContextForModule("CADASTROS");
    const query = new URL(request.url).searchParams;
    const id = z.string().min(1).max(100).parse(query.get("legalTextId"));
    const version = query.has("version") ? z.coerce.number().int().positive().max(2147483647).parse(query.get("version")) : undefined;
    const database = context.database ?? db;
    const [record] = await database.select({ type: legalTexts.type, number: legalTexts.number, governmentLevel: legalTexts.governmentLevel, issuingBody: legalTexts.issuingBody, summary: legalTextVersions.summary, content: legalTextVersions.content, versionNumber: legalTextVersions.versionNumber, publicationDate: legalTextVersions.publicationDate }).from(legalTextVersions).innerJoin(legalTexts, eq(legalTexts.id, legalTextVersions.legalTextId)).where(and(eq(legalTexts.id, id), version === undefined ? undefined : eq(legalTextVersions.versionNumber, version))).orderBy(desc(legalTextVersions.versionNumber)).limit(1);
    if (!record) return Response.json({ error: "Versão jurídica não encontrada." }, { status: 404, headers });
    const [relations, comments] = query.get("modo") === "consulta"
      ? await Promise.all([listLegalTextRelations(database, id), listLegalTextComments(database, id)])
      : [undefined, undefined];
    return new Response(renderLegalTextPrint(record, relations, comments), { headers: { ...headers, "Content-Type": "text/html; charset=utf-8" } });
  } catch (error) {
    if (error instanceof AccessError) return Response.json({ error: error.message }, { status: error.status, headers });
    if (error instanceof z.ZodError) return Response.json({ error: "Confira o texto e a versão solicitados." }, { status: 400, headers });
    return Response.json({ error: "Não foi possível preparar a impressão." }, { status: 500, headers });
  }
}
