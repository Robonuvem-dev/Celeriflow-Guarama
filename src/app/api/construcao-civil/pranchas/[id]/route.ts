import { NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { db } from "@/db/client";
import { findConstructionPlanExtraction } from "@/db/repositories/infrastructure/construction-integrations";
import { getTenantContextForModule, AccessError } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { PLAN_MAX_BYTES } from "@/lib/obras/construction-extraction";

export const runtime = "nodejs";
export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params; const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
    const row = await findConstructionPlanExtraction(db, access, id);
    if (!row) throw new AccessError("Prancha indisponível.", 404);
    const file = await getFile(row.sourceUrl);
    if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    const reader = file.stream.getReader(); const chunks: Uint8Array[] = []; let size = 0;
    try { for (;;) { const part = await reader.read(); if (part.done) break; size += part.value.length; if (size > PLAN_MAX_BYTES) throw new Error("Arquivo excede limite."); chunks.push(part.value); } } finally { await reader.cancel(); }
    const bytes = Buffer.concat(chunks);
    if (createHash("sha256").update(bytes).digest("hex") !== row.sourceHash) throw new Error("Hash divergente do PDF extraído.");
    return new NextResponse(bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${downloadFilename(row.filename)}"`, "Cache-Control": "private, no-store", "X-Content-SHA256": row.sourceHash } });
  } catch (error) { return NextResponse.json({ error: error instanceof AccessError ? error.message : "Não foi possível verificar e baixar a prancha." }, { status: error instanceof AccessError ? error.status : 400 }); }
}
