import { createHash } from "node:crypto";
import { AccessError, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { and, asc, desc, eq, gte, inArray, lte, or, sql } from "drizzle-orm";
import { sstClinicalRecords, sstVaccinations, sstQuestionnaires, sstProfessionalRoles } from "@/db/schema/sst-clinical";
import { sstDisciplineGrants } from "@/db/schema/sst-access";
import { people } from "@/db/schema/people";
import { employees, institutions } from "@/db/schema/administration";
import { users } from "@/db/schema/identity";
import { reportTemplates } from "@/db/schema/report-template";
import { findSstPerson, findSstUnit, listSstUnits, sstParameters } from "@/db/repositories/sst/scope";
import { getPostgresError } from "@/db/errors";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { sstContextConnection, sstDatabase } from "./database";
import { professionalInput, clinicalRecordInput, vaccinationInput, disciplineInput, clinicalSnapshot, clinicalRequest, clinicalDisciplines, type ClinicalDiscipline } from "./clinical-policy";
import { assertDisciplineAccess } from "./clinical-access";
import { questionnaireQuestions, validateQuestionnaireAnswers } from "./questionnaire-policy";
import { SstValidationError } from "./errors";
import { z } from "zod";
import { createReportTemplatePresentation, reportTemplateScope } from "@/lib/reports/report-template";

const hash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const day = (value: Date) => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value)}T00:00:00Z`);
function assertCreate(context: AppContext) { if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("O perfil não permite incluir registros SST.", 403); }

const listInput = z.object({ discipline: disciplineInput, budgetUnitId: z.string().max(100).default(""), q: z.string().max(200).default(""), page: z.coerce.number().finite().int().positive().default(1) });
async function clinicalListScope(context: AppContext, raw: unknown, targetType: string) {
  const input = listInput.parse(raw);
  const units = await listSstUnits(sstDatabase(context), context, input.discipline);
  const unit = units.find((row) => row.id === input.budgetUnitId);
  const budgetUnitId = { in: input.budgetUnitId ? unit ? [unit.id] : [] : units.map((row) => row.id) };
  if (budgetUnitId.in.length) await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType, targetId: unit?.id || "AUTHORIZED_UNITS" });
  return { input, units, unit, budgetUnitId };
}
export async function listClinicalRecords(context: AppContext, raw: unknown) {
  const { input, units, unit, budgetUnitId } = await clinicalListScope(context, raw, "SST_CLINICAL_LIST");
  const where = and(eq(sstClinicalRecords.discipline, input.discipline), inArray(sstClinicalRecords.budgetUnitId, budgetUnitId.in), input.q.trim() ? sql`EXISTS (SELECT 1 FROM "Person" p WHERE p.id=${sstClinicalRecords.personId} AND p."fullName" ILIKE ${`%${input.q.trim().replace(/[\\%_]/g, "\\$&")}%`})` : undefined);
  const [count] = await sstDatabase(context).select({ total: sql<number>`count(*)::int` }).from(sstClinicalRecords).where(where);
  const total = count.total;
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
  const records = await sstDatabase(context).select({ id: sstClinicalRecords.id, attendedAt: sstClinicalRecords.attendedAt, snapshot: sstClinicalRecords.snapshot }).from(sstClinicalRecords).where(where).limit(20).offset((page - 1) * 20).orderBy(desc(sstClinicalRecords.attendedAt), asc(sstClinicalRecords.id));
  return { units, unit, records, total, page };
}
export async function listOccupationalVaccinations(context: AppContext, raw: unknown) {
  const { input, units, unit, budgetUnitId } = await clinicalListScope(context, raw, "SST_VACCINATION_LIST");
  if (input.discipline !== "MEDICINE" && input.discipline !== "NURSING") throw new SstValidationError("Consulta vacinal exige Medicina ou Enfermagem.");
  const where = inArray(sstVaccinations.budgetUnitId, budgetUnitId.in);
  const [count] = await sstDatabase(context).select({ total: sql<number>`count(*)::int` }).from(sstVaccinations).where(where);
  const total = count.total;
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
  const records = await sstDatabase(context).select({ id: sstVaccinations.id, administeredAt: sstVaccinations.administeredAt, doseNumber: sstVaccinations.doseNumber, nextDoseAt: sstVaccinations.nextDoseAt, snapshot: sstVaccinations.snapshot, lotNumber: sstVaccinations.lotNumber }).from(sstVaccinations).where(where).limit(20).offset((page - 1) * 20).orderBy(desc(sstVaccinations.administeredAt), asc(sstVaccinations.id));
  return { units, unit, records, total, page };
}

export async function clinicalRecordDocument(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1).max(100), printing: z.boolean().default(false), report: z.enum(["chart", "requests", "opinion"]).default("chart") }).parse(raw);
  if (input.printing && !canPerformModuleOperation(context.user, "SST", "issueReports")) throw new AccessError("O perfil não permite emitir relatórios SST.", 403);
  const [scope] = await sstDatabase(context).select({ budgetUnitId: sstClinicalRecords.budgetUnitId, discipline: sstClinicalRecords.discipline }).from(sstClinicalRecords).where(eq(sstClinicalRecords.id, input.id));
  if (!scope) throw new SstValidationError("Atendimento não encontrado.");
  const discipline = disciplineInput.parse(scope.discipline);
  await assertDisciplineAccess(context, scope.budgetUnitId, discipline);
  if (input.report === "opinion" && discipline !== "MEDICINE") throw new SstValidationError("Laudo médico ocupacional exige atuação em Medicina.");
  const [record] = await sstDatabase(context).select().from(sstClinicalRecords).where(eq(sstClinicalRecords.id, input.id));
  if (!record) throw new SstValidationError("Atendimento não encontrado.");
  const snapshot = clinicalSnapshot.parse(record.snapshot);
  const requests = z.array(clinicalRequest).max(100).parse(record.requests);
  const questionnaire = record.questionnaireVersionId ? z.object({ title: z.string(), version: z.number().int().positive(), questions: questionnaireQuestions }).parse(record.questionnaireSnapshot) : null;
  if (!Number.isFinite(record.attendedAt.getTime()) || !Number.isFinite(record.createdAt.getTime())) throw new SstValidationError("Datas do atendimento inválidas.");
  const presentation = input.printing ? await Promise.all([
    sstDatabase(context).select().from(reportTemplates).where(eq(reportTemplates.scope, reportTemplateScope)).limit(1).then(rows => rows[0] ?? null),
    sstDatabase(context).select({ name: institutions.name, legalName: institutions.legalName, cnpj: institutions.cnpj, address: institutions.address, city: institutions.city, state: institutions.state }).from(institutions).limit(1).then(rows => rows[0] ?? null),
  ]) : null;
  await writeAuditEvent(sstDatabase(context), { actorUsuarioId: context.user.id, eventType: input.printing ? auditEventTypes.reportIssued : auditEventTypes.pageView, targetType: "SST_CLINICAL_RECORD", targetId: input.id });
  return { record, snapshot, requests, questionnaire, discipline,
    title: input.report === "requests" ? "Solicitações e encaminhamentos" : input.report === "opinion" ? "Laudo médico ocupacional" : `Prontuário ocupacional · ${clinicalDisciplines[discipline]}`,
    template: presentation ? createReportTemplatePresentation(presentation[0]) : null,
    institution: presentation?.[1] || null,
    emission: input.printing ? { issuedAt: new Date().toISOString(), issuedBy: context.user.name } : null,
  };
}

export async function registerDisciplineGrant(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  if (!isSystemAdministrator(context.user)) throw new AccessError("Autorizações exigem administração técnica.", 403);
  const input = z.object({ usuarioId: z.string().min(1).max(100), budgetUnitId: z.string().min(1).max(100), discipline: disciplineInput, canRead: z.boolean(), canWrite: z.boolean(), isActive: z.boolean() }).parse(raw);
  if (input.canWrite && !input.canRead) throw new SstValidationError("Gravação exige também autorização de leitura.");
  return withDatabaseTransaction(connection, async (tx) => {
    if (!(await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.usuarioId), eq(users.ativo, true)))).length || !await findSstUnit(tx, input.budgetUnitId)) throw new SstValidationError("Usuário inexistente/inativo ou UG não encontrada.");
    const data = { canRead: input.canRead, canWrite: input.canWrite, isActive: input.isActive };
    const [grant] = await tx.insert(sstDisciplineGrants).values(input).onConflictDoUpdate({ target: [sstDisciplineGrants.usuarioId, sstDisciplineGrants.budgetUnitId, sstDisciplineGrants.discipline], set: data }).returning({ id: sstDisciplineGrants.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_DISCIPLINE_GRANT", targetId: grant.id });
    return grant.id;
  });
}

async function functionalSubject(tx: DatabaseTransaction, personId: string, budgetUnitId: string, when: Date, civilDate = false) {
  const [row] = await tx.select({ person: people, employee: { id: employees.id } }).from(people).leftJoin(employees, eq(people.id, employees.personId)).where(eq(people.id, personId));
  const person = row ? { ...row.person, employee: row.employee } : null;
  if (!person?.employee) throw new SstValidationError("Atendimento ocupacional exige servidor canônico e período funcional RH explícito.");
  // Match RH's history lock, without requiring the clinical actor to have RH permissions.
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`HR_FUNCTIONAL:${person.employee.id}`}))`);
  const date = when.toISOString().slice(0, 10);
  const instant = when.toISOString();
  const periods = (await tx.execute<{ id: string }>(sql`SELECT p.id FROM "HrEmployeeFunctionalPeriod" p WHERE p."employeeId"=${person.employee.id} AND p."budgetUnitId"=${budgetUnitId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND ${civilDate ? sql`p."startsAt"<= ((${date}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC') AND p."endsAt">= (((${date}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')` : sql`p."startsAt"<=${instant}::timestamp AND p."endsAt">${instant}::timestamp`}`)).rows;
  if (periods.length !== 1) throw new SstValidationError("Servidor sem período funcional RH explícito e inequívoco nesta UG/data.");
  return person;
}

