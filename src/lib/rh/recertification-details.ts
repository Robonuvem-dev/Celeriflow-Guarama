import { Prisma } from "@prisma/client";
import { z } from "zod";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";

const text = z.string().trim().max(250);
export const recertificationDetailsSchema = z.object({
  addresses: z.array(z.object({ id: z.string().min(1).optional(), expectedUpdatedAt: z.iso.datetime().optional(), zipCode: text, streetName: text.min(1), number: text, complement: text, referencePoint: text, addressType: text.min(1), zone: text, neighborhoodId: z.string().min(1).nullable() }).strict()).max(10).default([]),
  dependents: z.array(z.object({ id: z.string().min(1).optional(), expectedUpdatedAt: z.iso.datetime().optional(), cpf: z.string().transform(value => requireValidCpf(value)), name: text.min(1), birthDate: z.iso.date(), relationship: text.min(1), irrfDependent: z.boolean(), familyWage: z.boolean() }).strict()).max(30).default([]),
  previousEmployment: z.array(z.object({ employer: text.min(3), role: text.min(1), startsAt: z.iso.date(), endsAt: z.iso.date(), evidenceReference: z.string().trim().min(5).max(2000) }).strict().refine(value => value.endsAt >= value.startsAt, "Período do emprego anterior fora de ordem.")).max(50).default([]),
  documentVersionIds: z.array(z.string().min(1)).max(20).default([]),
}).strict();

export type RecertificationDetails = z.infer<typeof recertificationDetailsSchema>;
export const emptyRecertificationDetails = () => recertificationDetailsSchema.parse({});
export const recertificationSections = ["ENDERECOS", "DEPENDENTES", "EMPREGOS_ANTERIORES"] as const;

export function validateRecertificationSections(details: RecertificationDetails, sections: readonly string[]) {
  if (details.addresses.length && !sections.includes("ENDERECOS") || details.dependents.length && !sections.includes("DEPENDENTES") || details.previousEmployment.length && !sections.includes("EMPREGOS_ANTERIORES")) throw new Error("Seção não habilitada nesta campanha.");
  for (const rows of [details.addresses, details.dependents]) {
    const ids = rows.flatMap(row => row.id ? [row.id] : []);
    if (new Set(ids).size !== ids.length) throw new Error("Registro informado mais de uma vez.");
  }
  if (new Set(details.dependents.map(row => row.cpf)).size !== details.dependents.length || new Set(details.documentVersionIds).size !== details.documentVersionIds.length) throw new Error("CPF ou documento repetido na proposta.");
}

export async function captureRecertificationDetails(tx: Prisma.TransactionClient, employeeId: string, personId: string, details: RecertificationDetails) {
  const addressIds = details.addresses.flatMap(row => row.id ? [row.id] : []), dependentIds = details.dependents.flatMap(row => row.id ? [row.id] : []);
  const addresses = addressIds.length ? await tx.address.findMany({ where: { id: { in: addressIds }, personId }, orderBy: { id: "asc" } }) : [];
  const dependents = dependentIds.length ? await tx.dependent.findMany({ where: { id: { in: dependentIds }, employeeId }, orderBy: { id: "asc" } }) : [];
  for (const row of details.addresses) if (row.id && !addresses.some(address => address.id === row.id && address.updatedAt.toISOString() === row.expectedUpdatedAt)) throw new Error("Endereço não pertence ao titular ou foi atualizado. Reabra a proposta.");
  for (const row of details.dependents) if (row.id && !dependents.some(dependent => dependent.id === row.id && dependent.updatedAt.toISOString() === row.expectedUpdatedAt)) throw new Error("Dependente não pertence ao titular ou foi atualizado. Reabra a proposta.");
  const versions = details.documentVersionIds.length ? await tx.documentVersion.findMany({ where: { id: { in: details.documentVersionIds }, status: { in: ["FINAL", "SIGNED"] }, document: { personId, status: { in: ["Válido", "Assinado"] } } }, select: { id: true, hashSha256: true }, orderBy: { id: "asc" } }) : [];
  if (versions.length !== details.documentVersionIds.length) throw new Error("Comprovação documental não pertence ao titular ou está indisponível.");
  return { addresses: addresses.map(row => ({ id: row.id, updatedAt: row.updatedAt.toISOString(), snapshot: JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue })), dependents: dependents.map(row => ({ id: row.id, updatedAt: row.updatedAt.toISOString(), snapshot: JSON.parse(JSON.stringify(row)) as Prisma.InputJsonValue })), documents: versions };
}

