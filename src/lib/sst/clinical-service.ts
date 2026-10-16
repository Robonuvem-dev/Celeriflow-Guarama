import { createHash } from "node:crypto";
import { AccessError, canPerformModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";
import { professionalInput, clinicalRecordInput, vaccinationInput, disciplineInput, clinicalSnapshot, clinicalRequest, clinicalDisciplines, type ClinicalDiscipline } from "./clinical-policy";
import { assertDisciplineAccess, disciplineUnitWhere } from "./clinical-access";
import { questionnaireQuestions, validateQuestionnaireAnswers } from "./questionnaire-policy";
import { SstValidationError } from "./errors";
import type { Prisma } from "@prisma/client";
import { z } from "zod";
import { createReportTemplatePresentation, reportTemplateScope } from "@/lib/reports/report-template";

const hash = (input: unknown) => createHash("sha256").update(JSON.stringify(input)).digest("hex");
const day = (value: Date) => new Date(`${new Intl.DateTimeFormat("en-CA", { timeZone: "America/Sao_Paulo", year: "numeric", month: "2-digit", day: "2-digit" }).format(value)}T00:00:00Z`);
function assertCreate(context: AppContext) { if (!canPerformModuleOperation(context.user, "SST", "create")) throw new AccessError("O perfil não permite incluir registros SST.", 403); }

const listInput = z.object({ discipline: disciplineInput, budgetUnitId: z.string().max(100).default(""), q: z.string().max(200).default(""), page: z.coerce.number().finite().int().positive().default(1) });
async function clinicalListScope(context: AppContext, raw: unknown, targetType: string) {
  const input = listInput.parse(raw);
  const units = await context.prisma.budgetUnit.findMany({ where: disciplineUnitWhere(context, input.discipline), select: { id: true, name: true }, orderBy: { name: "asc" } });
  const unit = units.find((row) => row.id === input.budgetUnitId);
  const budgetUnitId = { in: input.budgetUnitId ? unit ? [unit.id] : [] : units.map((row) => row.id) };
  if (budgetUnitId.in.length) await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.pageView, targetType, targetId: unit?.id || "AUTHORIZED_UNITS" });
  return { input, units, unit, budgetUnitId };
}
export async function listClinicalRecords(context: AppContext, raw: unknown) {
  const { input, units, unit, budgetUnitId } = await clinicalListScope(context, raw, "SST_CLINICAL_LIST");
  const where = { discipline: input.discipline, budgetUnitId, ...(input.q.trim() ? { person: { fullName: { contains: input.q.trim(), mode: "insensitive" as const } } } : {}) };
  const total = await context.prisma.sstClinicalRecord.count({ where });
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
  const records = await context.prisma.sstClinicalRecord.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: [{ attendedAt: "desc" }, { id: "asc" }], select: { id: true, attendedAt: true, snapshot: true } });
  return { units, unit, records, total, page };
}
export async function listOccupationalVaccinations(context: AppContext, raw: unknown) {
  const { input, units, unit, budgetUnitId } = await clinicalListScope(context, raw, "SST_VACCINATION_LIST");
  if (input.discipline !== "MEDICINE" && input.discipline !== "NURSING") throw new SstValidationError("Consulta vacinal exige Medicina ou Enfermagem.");
  const where = { budgetUnitId };
  const total = await context.prisma.sstVaccination.count({ where });
  const page = Math.min(input.page, Math.max(1, Math.ceil(total / 20)));
  const records = await context.prisma.sstVaccination.findMany({ where, take: 20, skip: (page - 1) * 20, orderBy: [{ administeredAt: "desc" }, { id: "asc" }], select: { id: true, administeredAt: true, doseNumber: true, nextDoseAt: true, snapshot: true, lotNumber: true } });
  return { units, unit, records, total, page };
}

