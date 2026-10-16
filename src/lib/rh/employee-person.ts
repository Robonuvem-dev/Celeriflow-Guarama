import type { Prisma } from "@prisma/client";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";

export async function resolveEmployeePerson(tx: Prisma.TransactionClient, input: { personId?: string | null; cpf?: string | null; existingPersonId?: string | null }) {
  if (input.existingPersonId && input.personId && input.existingPersonId !== input.personId) throw new Error("Não é permitido trocar a pessoa física de um servidor existente.");
  const id = input.existingPersonId || input.personId;
  const person = id ? await tx.person.findUnique({ where: { id } }) : await tx.person.findUnique({ where: { cpf: requireValidCpf(input.cpf || "") } });
  if (!person || person.status !== "Ativo") throw new Error("Selecione uma pessoa física ativa do Cadastro Único. Nenhum cadastro pessoal paralelo será criado.");
  return { personId: person.id, name: person.fullName, cpf: requireValidCpf(person.cpf), email: person.email, phone: person.phonePrimary };
}
