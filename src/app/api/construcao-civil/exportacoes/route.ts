import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { getTenantContextForModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionExportRecords, persistConstructionExport } from "@/lib/obras/construction-export-service";
import { exportRequestSchema, validateExportRecords } from "@/lib/obras/construction-export";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { constructionActionMessage } from "@/lib/obras/construction-errors";

export const runtime = "nodejs";
export async function POST(request: NextRequest) {
  try {
    const context = await getTenantContextForModuleOperation("OBRAS", "update"); const access = await resolveConstructionAccess(context);
    if (!access.administrator && !access.roles.includes("MANAGER")) throw new AccessError("Exportação restrita ao gestor.", 403);
    const raw = await request.json(); const input = exportRequestSchema.parse(raw);
    if (raw.validateOnly === true) {
      const records = await constructionExportRecords(databaseConnection.db, access, input.caseIds);
      return NextResponse.json({ validation: validateExportRecords(records, input.period) });
    }
    const row = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const saved = await persistConstructionExport(tx, access, context.user.id, input);
      await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "ConstructionFederalExport", targetId: saved.id });
      return saved;
    });
    return NextResponse.json({ id: row.id, hash: row.hashSha256 });
  } catch (error) { return NextResponse.json({ error: error instanceof z.ZodError ? error.message : constructionActionMessage(error, "Não foi possível gerar o lote.") }, { status: error instanceof AccessError ? error.status : 400 }); }
}