export async function registerProfessionalRole(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  if (!isSystemAdministrator(context.user)) throw new AccessError("Habilitação profissional exige administração técnica.", 403);
  const input = professionalInput.parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    // Lock the UG/discipline: the same user cannot be linked concurrently to two people.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_PROFESSIONAL:${input.budgetUnitId}:${input.discipline}`}))`);
    if (!await findSstPerson(tx, input.personId) || !await findSstUnit(tx, input.budgetUnitId)) throw new SstValidationError("Pessoa ou UG não encontrada.");
    if (input.usuarioId && !(await tx.select({ id: users.id }).from(users).where(and(eq(users.id, input.usuarioId), eq(users.ativo, true)))).length) throw new SstValidationError("Usuário inexistente ou inativo.");
    const [conflict] = await tx.select().from(sstProfessionalRoles).where(and(eq(sstProfessionalRoles.budgetUnitId, input.budgetUnitId), eq(sstProfessionalRoles.discipline, input.discipline), eq(sstProfessionalRoles.isActive, true), or(eq(sstProfessionalRoles.personId, input.personId), input.usuarioId ? eq(sstProfessionalRoles.usuarioId, input.usuarioId) : undefined), lte(sstProfessionalRoles.startsAt, input.endsAt), gte(sstProfessionalRoles.endsAt, input.startsAt))).limit(1);
    if (conflict) {
      if (conflict.personId === input.personId && conflict.budgetUnitId === input.budgetUnitId && conflict.discipline === input.discipline && conflict.council === input.council && conflict.usuarioId === (input.usuarioId || null) && conflict.startsAt.getTime() === input.startsAt.getTime() && conflict.endsAt.getTime() === input.endsAt.getTime() && conflict.createdById === context.user.id) return conflict.id;
      throw new SstValidationError("Já existe habilitação sobreposta para a pessoa ou usuário nesta atuação/UG.");
    }
    const [record] = await tx.insert(sstProfessionalRoles).values({ ...input, usuarioId: input.usuarioId || null, createdById: context.user.id }).returning({ id: sstProfessionalRoles.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_PROFESSIONAL", targetId: record.id });
    return record.id;
  });
}

