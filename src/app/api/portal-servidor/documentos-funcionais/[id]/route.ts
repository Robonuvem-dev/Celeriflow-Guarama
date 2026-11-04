import { NextRequest, NextResponse } from "next/server";
import { AccessError } from "@/lib/platform/tenant-context";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { readOwnGeneratedDocument } from "@/lib/portal-servidor/generated-documents";
import { db } from "@/db/client";
import { recordEmployeePortalActivity, employeePortalRequestMetadata } from "@/lib/portal-servidor/activity-audit";
export const runtime = "nodejs";
export async function GET(_request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try { const access = await getEmployeePortalAccess(); if (access.status !== "AVAILABLE") throw new AccessError("Acesso funcional indisponível.", 403); const document = await readOwnGeneratedDocument(access.context, (await params).id); if (document.artifact.input.kind === "IRRF_ANUAL") await recordEmployeePortalActivity(access.context.database ?? db, { action: "INCOME_STATEMENT_PRINT", userId: access.context.user.id, employeeId: access.employee.id, targetId: (await params).id, ...employeePortalRequestMetadata(_request) }); return new NextResponse(document.bytes, { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${document.artifact.input.kind.toLowerCase()}.pdf"`, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } }); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Emissão indisponível." }, { status: error instanceof AccessError ? error.status : 400, headers: { "Cache-Control": "private, no-store" } }); }
}
