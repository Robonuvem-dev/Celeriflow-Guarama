import { and, asc, eq, gte, lte, or, sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { employees, roles } from "@/db/schema/administration";
import { hrFunctionalRecords } from "@/db/schema/personnel-functional-management";
import { hrEmploymentContracts, hrPayrollRuns, hrPayrollStatements, payrolls } from "@/db/schema/personnel-workforce";
import { dependents } from "@/db/schema/personnel-records";
import { hrEmploymentRegimes } from "@/db/schema/personnel-configuration";
import { enqueueHrIntegration, lockPersonnel, stablePersonnelJson } from "@/db/repositories/personnel/integration";
import { isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { functionalDefinition, functionalKinds, parseFunctionalData, type FunctionalKind } from "./functional-records";
import { requireValidCpf, requireValidCnpj } from "@/lib/identifiers/brazilian-identifiers";
import { canAccessPersonnelClinicalData } from "./clinical-access";
import { assertPersonnelDepartment, assertPersonnelRubrics } from "./personnel-scope";
import { personnelBudgetEmployeeWhere } from "./personnel-budget-scope";
import { validateUnionRemittance } from "./union-contribution";

export type FunctionalRecord = typeof hrFunctionalRecords.$inferSelect;
export const functionalRecordInput = z.object({
  id: z.string().optional(), version: z.coerce.number().int().positive().optional(),
  kind: z.enum(functionalKinds as [FunctionalKind, ...FunctionalKind[]]), key: z.string().trim().min(1).max(160),
  name: z.string().trim().min(1).max(200), employeeId: z.string().optional(), contractId: z.string().optional(),
  startsAt: z.iso.date(), endsAt: z.union([z.iso.date(), z.literal("")]).optional(),
  status: z.enum(["ATIVO", "ENCERRADO", "CANCELADO"]).default("ATIVO"), data: z.record(z.string(), z.string()),
}).strict();

export async function assertFunctionalHolderAccess(db: DatabaseExecutor, context: AppContext, employeeId?: string | null) {
  if (!employeeId) {
    if (!isSystemAdministrator(context.user)) throw new Error("A parametrização geral exige administrador do sistema.");
    return;
  }
  const [employee] = await db.select().from(employees).where(eq(employees.id, employeeId)).limit(1);
  if (!employee) throw new Error("Servidor não encontrado.");
  assertPersonnelDepartment(context.user, employee.departmentId);
  if (!isSystemAdministrator(context.user)) {
    const permitted = await db.select({ id: employees.id }).from(employees).where(and(eq(employees.id, employeeId), personnelBudgetEmployeeWhere(employees.id, context.user.allowedBudgetUnitIds))).limit(1);
    if (!permitted.length) throw new Error("Servidor sem vínculo de dotação ou rateio em unidade orçamentária autorizada.");
  }
}

/** Serialized with payroll calculation/closure through the canonical contract lock. */
export async function saveFunctionalRecord(db: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = functionalRecordInput.parse(raw), definition = functionalDefinition(input.kind);
  if (input.kind === "READAPTACAO" && !canAccessPersonnelClinicalData(context.user)) throw new Error("Seu perfil não possui autorização clínica de RH.");
  const data = parseFunctionalData(input.kind, input.data);
  const codes = (values: Record<string, string>) => [values.rubricCode, values.quantityCode, values.floorRubric, values.ceilingRubric, ...[values.affectedCodes, values.includedCodes, values.rubricCodes, values.integralityCodes].flatMap(value => (value ?? "").split(","))].filter((value): value is string => !!value?.trim()).map(value => value.trim());
  assertPersonnelRubrics(context.user, codes(data));
  const startsAt = new Date(`${input.startsAt}T00:00:00Z`), endsAt = input.endsAt ? new Date(`${input.endsAt}T00:00:00Z`) : null;
  if (endsAt && endsAt < startsAt) throw new Error("Fim da vigência anterior ao início.");
  if (["CESSAO", "COMISSAO", "ESTAGIO", "READAPTACAO", "AFASTAMENTO", "PREVIDENCIA_OPCAO", "DEPENDENTE_VIGENCIA"].includes(input.kind) && !endsAt) throw new Error("Informe o término previsto da vigência.");
  if (input.kind === "ESTAGIO") { requireValidCpf(data.supervisorCpf); requireValidCnpj(data.agentCnpj); }
  return withDatabaseTransaction(db, async tx => {
    await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${context.user.id},true)`);
    await lockPersonnel(tx, "functional-configuration");
    await lockPersonnel(tx, `functional:${input.key}`);
    let employeeId = input.employeeId || null;
    const contractId = input.contractId || null;
    if (definition.holder === "contract" && !contractId) throw new Error("Selecione o contrato funcional.");
    if (contractId) {
      await lockPersonnel(tx, `contract:${contractId}`);
      const [contract] = await tx.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.id, contractId)).limit(1);
      if (!contract || (employeeId && employeeId !== contract.employeeId)) throw new Error("Contrato e servidor incompatíveis.");
      assertPersonnelDepartment(context.user, contract.departmentId);
      employeeId = contract.employeeId;
      if (startsAt < contract.admittedAt) throw new Error("Movimento anterior à admissão do contrato.");
    }
    if (definition.holder === "employee" && !employeeId) throw new Error("Selecione o servidor.");
    if (!definition.holder && (employeeId || contractId)) throw new Error("Esta modalidade é uma parametrização geral.");
    await assertFunctionalHolderAccess(tx, context, employeeId);
    if (input.kind === "CATEGORIA_FOLHA" && data.category === "PENSIONISTA") {
      const [holder] = await tx.select({ personId: employees.personId }).from(employees).where(eq(employees.id, employeeId!)).limit(1);
      if (!data.beneficiaryPersonId || holder?.personId !== data.beneficiaryPersonId) throw new Error("Registre a pensão no contrato próprio da pessoa beneficiária, preservando o instituidor no cadastro da pensão.");
    }
    const [previous] = await tx.select().from(hrFunctionalRecords).where(eq(hrFunctionalRecords.key, input.key)).limit(1);
    if (input.id && previous?.id !== input.id) throw new Error("Registro não encontrado ou chave alterada.");
    if (previous) {
      await assertFunctionalHolderAccess(tx, context, previous.employeeId);
      assertPersonnelRubrics(context.user, codes(previous.data));
      if (!input.id || input.version !== previous.version) throw new Error("Registro já existe ou foi alterado. Reabra a ficha.");
      if (previous.kind !== input.kind || previous.employeeId !== employeeId || previous.contractId !== contractId) throw new Error("Tipo e titular do registro são imutáveis.");
    }
    if (employeeId) {
      // Financial snapshots remain authoritative; changes affecting closed months require compensation elsewhere.
      const closed = await tx.select({ id: hrPayrollStatements.id }).from(hrPayrollStatements)
        .innerJoin(hrEmploymentContracts, eq(hrEmploymentContracts.id, hrPayrollStatements.contractId))
        .innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId))
        .where(and(eq(hrEmploymentContracts.employeeId, employeeId), eq(hrPayrollRuns.mode, "OFICIAL"), eq(hrPayrollRuns.status, "FECHADA"),
          sql`to_date(${payrolls.competence},'MM/YYYY') <= ${!endsAt || previous && !previous.endsAt ? new Date("2200-12-31") : previous?.endsAt && previous.endsAt > endsAt ? previous.endsAt : endsAt}::date`,
          sql`(to_date(${payrolls.competence},'MM/YYYY') + interval '1 month') > ${previous && previous.startsAt < startsAt ? previous.startsAt : startsAt}::date`)).limit(1);
      if (closed.length && !["DADOS_ATUARIAIS", "DEPENDENTE_ATUARIAL", "HISTORICO_CONTRIBUTIVO", "IDENTIFICACAO_TRABALHISTA", "ESTAGIO", "READAPTACAO", "AVALIACAO_TREINAMENTO", "RECOLHIMENTO_SINDICAL"].includes(input.kind)) throw new Error("O período alcança folha encerrada. Registre os efeitos em período aberto.");
    }
    for (const name of ["roleId", "targetRoleId"]) if (data[name]) {
      if (!(await tx.select({ id: roles.id }).from(roles).where(eq(roles.id, data[name])).limit(1)).length) throw new Error("Cargo não encontrado.");
    }
    if (data.regimeId && !(await tx.select({ id: hrEmploymentRegimes.id }).from(hrEmploymentRegimes).where(eq(hrEmploymentRegimes.id, data.regimeId)).limit(1)).length) throw new Error("Regime não encontrado.");
    if (data.bankId && !(await tx.execute(sql`SELECT id FROM "Bank" WHERE id=${data.bankId}`)).rows.length) throw new Error("Banco não encontrado.");
    if (data.departmentId && !(await tx.execute(sql`SELECT id FROM "Department" WHERE id=${data.departmentId}`)).rows.length) throw new Error("Lotação não encontrada.");
    if (data.courseId && !(await tx.execute(sql`SELECT id FROM "HrPayrollRule" WHERE id=${data.courseId} AND category='PORTAL' AND value->>'origin'='CAPACITACAO_FUNCIONAL'`)).rows.length) throw new Error("Selecione uma atividade de capacitação do Portal.");
    if (data.beneficiaryPersonId && !(await tx.execute(sql`SELECT id FROM "Person" WHERE id=${data.beneficiaryPersonId} AND status='Ativo'`)).rows.length) throw new Error("Beneficiário não encontrado no Cadastro Único ativo.");
    if (data.dependentId && !(await tx.select({ id: dependents.id }).from(dependents).where(and(eq(dependents.id, data.dependentId), eq(dependents.employeeId, employeeId!))).limit(1)).length) throw new Error("Dependente não pertence ao servidor selecionado.");
    if (data.institutorPersonId && !(await tx.execute(sql`SELECT id FROM "Person" WHERE id=${data.institutorPersonId}`)).rows.length) throw new Error("Pessoa instituidora não encontrada no Cadastro Único.");
    if (input.kind === "COMISSAO") {
      if (data.sourceContractId !== contractId) throw new Error("A comissão deve ser registrada no contrato efetivo de origem.");
    }
    if (input.kind === "RECOLHIMENTO_SINDICAL") await validateUnionRemittance(tx, context, { contractId: contractId!, startsAt: input.startsAt, endsAt: input.endsAt, status: input.status, data }, previous);
    const competing = await tx.select().from(hrFunctionalRecords).where(and(eq(hrFunctionalRecords.kind, input.kind), sql`${hrFunctionalRecords.status}<>'CANCELADO'`,
      employeeId ? eq(hrFunctionalRecords.employeeId, employeeId) : sql`${hrFunctionalRecords.employeeId} IS NULL`,
      contractId ? eq(hrFunctionalRecords.contractId, contractId) : sql`${hrFunctionalRecords.contractId} IS NULL`,
      lte(hrFunctionalRecords.startsAt, endsAt ?? new Date("2200-12-31")), or(sql`${hrFunctionalRecords.endsAt} IS NULL`, gte(hrFunctionalRecords.endsAt, startsAt))));
    const discriminator = (row: Record<string, string>) => input.kind === "INDICE_PREVIDENCIARIO" ? `${row.series}:${row.competence}` : input.kind === "AVALIACAO_TREINAMENTO" ? `${row.course}:${row.question}` : input.kind === "DEPENDENTE_VIGENCIA" ? `${row.dependentId}:${row.benefit}` : input.kind === "REGRA_ATS" || input.kind === "PREVIDENCIA_OPCAO" ? row.rubricCode : !definition.holder ? `${row.regimeId ?? ""}:${row.roleId ?? ""}:${row.rubricCode ?? ""}:${row.gender ?? ""}:${row.reason ?? ""}` : "holder";
    const identity = (row: Record<string, string>) => input.kind === "HORA_AULA" ? `${row.regimeId ?? ""}:${row.roleId ?? ""}:${row.level}:${row.rubricCode}` : ["REGRA_PREVIDENCIA_BENEFICIO", "REGRA_INCIDENCIAS_CATEGORIA"].includes(input.kind) ? `${row.regimeId ?? ""}:${row.roleId ?? ""}:${row.category}:${row.payrollTypes.split(";").map(value => value.trim()).sort().join(";")}` : input.kind === "DEPENDENTE_ATUARIAL" ? row.dependentId : input.kind === "HISTORICO_CONTRIBUTIVO" ? `${row.competence}:${row.regime}` : input.kind === "TREINAMENTO_INSTRUMENTO" ? `${row.courseId}:${row.code}` : discriminator(row);
    if (input.status !== "CANCELADO" && !["REGRA_APOSENTADORIA", "RECOLHIMENTO_SINDICAL"].includes(input.kind) && competing.some(row => row.id !== previous?.id && identity(row.data) === identity(data))) throw new Error("Há outra regra ou ocorrência desta modalidade sobreposta ao período.");
    const values = { kind: input.kind, key: input.key, name: input.name, employeeId, contractId, startsAt, endsAt, status: input.status, data, actorId: context.user.id, version: (previous?.version ?? 0) + 1, updatedAt: new Date() };
    const [record] = previous ? await tx.update(hrFunctionalRecords).set(values).where(and(eq(hrFunctionalRecords.id, previous.id), eq(hrFunctionalRecords.version, previous.version))).returning() : await tx.insert(hrFunctionalRecords).values(values).returning();
    if (!record) throw new Error("O registro foi alterado por outro usuário.");
    await enqueueHrIntegration(tx, { sourceKey: `FICHA_FUNCIONAL:${record.id}:${record.version}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "FICHA_FUNCIONAL_REGISTRADA", payload: { before: previous ?? null, after: record, actorId: context.user.id, changed: previous ? stablePersonnelJson(previous.data) !== stablePersonnelJson(data) : true } });
    return record;
  });
}

export async function functionalRecordsAt(db: DatabaseExecutor, input: { employeeId: string; contractId: string; from: Date; until: Date }) {
  return db.select().from(hrFunctionalRecords).where(and(sql`${hrFunctionalRecords.status}<>'CANCELADO'`,
    or(eq(hrFunctionalRecords.employeeId, input.employeeId), sql`${hrFunctionalRecords.employeeId} IS NULL`),
    or(eq(hrFunctionalRecords.contractId, input.contractId), sql`${hrFunctionalRecords.contractId} IS NULL`),
    lte(hrFunctionalRecords.startsAt, input.until), or(sql`${hrFunctionalRecords.endsAt} IS NULL`, gte(hrFunctionalRecords.endsAt, input.from)))).orderBy(asc(hrFunctionalRecords.startsAt), asc(hrFunctionalRecords.id));
}
