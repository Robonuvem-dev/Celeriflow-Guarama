import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { del } from "@vercel/blob";
import { z } from "zod";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionInternalUploadSchema, assertConstructionInternalOpeningActor, stageConstructionInternalDocument } from "@/lib/obras/construction-internal-documents";
import { uploadProcessFile } from "@/lib/platform/blob";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  let unreferencedBlob: string | null = null;
  try {
    if (request.headers.get("origin") !== request.nextUrl.origin) throw new AccessError("Origem inválida.", 403);
    const context = await getTenantContextForModuleOperation("OBRAS", "create");
    await getTenantContextForModuleOperation("PROCESSOS", "create");
    const access = await resolveConstructionAccess(context);
    await context.prisma.$transaction((tx) => assertConstructionInternalOpeningActor(tx, access));
    const form = await request.formData();
    const data = constructionInternalUploadSchema.parse({ requestKey: form.get("requestKey"), uploadKey: form.get("uploadKey"), formVersion: Number(form.get("formVersion")), label: form.get("label") });
    const file = form.get("file");
    if (!(file instanceof File)) throw new Error("Selecione um arquivo PDF, JPG ou PNG.");
    const blob = await uploadProcessFile(file); unreferencedBlob = blob.url;
    const hashSha256 = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex");
    const result = await context.prisma.$transaction((tx) => stageConstructionInternalDocument(tx, access, context.user.id, data, { fileUrl: blob.url, hashSha256, filename: file.name, mimeType: file.type }));
    if (!result.created) await del(blob.url, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
    unreferencedBlob = null;
    return NextResponse.json({ id: result.id, hashSha256 });
  } catch (error) {
    if (unreferencedBlob) await del(unreferencedBlob, { token: process.env.BLOB_READ_WRITE_TOKEN }).catch(() => undefined);
    return NextResponse.json({ error: error instanceof z.ZodError ? error.issues[0].message : error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível preparar o documento." }, { status: error instanceof AccessError ? error.status : 400 });
  }
}
