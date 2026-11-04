import { createHash } from "node:crypto";
import { and, eq, sql } from "drizzle-orm";
import { z } from "zod";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { hrEmploymentContracts } from "@/db/schema/personnel-workforce";
import { hrFunctionalRecords, hrRetirementAssessments } from "@/db/schema/personnel-functional-management";
import { lockPersonnel, personnelJson, stablePersonnelJson, enqueueHrIntegration } from "@/db/repositories/personnel/integration";
import { isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { assertFunctionalHolderAccess } from "./functional-record-service";
import { assertPersonnelDepartment, personnelScope } from "./personnel-scope";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { buildRetirementAssessmentReport } from "./retirement-assessment";
import { accessiblePayrollWhere } from "./payroll-access";
import { PERSONNEL_ISSUER } from "./personnel-presentation";
import { reportCompleteHistoryPredicate, reportEmployeePredicate } from "./report-filters";
import type { OperationalReportInput, PersonnelReport } from "./operational-reports";
import { retirementContributionHistory } from "./contribution-history";

const issuanceInput = z.object({ requestKey: z.string().min(1).max(160), contractId: z.string().min(1), ruleId: z.string().min(1), referenceDate: z.iso.date(), responsible: z.string().trim().min(3).max(300), legalReference: z.string().trim().min(3).max(4000) }).strict();
/** Seals a fully calculated concession memory; personnel/payment effects retain their own dated workflows. */
export async function issueRetirementAssessment(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = issuanceInput.parse(raw), referenceDate = new Date(`${input.referenceDate}T00:00:00Z`);
  if (referenceDate > new Date()) throw new Error("A memória de concessão exige uma referência já alcançada.");
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, "functional-configuration"); await lockPersonnel(tx, `APOSENTADORIA_MEMORIA:${input.requestKey}`);
    const [contract] = await tx.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.id, input.contractId));
    if (!contract) throw new Error("Contrato não encontrado.");
    await assertFunctionalHolderAccess(tx, context, contract.employeeId); assertPersonnelDepartment(context.user, contract.departmentId);
    await lockPersonnel(tx, `employee:${contract.employeeId}`); await lockPersonnel(tx, `contract:${contract.id}`);
    const [previous] = await tx.select().from(hrRetirementAssessments).where(eq(hrRetirementAssessments.requestKey, input.requestKey));
    if (previous) {
      if (previous.contractId !== input.contractId || previous.ruleId !== input.ruleId || previous.referenceDate.getTime() !== referenceDate.getTime() || previous.responsible !== input.responsible || previous.legalReference !== input.legalReference) throw new Error("Chave de emissão utilizada com outros termos.");
      return { id: previous.id, number: previous.number, amount: previous.amount };
    }
    const scope = isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds;
    const authorization = personnelScope(context.user);
    const authorizedDepartmentIds = authorization.departments === "TODOS" ? undefined : authorization.departments;
    const assessment = await buildRetirementAssessmentReport(tx, { kind: "APURACAO_APOSENTADORIA", q: "", employeeId: contract.employeeId, referenceDate: input.referenceDate, authorizedDepartmentIds }, scope, accessiblePayrollWhere(context.user));
    const selected = assessment.rows.filter(row => row[1] === contract.registration && row[17]?.startsWith(`${input.ruleId}/`));
    if (selected.length !== 1) throw new Error("Selecione uma regra aplicável única ao vínculo na referência.");
    const row = selected[0];
    const [rule] = await tx.select().from(hrFunctionalRecords).where(and(eq(hrFunctionalRecords.id, input.ruleId), eq(hrFunctionalRecords.kind, "REGRA_APOSENTADORIA")));
    if (!rule || row[17] !== `${rule.id}/${rule.version}`) throw new Error("A regra previdenciária foi alterada durante a emissão.");
    if (row[10] !== "Requisitos configurados cumpridos" || !row[12] || !new Decimal(row[12]).isFinite() || new Decimal(row[12]).lte(0)) throw new Error("Requisitos, dados contributivos ou cálculo de benefício incompletos. Consulte a apuração de aposentadoria.");
    const time = await buildRetirementAssessmentReport(tx, { kind: "MEMORIA_TEMPO_PREVIDENCIARIO", q: "", employeeId: contract.employeeId, referenceDate: input.referenceDate, authorizedDepartmentIds }, scope, accessiblePayrollWhere(context.user));
    const [serial] = (await tx.execute<{ number: string }>(sql`SELECT nextval('"HrRetirementAssessment_number_seq"')::text number`)).rows;
    const number = `${new Date().getUTCFullYear()}/${serial.number.padStart(6, "0")}`;
    const contributionHistory = await retirementContributionHistory(tx, contract.employeeId, referenceDate, accessiblePayrollWhere(context.user));
    const snapshot = personnelJson({ number, issuer: PERSONNEL_ISSUER, input, actorId: context.user.id, rule, contributionHistory, assessment: { ...assessment, rows: [row] }, time, employmentEffectApplied: false, financialPaymentConfirmed: false });
    const hash = createHash("sha256").update(stablePersonnelJson(snapshot)).digest("hex");
    const [record] = await tx.insert(hrRetirementAssessments).values({ ...input, referenceDate, employeeId: contract.employeeId, number, issuer: PERSONNEL_ISSUER, amount: row[12], snapshot, snapshotHash: hash, actorId: context.user.id }).returning();
    await enqueueHrIntegration(tx, { sourceKey: `APOSENTADORIA_MEMORIA:${record.id}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "MEMORIA_CONCESSAO_APOSENTADORIA_EMITIDA", payload: { employeeId: contract.employeeId, contractId: contract.id, assessmentId: record.id, number, amount: record.amount, snapshotHash: hash, actorId: context.user.id } });
    return { id: record.id, number, amount: record.amount };
  }, { timeoutMs: 120000 });
}

export async function buildIssuedRetirementAssessments(db: DatabaseExecutor, input: OperationalReportInput, budgetUnitIds?: readonly string[]): Promise<PersonnelReport> {
  const selected = await db.select({ record: hrRetirementAssessments }).from(hrRetirementAssessments).innerJoin(employees, eq(employees.id, hrRetirementAssessments.employeeId)).where(and(
    personnelBudgetEmployeeWhere(employees.id, budgetUnitIds), reportEmployeePredicate(input, employees.id, sql`${input.referenceDate ?? new Date().toISOString().slice(0, 10)}`),
    reportCompleteHistoryPredicate(input, employees.id, hrRetirementAssessments.referenceDate),
    input.employeeId ? eq(employees.id, input.employeeId) : undefined,
    input.from ? sql`${hrRetirementAssessments.createdAt}::date>=${input.from}::date` : undefined,
    input.until ? sql`${hrRetirementAssessments.createdAt}::date<=${input.until}::date` : undefined,
    input.q ? sql`strpos(lower(${employees.name}||' '||${hrRetirementAssessments.number}),lower(${input.q}))>0` : undefined,
  )).orderBy(hrRetirementAssessments.createdAt, hrRetirementAssessments.id);
  const rows = selected.flatMap(({ record }) => {
    if (createHash("sha256").update(stablePersonnelJson(record.snapshot)).digest("hex") !== record.snapshotHash) throw new Error("A memória emitida não confere com seu resumo de integridade.");
    const stored = z.object({ assessment: z.object({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) }), time: z.object({ headers: z.array(z.string()), rows: z.array(z.array(z.string())) }) }).parse(record.snapshot);
    return [stored.assessment, stored.time].flatMap((section, sectionIndex) => section.rows.flatMap(row => section.headers.map((header, index) => [record.number, record.createdAt.toISOString(), record.issuer, record.responsible, record.legalReference, record.amount, record.snapshotHash, sectionIndex === 0 ? "Cálculo do benefício" : "Tempo de serviço", header, row[index] ?? ""])));
  });
  return { title: "Memórias de concessão de aposentadoria emitidas — reprodução imutável", headers: ["Número", "Emitido em", "Emitente", "Responsável", "Fundamento", "Benefício calculado BRL", "SHA-256", "Seção", "Campo", "Conteúdo"], rows };
}
