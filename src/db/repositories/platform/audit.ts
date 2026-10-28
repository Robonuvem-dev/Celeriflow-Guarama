import type { AuditEventInput } from "@/lib/contracts/audit";
import type { DatabaseExecutor } from "../../transaction";
import { auditEvents } from "../../schema/audit";

export async function insertAuditEvent(db: DatabaseExecutor, input: AuditEventInput): Promise<void> {
  await db.insert(auditEvents).values({
    actorUsuarioId: input.actorUsuarioId,
    eventType: input.eventType,
    targetType: input.targetType,
    targetId: input.targetId,
  });
}
