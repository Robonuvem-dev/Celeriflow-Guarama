import { eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { hrPortalRequests } from "@/db/schema/personnel-workforce";
import { lockPersonnel } from "@/db/repositories/personnel/integration";
import { requireHrPortalRequest } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { enqueueHrIntegration } from "./workforce-service";

const requestSchema = z.object({ requestKey: z.string().min(1).max(160), kind: z.enum(["CORRECAO_CADASTRAL", "FERIAS", "DOCUMENTO", "BENEFICIO"]), description: z.string().trim().min(10).max(4000) }).strict();

export async function submitEmployeeHrRequest(db: DatabaseConnection, actorId: string, employeeId: string, raw: unknown) {
  const input = requestSchema.parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, `request:${input.requestKey}`);
    const [employee] = await tx.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
    if (!employee) throw new Error("Servidor não encontrado.");
    if (!employee.isActive) throw new Error("Cadastro funcional inativo.");
    const [previous] = await tx.select().from(hrPortalRequests).where(eq(hrPortalRequests.requestKey, input.requestKey)).limit(1);
    if (previous) {
      if (previous.employeeId !== employeeId || previous.kind !== input.kind || (previous.payload as { description?: string }).description !== input.description) throw new Error("Chave da solicitação reutilizada com outros dados.");
      return previous;
    }
    const [request] = await tx.insert(hrPortalRequests).values({ requestKey: input.requestKey, employeeId, kind: input.kind, actorId, payload: { description: input.description } }).returning();
    return request;
  });
}

export async function decideEmployeeHrRequest(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ requestId: z.string().min(1), status: z.enum(["DEFERIDA", "INDEFERIDA"]), decision: z.string().trim().min(10).max(4000) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await tx.execute(sql`SELECT id FROM "HrPortalRequest" WHERE id=${input.requestId} FOR UPDATE`);
    const request = await requireHrPortalRequest(tx, input.requestId);
    if (request.kind === "ACESSO_PORTAL") throw new Error("Provisionamento de acesso depende da rotina de identidade e não pode ser deferido por este formulário.");
    if (request.kind.startsWith("FUNCIONAL_")) throw new Error("Requerimento protocolado exige análise e execução pelo fluxo funcional próprio.");
    if (request.kind === "RECADASTRAMENTO") throw new Error("Recadastramento exige revisão do diff e atualização canônica pelo fluxo próprio.");
    if (request.kind === "CREDITO_CONSIGNADO") throw new Error("Crédito consignado exige decisão e reserva transacional pelo fluxo próprio.");
    if (request.kind === "DIARIA_POC") throw new Error("Diária exige autorização numerada pelo fluxo próprio.");
    if (["AVALIACAO_FUNCIONAL", "CAPACITACAO_INSCRICAO"].includes(request.kind)) throw new Error("Capacitação e avaliação exigem reconhecimento/publicação no fluxo próprio de atividades funcionais.");
    if (request.status !== "EM_ANALISE") {
      if (request.status === input.status && request.decision === input.decision) return request;
      throw new Error("Solicitação já decidida; o histórico foi preservado.");
    }
    const decidedAt = new Date();
    const [updated] = await tx.update(hrPortalRequests).set({ status: input.status, decision: input.decision, decidedBy: actorId, decidedAt }).where(eq(hrPortalRequests.id, request.id)).returning();
    await enqueueHrIntegration(tx, { sourceKey: `DECISAO_PORTAL:${request.id}`, domain: "PORTAL", environment: "INTERNO", eventType: "SOLICITACAO_DECIDIDA", payload: { requestId: request.id, employeeId: request.employeeId, actorId, status: input.status, decision: input.decision, decidedAt, appliedToFunctionalRecord: false } });
    return updated;
  });
}
