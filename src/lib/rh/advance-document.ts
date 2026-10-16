import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertTravelAllowanceAccess } from "./travel-allowance";

/** Reads preserved snapshots and all report rounds, including reversed evidence. */
export async function buildMunicipalAdvanceDocument(context: AppContext, requestId: string) {
  const request = await context.prisma.hrPortalRequest.findUniqueOrThrow({ where: { id: requestId } });
  assertTravelAllowanceAccess(request.payload, context, "issueReports");
  if (request.kind !== "ADIANTAMENTO") throw new Error("Selecione uma solicitação de adiantamento municipal.");
  const memory = z.object({ input: z.object({ budgetUnitId: z.string(), purpose: z.string(), date: z.string(), reportDueDate: z.string() }), assessment: z.object({ amountBRL: z.string() }), contract: z.object({ registration: z.string(), employee: z.object({ name: z.string(), personId: z.string() }) }) }).parse(request.payload);
  const unit = await context.prisma.budgetUnit.findUniqueOrThrow({ where: { id: memory.input.budgetUnitId }, include: { planningEntityUnit: { include: { governmentEntity: true } } } });
  const events = await context.prisma.hrIntegrationEvent.findMany({ where: { environment: "PRODUCAO", OR: [{ sourceKey: `DIARIA:PROCESSO:${request.id}` }, { sourceKey: `DIARIA:DECISAO:${request.id}` }, { sourceKey: `FINANCEIRO:DIARIA:PROCESSO:${request.id}` }, { sourceKey: { startsWith: `ADIANTAMENTO:PRESTACAO:${request.id}` } }, { sourceKey: { startsWith: `ADIANTAMENTO:REVISAO:${request.id}` } }, { sourceKey: { startsWith: `ADIANTAMENTO:REABERTURA:${request.id}:` } }, { sourceKey: `ADIANTAMENTO:CONCESSAO:${request.id}` }, { eventType: { in: ["ADIANTAMENTO_PAGAMENTO_ESTORNADO", "ADIANTAMENTO_RESTITUICAO_RECEBIDA", "ADIANTAMENTO_RESTITUICAO_ESTORNADA"] }, payload: { path: ["requestId"], equals: request.id } }] }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  // Exact keys and cycle suffixes avoid accidentally selecting another request with a shared prefix.
  const expenseRefunds = await context.prisma.hrIntegrationEvent.findMany({ where: { environment: "PRODUCAO", sourceKey: { startsWith: `ADIANTAMENTO:RESTITUICAO_DESPESA:${request.id}:` } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const scoped = [...events.filter(event => !event.sourceKey.startsWith("ADIANTAMENTO:PRESTACAO:") && !event.sourceKey.startsWith("ADIANTAMENTO:REVISAO:") || ["PRESTACAO", "REVISAO"].some(stage => event.sourceKey === `ADIANTAMENTO:${stage}:${request.id}` || event.sourceKey.startsWith(`ADIANTAMENTO:${stage}:${request.id}:CICLO:`))), ...expenseRefunds].sort((a, b) => a.createdAt.getTime() - b.createdAt.getTime() || a.id.localeCompare(b.id));
  const rows: string[][] = [["Solicitação", request.id], ["Ente", unit.planningEntityUnit?.governmentEntity.name ?? ""], ["UG", `${unit.code} — ${unit.name}`], ["Servidor", memory.contract.employee.name], ["Matrícula", memory.contract.registration], ["Finalidade", memory.input.purpose], ["Valor concedido BRL", memory.assessment.amountBRL], ["Data de concessão solicitada", memory.input.date], ["Prazo de prestação", memory.input.reportDueDate], ["Situação atual", request.status]];
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