export async function clinicalRecordDocument(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().min(1).max(100), printing: z.boolean().default(false), report: z.enum(["chart", "requests", "opinion"]).default("chart") }).parse(raw);
  if (input.printing && !canPerformModuleOperation(context.user, "SST", "issueReports")) throw new AccessError("O perfil não permite emitir relatórios SST.", 403);
  const scope = await context.prisma.sstClinicalRecord.findUnique({ where: { id: input.id }, select: { budgetUnitId: true, discipline: true } });
  if (!scope) throw new SstValidationError("Atendimento não encontrado.");
  const discipline = disciplineInput.parse(scope.discipline);
  await assertDisciplineAccess(context, scope.budgetUnitId, discipline);
  if (input.report === "opinion" && discipline !== "MEDICINE") throw new SstValidationError("Laudo médico ocupacional exige atuação em Medicina.");
  const record = await context.prisma.sstClinicalRecord.findUniqueOrThrow({ where: { id: input.id } });
  const snapshot = clinicalSnapshot.parse(record.snapshot);
  const requests = z.array(clinicalRequest).max(100).parse(record.requests);
  const questionnaire = record.questionnaireVersionId ? z.object({ title: z.string(), version: z.number().int().positive(), questions: questionnaireQuestions }).parse(record.questionnaireSnapshot) : null;
  if (!Number.isFinite(record.attendedAt.getTime()) || !Number.isFinite(record.createdAt.getTime())) throw new SstValidationError("Datas do atendimento inválidas.");
  const presentation = input.printing ? await Promise.all([
    context.prisma.reportTemplate.findUnique({ where: { scope: reportTemplateScope } }),
    context.prisma.institution.findFirst({ select: { name: true, legalName: true, cnpj: true, address: true, city: true, state: true } }),
  ]) : null;
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: input.printing ? auditEventTypes.reportIssued : auditEventTypes.pageView, targetType: "SST_CLINICAL_RECORD", targetId: input.id });
  return { record, snapshot, requests, questionnaire, discipline,
    title: input.report === "requests" ? "Solicitações e encaminhamentos" : input.report === "opinion" ? "Laudo médico ocupacional" : `Prontuário ocupacional · ${clinicalDisciplines[discipline]}`,
    template: presentation ? createReportTemplatePresentation(presentation[0]) : null,
    institution: presentation?.[1] || null,
    emission: input.printing ? { issuedAt: new Date().toISOString(), issuedBy: context.user.name } : null,
  };
}

export async function registerDisciplineGrant(context: AppContext, raw: unknown) {
  if (!isSystemAdministrator(context.user)) throw new AccessError("Autorizações exigem administração técnica.", 403);
  const input = z.object({ usuarioId: z.string().min(1).max(100), budgetUnitId: z.string().min(1).max(100), discipline: disciplineInput, canRead: z.boolean(), canWrite: z.boolean(), isActive: z.boolean() }).parse(raw);
  if (input.canWrite && !input.canRead) throw new SstValidationError("Gravação exige também autorização de leitura.");
  return context.prisma.$transaction(async (tx) => {
    if (!await tx.usuario.findFirst({ where: { id: input.usuarioId, ativo: true }, select: { id: true } }) || !await tx.budgetUnit.findUnique({ where: { id: input.budgetUnitId }, select: { id: true } })) throw new SstValidationError("Usuário inexistente/inativo ou UG não encontrada.");
    const { usuarioId, budgetUnitId, discipline, ...data } = input;
    const grant = await tx.sstDisciplineGrant.upsert({ where: { usuarioId_budgetUnitId_discipline: { usuarioId, budgetUnitId, discipline } }, create: input, update: data });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_DISCIPLINE_GRANT", targetId: grant.id });
    return grant.id;
  });
}

async function functionalSubject(tx: Prisma.TransactionClient, personId: string, budgetUnitId: string, when: Date, civilDate = false) {
  const person = await tx.person.findUnique({ where: { id: personId }, include: { employee: { select: { id: true } } } });
  if (!person?.employee) throw new SstValidationError("Atendimento ocupacional exige servidor canônico e período funcional RH explícito.");
  // Match RH's history lock, without requiring the clinical actor to have RH permissions.
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HR_FUNCTIONAL:${person.employee.id}`}))`;
  const date = when.toISOString().slice(0, 10);
  const instant = when.toISOString();
  const periods = civilDate
    ? await tx.$queryRaw<{ id: string }[]>`SELECT p.id FROM "HrEmployeeFunctionalPeriod" p WHERE p."employeeId"=${person.employee.id} AND p."budgetUnitId"=${budgetUnitId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND p."startsAt"<= ((${date}::date::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC') AND p."endsAt">= (((${date}::date + 1)::timestamp AT TIME ZONE 'America/Sao_Paulo') AT TIME ZONE 'UTC')`
    : await tx.$queryRaw<{ id: string }[]>`SELECT p.id FROM "HrEmployeeFunctionalPeriod" p WHERE p."employeeId"=${person.employee.id} AND p."budgetUnitId"=${budgetUnitId} AND NOT p.voided AND NOT EXISTS (SELECT 1 FROM "HrEmployeeFunctionalPeriod" n WHERE n."supersedesId"=p.id) AND p."startsAt"<=${instant}::timestamp AND p."endsAt">${instant}::timestamp`;
  if (periods.length !== 1) throw new SstValidationError("Servidor sem período funcional RH explícito e inequívoco nesta UG/data.");
  return person;
}

