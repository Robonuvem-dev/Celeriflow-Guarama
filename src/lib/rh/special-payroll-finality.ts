import { z } from "zod";
import { AccessError, canPerformModuleOperation, type AppContext } from "@/lib/platform/tenant-context";
import { assertPayrollBudgetScope } from "./payroll-access";
import { payrollSnapshotHash } from "@/lib/portal-servidor/payroll-publication";
import { enqueueHrIntegration } from "./workforce-service";
import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { documents } from "@/db/schema/registry";
import { documentVersions } from "@/db/schema/document-workflow";
import { hrEmploymentContracts, hrIntegrationEvents, hrPayrollRuns, hrPayrollStatements, payrolls } from "@/db/schema/personnel-workforce";

export async function recognizeSpecialPayrollFinality(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = z.object({ statementId: z.string().min(1), proofVersionId: z.string().min(1), reference: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  if (!canPerformModuleOperation(context.user, "RH", "update") || !canPerformModuleOperation(context.user, "RH", "issueReports")) throw new AccessError("Conferência de cálculo especial exige alteração e emissão RH.", 403);
  const [row] = await connection.db.select({ statement: hrPayrollStatements, run: hrPayrollRuns, payroll: payrolls, contract: hrEmploymentContracts, employee: employees }).from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId)).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(eq(hrPayrollStatements.id, input.statementId)).limit(1);
  if (!row) throw new Error("Demonstrativo não encontrado.");
  const statement = { ...row.statement, run: { ...row.run, payroll: row.payroll }, contract: { ...row.contract, employee: row.employee } };
  await assertPayrollBudgetScope({ ...context, database: connection.db }, statement.run.payrollId);
  if (!statement.contract.employee.personId) throw new Error("Vincule a pessoa física do servidor antes da conferência definitiva.");
  if (statement.run.scope !== "PRODUCAO" || statement.run.status !== "FECHADA" || statement.run.mode !== "OFICIAL" || !["Férias", "Rescisão"].includes(statement.run.payroll.type)) throw new Error("Conferência definitiva exige cálculo oficial fechado de produção do tipo férias/rescisão.");
  return withDatabaseTransaction(connection, async tx => {
    const [proof] = await tx.select({ hashSha256: documentVersions.hashSha256 }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(and(eq(documentVersions.id, input.proofVersionId), eq(documentVersions.status, "SIGNED"), inArray(documents.status, ["Válido", "Assinado"]), eq(documents.personId, statement.contract.employee.personId!))).limit(1);
    if (!proof) throw new Error("Documento de conferência do cálculo deve estar assinado e vinculado à pessoa do servidor.");
    const event = await enqueueHrIntegration(tx, { sourceKey: `RH:CALCULO_ESPECIAL_DEFINITIVO:${statement.id}`, domain: "RH", environment: "PRODUCAO", eventType: "CALCULO_ESPECIAL_CONFERIDO", payload: { ...input, employeeId: statement.contract.employeeId, statementHash: payrollSnapshotHash(statement), proofHash: proof.hashSha256, actorId: context.user.id, gross: statement.gross.toFixed(2), deductions: statement.deductions.toFixed(2), net: statement.net.toFixed(2) } });
    if (event.status === "REVOGADO") throw new Error("Conferência revogada exige nova versão de cálculo.");
    await tx.update(hrIntegrationEvents).set({ status: "PROCESSADO" }).where(eq(hrIntegrationEvents.id, event.id));
    return event.id;
  });
}
