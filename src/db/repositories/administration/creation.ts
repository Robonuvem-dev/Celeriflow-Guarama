import { eq, ilike } from "drizzle-orm";
import type { CanonicalEmployeePerson, InstitutionInput } from "@/lib/contracts/administration";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import { PersistenceError } from "../../errors";
import { administrativeUnits, calendarEvents, departments, employees, institutions, roles, secretariats } from "../../schema/administration";
import { people } from "../../schema/people";

function insertedId(rows: { id: string }[]): string {
  if (!rows[0]) throw new PersistenceError("not-found", "Registro não encontrado.");
  return rows[0].id;
}

export async function insertSecretariat(db: DatabaseExecutor, input: { name: string; acronym: string }): Promise<string> {
  return insertedId(await db.insert(secretariats).values(input).returning({ id: secretariats.id }));
}

export async function insertDepartment(db: DatabaseExecutor, input: { name: string; description: string | null; secretariatId: string }): Promise<string> {
  return insertedId(await db.insert(departments).values(input).returning({ id: departments.id }));
}

export async function insertUnit(db: DatabaseExecutor, input: { name: string; type: string; secretariatId: string; address: string | null; managerName: string | null }): Promise<string> {
  return insertedId(await db.insert(administrativeUnits).values(input).returning({ id: administrativeUnits.id }));
}

export async function insertRole(db: DatabaseExecutor, input: { name: string; description: string | null; level: string | null; canSign: boolean }): Promise<string> {
  const [duplicate] = await db.select({ id: roles.id }).from(roles).where(ilike(roles.name, input.name)).limit(1);
  if (duplicate) throw new Error("Já existe um cargo ou função com este nome. Edite ou reative o registro existente.");
  return insertedId(await db.insert(roles).values(input).returning({ id: roles.id }));
}

export async function insertCalendarEvent(db: DatabaseExecutor, input: { title: string; description: string; date: Date; type: string; isHoliday: boolean }): Promise<string> {
  return insertedId(await db.insert(calendarEvents).values(input).returning({ id: calendarEvents.id }));
}

export async function findFirstInstitutionId(db: DatabaseExecutor): Promise<string | null> {
  const [institution] = await db.select({ id: institutions.id }).from(institutions).limit(1);
  return institution?.id ?? null;
}

export async function persistInstitution(db: DatabaseExecutor, id: string | null, input: InstitutionInput): Promise<string> {
  return id
    ? insertedId(await db.update(institutions).set(input).where(eq(institutions.id, id)).returning({ id: institutions.id }))
    : insertedId(await db.insert(institutions).values(input).returning({ id: institutions.id }));
}

export async function resolveEmployeePerson(db: DatabaseExecutor, input: { personId?: string | null; cpf?: string | null; existingPersonId?: string | null }): Promise<CanonicalEmployeePerson> {
  if (input.existingPersonId && input.personId && input.existingPersonId !== input.personId) throw new Error("Não é permitido trocar a pessoa física de um servidor existente.");
  const id = input.existingPersonId || input.personId;
  const [person] = await db.select({ id: people.id, fullName: people.fullName, cpf: people.cpf, email: people.email, phonePrimary: people.phonePrimary, status: people.status })
    .from(people).where(id ? eq(people.id, id) : eq(people.cpf, requireValidCpf(input.cpf || ""))).limit(1);
  if (!person || person.status !== "Ativo") throw new Error("Selecione uma pessoa física ativa do Cadastro Único. Nenhum cadastro pessoal paralelo será criado.");
  return { personId: person.id, name: person.fullName, cpf: requireValidCpf(person.cpf), email: person.email, phone: person.phonePrimary };
}

export async function insertEmployee(tx: DatabaseTransaction, canonical: CanonicalEmployeePerson, input: { registration: string | null; roleId: string | null; secretariatId: string | null; departmentId: string | null; unitId: string | null }): Promise<string> {
  return insertedId(await tx.insert(employees).values({ ...canonical, ...input }).returning({ id: employees.id }));
}
