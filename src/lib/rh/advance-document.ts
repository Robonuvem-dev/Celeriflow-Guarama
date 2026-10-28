import { z } from "zod";
import { and, asc, eq, inArray, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { requireHrPortalRequest } from "@/db/repositories/personnel/workforce";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertTravelAllowanceAccess } from "./travel-allowance";

/** Reads preserved snapshots and all report rounds, including reversed evidence. */
export async function buildMunicipalAdvanceDocument(database: DatabaseExecutor, context: AppContext, requestId: string) {
  const request = await requireHrPortalRequest(database, requestId);
  assertTravelAllowanceAccess(request.payload, context, "issueReports");
  if (request.kind !== "ADIANTAMENTO") throw new Error("Selecione uma solicitação de adiantamento municipal.");
  const memory = z.object({ input: z.object({ budgetUnitId: z.string(), purpose: z.string(), date: z.string(), reportDueDate: z.string() }), assessment: z.object({ amountBRL: z.string() }), contract: z.object({ registration: z.string(), employee: z.object({ name: z.string(), personId: z.string() }) }) }).parse(request.payload);
  const { rows: [unit] } = await database.execute<{ code: string; name: string; entityName: string | null }>(sql`SELECT u.code,u.name,e.name AS "entityName" FROM "BudgetUnit" u LEFT JOIN "PlanningEntityUnit" p ON p."budgetUnitId"=u.id LEFT JOIN "GovernmentEntity" e ON e.id=p."governmentEntityId" WHERE u.id=${memory.input.budgetUnitId}`);
  if (!unit) throw new Error("UG não encontrada.");
  const events = await database.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.environment, "PRODUCAO"), or(inArray(hrIntegrationEvents.sourceKey, [`DIARIA:PROCESSO:${request.id}`, `DIARIA:DECISAO:${request.id}`, `FINANCEIRO:DIARIA:PROCESSO:${request.id}`, `ADIANTAMENTO:CONCESSAO:${request.id}`]), sql`starts_with(${hrIntegrationEvents.sourceKey}, ${`ADIANTAMENTO:PRESTACAO:${request.id}`})`, sql`starts_with(${hrIntegrationEvents.sourceKey}, ${`ADIANTAMENTO:REVISAO:${request.id}`})`, sql`starts_with(${hrIntegrationEvents.sourceKey}, ${`ADIANTAMENTO:REABERTURA:${request.id}:`})`, and(inArray(hrIntegrationEvents.eventType, ["ADIANTAMENTO_PAGAMENTO_ESTORNADO", "ADIANTAMENTO_RESTITUICAO_RECEBIDA", "ADIANTAMENTO_RESTITUICAO_ESTORNADA"]), sql`${hrIntegrationEvents.payload}->>'requestId' = ${request.id}`)))).orderBy(asc(hrIntegrationEvents.createdAt), asc(hrIntegrationEvents.id));
  // Exact keys and cycle suffixes avoid accidentally selecting another request with a shared prefix.
  const expenseRefunds = await database.select().from(hrIntegrationEvents).where(and(eq(hrIntegrationEvents.environment, "PRODUCAO"), sql`starts_with(${hrIntegrationEvents.sourceKey}, ${`ADIANTAMENTO:RESTITUICAO_DESPESA:${request.id}:`})`)).orderBy(asc(hrIntegrationEvents.createdAt), asc(hrIntegrationEvents.id));
  const scoped = [...events.filter(event => !event.sourceKey.startsWith("ADIANTAMENTO:PRESTACAO:") && !event.sourceKey.startsWith("ADIANTAMENTO:REVISAO:") || ["PRESTACAO", "REVISAO"].some(stage => event.sourceKey === `ADIANTAMENTO:${stage}:${request.id}` || event.sourceKey.startsWith(`ADIANTAMENTO:${stage}:${request.id}:CICLO:`))), ...expenseRefunds].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const rows: string[][] = [["Solicitação", request.id], ["Ente", unit.entityName ?? ""], ["UG", `${unit.code} — ${unit.name}`], ["Servidor", memory.contract.employee.name], ["Matrícula", memory.contract.registration], ["Finalidade", memory.input.purpose], ["Valor concedido BRL", memory.assessment.amountBRL], ["Data de concessão solicitada", memory.input.date], ["Prazo de prestação", memory.input.reportDueDate], ["Situação atual", request.status]];
  for (const event of scoped) {
    const payload = event.payload as Record<string, unknown>;
    const input = payload.input as Record<string, unknown> | undefined;
    rows.push([`${event.eventType} · ${event.status}`, `${event.createdAt.toISOString()} · ${event.id}`]);
    for (const field of ["date", "documentId", "activities", "spentAmount", "returnedAmount", "restitutionRevenueId", "amount", "requestKey", "decision", "reason", "authorizationNumber"]) if (input?.[field] !== undefined) rows.push([field, String(input[field])]);
    for (const field of ["protocolNumber", "processId", "commitmentId", "transactionId", "paymentId", "revenueId", "reversalId", "documentId", "returnedTotal", "reason", "previousReportId", "previousReviewId", "originalPaymentId", "correctionPaymentId", "correctionSettlementId", "treasuryMovementId", "transactionIds", "refundId"]) if (payload[field] !== undefined) rows.push([field, String(payload[field])]);
    if (event.result) rows.push(["Referências da etapa", JSON.stringify(event.result)]);
  }
  return { title: "Adiantamento municipal — concessão e histórico da prestação", headers: ["Campo / etapa", "Valor / evidência"], rows };
}
