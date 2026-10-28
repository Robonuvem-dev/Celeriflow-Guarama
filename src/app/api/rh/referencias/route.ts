import { NextRequest, NextResponse } from "next/server";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { and, asc, count, desc, eq, or, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { departments, employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { hrEmploymentContracts, payrolls } from "@/db/schema/personnel-workforce";
import { hrPayrollRules } from "@/db/schema/personnel-configuration";
import { costCenters } from "@/db/schema/master-data";
import { z } from "zod";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";

export async function GET(request: NextRequest) {
  const context = await getTenantContextForModule("RH"), { user } = context, executor = context.database ?? db;
  const input = z.object({ kind: z.enum(["employee", "person", "contract", "department", "center", "payroll", "rule"]), q: z.string().max(200).default(""), page: z.coerce.number().int().positive().default(1), id: z.string().optional() }).parse(Object.fromEntries(request.nextUrl.searchParams));
  const offset = (input.page - 1) * 20;
  let total = 0;
  let items: { id: string; label: string }[] = [];
  if (input.kind === "employee") {
    const where = input.id ? eq(employees.id, input.id) : and(eq(employees.isActive, true), or(sql`strpos(lower(${employees.name}),lower(${input.q})) > 0`, sql`strpos(${employees.cpf},${input.q}) > 0`, sql`strpos(${employees.registration},${input.q}) > 0`));
    total = (await executor.select({ total: count() }).from(employees).where(where))[0].total;
    items = (await executor.select({ id: employees.id, name: employees.name, registration: employees.registration }).from(employees).where(where).orderBy(asc(employees.name), asc(employees.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.name} · ${row.registration || "sem matrícula"}` }));
  } else if (input.kind === "person") {
    const where = input.id ? eq(people.id, input.id) : and(eq(people.status, "Ativo"), or(sql`strpos(lower(${people.fullName}),lower(${input.q})) > 0`, sql`strpos(${people.cpf},${input.q}) > 0`));
    total = (await executor.select({ total: count() }).from(people).where(where))[0].total;
    items = (await executor.select({ id: people.id, fullName: people.fullName, cpf: people.cpf }).from(people).where(where).orderBy(asc(people.fullName), asc(people.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.fullName} · ${row.cpf}` }));
  } else if (input.kind === "contract") {
    const where = input.id ? eq(hrEmploymentContracts.id, input.id) : and(eq(hrEmploymentContracts.status, "ATIVO"), or(sql`strpos(lower(${hrEmploymentContracts.registration}),lower(${input.q})) > 0`, sql`strpos(lower(${employees.name}),lower(${input.q})) > 0`));
    total = (await executor.select({ total: count() }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(where))[0].total;
    items = (await executor.select({ id: hrEmploymentContracts.id, registration: hrEmploymentContracts.registration, employeeName: employees.name }).from(hrEmploymentContracts).innerJoin(employees, eq(employees.id, hrEmploymentContracts.employeeId)).where(where).orderBy(asc(hrEmploymentContracts.registration), asc(hrEmploymentContracts.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.registration} · ${row.employeeName}` }));
  } else if (input.kind === "department") {
    const where = input.id ? eq(departments.id, input.id) : sql`strpos(lower(${departments.name}),lower(${input.q})) > 0`;
    total = (await executor.select({ total: count() }).from(departments).where(where))[0].total;
    items = (await executor.select({ id: departments.id, name: departments.name }).from(departments).where(where).orderBy(asc(departments.name), asc(departments.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: row.name }));
  } else if (input.kind === "center") {
    const where = input.id ? eq(costCenters.id, input.id) : sql`strpos(lower(${costCenters.name}),lower(${input.q})) > 0`;
    total = (await executor.select({ total: count() }).from(costCenters).where(where))[0].total;
    items = (await executor.select({ id: costCenters.id, name: costCenters.name }).from(costCenters).where(where).orderBy(asc(costCenters.name), asc(costCenters.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: row.name }));
  } else if (input.kind === "rule") {
    const where = input.id ? eq(hrPayrollRules.id, input.id) : and(eq(hrPayrollRules.isActive, true), eq(hrPayrollRules.valueType, "JSON"), or(sql`strpos(lower(${hrPayrollRules.code}),lower(${input.q})) > 0`, sql`strpos(lower(${hrPayrollRules.name}),lower(${input.q})) > 0`));
    total = (await executor.select({ total: count() }).from(hrPayrollRules).where(where))[0].total;
    items = (await executor.select({ id: hrPayrollRules.id, code: hrPayrollRules.code, name: hrPayrollRules.name }).from(hrPayrollRules).where(where).orderBy(asc(hrPayrollRules.code), asc(hrPayrollRules.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.code} · ${row.name}` }));
  } else {
    const where = and(accessiblePayrollWhere(user), input.id ? eq(payrolls.id, input.id) : sql`strpos(${payrolls.competence},${input.q}) > 0`);
    total = (await executor.select({ total: count() }).from(payrolls).where(where))[0].total;
    items = (await executor.select({ id: payrolls.id, competence: payrolls.competence, type: payrolls.type, status: payrolls.status }).from(payrolls).where(where).orderBy(desc(payrolls.createdAt), asc(payrolls.id)).limit(20).offset(offset)).map(row => ({ id: row.id, label: `${row.competence} · ${row.type} · ${row.status}` }));
  }
  return NextResponse.json({ items, total, page: input.page }, { headers: { "Cache-Control": "private, no-store" } });
}