export async function registerProfessionalRole(context: AppContext, raw: unknown) {
  if (!isSystemAdministrator(context.user)) throw new AccessError("Habilitação profissional exige administração técnica.", 403);
  const input = professionalInput.parse(raw);
  return context.prisma.$transaction(async (tx) => {
    // Lock the UG/discipline: the same user cannot be linked concurrently to two people.
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_PROFESSIONAL:${input.budgetUnitId}:${input.discipline}`}))`;
    if (!await tx.person.findUnique({ where: { id: input.personId }, select: { id: true } }) || !await tx.budgetUnit.findUnique({ where: { id: input.budgetUnitId }, select: { id: true } })) throw new SstValidationError("Pessoa ou UG não encontrada.");
    if (input.usuarioId && !await tx.usuario.findFirst({ where: { id: input.usuarioId, ativo: true }, select: { id: true } })) throw new SstValidationError("Usuário inexistente ou inativo.");
    const conflict = await tx.sstProfessionalRole.findFirst({ where: { budgetUnitId: input.budgetUnitId, discipline: input.discipline, isActive: true, OR: [{ personId: input.personId }, ...(input.usuarioId ? [{ usuarioId: input.usuarioId }] : [])], startsAt: { lte: input.endsAt }, endsAt: { gte: input.startsAt } } });
    if (conflict) {
      if (conflict.personId === input.personId && conflict.budgetUnitId === input.budgetUnitId && conflict.discipline === input.discipline && conflict.council === input.council && conflict.usuarioId === (input.usuarioId || null) && conflict.startsAt.getTime() === input.startsAt.getTime() && conflict.endsAt.getTime() === input.endsAt.getTime() && conflict.createdById === context.user.id) return conflict.id;
      throw new SstValidationError("Já existe habilitação sobreposta para a pessoa ou usuário nesta atuação/UG.");
    }
    const record = await tx.sstProfessionalRole.create({ data: { ...input, usuarioId: input.usuarioId || null, createdById: context.user.id } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_PROFESSIONAL", targetId: record.id });
    return record.id;
  });
}

async function professional(tx: Prisma.TransactionClient, context: AppContext, id: string, budgetUnitId: string, discipline: ClinicalDiscipline, when: Date, civilDate = false) {
  const date = civilDate ? when : day(when);
  await tx.$queryRaw`SELECT "id" FROM "SstProfessionalRole" WHERE "id" = ${id} FOR SHARE`;
  const record = await tx.sstProfessionalRole.findFirst({ where: { id, budgetUnitId, discipline, isActive: true, startsAt: { lte: date }, endsAt: { gte: date } }, include: { person: { select: { fullName: true } } } });
  if (!record || record.usuarioId !== context.user.id) throw new SstValidationError("Profissional fora da vigência, da UG/atuação ou sem vínculo com o usuário registrador.");
  return record;
}

export async function registerClinicalRecord(context: AppContext, raw: unknown) {
  assertCreate(context);
  const input = clinicalRecordInput.parse(raw);
  await assertDisciplineAccess(context, input.budgetUnitId, input.discipline, true);
  if (input.attendedAt > new Date()) throw new SstValidationError("Atendimento não pode ter data futura.");
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_CLINICAL:${input.budgetUnitId}:${input.submissionKey}`}))`;
    const questionnaire = input.questionnaireVersionId ? await tx.sstQuestionnaireVersion.findUnique({ where: { id: input.questionnaireVersionId } }) : null;
    if (input.questionnaireVersionId && (!questionnaire || questionnaire.budgetUnitId !== input.budgetUnitId || questionnaire.discipline !== input.discipline)) throw new SstValidationError("Questionário incompatível com a UG ou atuação.");
    const questions = questionnaire ? questionnaireQuestions.parse(questionnaire.questions) : [];
    const answers = questionnaire ? validateQuestionnaireAnswers(questions, input.answers) : {};
    const requestHash = hash({ ...input, answers });
    const existing = await tx.sstClinicalRecord.findUnique({ where: { budgetUnitId_submissionKey: { budgetUnitId: input.budgetUnitId, submissionKey: input.submissionKey } } });
    if (existing) { if (existing.createdById !== context.user.id || existing.requestHash !== requestHash) throw new SstValidationError("Submissão já utilizada com outros dados."); return existing.id; }
    const [author, subject, unit] = await Promise.all([
      professional(tx, context, input.professionalRoleId, input.budgetUnitId, input.discipline, input.attendedAt),
      functionalSubject(tx, input.personId, input.budgetUnitId, input.attendedAt),
      tx.budgetUnit.findUniqueOrThrow({ where: { id: input.budgetUnitId } }),
    ]);
    const medicineIds = input.requests.flatMap((request) => request.kind === "MEDICATION" ? [request.medicineId] : []);
    const medicines = medicineIds.length ? await tx.medicine.findMany({ where: { id: { in: [...new Set(medicineIds)] }, isActive: true }, select: { id: true, name: true } }) : [];
    if (medicines.length !== new Set(medicineIds).size) throw new SstValidationError("Medicamento inexistente ou inativo no catálogo canônico.");
    const record = await tx.sstClinicalRecord.create({ data: {
      ...input, cidCodes: [...new Set(input.cidCodes)], questionnaireVersionId: questionnaire?.id || null,
      questionnaireSnapshot: questionnaire ? { title: questionnaire.title, code: questionnaire.code, version: questionnaire.version, questions } : {}, answers,
      requests: input.requests.map((request) => request.kind === "MEDICATION" ? { ...request, description: medicines.find((medicine) => medicine.id === request.medicineId)!.name } : request),
      snapshot: { personName: subject.fullName, professionalName: author.person.fullName, council: author.council, unitName: unit.name, recordedByName: context.user.name },
      requestHash, createdById: context.user.id,
    } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_CLINICAL_RECORD", targetId: record.id });
    return record.id;
  });
}

export async function registerOccupationalVaccination(context: AppContext, raw: unknown) {
  assertCreate(context);
  const input = vaccinationInput.parse(raw);
  const role = await context.prisma.sstProfessionalRole.findUnique({ where: { id: input.professionalRoleId }, select: { discipline: true } });
  const discipline = disciplineInput.parse(role?.discipline);
  if (discipline !== "MEDICINE" && discipline !== "NURSING") throw new SstValidationError("Registro vacinal exige profissional de Medicina ou Enfermagem.");
  await assertDisciplineAccess(context, input.budgetUnitId, discipline, true);
  if (input.administeredAt > day(new Date())) throw new SstValidationError("Vacinação não pode ter data futura.");
  const requestHash = hash(input);
  return context.prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_VACCINE:${input.budgetUnitId}:${input.submissionKey}`}))`;
    const existing = await tx.sstVaccination.findUnique({ where: { budgetUnitId_submissionKey: { budgetUnitId: input.budgetUnitId, submissionKey: input.submissionKey } } });
    if (existing) { if (existing.createdById !== context.user.id || existing.requestHash !== requestHash) throw new SstValidationError("Submissão já utilizada com outros dados."); return existing.id; }
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`SST_VACCINE_DOSE:${input.personId}:${input.vaccineId}:${input.doseNumber}:${input.administeredAt.toISOString().slice(0, 10)}`}))`;
    if (await tx.sstVaccination.findFirst({ where: { personId: input.personId, vaccineId: input.vaccineId, doseNumber: input.doseNumber, administeredAt: input.administeredAt }, select: { id: true } })) throw new SstValidationError("Dose desta vacina já registrada para o servidor nesta data.");
    const [author, person, unit, vaccine] = await Promise.all([professional(tx, context, input.professionalRoleId, input.budgetUnitId, discipline, input.administeredAt, true), functionalSubject(tx, input.personId, input.budgetUnitId, input.administeredAt, true), tx.budgetUnit.findUniqueOrThrow({ where: { id: input.budgetUnitId } }), tx.vaccine.findFirst({ where: { id: input.vaccineId, isActive: true } })]);
    if (!vaccine) throw new SstValidationError("Vacina inexistente ou inativa no catálogo canônico.");
    const record = await tx.sstVaccination.create({ data: { ...input, snapshot: { personName: person.fullName, professionalName: author.person.fullName, council: author.council, unitName: unit.name, vaccineName: vaccine.name, recordedByName: context.user.name }, requestHash, createdById: context.user.id } });
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "SST_VACCINATION", targetId: record.id });
    return record.id;
  }).catch((error: unknown) => {
    const uniqueError = z.object({ code: z.literal("P2002"), meta: z.object({ target: z.union([z.string(), z.array(z.string())]) }) }).safeParse(error);
    if (uniqueError.success) {
      const target = uniqueError.data.meta.target;
      if (target === "SstVaccination_person_vaccine_dose_date_key" || (Array.isArray(target) && target.length === 4 && ["personId", "vaccineId", "doseNumber", "administeredAt"].every((field) => target.includes(field)))) throw new SstValidationError("Dose desta vacina já registrada para o servidor nesta data.");
    }
    throw error;
  });
}
