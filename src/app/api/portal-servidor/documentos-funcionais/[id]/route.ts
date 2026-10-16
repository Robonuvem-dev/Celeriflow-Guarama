import { NextRequest, NextResponse } from "next/server";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { readOwnGeneratedDocument } from "@/lib/portal-servidor/generated-documents";
export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403); const document = await readOwnGeneratedDocument(access.context, (await params).id); return new NextResponse(document.bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${document.artifact.input.kind.toLowerCase()}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Emissão indisponível." }, { status: error instanceof AccessError ? error.status : 400, headers: { "Cache-Control": "private, no-store" } }); }
}
