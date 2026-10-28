import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { getFile, downloadFilename } from "@/lib/platform/blob";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalFirst } from "@/db/repositories/portal-servidor/records";
export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const executor = access.context.database ?? db;
    const act = await portalFirst<{ documentUrl: string | null }>(executor, sql`SELECT "documentUrl" FROM "PersonnelAct" WHERE id=${(await params).id} AND "employeeId"=${access.employee.id} LIMIT 1`);
    if (!act?.documentUrl) throw new AccessError("Ato sem arquivo disponibilizado na origem RH.", 404);
    const version = await portalFirst<{ hashSha256: string }>(executor, sql`SELECT v."hashSha256" FROM "DocumentVersion" v JOIN "Document" d ON d.id=v."documentId" WHERE v."fileUrl"=${act.documentUrl} AND v.status IN ('FINAL','SIGNED') AND d.status='Válido' LIMIT 1`);
    if (!version) throw new AccessError("Vincule o arquivo do ato a uma versão GED válida.", 423);
    const file = await getFile(act.documentUrl); if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer()); if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new AccessError("Integridade documental inválida.", 423);
    return new NextResponse(bytes, { headers: { "Content-Type": file.blob.contentType || "application/pdf", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ato indisponível." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
}
