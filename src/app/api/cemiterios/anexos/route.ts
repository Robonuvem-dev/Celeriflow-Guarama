import { NextRequest, NextResponse } from "next/server";
import { db, databaseConnection } from "@/db/client";
import { createHash } from "node:crypto";
import { z } from "zod";
import { del } from "@vercel/blob";
import { DrizzleQueryError } from "drizzle-orm/errors";
import { AccessError, getTenantContextForModule, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { uploadProcessFile } from "@/lib/platform/blob";
import { assertCemeteryAttachmentTarget, cemeteryAttachmentTargetSchema, ingestCemeteryAttachment, listCemeteryAttachments } from "@/lib/cemeteries/attachments";
export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  try {
    await getTenantContextForModule("CEMITERIOS");
    const target = cemeteryAttachmentTargetSchema.parse(Object.fromEntries(request.nextUrl.searchParams));
    const page = z.coerce.number().int().min(1).parse(request.nextUrl.searchParams.get("page") || 1);
    return NextResponse.json(await listCemeteryAttachments(db, target, page), { headers: { "Cache-Control": "private, no-store" } });
  } catch (e) { return NextResponse.json({ error: e instanceof AccessError ? e.message : "Consulta inválida." }, { status: e instanceof AccessError ? e.status : 400 }); }
}
export async function POST(request: NextRequest) {
  let orphan: string | null = null;
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new AccessError("Origem inválida.", 403);
    const context = await getTenantContextForModuleOperation("CEMITERIOS", "create");
    const form = await request.formData();
    const target = cemeteryAttachmentTargetSchema.parse({ targetType: form.get("targetType"), targetId: form.get("targetId") });
    await assertCemeteryAttachmentTarget(db, target);
    const requestKey = z.uuid().parse(form.get("requestKey"));
    const title = z.string().trim().min(1).max(180).parse(form.get("title"));
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Selecione PDF, JPG ou PNG.");
    const uploaded = await uploadProcessFile(file); orphan = uploaded.url;
    const hashSha256 = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
    const result = await ingestCemeteryAttachment(databaseConnection, context.user.id, target, { requestKey, title, fileUrl: uploaded.url, hashSha256 });
    if (!result.created) await del(uploaded.url).catch(() => undefined);
    orphan = null;
    return NextResponse.json(result);
  } catch (e) {
    if (orphan) await del(orphan).catch(() => undefined);
    return NextResponse.json({ error: e instanceof AccessError ? e.message : e instanceof Error && !(e instanceof DrizzleQueryError) ? e.message : "Não foi possível gravar o anexo." }, { status: e instanceof AccessError ? e.status : 400 });
  }
}
