import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertFunctionalHolderAccess } from "./functional-record-service";
import { assertPersonnelDepartment, assertPersonnelRubrics, personnelScope } from "./personnel-scope";
import { assertPayrollBudgetScope } from "./payroll-access";
import { parsePayrollMovementImport } from "./movement-import";
import { payrollPensionPolicySchema } from "./payroll-pensions";
import { z } from "zod";
import { integrationEventWhere } from "./integration-event-scope";

/** Resolve direct holders before invoking actor-only legacy services. */
export async function assertWorkforceInputAccess(db: DatabaseExecutor, context: AppContext, command: string, values: Record<string, string>) {
  const contracts = new Set<string>();
  const holders = new Set<string>();
  for (const key of ["runId", "sourceRunId"]) if (values[key]) {
    const [run] = (await db.execute<{ payrollId: string }>(sql`SELECT "payrollId" FROM "HrPayrollRun" WHERE id=${values[key]}`)).rows;
    if (!run) throw new Error("Cálculo não encontrado.");
    await assertPayrollBudgetScope({ ...context, database: db }, run.payrollId);
  }
  if (values.payrollId) await assertPayrollBudgetScope({ ...context, database: db }, values.payrollId);
  for (const key of ["contractId", "previousContractId", "sourceContractId", "targetContractId", "benefitContractId"]) if (values[key]) contracts.add(values[key]);
  for (const id of (values.contractIds ?? "").split(/[\s,;]+/).filter(Boolean)) contracts.add(id);
  if (command === "contrato" && values.id) contracts.add(values.id);
  if (command === "movimento" && values.id) {
    const [movement] = (await db.execute<{ contractId: string; rubricCode: string }>(sql`SELECT "contractId","rubricCode" FROM "HrMovement" WHERE id=${values.id}`)).rows;
    if (!movement) throw new Error("Movimento não encontrado.");
    contracts.add(movement.contractId); assertPersonnelRubrics(context.user, [movement.rubricCode]);
  }
  if (values.installmentId) {
    const [agreement] = (await db.execute<{ contractId: string; rubricCode: string }>(sql`SELECT a."contractId",a."rubricCode" FROM "HrConsignmentInstallment" i JOIN "HrConsignmentAgreement" a ON a.id=i."agreementId" WHERE i.id=${values.installmentId}`)).rows;
    if (!agreement) throw new Error("Parcela consignada não encontrada.");
    contracts.add(agreement.contractId); assertPersonnelRubrics(context.user, [agreement.rubricCode]);
  }
  if (values.requestId) {
    const [request] = (await db.execute<{ employeeId: string; contractId: string | null }>(sql`SELECT "employeeId",payload->'input'->>'contractId' "contractId" FROM "HrPortalRequest" WHERE id=${values.requestId}`)).rows;
    if (!request) throw new Error("Solicitação não encontrada.");
    holders.add(request.employeeId);
    if (request.contractId) contracts.add(request.contractId);
  }
  if (command === "diaria-estornar-restituicao-anterior" && values.revenueId) {
    const [origin] = (await db.execute<{ employeeId: string }>(sql`SELECT request."employeeId" FROM "Revenue" revenue JOIN "HrPortalRequest" request ON request.id=revenue."sourceId" WHERE revenue.id=${values.revenueId} AND revenue."sourceModule"='RH' AND revenue."sourceType"='TRAVEL_ALLOWANCE_REFUND'`)).rows;
    if (!origin) throw new Error("Restituição sem solicitação de diária verificável.");
    holders.add(origin.employeeId);
  }
  for (const key of ["originalSourceKey", "conversionSourceKey", "transferSourceKey", "groupSourceKey", "occurrenceId"]) if (values[key]) {
    const [event] = (await db.execute<{ payload: unknown }>(sql`SELECT payload FROM "HrIntegrationEvent" WHERE ${key === "occurrenceId" ? sql`id` : sql`"sourceKey"`}=${values[key]} AND ${integrationEventWhere(context.user, sql`payload`)}`)).rows;
    if (!event) throw new Error("Origem funcional não encontrada.");
    const payload = z.object({ contractId: z.string().optional(), employeeId: z.string().optional(), sourceEntryId: z.string().optional(), targetEntryId: z.string().optional(), input: z.object({ contractId: z.string().optional(), sourceContractId: z.string().optional(), targetContractId: z.string().optional() }).passthrough().optional() }).passthrough().parse(event.payload);
    for (const id of [payload.contractId, payload.input?.contractId, payload.input?.sourceContractId, payload.input?.targetContractId]) if (id) contracts.add(id);
    if (payload.employeeId) holders.add(payload.employeeId);
    for (const entryId of [payload.sourceEntryId, payload.targetEntryId]) if (entryId) {
      const [entry] = (await db.execute<{ contractId: string }>(sql`SELECT "contractId" FROM "HrRightEntry" WHERE id=${entryId}`)).rows;
      if (!entry) throw new Error("Entrada de origem funcional não encontrada.");
      contracts.add(entry.contractId);
    }
  }
  if (command === "importar") {
    const rows = parsePayrollMovementImport(values.csv);
    assertPersonnelRubrics(context.user, rows.map(row => row.rubricCode));
    const found = await db.execute<{ id: string; registration: string }>(sql`SELECT id,registration FROM "HrEmploymentContract" WHERE registration=ANY(${sql.param([...new Set(rows.map(row => row.registration))])}::text[])`);
    if (new Set(found.rows.map(row => row.registration)).size !== new Set(rows.map(row => row.registration)).size) throw new Error("Matrícula de importação não encontrada.");
    for (const row of found.rows) contracts.add(row.id);
  }
  if (command === "pensoes-configurar") {
    const policy = payrollPensionPolicySchema.parse(JSON.parse(values.policy || "{}"));
    for (const entry of policy.entries) contracts.add(entry.contractId);
    assertPersonnelRubrics(context.user, policy.entries.map(entry => `PENSAO_${entry.id}`));
    const [previous] = (await db.execute<{ value: unknown }>(sql`SELECT value FROM "HrPayrollRule" WHERE "ruleSetId"=${values.ruleSetId} AND code='PENSOES_FOLHA'`)).rows;
    if (previous) for (const entry of payrollPensionPolicySchema.parse(previous.value).entries) { contracts.add(entry.contractId); assertPersonnelRubrics(context.user, [`PENSAO_${entry.id}`]); }
  }
  if (values.entryId) {
    const [entry] = (await db.execute<{ contractId: string }>(sql`SELECT "contractId" FROM "HrRightEntry" WHERE id=${values.entryId}`)).rows;
    if (!entry) throw new Error("Lançamento de direito não encontrado.");
    contracts.add(entry.contractId);
  }
  if (values.employeeId) await assertFunctionalHolderAccess(db, context, values.employeeId);
  for (const id of holders) await assertFunctionalHolderAccess(db, context, id);
  for (const id of contracts) {
    const [contract] = (await db.execute<{ employeeId: string; departmentId: string | null }>(sql`SELECT "employeeId","departmentId" FROM "HrEmploymentContract" WHERE id=${id}`)).rows;
    if (!contract) throw new Error("Contrato não encontrado.");
    await assertFunctionalHolderAccess(db, context, contract.employeeId);
    assertPersonnelDepartment(context.user, contract.departmentId);
  }
  if (["contrato", "readmitir-servidor"].includes(command)) assertPersonnelDepartment(context.user, values.departmentId || null);
  if (command === "contratos-coletivos") {
    const changes = z.object({ departmentId: z.string().optional() }).passthrough().parse(JSON.parse(values.changes || "{}"));
    if (changes.departmentId !== undefined) assertPersonnelDepartment(context.user, changes.departmentId);
  }
  if (values.rubricCode) assertPersonnelRubrics(context.user, [values.rubricCode]);
  if (contracts.size && ["calcular", "calcular-poc", "calcular-rescisao-direitos", "simular-especial"].includes(command)) {
    const scope = personnelScope(context.user);
    if (scope.rubricCodes !== "TODOS") {
      const forbidden = await db.execute(sql`SELECT b.code FROM "HrPayrollRubric" b JOIN "HrEmploymentRegime" r ON r."ruleSetId"=b."ruleSetId"
        JOIN "HrEmploymentContract" c ON c."regimeId"=r.id WHERE c.id=ANY(${sql.param([...contracts])}::text[]) AND b."isActive" AND NOT (b.code=ANY(${sql.param(scope.rubricCodes)}::text[])) LIMIT 1`);
      if (forbidden.rows.length) throw new Error("Cálculo integral exige acesso a todas as verbas ativas do conjunto selecionado.");
    }
  }
}
