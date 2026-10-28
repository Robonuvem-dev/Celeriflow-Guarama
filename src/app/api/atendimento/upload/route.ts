import { NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { AccessError } from "@/lib/platform/tenant-context";
import { getAttendanceOperationalContextForOperation, getOmbudsmanOperationalContextForOperation } from "@/lib/attendance/access";
import { uploadFile } from "@/lib/platform/blob";
import { and, eq } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { ticketScopeCondition, ombudsmanScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { tickets, ombudsmans, ticketDocuments, ombudsmanDocuments, ticketAuditLogs, ombudsmanAuditLogs } from "@/db/schema/attendance-portals";
import { documents } from "@/db/schema/registry";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file");
    const entityType = String(formData.get("entityType") || "");
    const entityId = String(formData.get("entityId") || "");
    const title = String(formData.get("title") || "").trim();
    const documentType = String(formData.get("documentType") || "Anexo").trim() || "Anexo";
    const purpose = String(formData.get("purpose") || "").trim() || null;
    if (!(file instanceof File) || !entityId || !title || !["ticket", "ombudsman"].includes(entityType)) {
      return NextResponse.json({ error: "Informe o registro, titulo e arquivo do anexo." }, { status: 400 });
    }
    const context = entityType === "ombudsman"
      ? await getOmbudsmanOperationalContextForOperation("update")
      : await getAttendanceOperationalContextForOperation("update");

    if (entityType === "ticket") {
      const [ticket] = await db.select({ id: tickets.id }).from(tickets).where(and(eq(tickets.id, entityId), ticketScopeCondition(context))).limit(1);
      if (!ticket) throw new AccessError("Chamado nao encontrado ou sem acesso.", 403);
    } else {
      if (!context.attendanceAccess.isOmbudsman) throw new AccessError("Somente a Ouvidoria pode anexar evidencias.", 403);
      const [ombudsman] = await db.select({ id: ombudsmans.id }).from(ombudsmans).where(and(eq(ombudsmans.id, entityId), ombudsmanScopeCondition(context))).limit(1);
      if (!ombudsman) throw new AccessError("Manifestacao nao encontrada ou sem acesso.", 403);
    }

    const blob = await uploadFile(file);
    const document = await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [created] = await tx.insert(documents).values({ title, documentType, fileUrl: blob.url, status: "Válido", notes: `Anexo de ${entityType === "ticket" ? "atendimento" : "manifestacao de Ouvidoria"}.` }).returning({ id: documents.id });
      if (entityType === "ticket") {
        await tx.insert(ticketDocuments).values({ ticketId: entityId, documentId: created.id, employeeId: context.employee.id, purpose });
        await tx.insert(ticketAuditLogs).values({ ticketId: entityId, userId: context.user.id, employeeId: context.employee.id, action: "DOCUMENT_ADDED", details: { documentId: created.id, purpose } });
      } else {
        await tx.insert(ombudsmanDocuments).values({ ombudsmanId: entityId, documentId: created.id, employeeId: context.employee.id, purpose });
        await tx.insert(ombudsmanAuditLogs).values({ ombudsmanId: entityId, userId: context.user.id, employeeId: context.employee.id, action: "DOCUMENT_ADDED", details: { documentId: created.id, purpose } });
      }
      return created;
    }, { timeoutMs: 5_000 });
    if (entityType === "ticket") {
      revalidatePath(`/atendimento/chamados/${entityId}`);
    } else {
      revalidatePath(`/atendimento/ouvidoria/${entityId}`);
      revalidatePath(`/protocolos/ouvidoria/${entityId}`);
    }
    return NextResponse.json({ id: document.id }, { status: 201 });
  } catch (error) {
    if (error instanceof AccessError) return NextResponse.json({ error: error.message }, { status: error.status });
    return NextResponse.json({ error: error instanceof Error ? error.message : "Erro ao anexar arquivo." }, { status: 400 });
  }
}
