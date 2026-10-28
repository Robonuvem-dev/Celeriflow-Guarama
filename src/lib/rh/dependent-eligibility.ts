import { and, asc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { dependents } from "@/db/schema/personnel-records";
import { people } from "@/db/schema/people";
import { documents as documentTable } from "@/db/schema/registry";
import { z } from "zod";

export const dependentEligibilityPolicySchema = z.object({
  relationships: z.array(z.object({ relationship: z.string().trim().min(1), maxAgeYears: z.number().int().min(0).max(120).nullable() }).strict()).min(1),
  requiredDocumentTypes: z.array(z.string().trim().min(1)),
  acceptedDocumentStatuses: z.array(z.string().min(1)).min(1),
  allowDocumentsWithoutExpiry: z.boolean(),
  legalReference: z.string().trim().min(3),
}).strict().superRefine((policy, context) => {
  if (new Set(policy.relationships.map(item => item.relationship)).size !== policy.relationships.length || new Set(policy.requiredDocumentTypes).size !== policy.requiredDocumentTypes.length) context.addIssue({ code: "custom", message: "Parentescos/tipos documentais duplicados na política." });
});

export const familyWagePolicySchema = z.object({
  origin: z.literal("SALARIO_FAMILIA"), rubricCode: z.string().min(1),
  incomeLimit: z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/), quota: z.string().regex(/^\d{1,15}(?:\.\d{1,2})?$/),
  proration: z.enum(["INTEGRAL", "POR_DIAS"]), allocationBasis: z.enum(["DIAS", "REMUNERACAO"]),
  eligibility: dependentEligibilityPolicySchema,
}).strict();

const eligibilityMemorySchema = z.array(z.object({ dependentId: z.string(), personId: z.string().nullable(), relationship: z.string(), birthDate: z.string().nullable(), age: z.number().nullable(), eligible: z.boolean(), reasons: z.array(z.string()), documentIds: z.array(z.string()) }));
export const dependentAssessmentSchema = z.object({ policy: dependentEligibilityPolicySchema, memory: eligibilityMemorySchema, eligibleCount: z.number().int().nonnegative() });
export const familyWageSnapshotSchema = z.object({ policy: familyWagePolicySchema, memory: eligibilityMemorySchema, eligibleCount: z.number().int().nonnegative(), income: z.string(), incomeEligible: z.boolean(), factor: z.string(), amount: z.string(), allocations: z.array(z.object({ contractId: z.string(), value: z.string() })) });

type Candidate = { id: string; personId: string | null; relationship: string; person: { id: string; birthDate: Date | null; status: string } | null };
type Evidence = { id: string; personId: string | null; documentType: string; status: string; validUntil: Date | null };

function birthday(birthDate: Date, year: number) {
  const lastDay = new Date(Date.UTC(year, birthDate.getUTCMonth() + 1, 0)).getUTCDate();
  return new Date(Date.UTC(year, birthDate.getUTCMonth(), Math.min(lastDay, birthDate.getUTCDate())));
}

export function evaluateDependentEligibility(candidate: Candidate, documents: Evidence[], policy: z.infer<typeof dependentEligibilityPolicySchema>, period: { start: Date; end: Date }) {
  const reasons: string[] = []; const documentIds: string[] = [];
  const person = candidate.person;
  if (!person || !candidate.personId || person.id !== candidate.personId || person.status !== "Ativo") reasons.push("Pessoa física central ativa obrigatória.");
  const relationship = policy.relationships.find(item => item.relationship === candidate.relationship);
  if (!relationship) reasons.push("Parentesco não elegível pela política.");
  const date = new Date(Date.UTC(period.end.getUTCFullYear(), period.end.getUTCMonth(), period.end.getUTCDate()));
  let age: number | null = null;
  if (!person?.birthDate || person.birthDate > date) reasons.push("Nascimento central ausente ou inválido.");
  else {
    age = date.getUTCFullYear() - person.birthDate.getUTCFullYear();
    if (date < birthday(person.birthDate, date.getUTCFullYear())) age--;
    if (relationship?.maxAgeYears !== null && relationship?.maxAgeYears !== undefined && age > relationship.maxAgeYears) reasons.push("Idade acima do limite do parentesco na competência.");
  }
  for (const type of policy.requiredDocumentTypes) {
    const valid = documents.filter(document => document.personId === candidate.personId && document.documentType === type && policy.acceptedDocumentStatuses.includes(document.status) && (document.validUntil ? document.validUntil >= period.end : policy.allowDocumentsWithoutExpiry)).sort((a, b) => a.id.localeCompare(b.id))[0];
    if (!valid) reasons.push(`Documento ${type} ausente, não aprovado ou vencido na competência.`);
    else documentIds.push(valid.id);
  }
  return { dependentId: candidate.id, personId: candidate.personId, relationship: candidate.relationship, birthDate: person?.birthDate?.toISOString() || null, age, eligible: reasons.length === 0, reasons, documentIds };
}

export async function assessPayrollDependents(tx: DatabaseExecutor, employeeIds: string[], flag: "familyWage" | "irrfDependent", rawPolicy: unknown, period: { start: Date; end: Date }) {
  const policy = dependentEligibilityPolicySchema.parse(rawPolicy);
  const candidates = await tx.select({ id: dependents.id, personId: dependents.personId, relationship: dependents.relationship, person: { id: people.id, birthDate: people.birthDate, status: people.status } }).from(dependents).leftJoin(people, eq(people.id, dependents.personId)).where(and(inArray(dependents.employeeId, employeeIds), eq(dependents[flag], true))).orderBy(asc(dependents.id));
  const linked = candidates.map(candidate => candidate.personId).filter((id): id is string => Boolean(id));
  if (new Set(linked).size !== linked.length) throw new Error("Dependente repetido no Cadastro Único; saneie a duplicidade antes de calcular.");
  const documents = await tx.select({ id: documentTable.id, personId: documentTable.personId, documentType: documentTable.documentType, status: documentTable.status, validUntil: documentTable.validUntil }).from(documentTable).where(and(inArray(documentTable.personId, linked), inArray(documentTable.documentType, policy.requiredDocumentTypes)));
  const memory = candidates.map(candidate => evaluateDependentEligibility(candidate, documents, policy, period));
  return { policy, memory, eligibleCount: memory.filter(item => item.eligible).length };
}
