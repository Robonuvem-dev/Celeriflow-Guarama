import { z } from "zod";
import { and, asc, eq, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { healthPatientCalls, healthPatientContacts, healthPatientRegistrationChanges, healthPatientRegistrations, patients } from "@/db/schema/health-registration";
import { people } from "@/db/schema/people";
import { instanceParameters, systemInstances } from "@/db/schema/instance-configuration";
import { findHealthPatientRegistration, findHealthPatientWithAddresses } from "@/db/repositories/health/registration";
import { runHealthTransaction } from "./health-transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";
import { patientRegistrationPolicyKey, patientRegistrationPolicySchema, cpfRequired, registrationValidity } from "./patient-registration-policy";

type Tx = DatabaseExecutor;
const optional = z.string().trim().max(2000).nullable().optional();
export const registrationDetailsSchema = z.object({
  stage: z.enum(["PRE", "COMPLETE"]), fullName: z.string().trim().min(1).max(200), cpf: optional,
  birthDate: z.iso.date().nullable().optional(), gender: optional, raceColor: optional,
  motherName: optional, fatherName: optional, motherUnknown: z.boolean().default(false), fatherUnknown: z.boolean().default(false),
  phonePrimary: optional, whatsapp: optional, email: z.email().nullable().optional(), profession: optional,
  workplace: optional, socialMotherName: optional, socialFatherName: optional,
  contactStartTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
  contactEndTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/).nullable().optional(),
}).strict();

export async function getPatientRegistrationPolicy(tx: Tx, unitId: string | null) {
  const parameter = unitId ? (await tx.select({ valor: instanceParameters.valor }).from(instanceParameters).where(eq(instanceParameters.chave, patientRegistrationPolicyKey(unitId))).limit(1))[0] : null;
  return patientRegistrationPolicySchema.parse(parameter?.valor || {});
}

export async function configurePatientRegistration(context: AppContext, unitId: string, raw: unknown) {
  const policy = patientRegistrationPolicySchema.parse(raw);
  assertHealthUnitAccess(context.user, unitId);
  return runHealthTransaction(context, async tx => {
    if (!(await tx.execute(sql`SELECT id FROM "HealthUnit" WHERE id=${unitId} AND "isActive"=true LIMIT 1`)).rows.length) throw new Error("Selecione uma unidade ativa.");
    const [instance] = await tx.select({ id: systemInstances.id }).from(systemInstances).orderBy(asc(systemInstances.createdAt)).limit(1);
    if (!instance) throw new Error("Configuração da instância não encontrada.");
    const [parameter] = await tx.insert(instanceParameters).values({ configuracaoInstanciaId: instance.id, chave: patientRegistrationPolicyKey(unitId), valor: policy }).onConflictDoUpdate({ target: [instanceParameters.configuracaoInstanciaId, instanceParameters.chave], set: { valor: policy } }).returning();
    return parameter;
  });
}

export async function validateRegistrationIdentity(tx: Tx, unitId: string | null, raw: z.input<typeof registrationDetailsSchema>) {
  const input = registrationDetailsSchema.parse(raw);
  const birthDate = input.birthDate ? new Date(`${input.birthDate}T12:00:00Z`) : null;
  const policy = await getPatientRegistrationPolicy(tx, unitId);
  const cpf = input.cpf ? requireValidCpf(input.cpf) : null;
  if (!cpf && cpfRequired(policy, input.stage, birthDate)) throw new Error("Informe CPF conforme a idade exigida pela unidade.");
  if (input.stage === "COMPLETE") {
    if (!birthDate || !input.gender || !input.raceColor) throw new Error("Cadastro completo exige nascimento, sexo e raça/cor.");
    if (!input.motherUnknown && !input.motherName || !input.fatherUnknown && !input.fatherName) throw new Error("Informe a filiação ou marque desconhecimento.");
  }
  if (input.contactStartTime && input.contactEndTime && input.contactEndTime <= input.contactStartTime) throw new Error("O horário final de contato deve ser posterior ao inicial.");
  return { input, birthDate, cpf };
}

export async function assertPatientRegistrationCurrent(tx: Tx, patientId: string, unitId: string, urgency = false) {
  const patient = await findHealthPatientRegistration(tx, patientId);
  if (patient.status !== "Ativo" || patient.person.deathDate || patient.person.status !== "Ativo") throw new Error("Paciente não está ativo para atendimento.");
  const policy = await getPatientRegistrationPolicy(tx, unitId);
  const stage = patient.registrationProfile?.stage || "COMPLETE";
  const validity = registrationValidity(policy, stage, patient.registrationProfile?.reviewedAt || patient.createdAt);
  if (urgency && policy.allowOutdatedForUrgency) return patient;
  if (stage !== "COMPLETE" || validity.expired) throw new Error("Complete ou atualize o cadastro do paciente conforme a política da unidade.");
  if (!patient.person.cpf && cpfRequired(policy, stage, patient.person.birthDate)) throw new Error("Atualize o CPF exigido pela política de idade da unidade.");
  return patient;
}

export async function scopedPatient(tx: Tx, context: AppContext, patientId: string) {
  const patient = await findHealthPatientWithAddresses(tx, patientId);
  if (patient.referenceUnitId) assertHealthUnitAccess(context.user, patient.referenceUnitId);
  else if (context.user.hasHealthAccessScope) throw new Error("Paciente sem unidade de referência autorizada.");
  return patient;
}

