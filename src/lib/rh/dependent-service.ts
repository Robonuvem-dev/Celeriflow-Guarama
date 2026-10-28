import { and, eq, ne, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { dependents } from "@/db/schema/personnel-records";
import { people } from "@/db/schema/people";
import { lockPersonnel } from "@/db/repositories/personnel/integration";
import { requireEmployeeWithPerson } from "@/db/repositories/personnel/workforce";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { enqueueHrIntegration } from "./workforce-service";

export async function saveCanonicalDependent(db: DatabaseConnection, actorId: string, raw: unknown) {
  const input = z.object({ id: z.string().min(1).optional(), employeeId: z.string().min(1), personId: z.string().min(1), relationship: z.string().trim().min(1).max(100), irrfDependent: z.boolean(), familyWage: z.boolean() }).strict().parse(raw);
  return withDatabaseTransaction(db, async tx => {
    await lockPersonnel(tx, `employee:${input.employeeId}`);
    const employee = await requireEmployeeWithPerson(tx, input.employeeId);
    if (!employee.isActive || !employee.personId) throw new Error("Titular deve estar ativo e vinculado ao Cadastro Único.");
    if (employee.personId === input.personId) throw new Error("Titular não pode ser dependente de si próprio.");
    await tx.execute(sql`SELECT id FROM "Person" WHERE id=${input.personId} FOR SHARE`);
    const [person] = await tx.select().from(people).where(eq(people.id, input.personId)).limit(1);
    if (!person) throw new Error("Pessoa física não encontrada.");
    const cpf = requireValidCpf(person.cpf);
    if (person.status !== "Ativo" || !person.birthDate || person.birthDate > new Date()) throw new Error("Dependente exige pessoa física ativa com nascimento válido no Cadastro Único.");
    const [previous] = input.id ? await tx.select().from(dependents).where(eq(dependents.id, input.id)).limit(1) : [];
    if (input.id && !previous) throw new Error("Dependente não encontrado.");
    if (previous && (previous.employeeId !== input.employeeId || (previous.personId && previous.personId !== person.id))) throw new Error("Titular e pessoa física do dependente são preservados; cadastre o relacionamento correto separadamente.");
    if (previous?.cpf && previous.cpf.replace(/\D/g, "") !== cpf) throw new Error("CPF legado diverge do Cadastro Único; saneie o relacionamento antes de vincular.");
    if ((await tx.select({ id: dependents.id }).from(dependents).where(and(eq(dependents.employeeId, input.employeeId), eq(dependents.personId, person.id), input.id ? ne(dependents.id, input.id) : undefined)).limit(1)).length) throw new Error("Esta pessoa já é dependente do titular.");
    const data = { employeeId: employee.id, personId: person.id, name: person.fullName, cpf, birthDate: person.birthDate, relationship: input.relationship, irrfDependent: input.irrfDependent, familyWage: input.familyWage };
    const [dependent] = input.id ? await tx.update(dependents).set(data).where(eq(dependents.id, input.id)).returning() : await tx.insert(dependents).values(data).returning();
    await enqueueHrIntegration(tx, { sourceKey: `DEPENDENTE:${dependent.id}:${randomUUID()}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "DEPENDENTE_CANONICO_SALVO", payload: { before: previous ?? null, after: dependent, actorId } });
    return dependent;
  });
}