async function professional(tx: DatabaseTransaction, context: AppContext, id: string, budgetUnitId: string, discipline: ClinicalDiscipline, when: Date, civilDate = false) {
  const date = civilDate ? when : day(when);
  await tx.execute(sql`SELECT "id" FROM "SstProfessionalRole" WHERE "id" = ${id} FOR SHARE`);
  const [row] = await tx.select({ record: sstProfessionalRoles, person: { fullName: people.fullName } }).from(sstProfessionalRoles).innerJoin(people, eq(sstProfessionalRoles.personId, people.id)).where(and(eq(sstProfessionalRoles.id, id), eq(sstProfessionalRoles.budgetUnitId, budgetUnitId), eq(sstProfessionalRoles.discipline, discipline), eq(sstProfessionalRoles.isActive, true), lte(sstProfessionalRoles.startsAt, date), gte(sstProfessionalRoles.endsAt, date))).limit(1);
  const record = row ? { ...row.record, person: row.person } : null;
  if (!record || record.usuarioId !== context.user.id) throw new SstValidationError("Profissional fora da vigência, da UG/atuação ou sem vínculo com o usuário registrador.");
  return record;
}

export async function registerClinicalRecord(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertCreate(context);
  const input = clinicalRecordInput.parse(raw);
  await assertDisciplineAccess(context, input.budgetUnitId, input.discipline, true);
  if (input.attendedAt > new Date()) throw new SstValidationError("Atendimento não pode ter data futura.");
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_CLINICAL:${input.budgetUnitId}:${input.submissionKey}`}))`);
    const questionnaire = input.questionnaireVersionId ? (await tx.select().from(sstQuestionnaires).where(eq(sstQuestionnaires.id, input.questionnaireVersionId)))[0] : null;
    if (input.questionnaireVersionId && (!questionnaire || questionnaire.budgetUnitId !== input.budgetUnitId || questionnaire.discipline !== input.discipline)) throw new SstValidationError("Questionário incompatível com a UG ou atuação.");
    const questions = questionnaire ? questionnaireQuestions.parse(questionnaire.questions) : [];
    const answers = questionnaire ? validateQuestionnaireAnswers(questions, input.answers) : {};
    const requestHash = hash({ ...input, answers });
    const [existing] = await tx.select().from(sstClinicalRecords).where(and(eq(sstClinicalRecords.budgetUnitId, input.budgetUnitId), eq(sstClinicalRecords.submissionKey, input.submissionKey)));
    if (existing) { if (existing.createdById !== context.user.id || existing.requestHash !== requestHash) throw new SstValidationError("Submissão já utilizada com outros dados."); return existing.id; }
    const [author, subject, unit] = await Promise.all([
      professional(tx, context, input.professionalRoleId, input.budgetUnitId, input.discipline, input.attendedAt),
      functionalSubject(tx, input.personId, input.budgetUnitId, input.attendedAt),
      findSstUnit(tx, input.budgetUnitId),
    ]);
    const medicineIds = input.requests.flatMap((request) => request.kind === "MEDICATION" ? [request.medicineId] : []);
    if (!unit) throw new SstValidationError("UG não encontrada.");
    const medicines = medicineIds.length ? (await tx.execute<{ id: string; name: string }>(sql`SELECT id,name FROM "Medicine" WHERE id IN (${sstParameters([...new Set(medicineIds)])}) AND "isActive"`)).rows : [];
    if (medicines.length !== new Set(medicineIds).size) throw new SstValidationError("Medicamento inexistente ou inativo no catálogo canônico.");
    const [record] = await tx.insert(sstClinicalRecords).values({
      ...input, cidCodes: [...new Set(input.cidCodes)], questionnaireVersionId: questionnaire?.id || null,
      questionnaireSnapshot: questionnaire ? { title: questionnaire.title, code: questionnaire.code, version: questionnaire.version, questions } : {}, answers,
      requests: input.requests.map((request) => request.kind === "MEDICATION" ? { ...request, description: medicines.find((medicine) => medicine.id === request.medicineId)!.name } : request),
      snapshot: { personName: subject.fullName, professionalName: author.person.fullName, council: author.council, unitName: unit.name, recordedByName: context.user.name },
      requestHash, createdById: context.user.id,
    }).returning({ id: sstClinicalRecords.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CLINICAL_RECORD", targetId: record.id });
    return record.id;
  });
}

