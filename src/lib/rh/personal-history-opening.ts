import { eq, sql } from "drizzle-orm";
import { z } from "zod";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { hrPersonalRevisions } from "@/db/schema/personnel-functional-management";
import { lockPersonnel, enqueueHrIntegration, personnelJson } from "@/db/repositories/personnel/integration";
import type { AppContext } from "@/lib/platform/tenant-context";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { assertFunctionalHolderAccess } from "./functional-record-service";

const text = z.string().trim().max(500).default("");
const openingInput = z.object({ employeeId: z.string().min(1), referenceDate: z.iso.date(), source: z.string().trim().min(10).max(2000), reason: z.string().trim().min(10).max(3000), name: z.string().trim().min(3).max(300), registration: z.string().trim().min(1).max(100), cpf: z.string().min(11), rg: text, rgIssuer: text, birthDate: z.union([z.iso.date(), z.literal("")]).default(""), gender: text, nationality: text, birthPlace: text, maritalStatus: text, motherName: text, fatherName: text, educationLevel: text, phone: text, email: z.union([z.email(), z.literal("")]).default(""), streetName: text, number: text, neighborhood: text, city: text, state: text, zipCode: text, complement: text, pisPasep: z.string().regex(/^(?:\d{11})?$/).default(""), ctps: text, ctpsSeries: text, ctpsState: text }).strict();

/** Documentary opening fills an earlier gap; it never replaces observations or closed payroll snapshots. */
export async function openDocumentedPersonalHistory(connection: DatabaseConnection, context: AppContext, raw: unknown) {
  const input = openingInput.parse(raw), effectiveFrom = new Date(`${input.referenceDate}T00:00:00Z`), cpf = requireValidCpf(input.cpf);
  if (effectiveFrom > new Date() || input.birthDate && input.birthDate > input.referenceDate) throw new Error("Referência histórica e nascimento incompatíveis.");
  return withDatabaseTransaction(connection, async tx => {
    await lockPersonnel(tx, `employee:${input.employeeId}`);
    await assertFunctionalHolderAccess(tx, context, input.employeeId);
    const [holder] = await tx.select().from(employees).where(eq(employees.id, input.employeeId));
    if (!holder?.personId) throw new Error("Titular sem pessoa vinculada ao Cadastro Único.");
    const [person] = await tx.select({ cpf: people.cpf }).from(people).where(eq(people.id, holder.personId));
    if (!person?.cpf || requireValidCpf(person.cpf) !== cpf) throw new Error("A abertura deve documentar a mesma pessoa física vinculada ao titular.");
    const [earliest] = await tx.select().from(hrPersonalRevisions).where(sql`${hrPersonalRevisions.employeeId}=${holder.id} AND NOT (${hrPersonalRevisions.snapshot} ? 'historicalOpening')`).orderBy(hrPersonalRevisions.effectiveFrom).limit(1);
    if (earliest && earliest.effectiveFrom <= effectiveFrom) throw new Error("A posição histórica deve anteceder a primeira observação cadastral; observações já preservadas não podem ser substituídas.");
    if ((await tx.select({ id: hrPersonalRevisions.id }).from(hrPersonalRevisions).where(sql`${hrPersonalRevisions.employeeId}=${holder.id} AND ${hrPersonalRevisions.effectiveFrom}=${effectiveFrom}`).limit(1)).length) throw new Error("Já existe uma fotografia imutável nesta referência; não é permitido substituí-la.");
    const identity = { id: holder.personId, fullName: input.name, cpf, rg: input.rg || null, rgIssuer: input.rgIssuer || null, birthDate: input.birthDate || null, gender: input.gender || null, nationality: input.nationality || null, birthPlace: input.birthPlace || null, maritalStatus: input.maritalStatus || null, motherName: input.motherName || null, fatherName: input.fatherName || null, educationLevel: input.educationLevel || null, phonePrimary: input.phone || null, email: input.email || null };
    const snapshot = personnelJson({ employee: { id: holder.id, personId: holder.personId, name: input.name, registration: input.registration, cpf, phone: input.phone || null, email: input.email || null }, person: identity,
      addresses: input.streetName ? [{ id: `HISTORICO:${holder.id}:${input.referenceDate}`, streetName: input.streetName, number: input.number, neighborhood: input.neighborhood, city: input.city, state: input.state, zipCode: input.zipCode, complement: input.complement }] : [], documents: [], dependents: [],
      functionalIdentification: input.pisPasep || input.ctps ? [{ id: `HISTORICO:${holder.id}:${input.referenceDate}:IDENTIFICACAO`, startsAt: input.referenceDate, endsAt: null, status: "ATIVO", data: { pisPasep: input.pisPasep, ctps: input.ctps, ctpsSeries: input.ctpsSeries, ctpsState: input.ctpsState, legalReference: input.source } }] : [],
      historicalOpening: { source: input.source, reason: input.reason, recordedAt: new Date().toISOString(), actorId: context.user.id, sectionsNotDocumented: ["Documentos anexos", "Dependentes", "Formação detalhada", ...(!input.streetName ? ["Endereços"] : [])], blankFields: "Não documentados na fonte; não presumidos a partir do cadastro atual" } });
    await tx.execute(sql`SELECT set_config('celeriflow.actor_id',${context.user.id},true)`);
    const [revision] = await tx.insert(hrPersonalRevisions).values({ employeeId: holder.id, effectiveFrom, snapshot, actorId: context.user.id, reason: `Abertura histórica documentada: ${input.reason}; fonte: ${input.source}` }).returning();
    await enqueueHrIntegration(tx, { sourceKey: `ABERTURA_HISTORICO_CADASTRAL:${revision.id}`, domain: "AUDITORIA", environment: "INTERNO", eventType: "HISTORICO_CADASTRAL_ABERTO", payload: { employeeId: holder.id, revisionId: revision.id, referenceDate: input.referenceDate, source: input.source, actorId: context.user.id, closedPayrollPreserved: true } });
    return { id: revision.id };
  });
}
