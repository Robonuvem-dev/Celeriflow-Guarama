import { and, asc, eq, inArray, ne, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "@/db/transaction";
import { addresses as addressTable, documents } from "@/db/schema/registry";
import { documentVersions } from "@/db/schema/document-workflow";
import { neighborhoods } from "@/db/schema/localities";
import { dependents as dependentTable } from "@/db/schema/personnel-records";
import { people } from "@/db/schema/people";
import { personnelJson, stablePersonnelJson } from "@/db/repositories/personnel/integration";
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

export async function captureRecertificationDetails(tx: DatabaseExecutor, employeeId: string, personId: string, details: RecertificationDetails) {
  const addressIds = details.addresses.flatMap(row => row.id ? [row.id] : []), dependentIds = details.dependents.flatMap(row => row.id ? [row.id] : []);
  const addresses = addressIds.length ? await tx.select().from(addressTable).where(and(inArray(addressTable.id, addressIds), eq(addressTable.personId, personId))).orderBy(asc(addressTable.id)) : [];
  const dependents = dependentIds.length ? await tx.select().from(dependentTable).where(and(inArray(dependentTable.id, dependentIds), eq(dependentTable.employeeId, employeeId))).orderBy(asc(dependentTable.id)) : [];
  for (const row of details.addresses) if (row.id && !addresses.some(address => address.id === row.id && address.updatedAt.toISOString() === row.expectedUpdatedAt)) throw new Error("Endereço não pertence ao titular ou foi atualizado. Reabra a proposta.");
  for (const row of details.dependents) if (row.id && !dependents.some(dependent => dependent.id === row.id && dependent.updatedAt.toISOString() === row.expectedUpdatedAt)) throw new Error("Dependente não pertence ao titular ou foi atualizado. Reabra a proposta.");
  const versions = details.documentVersionIds.length ? await tx.select({ id: documentVersions.id, hashSha256: documentVersions.hashSha256 }).from(documentVersions).innerJoin(documents, eq(documents.id, documentVersions.documentId)).where(and(inArray(documentVersions.id, details.documentVersionIds), inArray(documentVersions.status, ["FINAL", "SIGNED"]), eq(documents.personId, personId), inArray(documents.status, ["Válido", "Assinado"]))).orderBy(asc(documentVersions.id)) : [];
  if (versions.length !== details.documentVersionIds.length) throw new Error("Comprovação documental não pertence ao titular ou está indisponível.");
  return { addresses: addresses.map(row => ({ id: row.id, updatedAt: row.updatedAt.toISOString(), snapshot: personnelJson(row) })), dependents: dependents.map(row => ({ id: row.id, updatedAt: row.updatedAt.toISOString(), snapshot: personnelJson(row) })), documents: versions };
}

export const recertificationBeforeDetailsSchema = z.object({ addresses: z.array(z.object({ id: z.string(), updatedAt: z.iso.datetime(), snapshot: z.unknown() })), dependents: z.array(z.object({ id: z.string(), updatedAt: z.iso.datetime(), snapshot: z.unknown() })), documents: z.array(z.object({ id: z.string(), hashSha256: z.string() })) });

export async function applyRecertificationDetails(tx: DatabaseTransaction, employeeId: string, personId: string, raw: unknown, beforeRaw: unknown) {
  const details = recertificationDetailsSchema.parse(raw), before = recertificationBeforeDetailsSchema.parse(beforeRaw);
  // Lock in stable order and revalidate the same versions before changing canonical data.
  for (const row of [...before.addresses].sort((a, b) => a.id.localeCompare(b.id))) await tx.execute(sql`SELECT id FROM "Address" WHERE id=${row.id} FOR UPDATE`);
  for (const row of [...before.dependents].sort((a, b) => a.id.localeCompare(b.id))) await tx.execute(sql`SELECT id FROM "Dependent" WHERE id=${row.id} FOR UPDATE`);
  const current = await captureRecertificationDetails(tx, employeeId, personId, details);
  // JSONB may reorder keys; compare every captured field without relying on ORM field order.
  if (stablePersonnelJson(current) !== stablePersonnelJson(before)) throw new Error("Cadastro ou comprovação alterados após a proposta. Solicite correção antes de deferir.");
  const addressIds: string[] = [], dependentIds: string[] = [];
  for (const row of details.addresses) {
    const { id, expectedUpdatedAt: _version, ...data } = row;
    void _version;
    if (data.neighborhoodId && !(await tx.select({ id: neighborhoods.id }).from(neighborhoods).where(and(eq(neighborhoods.id, data.neighborhoodId), eq(neighborhoods.status, "Ativo"))).limit(1)).length) throw new Error("Bairro de origem indisponível.");
    const [old] = id ? await tx.select().from(addressTable).where(eq(addressTable.id, id)).limit(1) : [];
    if (id && !old) throw new Error("Endereço não encontrado.");
    if (old && (old.streetId || old.canonicalAddressId) && (old.streetName !== data.streetName || old.neighborhoodId !== data.neighborhoodId)) throw new Error("Endereço vinculado a logradouro canônico exige saneamento na origem antes da alteração.");
    const [address] = old ? await tx.update(addressTable).set(data).where(eq(addressTable.id, old.id)).returning() : await tx.insert(addressTable).values({ ...data, personId }).returning();
    addressIds.push(address.id);
  }
  for (const row of details.dependents) {
    const [person] = await tx.select().from(people).where(eq(people.cpf, row.cpf)).limit(1);
    if (!person || person.status !== "Ativo" || !person.birthDate || person.id === personId || person.fullName !== row.name || person.birthDate.toISOString().slice(0, 10) !== row.birthDate || person.birthDate > new Date()) throw new Error("Dependente exige pessoa física ativa, nome/CPF/nascimento conciliados no Cadastro Único. Regularize a origem antes do deferimento.");
    const [old] = row.id ? await tx.select().from(dependentTable).where(eq(dependentTable.id, row.id)).limit(1) : [];
    if (row.id && !old) throw new Error("Dependente não encontrado.");
    if (old?.personId && old.personId !== person.id || old?.cpf && requireValidCpf(old.cpf) !== person.cpf) throw new Error("Identidade do dependente diverge do registro de origem.");
    if ((await tx.select({ id: dependentTable.id }).from(dependentTable).where(and(eq(dependentTable.employeeId, employeeId), eq(dependentTable.personId, person.id), row.id ? ne(dependentTable.id, row.id) : undefined)).limit(1)).length) throw new Error("Pessoa já vinculada como dependente do titular.");
    const data = { employeeId, personId: person.id, name: person.fullName, cpf: person.cpf, birthDate: person.birthDate, relationship: row.relationship, irrfDependent: row.irrfDependent, familyWage: row.familyWage };
    const [dependent] = old ? await tx.update(dependentTable).set(data).where(eq(dependentTable.id, old.id)).returning() : await tx.insert(dependentTable).values(data).returning();
    dependentIds.push(dependent.id);
  }
  return { addressIds, dependentIds, previousEmployment: details.previousEmployment, documentVersionIds: details.documentVersionIds, automaticallyRecognizedServiceDays: false };
}
