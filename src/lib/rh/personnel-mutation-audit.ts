import { randomUUID } from "node:crypto";
import type { DatabaseExecutor } from "@/db/transaction";
import { enqueueHrIntegration, personnelJson } from "@/db/repositories/personnel/integration";

/** Legacy projections keep their own before/after evidence, independently of their current row. */
export async function auditPersonnelMutation(tx: DatabaseExecutor, actorId: string, input: { employeeId: string; entity: string; id: string; operation: "INCLUIR" | "ALTERAR" | "EXCLUIR"; before: unknown; after: unknown }) {
  return enqueueHrIntegration(tx, { sourceKey: `CADASTRO_RH:${input.entity}:${input.id}:${randomUUID()}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "CADASTRO_LEGADO_ALTERADO", payload: personnelJson({ ...input, actorId }) });
}
