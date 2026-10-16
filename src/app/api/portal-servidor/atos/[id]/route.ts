import { NextRequest, NextResponse } from "next/server";
import { createHash } from "node:crypto";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { getFile, downloadFilename } from "@/lib/platform/blob";
export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403);
    const act = await access.context.prisma.personnelAct.findFirst({ where: { id: (await params).id, employeeId: access.employee.id }, select: { documentUrl: true } });
    if (!act?.documentUrl) throw new AccessError("Ato sem arquivo disponibilizado na origem RH.", 404);
    const version = await access.context.prisma.documentVersion.findFirst({ where: { fileUrl: act.documentUrl, status: { in: ["FINAL", "SIGNED"] }, document: { status: "Válido" } }, select: { hashSha256: true } });
    if (!version) throw new AccessError("Vincule o arquivo do ato a uma versão GED válida.", 423);
    const file = await getFile(act.documentUrl); if (!file?.stream) throw new AccessError("Arquivo indisponível.", 404);
    const bytes = new Uint8Array(await new Response(file.stream).arrayBuffer()); if (createHash("sha256").update(bytes).digest("hex") !== version.hashSha256) throw new AccessError("Integridade documental inválida.", 423);
    return new NextResponse(bytes, { headers: { "Content-Type": file.blob.contentType || "application/pdf", "Content-Disposition": `attachment; filename="${downloadFilename(file.blob.pathname)}"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ato indisponível." }, { status: error instanceof AccessError ? error.status : 500, headers: { "Cache-Control": "private, no-store" } }); }
}
