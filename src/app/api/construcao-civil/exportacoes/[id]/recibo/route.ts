import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { z } from "zod";
import { getTenantContextForModuleOperation, getTenantContextForModule, AccessError } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { uploadProcessFile, getFile } from "@/lib/platform/blob";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

export const runtime = "nodejs";
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new AccessError("Recibo restrito ao gestor.", 403);
    const where = { id, ...(access.administrator ? {} : { scope: access.departmentId || "", items: { every: { case: constructionCaseWhere(access) } } }) };
    if (!await context.prisma.constructionFederalExport.findFirst({ where, select: { id: true } })) throw new AccessError("Lote indisponível.", 404);
    const form = await request.formData();
    const data = z.object({ protocol: z.string().trim().min(2).max(160), destination: z.string().trim().min(3).max(300), submittedAt: z.iso.datetime(), notes: z.string().trim().min(10).max(2000) }).parse({ protocol: form.get("protocol"), destination: form.get("destination"), submittedAt: form.get("submittedAt"), notes: form.get("notes") });
    const file = form.get("file"); if (!(file instanceof File) || file.size > 10 * 1024 * 1024 || !["application/pdf", "image/jpeg", "image/png"].includes(file.type)) throw new Error("Anexe comprovante PDF/JPG/PNG de até 10 MB.");
    const evidenceHash = createHash("sha256").update(Buffer.from(await file.arrayBuffer())).digest("hex"); const blob = await uploadProcessFile(file);
    const receipt = await context.prisma.$transaction(async (tx) => {
      if (!await tx.constructionFederalExport.findFirst({ where, select: { id: true } })) throw new AccessError("Lote indisponível.", 404);
      const saved = await tx.constructionFederalExportReceipt.create({ data: { ...data, submittedAt: new Date(data.submittedAt), exportId: id, evidenceUrl: blob.url, evidenceHash, createdBy: context.user.id } });
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionFederalExportReceipt", targetId: saved.id }); return saved;
    });
    return NextResponse.json({ id: receipt.id });
  } catch (error) { return NextResponse.json({ error: error instanceof Error && !error.name.startsWith("Prisma") ? error.message : "Não foi possível registrar o recibo." }, { status: error instanceof AccessError ? error.status : 400 }); }
}

export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new AccessError("Recibo restrito ao gestor.", 403);
    const row = await context.prisma.constructionFederalExportReceipt.findFirst({ where: { id: request.nextUrl.searchParams.get("receiptId") || "", exportId: id, export: access.administrator ? {} : { scope: access.departmentId || "", items: { every: { case: constructionCaseWhere(access) } } } } });
    if (!row) throw new AccessError("Recibo indisponível.", 404);
    const file = await getFile(row.evidenceUrl); if (!file?.stream) throw new AccessError("Comprovante indisponível.", 404);
    const reader = file.stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const chunk = await reader.read(); if (chunk.done) break; size += chunk.value.length; if (size > 10 * 1024 * 1024) throw new Error("Comprovante excede limite."); chunks.push(chunk.value); } } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks); if (createHash("sha256").update(bytes).digest("hex") !== row.evidenceHash) throw new Error("Hash divergente.");
    return new NextResponse(bytes, { headers: { "Content-Type": file.blob.contentType || "application/octet-stream", "Content-Disposition": "attachment; filename=\"comprovante-envio\"", "Cache-Control": "private, no-store", "X-Content-SHA256": row.evidenceHash } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível verificar e baixar o comprovante." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
