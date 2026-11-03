import { desc, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { personnelActs } from "@/db/schema/personnel-records";
import { hrEmploymentContracts, hrEmploymentRevisions } from "@/db/schema/personnel-workforce";
import { hrPayrollRuleSets } from "@/db/schema/personnel-configuration";
import { findHrIntegrationEvent, lockPersonnel, personnelJson } from "@/db/repositories/personnel/integration";
import { requireEmploymentContract, requirePayrollRunWithStatements } from "@/db/repositories/personnel/workforce";
import { z } from "zod";
import { payrollPeriod } from "./calculation-engine";
import { enqueueHrIntegration, hrContractInputSchema, saveEmploymentContractInTransaction } from "./workforce-service";
import { assertPositionPlanForContract } from "./position-plan";
import { assertFunctionalHolderAccess } from "./functional-record-service";
import type { AppContext } from "@/lib/platform/tenant-context";
import { stablePersonnelJson } from "@/db/repositories/personnel/integration";
import { assertPersonnelDepartment } from "./personnel-scope";

const readmissionInput = z.object({
  requestKey: z.string().trim().min(1).max(160), previousContractId: z.string().min(1),
  registration: z.string().trim().min(1).max(100), regimeId: z.string().min(1), roleId: z.string().min(1),
  departmentId: z.string().default(""), costCenterId: z.string().default(""), workLocation: z.string().trim().min(1).max(200),
  salaryLevel: z.string().default(""), admittedAt: z.iso.date(), endsAt: z.union([z.iso.date(), z.literal("")]).default(""),
  salary: z.string().regex(/^\d{1,12}(?:\.\d{1,2})?$/), monthlyHours: z.coerce.number().int().min(1).max(744),
  actNumber: z.string().trim().min(3).max(100), reason: z.string().trim().min(10).max(2000),
}).strict();

/** A readmission starts a distinct service relationship; no balance is carried implicitly. */
export async function readmitEmployee(db: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = readmissionInput.parse(raw), fingerprint = stablePersonnelJson(input);
  assertPersonnelDepartment(context.user, input.departmentId);
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, "functional-configuration");
    await lockPersonnel(tx, `readmission:${input.requestKey}`);
    const former = await requireEmploymentContract(tx, input.previousContractId);
    await assertFunctionalHolderAccess(tx, context, former.employeeId);
    await lockPersonnel(tx, `employee:${former.employeeId}`);
    await lockPersonnel(tx, `contract:${former.id}`);
    const previous = await findHrIntegrationEvent(tx, `READMISSAO:${input.requestKey}`);
    if (previous) {
      if ((previous.payload as { fingerprint: string }).fingerprint !== fingerprint) throw new Error("Chave de readmissão já utilizada com outros termos.");
      return previous;
    }
    const contract = await requireEmploymentContract(tx, former.id);
    if (contract.status !== "INATIVO" || !contract.endsAt) throw new Error("Readmissão exige vínculo anterior encerrado com data de término.");
    const admission = new Date(`${input.admittedAt}T00:00:00Z`);
    if (admission <= contract.endsAt) throw new Error("A readmissão deve ser posterior ao término do vínculo anterior.");
    if (input.registration === contract.registration) throw new Error("Informe uma matrícula contratual nova para a readmissão.");
    await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${context.user.id},true)`);
    const created = await saveEmploymentContractInTransaction(tx, context.user.id, hrContractInputSchema.parse({
      employeeId: contract.employeeId, registration: input.registration, regimeId: input.regimeId, roleId: input.roleId,
      departmentId: input.departmentId, costCenterId: input.costCenterId, workLocation: input.workLocation, salaryLevel: input.salaryLevel,
      admittedAt: input.admittedAt, effectiveFrom: input.admittedAt, appointedAt: "", swornAt: "", endsAt: input.endsAt, salary: input.salary, monthlyHours: input.monthlyHours,
      details: { readmission: { previousContractId: contract.id, actNumber: input.actNumber, requestKey: input.requestKey } },
      reason: `Readmissão · ${input.actNumber} · ${input.reason}`,
    }));
    const [act] = await tx.insert(personnelActs).values({ employeeId: contract.employeeId, type: "Readmissão", actNumber: input.actNumber, date: admission }).returning();
    return enqueueHrIntegration(tx, { sourceKey: `READMISSAO:${input.requestKey}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "READMISSAO_REGISTRADA", payload: { fingerprint, input, employeeId: contract.employeeId, previousContractId: contract.id, contractId: created.id, actId: act.id, actorId: context.user.id, balancesTransferred: false } });
  });
}

