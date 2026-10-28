import { NextRequest, NextResponse } from "next/server";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { and, eq, gte, isNotNull, isNull, lte, notInArray } from "drizzle-orm";
import { processes as processTable } from "@/db/schema/processes";
import { users } from "@/db/schema/identity";
import { notifyProtocolDepartment } from "@/lib/protocols/notifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const secret = process.env.CRON_SECRET || process.env.PROTOCOLS_CRON_SECRET;
  if (!secret) return NextResponse.json({ error: "Cron secret is not configured." }, { status: 503 });
  if (request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const actorUsuarioId = process.env.NOTIFICATION_SYSTEM_ACTOR_USER_ID?.trim();
  if (!actorUsuarioId) {
    return NextResponse.json({ error: "NOTIFICATION_SYSTEM_ACTOR_USER_ID is not configured." }, { status: 503 });
  }
  const [technicalActor] = await db.select({ id: users.id }).from(users).where(and(eq(users.id, actorUsuarioId), eq(users.ativo, true))).limit(1);
  if (!technicalActor) {
    return NextResponse.json({ error: "Configured notification system actor is not active." }, { status: 503 });
  }

  const now = new Date();
  const horizon = new Date(now.getTime() + 3 * 86_400_000);
  const processes = await db.select({ id: processTable.id, protocolNumber: processTable.protocolNumber, currentDepartmentId: processTable.currentDepartmentId, expectedCompletionAt: processTable.expectedCompletionAt }).from(processTable).where(and(gte(processTable.expectedCompletionAt, now), lte(processTable.expectedCompletionAt, horizon), isNull(processTable.completedAt), isNull(processTable.archivedAt), notInArray(processTable.status, ["Concluido", "Concluído", "Arquivado", "Cancelado"]), isNotNull(processTable.currentDepartmentId))).limit(500);

  let created = 0;
  for (const process of processes) {
    const deadline = process.expectedCompletionAt!;
    const result = await withDatabaseTransaction(databaseConnection, (tx) => notifyProtocolDepartment(tx, technicalActor.id, process.currentDepartmentId!, {
      processId: process.id,
      type: "DEADLINE_REMINDER",
      title: `Prazo proximo: ${process.protocolNumber}`,
      message: `O prazo previsto e ${deadline.toLocaleDateString("pt-BR")}.`,
      priority: "ALTA",
      dedupeDiscriminator: `DEADLINE_REMINDER:${deadline.toISOString()}`,
    }), { timeoutMs: 5_000 });
    created += result.created;
  }

  return NextResponse.json({ checked: processes.length, created });
}