export async function savePatientRegistrationDetails(context: AppContext, patientId: string, raw: z.input<typeof registrationDetailsSchema>) {
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "Patient" WHERE id=${patientId} FOR UPDATE`);
    const patient = await scopedPatient(tx, context, patientId);
    const { input, cpf, birthDate } = await validateRegistrationIdentity(tx, patient.referenceUnitId, raw);
    if (patient.person.cpf && !cpf) throw new Error("O CPF já informado no cadastro único deve ser preservado.");
    const personData = { fullName: input.fullName, cpf, birthDate, gender: input.gender || null, raceColor: input.raceColor || null, motherName: input.motherUnknown ? null : input.motherName || null, fatherName: input.fatherUnknown ? null : input.fatherName || null, motherUnknown: input.motherUnknown, fatherUnknown: input.fatherUnknown, phonePrimary: input.phonePrimary || null, whatsapp: input.whatsapp || null, email: input.email || null, profession: input.profession || null };
    const changes = (Object.keys(personData) as (keyof typeof personData)[]).filter(key => JSON.stringify(patient.person[key]) !== JSON.stringify(personData[key])).map(field => {
      const before = patient.person[field], after = personData[field];
      return { field, before: before instanceof Date ? before.toISOString() : before, after: after instanceof Date ? after.toISOString() : after };
    });
    await tx.update(people).set(personData).where(eq(people.id, patient.personId));
    const profileData = { stage: input.stage, reviewedAt: new Date(), workplace: input.workplace || null, socialMotherName: input.socialMotherName || null, socialFatherName: input.socialFatherName || null, contactStartTime: input.contactStartTime || null, contactEndTime: input.contactEndTime || null };
    await tx.insert(healthPatientRegistrations).values({ patientId, ...profileData }).onConflictDoUpdate({ target: healthPatientRegistrations.patientId, set: profileData });
    await tx.insert(healthPatientRegistrationChanges).values({ patientId, actorUsuarioId: context.user.id, changes: JSON.parse(JSON.stringify([...changes, { field: "registrationProfile", before: patient.registrationProfile, after: profileData }])) });
    return { patientId };
  });
}

export async function recordPatientDeath(context: AppContext, patientId: string, raw: unknown) {
  return runHealthTransaction(context, tx => recordPatientDeathInTransaction(tx, context, patientId, raw));
}

export async function recordPatientDeathInTransaction(tx: Tx, context: AppContext, patientId: string, raw: unknown) {
  const input = z.object({ deathDate: z.iso.date(), registeredAt: z.iso.date(), municipality: z.string().trim().min(1).max(200), cause: z.string().trim().min(1).max(4000), cidReferenceId: z.string().min(1).nullable().optional() }).strict().parse(raw);
  const deathDate = new Date(`${input.deathDate}T12:00:00Z`), registeredAt = new Date(`${input.registeredAt}T12:00:00Z`);
  if (deathDate > new Date() || registeredAt < deathDate) throw new Error("Confira as datas do falecimento e de emissão do registro.");
    const patient = await scopedPatient(tx, context, patientId);
    if (input.cidReferenceId && !(await tx.execute(sql`SELECT id FROM "HealthSusReference" WHERE id=${input.cidReferenceId} AND kind='CID' LIMIT 1`)).rows.length) throw new Error("CID não encontrado.");
    await tx.update(people).set({ deathDate, status: "Falecido" }).where(eq(people.id, patient.personId));
    await tx.update(patients).set({ status: "Falecido" }).where(eq(patients.id, patientId));
    const data = { deathRegisteredAt: registeredAt, deathMunicipality: input.municipality, deathCause: input.cause, deathCidReferenceId: input.cidReferenceId || null };
    await tx.insert(healthPatientRegistrations).values({ patientId, ...data }).onConflictDoUpdate({ target: healthPatientRegistrations.patientId, set: data });
    await tx.insert(healthPatientRegistrationChanges).values({ patientId, actorUsuarioId: context.user.id, changes: { field: "death", before: { date: patient.person.deathDate?.toISOString() || null, status: patient.status }, after: { ...input } } });
    return { patientId };
}

export async function savePatientContact(context: AppContext, patientId: string, raw: unknown) {
  const input = z.object({ id: z.string().optional(), name: z.string().trim().min(1).max(200), phone: z.string().trim().min(1).max(50), kinship: z.string().trim().min(1).max(100), relationshipKind: z.enum(["BIOLOGICAL", "SOCIOAFFECTIVE"]), startTime: optional, endTime: optional, isActive: z.boolean().default(true) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    await scopedPatient(tx, context, patientId);
    const { id, ...values } = input;
    const data = { ...values, patientId, actorUsuarioId: context.user.id };
    if (id) {
      const [contact] = await tx.update(healthPatientContacts).set(data).where(and(eq(healthPatientContacts.id, id), eq(healthPatientContacts.patientId, patientId))).returning();
      if (!contact) throw new Error("Contato não pertence ao paciente.");
      return contact;
    }
    const [contact] = await tx.insert(healthPatientContacts).values(data).returning();
    return contact;
  });
}

export async function recordPatientPhoneCall(context: AppContext, patientId: string, raw: unknown) {
  const input = z.object({ calledAt: z.coerce.date(), phone: z.string().trim().min(1).max(50), result: z.string().trim().min(1).max(500), notes: optional, regulationRequestId: z.string().nullable().optional() }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    await scopedPatient(tx, context, patientId);
    if (input.regulationRequestId && !(await tx.execute(sql`SELECT id FROM "HealthRegulationRequest" WHERE id=${input.regulationRequestId} AND "patientId"=${patientId} LIMIT 1`)).rows.length) throw new Error("Pedido de regulação não pertence ao paciente.");
    const [call] = await tx.insert(healthPatientCalls).values({ ...input, patientId, actorUsuarioId: context.user.id }).returning();
    return call;
  });
}