export async function applyPocEmploymentLifecycle(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ sourceRunId: z.string().min(1), operation: z.enum(["DESLIGAR", "REINTEGRAR"]), date: z.iso.date(), actNumber: z.string().trim().min(3).max(100), reason: z.string().trim().min(10).max(2000) }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    const run = await requirePayrollRunWithStatements(tx, input.sourceRunId);
    await lockPersonnel(tx, `payroll:${run.payrollId}`);
    if (run.mode !== "OFICIAL" || run.status !== "FECHADA" || run.scope !== "DEMONSTRACAO" || run.payroll.type !== "Rescisão") throw new Error("Efeito funcional exige cálculo de rescisão oficial fechado.");
    const [set] = await tx.select().from(hrPayrollRuleSets).where(eq(hrPayrollRuleSets.id, run.ruleSetId)).limit(1);
    if (!set) throw new Error("Conjunto de regras não encontrado.");
    if (!set.isDemo || set.scope !== "DEMONSTRACAO") throw new Error("Efeito funcional estimado exige conjunto demonstrativo.");
    const sourceKey = `VINCULO:${input.operation}:${run.id}`;
    const fingerprint = JSON.stringify(input);
    const previous = await findHrIntegrationEvent(tx, sourceKey);
    if (previous) {
      if ((previous.payload as { fingerprint: string }).fingerprint !== fingerprint) throw new Error("Efeito funcional já registrado com outros termos.");
      return previous;
    }
    const closedEnd = payrollPeriod(run.payroll.competence).end.toISOString().slice(0, 10);
    const date = new Date(`${input.date}T00:00:00Z`);
    const calculationDate = (run.snapshot as { specialParameters?: { terminationDate?: string } }).specialParameters?.terminationDate ?? closedEnd;
    if (input.operation === "DESLIGAR" && input.date !== calculationDate) throw new Error("A data do desligamento deve corresponder à data usada no cálculo rescisório fechado.");
    const termination = await findHrIntegrationEvent(tx, `VINCULO:DESLIGAR:${run.id}`);
    if (input.operation === "REINTEGRAR" && (!termination || input.date <= calculationDate)) throw new Error("Reintegração exige desligamento vinculado e data posterior.");
    const effectiveFrom = input.operation === "DESLIGAR" ? new Date(date.getTime() + 86400000) : date;
    const results = [];
    for (const statement of [...run.statements].sort((a, b) => a.contractId.localeCompare(b.contractId))) {
      await lockPersonnel(tx, `contract:${statement.contractId}`);
      const contract = await requireEmploymentContract(tx, statement.contractId);
      const version = z.object({ contract: z.object({ version: z.number() }) }).parse(statement.snapshot).contract.version;
      const expected = input.operation === "DESLIGAR" ? version : (termination!.payload as { results: { contractId: string; version: number }[] }).results.find(result => result.contractId === contract.id)?.version;
      if (contract.version !== expected || contract.status !== (input.operation === "DESLIGAR" ? "ATIVO" : "INATIVO")) throw new Error("Vínculo mudou após a rescisão/efeito funcional. Concilie antes de aplicar o ato.");
      const closed = await tx.execute(sql`SELECT s.id FROM "HrPayrollStatement" s JOIN "HrPayrollRun" r ON r.id=s."runId" JOIN "Payroll" p ON p.id=r."payrollId" WHERE s."contractId"=${contract.id} AND r.id<>${run.id} AND r.status='FECHADA' AND (to_date(p.competence,'MM/YYYY')+interval '1 month'-interval '1 millisecond')>=${effectiveFrom} LIMIT 1`);
      if (closed.rows.length) throw new Error("Efeito funcional alcança outra folha fechada; exige conciliação antes do ato.");
      const [latest] = await tx.select().from(hrEmploymentRevisions).where(eq(hrEmploymentRevisions.contractId, contract.id)).orderBy(desc(hrEmploymentRevisions.effectiveFrom), desc(hrEmploymentRevisions.version)).limit(1);
      if (latest && latest.effectiveFrom > effectiveFrom) throw new Error("Ato anterior à última vigência contratual.");
      const [updated] = await tx.update(hrEmploymentContracts).set({ status: input.operation === "DESLIGAR" ? "INATIVO" : "ATIVO", endsAt: input.operation === "DESLIGAR" ? date : null, version: sql`${hrEmploymentContracts.version} + 1` }).where(eq(hrEmploymentContracts.id, contract.id)).returning();
      await tx.insert(hrEmploymentRevisions).values({ contractId: contract.id, version: updated.version, effectiveFrom, snapshot: personnelJson(updated), actorId, reason: `${input.operation} · ${input.actNumber} · ${input.reason}` });
      if (input.operation === "REINTEGRAR") await assertPositionPlanForContract(tx, updated, effectiveFrom);
      const reason = (run.snapshot as { specialParameters?: { terminationReason?: string } }).specialParameters?.terminationReason ?? "EXONERACAO";
      const labels: Record<string, string> = { TERMINO_CONTRATO: "Término de contrato", EXONERACAO: "Exoneração", DEMISSAO: "Demissão", APOSENTADORIA: "Aposentadoria", FALECIMENTO: "Falecimento" };
      const [act] = await tx.insert(personnelActs).values({ employeeId: contract.employeeId, type: input.operation === "DESLIGAR" ? labels[reason] : "Reintegração", actNumber: input.actNumber, date }).returning();
      results.push({ contractId: contract.id, version: updated.version, actId: act.id, effectiveFrom: effectiveFrom.toISOString(), status: updated.status });
    }
    return enqueueHrIntegration(tx, { sourceKey, domain: "AUDITORIA", environment: "DEMONSTRACAO", eventType: "EFEITO_FUNCIONAL_RESCISAO", payload: { fingerprint, input, actorId, results, historicalStatementsPreserved: true, retroactivePaymentsCalculated: false, gapRightsReconciled: false } });
  }, { timeoutMs: 60000 });
}