export async function registerOccupationalVaccination(context: AppContext, raw: unknown, connection: DatabaseConnection = sstContextConnection(context)) {
  assertCreate(context);
  const input = vaccinationInput.parse(raw);
  const [role] = await sstDatabase(context).select({ discipline: sstProfessionalRoles.discipline }).from(sstProfessionalRoles).where(eq(sstProfessionalRoles.id, input.professionalRoleId));
  const discipline = disciplineInput.parse(role?.discipline);
  if (discipline !== "MEDICINE" && discipline !== "NURSING") throw new SstValidationError("Registro vacinal exige profissional de Medicina ou Enfermagem.");
  await assertDisciplineAccess(context, input.budgetUnitId, discipline, true);
  if (input.administeredAt > day(new Date())) throw new SstValidationError("Vacinação não pode ter data futura.");
  const requestHash = hash(input);
  return withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_VACCINE:${input.budgetUnitId}:${input.submissionKey}`}))`);
    const [existing] = await tx.select().from(sstVaccinations).where(and(eq(sstVaccinations.budgetUnitId, input.budgetUnitId), eq(sstVaccinations.submissionKey, input.submissionKey)));
    if (existing) { if (existing.createdById !== context.user.id || existing.requestHash !== requestHash) throw new SstValidationError("Submissão já utilizada com outros dados."); return existing.id; }
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`SST_VACCINE_DOSE:${input.personId}:${input.vaccineId}:${input.doseNumber}:${input.administeredAt.toISOString().slice(0, 10)}`}))`);
    if ((await tx.select({ id: sstVaccinations.id }).from(sstVaccinations).where(and(eq(sstVaccinations.personId, input.personId), eq(sstVaccinations.vaccineId, input.vaccineId), eq(sstVaccinations.doseNumber, input.doseNumber), eq(sstVaccinations.administeredAt, input.administeredAt))).limit(1)).length) throw new SstValidationError("Dose desta vacina já registrada para o servidor nesta data.");
    const [author, person, unit, vaccine] = await Promise.all([professional(tx, context, input.professionalRoleId, input.budgetUnitId, discipline, input.administeredAt, true), functionalSubject(tx, input.personId, input.budgetUnitId, input.administeredAt, true), findSstUnit(tx, input.budgetUnitId), tx.execute<{ id: string; name: string }>(sql`SELECT id,name FROM "Vaccine" WHERE id=${input.vaccineId} AND "isActive" LIMIT 1`).then(result => result.rows[0])]);
    if (!vaccine) throw new SstValidationError("Vacina inexistente ou inativa no catálogo canônico.");
    if (!unit) throw new SstValidationError("UG não encontrada.");
    const [record] = await tx.insert(sstVaccinations).values({ ...input, snapshot: { personName: person.fullName, professionalName: author.person.fullName, council: author.council, unitName: unit.name, vaccineName: vaccine.name, recordedByName: context.user.name }, requestHash, createdById: context.user.id }).returning({ id: sstVaccinations.id });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_VACCINATION", targetId: record.id });
    return record.id;
  }).catch((error: unknown) => {
    const postgres = getPostgresError(error);
    if (postgres?.code === "23505" && postgres.constraint === "SstVaccination_person_vaccine_dose_date_key") throw new SstValidationError("Dose desta vacina já registrada para o servidor nesta data.");
    throw error;
  });
}
