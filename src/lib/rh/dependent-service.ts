import type { PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { enqueueHrIntegration } from "./workforce-service";

export async function saveCanonicalDependent(db: PrismaClient, actorId: string, raw: unknown) {
  const input = z.object({ id: z.string().min(1).optional(), employeeId: z.string().min(1), personId: z.string().min(1), relationship: z.string().trim().min(1).max(100), irrfDependent: z.boolean(), familyWage: z.boolean() }).strict().parse(raw);
  return db.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`RH:employee:${input.employeeId}`}))`;
    const employee = await tx.employee.findUniqueOrThrow({ where: { id: input.employeeId } });
    if (!employee.isActive || !employee.personId) throw new Error("Titular deve estar ativo e vinculado ao Cadastro Único.");
    if (employee.personId === input.personId) throw new Error("Titular não pode ser dependente de si próprio.");
    await tx.$queryRaw`SELECT id FROM "Person" WHERE id=${input.personId} FOR SHARE`;
    const person = await tx.person.findUniqueOrThrow({ where: { id: input.personId } });
    const cpf = requireValidCpf(person.cpf);
    if (person.status !== "Ativo" || !person.birthDate || person.birthDate > new Date()) throw new Error("Dependente exige pessoa física ativa com nascimento válido no Cadastro Único.");
    const previous = input.id ? await tx.dependent.findUniqueOrThrow({ where: { id: input.id } }) : null;
    if (previous && (previous.employeeId !== input.employeeId || (previous.personId && previous.personId !== person.id))) throw new Error("Titular e pessoa física do dependente são preservados; cadastre o relacionamento correto separadamente.");
    if (previous?.cpf && previous.cpf.replace(/\D/g, "") !== cpf) throw new Error("CPF legado diverge do Cadastro Único; saneie o relacionamento antes de vincular.");
    if (await tx.dependent.findFirst({ where: { employeeId: input.employeeId, personId: person.id, ...(input.id ? { id: { not: input.id } } : {}) }, select: { id: true } })) throw new Error("Esta pessoa já é dependente do titular.");
    const data = { employeeId: employee.id, personId: person.id, name: person.fullName, cpf, birthDate: person.birthDate, relationship: input.relationship, irrfDependent: input.irrfDependent, familyWage: input.familyWage };
    const dependent = input.id ? await tx.dependent.update({ where: { id: input.id }, data }) : await tx.dependent.create({ data });
    await enqueueHrIntegration(tx, { sourceKey: `DEPENDENTE:${dependent.id}:${randomUUID()}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "DEPENDENTE_CANONICO_SALVO", payload: { before: previous, after: dependent, actorId } });
    return dependent;
  });
}
