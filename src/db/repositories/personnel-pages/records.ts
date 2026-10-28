import { and, asc, count, desc, eq, getTableColumns, gte, ilike, like, lte, or, type SQL } from 'drizzle-orm';
import type { DatabaseExecutor } from '../../transaction';
import { employees, roles, departments, secretariats } from '../../schema/administration';
import { companies, suppliers } from '../../schema/registry';
import { people } from '../../schema/people';
import { personnelActs, vacations, leaves, dependents, attendanceRecords } from '../../schema/personnel-records';
import { payrolls, payrollEvents } from '../../schema/personnel-workforce';
import { sstBenefitConfigs as benefitConfigs, sstPayrollBenefits as payrollBenefits } from '../../schema/sst-benefits';
import { rhPagination } from '@/lib/rh/list-pagination';
import type { Employee, EmployeeListRow, EmployeeFormData, EmployeeFormOptions, SupplierWithIdentity, BenefitConfig, BenefitListRow, PersonnelAct, Vacation, Leave, Dependent, AttendanceRecord, Payroll, PayrollEvent } from '@/lib/contracts/personnel-pages';

type Search = { q?: string; page?: string };
type Paging = ReturnType<typeof rhPagination>;
export function readEmployeeOptions(db: DatabaseExecutor): Promise<Employee[]> {
  return db.select().from(employees).orderBy(asc(employees.name));
}
export async function readEmployeeFormOptions(db: DatabaseExecutor): Promise<EmployeeFormOptions> {
  const roleRows = await db.select().from(roles).orderBy(asc(roles.name));
  const departmentRows = await db.select().from(departments).orderBy(asc(departments.name));
  const secretariatRows = await db.select().from(secretariats).orderBy(asc(secretariats.name));
  const benefitRows = await db.select().from(benefitConfigs).where(eq(benefitConfigs.isActive, true)).orderBy(asc(benefitConfigs.name));
  return { roles: roleRows, departments: departmentRows, secretariats: secretariatRows, benefitConfigs: benefitRows };
}
export async function readEmployeeFormData(db: DatabaseExecutor, id: string): Promise<EmployeeFormData | null> {
  const [employee] = await db.select().from(employees).where(eq(employees.id, id)).limit(1);
  if (!employee) return null;
  const dependentRows = await db.select().from(dependents).where(eq(dependents.employeeId, id));
  const benefits = await db.select({ ...getTableColumns(payrollBenefits), benefitConfig: getTableColumns(benefitConfigs) }).from(payrollBenefits).innerJoin(benefitConfigs, eq(benefitConfigs.id, payrollBenefits.benefitConfigId)).where(eq(payrollBenefits.employeeId, id));
  return { ...employee, dependents: dependentRows, benefits };
}
export async function readSupplierOptions(db: DatabaseExecutor): Promise<SupplierWithIdentity[]> {
  const rows = await db.select({ supplier: suppliers, company: companies, person: people }).from(suppliers).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId)).orderBy(asc(companies.corporateName));
  return rows.map(({ supplier, company, person }) => ({ ...supplier, company, person }));
}
export async function readPersonnelAct(db: DatabaseExecutor, id: string): Promise<PersonnelAct | null> { return (await db.select().from(personnelActs).where(eq(personnelActs.id, id)).limit(1))[0] ?? null; }
export async function readVacation(db: DatabaseExecutor, id: string): Promise<Vacation | null> { return (await db.select().from(vacations).where(eq(vacations.id, id)).limit(1))[0] ?? null; }
export async function readLeave(db: DatabaseExecutor, id: string): Promise<Leave | null> { return (await db.select().from(leaves).where(eq(leaves.id, id)).limit(1))[0] ?? null; }
export async function readDependent(db: DatabaseExecutor, id: string): Promise<Dependent | null> { return (await db.select().from(dependents).where(eq(dependents.id, id)).limit(1))[0] ?? null; }
export async function readAttendance(db: DatabaseExecutor, id: string): Promise<AttendanceRecord | null> { return (await db.select().from(attendanceRecords).where(eq(attendanceRecords.id, id)).limit(1))[0] ?? null; }
export async function readBenefit(db: DatabaseExecutor, id: string): Promise<BenefitConfig | null> { return (await db.select().from(benefitConfigs).where(eq(benefitConfigs.id, id)).limit(1))[0] ?? null; }
export async function readPayroll(db: DatabaseExecutor, id: string): Promise<Payroll | null> { return (await db.select().from(payrolls).where(eq(payrolls.id, id)).limit(1))[0] ?? null; }
export async function readPayrollEvent(db: DatabaseExecutor, id: string): Promise<PayrollEvent | null> { return (await db.select().from(payrollEvents).where(eq(payrollEvents.id, id)).limit(1))[0] ?? null; }

