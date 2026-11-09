import { NextRequest, NextResponse } from "next/server";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { and, asc, count, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { departments, employees, roles } from "@/db/schema/administration";
import { dependents } from "@/db/schema/personnel-records";
import { hrEmploymentRegimes } from "@/db/schema/personnel-configuration";
import { people } from "@/db/schema/people";
import { hrEmploymentContracts, hrPayrollRuns, hrPayrollStatements, payrolls } from "@/db/schema/personnel-workforce";
import { hrPayrollRules } from "@/db/schema/personnel-configuration";
import { costCenters } from "@/db/schema/master-data";
import { z } from "zod";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { personnelDepartmentWhere, personnelEmployeeWhere } from "@/lib/rh/personnel-scope";
import { hrFunctionalRecords, hrRetirementAssessments } from "@/db/schema/personnel-functional-management";

export async function GET(request: NextRequest) {
  const context = await getTenantContextForModule("RH"), { user } = context, executor = context.database ?? db;
   const input = z.object({ kind: z.enum(["employee", "person", "contract", "ended-contract", "department", "center", "payroll", "payroll-run", "payroll-statement", "bank-credit-convention", "rule", "retirement-rule", "retirement-assessment", "role", "regime", "dependent", "bank"]), q: z.string().max(200).default(""), page: z.coerce.number().int().positive().default(1), id: z.string().optional() }).parse(Object.fromEntries(request.nextUrl.searchParams));
  const employeeScope = personnelEmployeeWhere(user, employees.departmentId, employees.id);
  const offset = (input.page - 1) * 20;
  let total = 0;
  let items: { id: string; label: string }[] = [];
  if (input.kind === "employee") {
    const where = and(employeeScope, input.id ? eq(employees.id, input.id) : and(eq(employees.isActive, true), or(sql`strpos(lower(${employees.name}),lower(${input.q})) > 0`, sql`strpos(${employees.cpf},${input.q}) > 0`, sql`strpos(${employees.registration},${input.q}) > 0`)));
    total = (await executor.select({ total: count() }).from(employees).where(where))[0].total;
    items = (await executor.select({ id: employees.id, name: employees.name, registration: employees.registration }).from(employees).where(where).orderBy(asc(employees.name), asc(employees.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.name} · ${row.registration || "sem matrícula"}` }));
  } else if (input.kind === "person") {
    const where = input.id ? eq(people.id, input.id) : and(eq(people.status, "Ativo"), or(sql`strpos(lower(${people.fullName}),lower(${input.q})) > 0`, sql`strpos(${people.cpf},${input.q}) > 0`));
    total = (await executor.select({ total: count() }).from(people).where(where))[0].total;
    items = (await executor.select({ id: people.id, fullName: people.fullName, cpf: people.cpf }).from(people).where(where).orderBy(asc(people.fullName), asc(people.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.fullName} · ${row.cpf}` }));
  } else if (input.kind === "contract" || input.kind === "ended-contract") {
    const where = and(employeeScope, personnelDepartmentWhere(user, hrEmploymentContracts.departmentId), input.kind === "ended-contract" ? and(eq(hrEmploymentContracts.status, "INATIVO"), sql`${hrEmploymentContracts.endsAt} IS NOT NULL`) : undefined, input.id ? eq(hrEmploymentContracts.id, input.id) : and(input.kind === "contract" ? eq(hrEmploymentContracts.status, "ATIVO") : undefined, or(sql`strpos(${employees.registration},${input.q}) > 0`, sql`strpos(lower(${hrEmploymentContracts.registration}),lower(${input.q})) > 0`, sql`strpos(lower(${employees.name}),lower(${input.q})) > 0`)));
    total = (await executor.select({ total: count() }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(where))[0].total;
    items = (await executor.select({ id: hrEmploymentContracts.id, registration: hrEmploymentContracts.registration, employeeName: employees.name, employeeRegistration: employees.registration }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(where).orderBy(asc(employees.registration), asc(hrEmploymentContracts.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.employeeRegistration || "—"} · ${row.employeeName} · vínculo ${row.registration}` }));
  } else if (input.kind === "department") {
    const where = and(personnelDepartmentWhere(user, departments.id), input.id ? eq(departments.id, input.id) : sql`strpos(lower(${departments.name}),lower(${input.q})) > 0`);
    total = (await executor.select({ total: count() }).from(departments).where(where))[0].total;
    items = (await executor.select({ id: departments.id, name: departments.name }).from(departments).where(where).orderBy(asc(departments.name), asc(departments.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: row.name }));
  } else if (input.kind === "center") {
    const where = input.id ? eq(costCenters.id, input.id) : sql`strpos(lower(${costCenters.name}),lower(${input.q})) > 0`;
    total = (await executor.select({ total: count() }).from(costCenters).where(where))[0].total;
    items = (await executor.select({ id: costCenters.id, name: costCenters.name }).from(costCenters).where(where).orderBy(asc(costCenters.name), asc(costCenters.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: row.name }));
  } else if (input.kind === "payroll-statement") {
    const where = and(accessiblePayrollWhere(user), eq(hrPayrollRuns.status, "FECHADA"), eq(hrPayrollRuns.mode, "OFICIAL"), input.id ? eq(hrPayrollStatements.id, input.id) : sql`strpos(lower(concat_ws(' ',${payrolls.competence},${payrolls.type},${hrPayrollStatements.snapshot}#>>'{contract,employee,name}',${hrPayrollStatements.snapshot}#>>'{contract,registration}')),lower(${input.q}))>0`);
    const source = () => executor.select().from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId));
    total = (await executor.select({ total: count() }).from(hrPayrollStatements).innerJoin(hrPayrollRuns, eq(hrPayrollRuns.id, hrPayrollStatements.runId)).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(where))[0].total;
    items = (await source().where(where).orderBy(desc(hrPayrollRuns.createdAt), asc(hrPayrollStatements.id)).limit(20).offset(offset)).map(row => {
      const state = row.HrPayrollStatement.snapshot as { contract?: { registration?: string; employee?: { name?: string } }; items?: { code: string; type: string; value: string }[] };
      const deductions = state.items?.filter(item => item.type === "DESCONTO").map(item => `${item.code}: ${item.value}`).join("; ") ?? "";
      return { id: row.HrPayrollStatement.id, label: `${row.Payroll.competence} · ${row.Payroll.type} · ${state.contract?.registration} · ${state.contract?.employee?.name} · descontos: ${deductions}` };
    });
  } else if (input.kind === "payroll-run") {
    const where = and(accessiblePayrollWhere(user), eq(hrPayrollRuns.status, "FECHADA"), eq(hrPayrollRuns.mode, "OFICIAL"), input.id ? eq(hrPayrollRuns.id, input.id) : sql`strpos(lower(${payrolls.competence}||' '||${payrolls.type}||' '||${hrPayrollRuns.requestKey}),lower(${input.q}))>0`);
    total = (await executor.select({ total: count() }).from(hrPayrollRuns).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(where))[0].total;
    items = (await executor.select({ id: hrPayrollRuns.id, competence: payrolls.competence, type: payrolls.type, key: hrPayrollRuns.requestKey }).from(hrPayrollRuns).innerJoin(payrolls, eq(payrolls.id, hrPayrollRuns.payrollId)).where(where).orderBy(desc(hrPayrollRuns.createdAt), asc(hrPayrollRuns.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.competence} · ${row.type} · ${row.key}` }));
  } else if (input.kind === "retirement-rule") {
    const where = and(eq(hrFunctionalRecords.kind, "REGRA_APOSENTADORIA"), sql`${hrFunctionalRecords.status}<>'CANCELADO'`, input.id ? eq(hrFunctionalRecords.id, input.id) : sql`strpos(lower(${hrFunctionalRecords.name}||' '||${hrFunctionalRecords.key}),lower(${input.q}))>0`);
    total = (await executor.select({ total: count() }).from(hrFunctionalRecords).where(where))[0].total;
    items = (await executor.select({ id: hrFunctionalRecords.id, name: hrFunctionalRecords.name, startsAt: hrFunctionalRecords.startsAt, version: hrFunctionalRecords.version }).from(hrFunctionalRecords).where(where).orderBy(asc(hrFunctionalRecords.name), asc(hrFunctionalRecords.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.name} · desde ${row.startsAt.toISOString().slice(0, 10)} · versão ${row.version}` }));
  } else if (input.kind === "retirement-assessment") {
    const where = and(employeeScope, input.id ? eq(hrRetirementAssessments.id, input.id) : sql`strpos(lower(${employees.name}||' '||${hrRetirementAssessments.number}),lower(${input.q}))>0`);
    total = (await executor.select({ total: count() }).from(hrRetirementAssessments).innerJoin(employees, eq(employees.id, hrRetirementAssessments.employeeId)).where(where))[0].total;
    items = (await executor.select({ id: hrRetirementAssessments.id, number: hrRetirementAssessments.number, name: employees.name, reference: hrRetirementAssessments.referenceDate }).from(hrRetirementAssessments).innerJoin(employees, eq(employees.id, hrRetirementAssessments.employeeId)).where(where).orderBy(desc(hrRetirementAssessments.createdAt), asc(hrRetirementAssessments.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.number} · ${row.name} · ${row.reference.toISOString().slice(0, 10)}` }));
  } else if (input.kind === "rule") {
    const where = input.id ? eq(hrPayrollRules.id, input.id) : and(eq(hrPayrollRules.isActive, true), eq(hrPayrollRules.valueType, "JSON"), or(sql`strpos(lower(${hrPayrollRules.code}),lower(${input.q})) > 0`, sql`strpos(lower(${hrPayrollRules.name}),lower(${input.q})) > 0`));
    total = (await executor.select({ total: count() }).from(hrPayrollRules).where(where))[0].total;
    items = (await executor.select({ id: hrPayrollRules.id, code: hrPayrollRules.code, name: hrPayrollRules.name }).from(hrPayrollRules).where(where).orderBy(asc(hrPayrollRules.code), asc(hrPayrollRules.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.code} · ${row.name}` }));
  } else if (input.kind === "role") {
    const where = input.id ? eq(roles.id, input.id) : sql`strpos(lower(${roles.name}),lower(${input.q}))>0`;
    total = (await executor.select({ total: count() }).from(roles).where(where))[0].total;
    items = (await executor.select({ id: roles.id, name: roles.name }).from(roles).where(where).orderBy(asc(roles.name), asc(roles.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: row.name }));
  } else if (input.kind === "regime") {
    const where = input.id ? eq(hrEmploymentRegimes.id, input.id) : sql`strpos(lower(${hrEmploymentRegimes.name}),lower(${input.q}))>0`;
    total = (await executor.select({ total: count() }).from(hrEmploymentRegimes).where(where))[0].total;
    items = (await executor.select({ id: hrEmploymentRegimes.id, name: hrEmploymentRegimes.name }).from(hrEmploymentRegimes).where(where).orderBy(asc(hrEmploymentRegimes.name), asc(hrEmploymentRegimes.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: row.name }));
  } else if (input.kind === "dependent") {
    const where = and(employeeScope, input.id ? eq(dependents.id, input.id) : sql`strpos(lower(${dependents.name}||' '||${employees.name}),lower(${input.q}))>0`);
    total = (await executor.select({ total: count() }).from(dependents).innerJoin(employees, eq(employees.id, dependents.employeeId)).where(where))[0].total;
    items = (await executor.select({ id: dependents.id, name: dependents.name, holder: employees.name }).from(dependents).innerJoin(employees, eq(employees.id, dependents.employeeId)).where(where).orderBy(asc(dependents.name), asc(dependents.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.name} · titular: ${row.holder}` }));
  } else if (input.kind === "bank-credit-convention") {
    const where = sql`v.kind='CONVENIO_BANCARIO' AND v.details->>'direction'='CREDITO' AND b.compe='001' ${input.id ? sql`AND v.id=${input.id}` : sql`AND strpos(lower(v.name),lower(${input.q}))>0`}`;
    total = Number((await executor.execute<{ total: number }>(sql`SELECT count(*)::int total FROM "HrReferenceRecord" v JOIN "Bank" b ON b.id=v.details->>'bankId' WHERE ${where}`)).rows[0].total);
    items = (await executor.execute<{ id: string; label: string }>(sql`SELECT v.id,v.name||' · BB · '||(v.details->>'from')||' a '||(v.details->>'until') label FROM "HrReferenceRecord" v JOIN "Bank" b ON b.id=v.details->>'bankId' WHERE ${where} ORDER BY v.name,v.id LIMIT 20 OFFSET ${offset}`)).rows;
  } else if (input.kind === "bank") {
    const where = input.id ? sql`id=${input.id}` : sql`strpos(lower(name||' '||coalesce(compe,'')),lower(${input.q}))>0`;
    total = Number((await executor.execute<{ total: number }>(sql`SELECT count(*)::int total FROM "Bank" WHERE ${where}`)).rows[0].total);
    items = (await executor.execute<{ id: string; label: string }>(sql`SELECT id,coalesce(compe,'')||' · '||name label FROM "Bank" WHERE ${where} ORDER BY name,id LIMIT 20 OFFSET ${offset}`)).rows;
  } else {
    const where = and(accessiblePayrollWhere(user), input.id ? eq(payrolls.id, input.id) : sql`strpos(${payrolls.competence},${input.q}) > 0`);
    total = (await executor.select({ total: count() }).from(payrolls).where(where))[0].total;
    items = (await executor.select({ id: payrolls.id, competence: payrolls.competence, type: payrolls.type, status: payrolls.status }).from(payrolls).where(where).orderBy(desc(payrolls.createdAt), asc(payrolls.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.competence} · ${row.type} · ${row.status}` }));
  }
  return NextResponse.json({ items, total, page: input.page }, { headers: { "Cache-Control": "private, no-store" } });
}