export const recertificationBeforeDetailsSchema = z.object({ addresses: z.array(z.object({ id: z.string(), updatedAt: z.iso.datetime(), snapshot: z.unknown() })), dependents: z.array(z.object({ id: z.string(), updatedAt: z.iso.datetime(), snapshot: z.unknown() })), documents: z.array(z.object({ id: z.string(), hashSha256: z.string() })) });

export async function applyRecertificationDetails(tx: Prisma.TransactionClient, employeeId: string, personId: string, raw: unknown, beforeRaw: unknown) {
  const details = recertificationDetailsSchema.parse(raw), before = recertificationBeforeDetailsSchema.parse(beforeRaw);
  // Lock in stable order and revalidate the same versions before changing canonical data.
  for (const row of [...before.addresses].sort((a, b) => a.id.localeCompare(b.id))) await tx.$queryRaw`SELECT id FROM "Address" WHERE id=${row.id} FOR UPDATE`;
  for (const row of [...before.dependents].sort((a, b) => a.id.localeCompare(b.id))) await tx.$queryRaw`SELECT id FROM "Dependent" WHERE id=${row.id} FOR UPDATE`;
  const current = await captureRecertificationDetails(tx, employeeId, personId, details);
  if (JSON.stringify(current) !== JSON.stringify(before)) throw new Error("Cadastro ou comprovação alterados após a proposta. Solicite correção antes de deferir.");
  const addressIds: string[] = [], dependentIds: string[] = [];
  for (const row of details.addresses) {
    const { id, expectedUpdatedAt: _version, ...data } = row;
    void _version;
    if (data.neighborhoodId && !await tx.neighborhood.findFirst({ where: { id: data.neighborhoodId, status: "Ativo" }, select: { id: true } })) throw new Error("Bairro de origem indisponível.");
    const old = id ? await tx.address.findUniqueOrThrow({ where: { id } }) : null;
    if (old && (old.streetId || old.canonicalAddressId) && (old.streetName !== data.streetName || old.neighborhoodId !== data.neighborhoodId)) throw new Error("Endereço vinculado a logradouro canônico exige saneamento na origem antes da alteração.");
    const address = old ? await tx.address.update({ where: { id: old.id }, data }) : await tx.address.create({ data: { ...data, personId } });
    addressIds.push(address.id);
  }
  for (const row of details.dependents) {
    const person = await tx.person.findUnique({ where: { cpf: row.cpf } });
    if (!person || person.status !== "Ativo" || !person.birthDate || person.id === personId || person.fullName !== row.name || person.birthDate.toISOString().slice(0, 10) !== row.birthDate || person.birthDate > new Date()) throw new Error("Dependente exige pessoa física ativa, nome/CPF/nascimento conciliados no Cadastro Único. Regularize a origem antes do deferimento.");
    const old = row.id ? await tx.dependent.findUniqueOrThrow({ where: { id: row.id } }) : null;
    if (old?.personId && old.personId !== person.id || old?.cpf && requireValidCpf(old.cpf) !== person.cpf) throw new Error("Identidade do dependente diverge do registro de origem.");
    if (await tx.dependent.findFirst({ where: { employeeId, personId: person.id, ...(row.id ? { id: { not: row.id } } : {}) }, select: { id: true } })) throw new Error("Pessoa já vinculada como dependente do titular.");
    const data = { employeeId, personId: person.id, name: person.fullName, cpf: person.cpf, birthDate: person.birthDate, relationship: row.relationship, irrfDependent: row.irrfDependent, familyWage: row.familyWage };
    const dependent = old ? await tx.dependent.update({ where: { id: old.id }, data }) : await tx.dependent.create({ data });
    dependentIds.push(dependent.id);
  }
  return { addressIds, dependentIds, previousEmployment: details.previousEmployment, documentVersionIds: details.documentVersionIds, automaticallyRecognizedServiceDays: false };
}
