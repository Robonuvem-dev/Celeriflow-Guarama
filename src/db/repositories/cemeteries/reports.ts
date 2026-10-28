import type { JsonValue } from "../../json";
import type { DatabaseConnection } from "../../connection";
import { withDatabaseTransaction } from "../../transaction";
import { cemeteryChangeHistory } from "../../schema/cemeteries";
import { insertAuditEvent } from "../platform/audit";

export async function recordCemeteryReport(connection: DatabaseConnection, input: { id: string; actorId: string; fieldName: "emissao" | "emissao_pdf"; evidence: JsonValue }): Promise<void> {
  await withDatabaseTransaction(connection, async tx => {
    await tx.insert(cemeteryChangeHistory).values({ targetType: "RELATORIO_SEPULTADOS", targetId: input.id, fieldName: input.fieldName, newValue: input.evidence, actorUsuarioId: input.actorId });
    await insertAuditEvent(tx, { actorUsuarioId: input.actorId, eventType: "REPORT_ISSUED", targetType: "CEMETERY_REPORT", targetId: input.id });
  });
}
