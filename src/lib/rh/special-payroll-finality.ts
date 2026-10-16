import { z } from "zod";
import { AccessError, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { assertPayrollBudgetScope } from "./payroll-access";
import { payrollSnapshotHash } from "@/lib/portal-servidor/payroll-publication";
import { enqueueHrIntegration } from "./workforce-service";
export async function recognizeSpecialPayrollFinality(context: AppContext, raw: unknown) {
  const input = z.object({ statementId: z.string().min(1), proofVersionId: z.string().min(1), reference: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "RH", "issueReports")) throw new AccessError("Conferência de cálculo especial exige alteração e emissão RH.", 403);
  const statement = await context.prisma.hrPayrollStatement.findUniqueOrThrow({ where: { id: input.statementId }, include: { run: { include: { payroll: true } }, contract: { include: { employee: true } } } });
  await assertPayrollBudgetScope(context, statement.run.payrollId);
  if (!statement.contract.employee.personId) throw new Error("Vincule a pessoa física do servidor antes da conferência definitiva.");
  if (statement.run.scope !== "PRODUCAO" || statement.run.status !== "FECHADA" || statement.run.mode !== "OFICIAL" || !["Férias", "Rescisão"].includes(statement.run.payroll.type)) throw new Error("Conferência definitiva exige cálculo oficial fechado de produção do tipo férias/rescisão.");
  return context.prisma.$transaction(async tx => {
    const proof = await tx.documentVersion.findFirst({ where: { id: input.proofVersionId, status: "SIGNED", document: { status: { in: ["Válido", "Assinado"] }, personId: statement.contract.employee.personId } }, select: { hashSha256: true } });
    if (!proof) throw new Error("Documento de conferência do cálculo deve estar assinado e vinculado à pessoa do servidor.");
    const event = await enqueueHrIntegration(tx, { sourceKey: `RH:CALCULO_ESPECIAL_DEFINITIVO:${statement.id}`, domain: "RH", environment: "PRODUCAO", eventType: "CALCULO_ESPECIAL_CONFERIDO", payload: { ...input, employeeId: statement.contract.employeeId, statementHash: payrollSnapshotHash(statement), proofHash: proof.hashSha256, actorId: context.user.id, gross: statement.gross.toFixed(2), deductions: statement.deductions.toFixed(2), net: statement.net.toFixed(2) } });
    if (event.status === "REVOGADO") throw new Error("Conferência revogada exige nova versão de cálculo.");
    await tx.hrIntegrationEvent.update({ where: { id: event.id }, data: { status: "PROCESSADO" } });
    return event.id;
  });
}
