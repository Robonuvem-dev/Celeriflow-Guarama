import { NextRequest, NextResponse } from "next/server";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";

export async function GET(request: NextRequest) {
  const { prisma, user } = await getTenantContextForModule("RH");
  const input = z.object({ kind: z.enum(["employee", "person", "contract", "department", "center", "payroll", "rule"]), q: z.string().max(200).default(""), page: z.coerce.number().int().positive().default(1), id: z.string().optional() }).parse(Object.fromEntries(request.nextUrl.searchParams));
  const paging = { skip: (input.page - 1) * 20, take: 20 };
  let total = 0;
  let items: { id: string; label: string }[] = [];
  if (input.kind === "employee") {
    const where: Prisma.EmployeeWhereInput = input.id ? { id: input.id } : { isActive: true, OR: [{ name: { contains: input.q, mode: "insensitive" } }, { cpf: { contains: input.q } }, { registration: { contains: input.q } }] };
    total = await prisma.employee.count({ where });
    items = (await prisma.employee.findMany({ where, ...paging, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true, registration: true } })).map(row => ({ id: row.id, label: `${row.name} · ${row.registration || "sem matrícula"}` }));
  } else if (input.kind === "person") {
    const where: Prisma.PersonWhereInput = input.id ? { id: input.id } : { status: "Ativo", OR: [{ fullName: { contains: input.q, mode: "insensitive" } }, { cpf: { contains: input.q } }] };
    total = await prisma.person.count({ where });
    items = (await prisma.person.findMany({ where, ...paging, orderBy: [{ fullName: "asc" }, { id: "asc" }], select: { id: true, fullName: true, cpf: true } })).map(row => ({ id: row.id, label: `${row.fullName} · ${row.cpf}` }));
  } else if (input.kind === "contract") {
    const where: Prisma.HrEmploymentContractWhereInput = input.id ? { id: input.id } : { status: "ATIVO", OR: [{ registration: { contains: input.q, mode: "insensitive" } }, { employee: { name: { contains: input.q, mode: "insensitive" } } }] };
    total = await prisma.hrEmploymentContract.count({ where });
    items = (await prisma.hrEmploymentContract.findMany({ where, ...paging, orderBy: [{ registration: "asc" }, { id: "asc" }], include: { employee: { select: { name: true } } } })).map(row => ({ id: row.id, label: `${row.registration} · ${row.employee.name}` }));
  } else if (input.kind === "department") {
    const where = input.id ? { id: input.id } : { name: { contains: input.q, mode: "insensitive" as const } };
    total = await prisma.department.count({ where });
    items = (await prisma.department.findMany({ where, ...paging, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } })).map(row => ({ id: row.id, label: row.name }));
  } else if (input.kind === "center") {
    const where = input.id ? { id: input.id } : { name: { contains: input.q, mode: "insensitive" as const } };
    total = await prisma.costCenter.count({ where });
    items = (await prisma.costCenter.findMany({ where, ...paging, orderBy: [{ name: "asc" }, { id: "asc" }], select: { id: true, name: true } })).map(row => ({ id: row.id, label: row.name }));
  } else if (input.kind === "rule") {
    const where: Prisma.HrPayrollRuleWhereInput = input.id ? { id: input.id } : { isActive: true, valueType: "JSON", OR: [{ code: { contains: input.q, mode: "insensitive" } }, { name: { contains: input.q, mode: "insensitive" } }] };
    total = await prisma.hrPayrollRule.count({ where });
    items = (await prisma.hrPayrollRule.findMany({ where, ...paging, orderBy: [{ code: "asc" }, { id: "asc" }], select: { id: true, code: true, name: true } })).map(row => ({ id: row.id, label: `${row.code} · ${row.name}` }));
  } else {
    const where: Prisma.PayrollWhereInput = { AND: [accessiblePayrollWhere(user), input.id ? { id: input.id } : { competence: { contains: input.q } }] };
    total = await prisma.payroll.count({ where });
    items = (await prisma.payroll.findMany({ where, ...paging, orderBy: [{ createdAt: "desc" }, { id: "asc" }], select: { id: true, competence: true, type: true, status: true } })).map(row => ({ id: row.id, label: `${row.competence} · ${row.type} · ${row.status}` }));
  }
  return NextResponse.json({ items, total, page: input.page }, { headers: { "Cache-Control": "private, no-store" } });
}
