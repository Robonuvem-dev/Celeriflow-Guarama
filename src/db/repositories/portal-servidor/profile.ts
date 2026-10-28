import { asc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { employees, roles, departments, secretariats } from "../../schema/administration";
import { people } from "../../schema/people";
import { addresses } from "../../schema/registry";
import { portalRows } from "./records";

export async function portalEmployeeProfile(db: DatabaseExecutor, employeeId: string) {
  const [row] = await db.select({ employee: employees, person: people, role: roles, department: departments, secretariat: secretariats }).from(employees)
    .leftJoin(people, eq(people.id, employees.personId)).leftJoin(roles, eq(roles.id, employees.roleId)).leftJoin(departments, eq(departments.id, employees.departmentId)).leftJoin(secretariats, eq(secretariats.id, employees.secretariatId)).where(eq(employees.id, employeeId)).limit(1);
  if (!row) return null;
  const [personAddresses, dependents] = await Promise.all([
    row.person ? db.select().from(addresses).where(eq(addresses.personId, row.person.id)).orderBy(asc(addresses.id)) : Promise.resolve([]),
    portalRows<{ id: string; employeeId: string; personId: string | null; name: string; relationship: string; birthDate: Date | null; cpf: string | null; irrfDependent: boolean; familyWage: boolean; createdAt: Date; updatedAt: Date }>(db, sql`SELECT * FROM "Dependent" WHERE "employeeId"=${employeeId} ORDER BY id ASC`),
  ]);
  return { ...row.employee, person: row.person ? { ...row.person, addresses: personAddresses } : null, role: row.role, department: row.department, secretariat: row.secretariat, dependents };
}