export async function readEmployeesPage(db: DatabaseExecutor, input: Search & { status?: string; departmentId?: string }): Promise<{ total: number; pagination: Paging; employees: EmployeeListRow[]; departments: EmployeeFormOptions['departments'] }> {
  const where = and(input.q ? or(ilike(employees.name, `%${input.q}%`), like(employees.cpf, `%${input.q}%`), like(employees.registration, `%${input.q}%`)) : undefined, input.status && input.status !== 'all' ? eq(employees.isActive, input.status === 'active') : undefined, input.departmentId && input.departmentId !== 'all' ? eq(employees.departmentId, input.departmentId) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(employees).where(where);
  const pagination = rhPagination(input.page, total);
  const [rows, departmentRows] = await Promise.all([
    db.select({ ...getTableColumns(employees), role: getTableColumns(roles), department: getTableColumns(departments) }).from(employees).leftJoin(roles, eq(roles.id, employees.roleId)).leftJoin(departments, eq(departments.id, employees.departmentId)).where(where).orderBy(asc(employees.name), asc(employees.id)).limit(pagination.take).offset(pagination.skip),
    db.select().from(departments).orderBy(asc(departments.name)),
  ]);
  return { total, pagination, employees: rows, departments: departmentRows };
}
export async function readActsPage(db: DatabaseExecutor, input: Search & { type?: string }): Promise<{ total: number; pagination: Paging; acts: Array<PersonnelAct & { employee: Employee }> }> {
  const where = and(input.q ? ilike(employees.name, `%${input.q}%`) : undefined, input.type && input.type !== 'all' ? eq(personnelActs.type, input.type) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(personnelActs).innerJoin(employees, eq(employees.id, personnelActs.employeeId)).where(where);
  const pagination = rhPagination(input.page, total);
  const acts = await db.select({ ...getTableColumns(personnelActs), employee: getTableColumns(employees) }).from(personnelActs).innerJoin(employees, eq(employees.id, personnelActs.employeeId)).where(where).orderBy(desc(personnelActs.date), asc(personnelActs.id)).limit(pagination.take).offset(pagination.skip);
  return { total, pagination, acts };
}
export async function readVacationsPage(db: DatabaseExecutor, input: Search & { status?: string }): Promise<{ total: number; pagination: Paging; vacations: Array<Vacation & { employee: Employee }> }> {
  const where = and(input.q ? ilike(employees.name, `%${input.q}%`) : undefined, input.status && input.status !== 'all' ? eq(vacations.status, input.status) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(vacations).innerJoin(employees, eq(employees.id, vacations.employeeId)).where(where);
  const pagination = rhPagination(input.page, total);
  const rows = await db.select({ ...getTableColumns(vacations), employee: getTableColumns(employees) }).from(vacations).innerJoin(employees, eq(employees.id, vacations.employeeId)).where(where).orderBy(desc(vacations.createdAt), asc(vacations.id)).limit(pagination.take).offset(pagination.skip);
  return { total, pagination, vacations: rows };
}
export async function readLeavesPage(db: DatabaseExecutor, input: Search & { status?: string }): Promise<{ total: number; pagination: Paging; leaves: Array<Leave & { employee: Employee }> }> {
  const where = and(input.q ? ilike(employees.name, `%${input.q}%`) : undefined, input.status && input.status !== 'all' ? eq(leaves.status, input.status) : undefined);
  const [{ total }] = await db.select({ total: count() }).from(leaves).innerJoin(employees, eq(employees.id, leaves.employeeId)).where(where);
  const pagination = rhPagination(input.page, total);
  const rows = await db.select({ ...getTableColumns(leaves), employee: getTableColumns(employees) }).from(leaves).innerJoin(employees, eq(employees.id, leaves.employeeId)).where(where).orderBy(desc(leaves.startDate), asc(leaves.id)).limit(pagination.take).offset(pagination.skip);
  return { total, pagination, leaves: rows };
}
export async function readDependentsPage(db: DatabaseExecutor, input: Search): Promise<{ total: number; pagination: Paging; dependents: Array<Dependent & { employee: Employee }> }> {
  const where = input.q ? or(ilike(dependents.name, `%${input.q}%`), ilike(employees.name, `%${input.q}%`)) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(dependents).innerJoin(employees, eq(employees.id, dependents.employeeId)).where(where);
  const pagination = rhPagination(input.page, total);
  const rows = await db.select({ ...getTableColumns(dependents), employee: getTableColumns(employees) }).from(dependents).innerJoin(employees, eq(employees.id, dependents.employeeId)).where(where).orderBy(desc(dependents.createdAt), asc(dependents.id)).limit(pagination.take).offset(pagination.skip);
  return { total, pagination, dependents: rows };
}
export async function readAttendancePage(db: DatabaseExecutor, input: Search & { month?: string }): Promise<{ total: number; pagination: Paging; records: Array<AttendanceRecord & { employee: Employee }> }> {
  let range: SQL | undefined;
  if (input.month) {
    const [year, m] = input.month.split('-');
    const startDate = new Date(parseInt(year), parseInt(m) - 1, 1);
    const endDate = new Date(parseInt(year), parseInt(m), 0);
    range = and(gte(attendanceRecords.date, startDate), lte(attendanceRecords.date, endDate));
  }
  const where = and(input.q ? ilike(employees.name, `%${input.q}%`) : undefined, range);
  const [{ total }] = await db.select({ total: count() }).from(attendanceRecords).innerJoin(employees, eq(employees.id, attendanceRecords.employeeId)).where(where);
  const pagination = rhPagination(input.page, total);
  const records = await db.select({ ...getTableColumns(attendanceRecords), employee: getTableColumns(employees) }).from(attendanceRecords).innerJoin(employees, eq(employees.id, attendanceRecords.employeeId)).where(where).orderBy(desc(attendanceRecords.date), asc(attendanceRecords.id)).limit(pagination.take).offset(pagination.skip);
  return { total, pagination, records };
}
export async function readBenefitsPage(db: DatabaseExecutor, input: Search): Promise<{ total: number; pagination: Paging; benefits: BenefitListRow[] }> {
  const where = input.q ? ilike(benefitConfigs.name, `%${input.q}%`) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(benefitConfigs).where(where);
  const pagination = rhPagination(input.page, total);
  const rows = await db.select({ benefit: benefitConfigs, supplier: suppliers, company: companies, person: people }).from(benefitConfigs).leftJoin(suppliers, eq(suppliers.id, benefitConfigs.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId)).where(where).orderBy(asc(benefitConfigs.name), asc(benefitConfigs.id)).limit(pagination.take).offset(pagination.skip);
  return { total, pagination, benefits: rows.map(({ benefit, supplier, company, person }) => ({ ...benefit, supplier: supplier ? { ...supplier, company, person } : null })) };
}
export async function readPayrollsPage(db: DatabaseExecutor, input: Search): Promise<{ total: number; pagination: Paging; payrolls: Payroll[] }> {
  const where = input.q ? or(ilike(payrolls.competence, `%${input.q}%`), ilike(payrolls.type, `%${input.q}%`), ilike(payrolls.status, `%${input.q}%`)) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(payrolls).where(where);
  const pagination = rhPagination(input.page, total);
  const rows = await db.select().from(payrolls).where(where).orderBy(desc(payrolls.createdAt), asc(payrolls.id)).limit(pagination.take).offset(pagination.skip);
  return { total, pagination, payrolls: rows };
}
export async function readPayrollEventsPage(db: DatabaseExecutor, input: Search): Promise<{ total: number; pagination: Paging; events: PayrollEvent[] }> {
  const where = input.q ? or(ilike(payrollEvents.code, `%${input.q}%`), ilike(payrollEvents.name, `%${input.q}%`), ilike(payrollEvents.type, `%${input.q}%`)) : undefined;
  const [{ total }] = await db.select({ total: count() }).from(payrollEvents).where(where);
  const pagination = rhPagination(input.page, total);
  const events = await db.select().from(payrollEvents).where(where).orderBy(asc(payrollEvents.code), asc(payrollEvents.id)).limit(pagination.take).offset(pagination.skip);
  return { total, pagination, events };
}
export async function readPersonnelDashboard(db: DatabaseExecutor) {
  const totalEmployees = await db.select({ value: count() }).from(employees).then(rows => rows[0].value).catch(() => 0);
  const activeEmployees = await db.select({ value: count() }).from(employees).where(eq(employees.isActive, true)).then(rows => rows[0].value).catch(() => 0);
  const totalRoles = await db.select({ value: count() }).from(roles).then(rows => rows[0].value).catch(() => 0);
  const activeRoles = await db.select({ value: count() }).from(roles).where(eq(roles.isActive, true)).then(rows => rows[0].value).catch(() => 0);
  const activePayrolls = await db.select({ value: count() }).from(payrolls).where(eq(payrolls.status, 'Aberta')).then(rows => rows[0].value).catch(() => 0);
  const vacationRequests = await db.select({ value: count() }).from(vacations).where(eq(vacations.status, 'Programada')).then(rows => rows[0].value).catch(() => 0);
  const totalAttendances = await db.select({ value: count() }).from(attendanceRecords).then(rows => rows[0].value).catch(() => 0);
  return { totalEmployees, activeEmployees, totalRoles, activeRoles, activePayrolls, vacationRequests, totalAttendances };
}
