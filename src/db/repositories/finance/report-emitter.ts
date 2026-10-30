import { eq } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { users } from "../../schema/identity";
import { employees } from "../../schema/administration";
import { people } from "../../schema/people";

export async function readFinancialReportEmitter(db: DatabaseExecutor, userId: string, fallbackName: string): Promise<string> {
  const [row] = await db.select({ name: users.nome, cpf: people.cpf, employeeCpf: employees.cpf }).from(users)
    .leftJoin(employees, eq(employees.id, users.employeeId))
    .leftJoin(people, eq(people.id, employees.personId)).where(eq(users.id, userId));
  const cpf = row?.cpf || row?.employeeCpf;
  return cpf ? `${row.name} · CPF ${cpf}` : row?.name ?? fallbackName;
}
