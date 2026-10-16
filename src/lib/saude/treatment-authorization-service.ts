import { z } from "zod";
import type { Prisma } from "@prisma/client";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
import { getIdTokenPrincipal } from "@/lib/platform/session";
import { recordPatientDeathInTransaction } from "./patient-registration-service";

const id = z.string().trim().min(1).max(200), note = z.string().trim().min(3).max(12000);
const kindSchema = z.enum(["AIH", "APAC"]);
const date = z.iso.date(), day = (value: string) => new Date(`${value}T00:00:00Z`);
const today = () => day(new Date().toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" }));
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value));
const procedureInput = z.object({ procedureId: id, role: z.enum(["PRIMARY", "SECONDARY"]), quantity: z.number().int().positive().max(9999), performerProfessionalId: id.nullable().default(null) }).strict();
const reportInput = z.object({
  id: id.nullable().default(null), expectedVersion: z.number().int().nonnegative(), kind: kindSchema,
  patientId: id, unitId: id, professionalId: id, medicalRecordId: id.nullable().default(null),
  diagnosis: note, diagnosticCode: z.string().trim().max(30).nullable().default(null),
  clinicalHistory: note, examinations: note, treatmentJustification: note,
  admissionAt: z.coerce.date().nullable().default(null), plannedStart: date, plannedEnd: date,
  initialApac: z.boolean().default(true), procedures: z.array(procedureInput).min(1).max(100), reason: note,
}).strict().refine(input => input.plannedStart <= input.plannedEnd, "Confira o período previsto do tratamento.")
  .refine(input => input.procedures.filter(procedure => procedure.role === "PRIMARY").length === 1, "Selecione exatamente um procedimento principal.")
  .refine(input => new Set(input.procedures.map(procedure => `${procedure.procedureId}:${procedure.role}`)).size === input.procedures.length, "Não repita o mesmo procedimento e papel.");

async function lockReport(tx: Prisma.TransactionClient, reportId: string) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_TREATMENT_REPORT:${reportId}`}))`;
}

export async function treatmentReportForActor(tx: Prisma.TransactionClient, context: AppContext, reportId: string) {
  const report = await tx.healthTreatmentReport.findUniqueOrThrow({ where: { id: reportId }, include: { patient: { include: { person: true } }, unit: true, procedures: { include: { procedure: true, performerProfessional: { include: { employee: { select: { name: true } } } } } }, authorization: { include: { range: { include: { issuer: true } } } } } });
  assertHealthUnitAccess(context.user, report.unitId);
  return report;
}

export async function createAuthorizationIssuer(context: AppContext, raw: unknown) {
  const input = z.object({ code: z.string().trim().min(1).max(40), name: z.string().trim().min(3).max(200), typeCode: z.string().trim().min(1).max(40), sourceReference: note }).strict().parse(raw);
  return context.prisma.healthAuthorizationIssuer.create({ data: { ...input, createdByUsuarioId: context.user.id }, select: { id: true } });
}

export async function createAuthorizationNumberRange(context: AppContext, raw: unknown) {
  const number = z.string().regex(/^\d{1,20}$/);
  const input = z.object({ issuerId: id, kind: kindSchema, firstNumber: number, lastNumber: number, validFrom: date, validUntil: date, sourceReference: note }).strict().parse(raw);
  if (input.firstNumber.length !== input.lastNumber.length || BigInt(input.firstNumber) > BigInt(input.lastNumber) || input.validFrom > input.validUntil) throw new Error("Confira os limites, comprimento e validade da faixa numérica.");
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_NUMBER_RANGE:${input.kind}`}))`;
    if (!await tx.healthAuthorizationIssuer.count({ where: { id: input.issuerId, isActive: true } })) throw new Error("Órgão emissor ativo não encontrado.");
    const ranges = await tx.healthAuthorizationNumberRange.findMany({ where: { kind: input.kind }, select: { firstNumber: true, lastNumber: true } });
    if (ranges.some(range => BigInt(input.firstNumber) <= BigInt(range.lastNumber) && BigInt(input.lastNumber) >= BigInt(range.firstNumber))) throw new Error("Faixa sobreposta à numeração já cadastrada, inclusive de outro órgão.");
    return tx.healthAuthorizationNumberRange.create({ data: { ...input, validFrom: day(input.validFrom), validUntil: day(input.validUntil), nextNumber: input.firstNumber, createdByUsuarioId: context.user.id }, select: { id: true } });
  });
}

export function authorizationRangePosition(range: { firstNumber: string; lastNumber: string; nextNumber: string }) {
  const total = BigInt(range.lastNumber) - BigInt(range.firstNumber) + BigInt(1);
  const available = BigInt(range.lastNumber) >= BigInt(range.nextNumber) ? BigInt(range.lastNumber) - BigInt(range.nextNumber) + BigInt(1) : BigInt(0);
  return { total: total.toString(), available: available.toString(), nextNumber: available > BigInt(0) ? range.nextNumber : null };
}

async function saveReportTx(tx: Prisma.TransactionClient, context: AppContext, input: z.infer<typeof reportInput>, renewalOfId: string | null = null) {
  assertHealthUnitAccess(context.user, input.unitId);
  if (input.id) await lockReport(tx, input.id);
  const previous = input.id ? await treatmentReportForActor(tx, context, input.id) : null;
  if (previous && (!["SOLICITADA", "GLOSADA", "ALTERACAO"].includes(previous.status) || previous.authorization)) throw new Error("Laudo aprovado/autorizado não pode ter o conteúdo sobrescrito.");
  if ((previous?.version || 0) !== input.expectedVersion) throw new Error("Laudo alterado por outra sessão. Atualize antes de salvar.");
  if (previous && (previous.patientId !== input.patientId || previous.unitId !== input.unitId || previous.kind !== input.kind)) throw new Error("Paciente, unidade e tipo do laudo são imutáveis.");
  const [patient, unit, professional] = await Promise.all([
    tx.patient.findUniqueOrThrow({ where: { id: input.patientId }, include: { person: true } }),
    tx.healthUnit.findFirst({ where: { id: input.unitId, isActive: true } }),
    tx.healthProfessional.findFirst({ where: { id: input.professionalId, employeeId: context.user.employeeId || "__SEM_PROFISSIONAL__", isActive: true, employee: { isActive: true } }, include: { employee: { select: { name: true } } } }),
  ]);
  if (!unit || !professional?.employee.name) throw new Error("A emissão exige unidade ativa e profissional de Saúde autenticado.");
  if (patient.status !== "Ativo" || patient.person.deathDate) throw new Error("Paciente deve estar ativo e sem óbito registrado para novo laudo.");
  if (professional.unitId !== unit.id && !await tx.healthProfessionalAssignment.count({ where: { professionalId: professional.id, unitId: unit.id, isActive: true, AND: [{ OR: [{ validFrom: null }, { validFrom: { lte: new Date() } }] }, { OR: [{ validUntil: null }, { validUntil: { gte: today() } }] }] } })) throw new Error("Profissional sem vínculo vigente na unidade do laudo.");
  if (input.medicalRecordId && !await tx.medicalRecord.count({ where: { id: input.medicalRecordId, patientId: patient.id, unitId: unit.id, professionalId: professional.id } })) throw new Error("Atendimento não corresponde ao paciente, unidade e profissional do laudo.");
  if (input.kind === "AIH" && !input.admissionAt) throw new Error("Informe a data de internação para o laudo AIH.");
  for (const item of input.procedures) {
    if (!await tx.healthSusProcedure.count({ where: { id: item.procedureId, isActive: true } })) throw new Error("Procedimento SUS ativo não encontrado.");
    if (item.performerProfessionalId && !await tx.healthProfessional.count({ where: { id: item.performerProfessionalId, isActive: true, employee: { isActive: true } } })) throw new Error("Profissional executor ativo não encontrado.");
  }
  const { id: reportId, expectedVersion, reason, procedures, ...clinical } = input;
  const values = { ...clinical, plannedStart: day(input.plannedStart), plannedEnd: day(input.plannedEnd), version: expectedVersion + 1, status: "SOLICITADA",
    patientSnapshot: json({ fullName: patient.person.fullName, cpf: patient.person.cpf, cns: patient.cns, birthDate: patient.person.birthDate, gender: patient.person.gender, motherName: patient.person.motherName, unitName: unit.name, cnes: unit.cnes }),
    professionalSnapshot: json({ name: professional.employee.name, councilName: professional.councilName, councilNumber: professional.councilNumber, cns: professional.cns }),
  };
  const report = reportId ? await tx.healthTreatmentReport.update({ where: { id: reportId }, data: values }) : await tx.healthTreatmentReport.create({ data: { ...values, renewalOfId, createdByUsuarioId: context.user.id } });
  if (previous) await tx.healthTreatmentReportProcedure.deleteMany({ where: { reportId: report.id } });
  for (const item of procedures) await tx.healthTreatmentReportProcedure.create({ data: { ...item, reportId: report.id } });
  const persistedItems = await tx.healthTreatmentReportProcedure.findMany({ where: { reportId: report.id }, include: { procedure: { select: { code: true, description: true } }, performerProfessional: { select: { employee: { select: { name: true } } } } } });
  await tx.healthTreatmentReportRevision.create({ data: { reportId: report.id, version: report.version, snapshot: json({ ...report, procedures: persistedItems }), reason, actorUsuarioId: context.user.id } });
  await tx.healthTreatmentReportEvent.create({ data: { reportId: report.id, eventType: previous ? "REVISAO" : renewalOfId ? "RENOVACAO" : "INCLUSAO", fromStatus: previous?.status, toStatus: "SOLICITADA", reason, actorUsuarioId: context.user.id } });
  return { id: report.id, version: report.version };
}

export async function saveTreatmentReport(context: AppContext, raw: unknown) {
  const input = reportInput.parse(raw);
  return context.prisma.$transaction(tx => saveReportTx(tx, context, input));
}

export async function transitionTreatmentReport(context: AppContext, raw: unknown) {
  const input = z.object({ reportId: id, status: z.enum(["APROVADA", "GLOSADA", "ALTERACAO", "ARQUIVADA"]), reason: note }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await lockReport(tx, input.reportId);
    const report = await treatmentReportForActor(tx, context, input.reportId);
    const allowed: Record<string, string[]> = { SOLICITADA: ["APROVADA", "GLOSADA", "ARQUIVADA"], GLOSADA: ["ALTERACAO", "ARQUIVADA"], APROVADA: ["ALTERACAO", "ARQUIVADA"], ALTERACAO: ["ARQUIVADA"], AUTORIZADA: ["ARQUIVADA"], CANCELADA: ["ARQUIVADA"], CONCLUIDA: ["ARQUIVADA"] };
    const archivingClosedAuthorization = input.status === "ARQUIVADA" && (report.status === "CONCLUIDA" || (report.kind === "APAC" && report.authorization && report.authorization.validUntil < today()));
    if (!allowed[report.status]?.includes(input.status) || (report.authorization?.status === "ATIVA" && !archivingClosedAuthorization)) throw new Error("Trâmite não permitido para a situação atual do laudo.");
    await tx.healthTreatmentReport.update({ where: { id: report.id }, data: { status: input.status } });
    await tx.healthTreatmentReportEvent.create({ data: { reportId: report.id, eventType: "DECISAO", fromStatus: report.status, toStatus: input.status, reason: input.reason, actorUsuarioId: context.user.id } });
    return { id: report.id };
  });
}

export async function authorizeTreatmentReports(context: AppContext, raw: unknown) {
  const input = z.object({ rangeId: id, reportIds: z.array(id).min(1).max(200), expectedNextNumber: z.string().regex(/^\d{1,20}$/).nullable().default(null) }).strict().parse(raw);
  if (new Set(input.reportIds).size !== input.reportIds.length) throw new Error("Não repita laudos na autorização coletiva.");
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${`HEALTH_AUTH_RANGE:${input.rangeId}`}))`;
    const range = await tx.healthAuthorizationNumberRange.findUniqueOrThrow({ where: { id: input.rangeId }, include: { issuer: true } });
    const currentDay = today();
    if (!range.issuer.isActive || range.validFrom > currentDay || range.validUntil < currentDay) throw new Error("Órgão ou faixa numérica fora da validade para emissão.");
    if (input.expectedNextNumber && range.nextNumber !== input.expectedNextNumber) throw new Error("A próxima numeração mudou. Atualize a prévia antes de autorizar.");
    if (BigInt(range.nextNumber) + BigInt(input.reportIds.length) - BigInt(1) > BigInt(range.lastNumber)) throw new Error("Saldo insuficiente na faixa numérica.");
    for (const reportId of [...input.reportIds].sort()) await lockReport(tx, reportId);
    let next = BigInt(range.nextNumber);
    const result: { id: string; number: string }[] = [];
    for (const reportId of input.reportIds) {
      const report = await treatmentReportForActor(tx, context, reportId);
      if (report.kind !== range.kind || report.status !== "APROVADA" || report.authorization) throw new Error("Todos os laudos devem estar aprovados, sem autorização anterior e ser do mesmo tipo da faixa.");
      if (report.plannedEnd < currentDay) throw new Error("Período do tratamento vencido. Revise o laudo antes de autorizar.");
      const number = next.toString().padStart(range.firstNumber.length, "0"); next += BigInt(1);
      const authorization = await tx.healthTreatmentAuthorization.create({ data: { reportId, rangeId: range.id, kind: report.kind, number, reportVersion: report.version, validFrom: report.plannedStart, validUntil: report.plannedEnd, authorizedByUsuarioId: context.user.id } });
      await tx.healthTreatmentReport.update({ where: { id: reportId }, data: { status: "AUTORIZADA" } });
      await tx.healthTreatmentReportEvent.create({ data: { reportId, eventType: "AUTORIZACAO", fromStatus: "APROVADA", toStatus: "AUTORIZADA", reason: `${range.kind} ${number} · órgão ${range.issuer.code} · faixa ${range.id}`, actorUsuarioId: context.user.id } });
      result.push({ id: authorization.id, number });
    }
    await tx.healthAuthorizationNumberRange.update({ where: { id: range.id }, data: { nextNumber: next.toString().padStart(range.firstNumber.length, "0") } });
    return result;
  }, { timeout: 60000 });
}

const cancellationKey = (unitId: string) => `SAUDE:AIH_CANCEL_PASSWORD:${unitId}`;
export async function configureAihCancellation(context: AppContext, unitId: string, required: boolean) {
  assertHealthUnitAccess(context.user, unitId);
  z.boolean().parse(required);
  return context.prisma.$transaction(async tx => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cancellationKey(unitId)}))`;
    if (!await tx.healthUnit.count({ where: { id: unitId, isActive: true } })) throw new Error("Unidade ativa não encontrada.");
    const instance = await tx.configuracaoInstancia.findFirstOrThrow({ orderBy: { createdAt: "asc" }, select: { id: true } });
    return tx.configuracaoParametroInstancia.upsert({ where: { configuracaoInstanciaId_chave: { configuracaoInstanciaId: instance.id, chave: cancellationKey(unitId) } }, create: { configuracaoInstanciaId: instance.id, chave: cancellationKey(unitId), valor: { required } }, update: { valor: { required } } });
  });
}

export async function cancelTreatmentAuthorization(context: AppContext, raw: unknown) {
  const input = z.object({ reportId: id, reason: note, reauthenticationToken: z.string().max(20000).nullable().default(null) }).strict().parse(raw);
  const principal = input.reauthenticationToken ? await getIdTokenPrincipal(input.reauthenticationToken) : null;
  return context.prisma.$transaction(async tx => {
    await lockReport(tx, input.reportId);
    const report = await treatmentReportForActor(tx, context, input.reportId);
    if (report.status !== "AUTORIZADA" || report.authorization?.status !== "ATIVA" || report.dischargedAt) throw new Error("Somente autorização ativa sem alta pode ser cancelada.");
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${cancellationKey(report.unitId)}))`;
    const parameter = await tx.configuracaoParametroInstancia.findFirst({ where: { chave: cancellationKey(report.unitId) }, select: { valor: true } });
    const policy = z.object({ required: z.boolean().default(false) }).parse(parameter?.valor || {});
    if (report.kind === "AIH" && policy.required && (!principal || principal.firebaseUid !== context.user.firebaseUid || Date.now() - principal.authTime * 1000 > 300000 || principal.authTime * 1000 > Date.now() + 30000)) throw new Error("Confirme novamente sua senha para cancelar a autorização AIH.");
    await tx.healthTreatmentAuthorization.update({ where: { id: report.authorization.id }, data: { status: "CANCELADA", cancelledAt: new Date(), cancelledByUsuarioId: context.user.id, cancellationReason: input.reason } });
    await tx.healthTreatmentReport.update({ where: { id: report.id }, data: { status: "CANCELADA" } });
    await tx.healthTreatmentReportEvent.create({ data: { reportId: report.id, eventType: "CANCELAMENTO", fromStatus: report.status, toStatus: "CANCELADA", reason: input.reason, actorUsuarioId: context.user.id } });
    // Consumed numbering is retained permanently and is never returned to the range.
    return { id: report.id };
  });
}

export async function renewApacReport(context: AppContext, raw: unknown) {
  const input = z.object({ reportId: id, plannedStart: date, plannedEnd: date, professionalId: id, reason: note }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await lockReport(tx, input.reportId);
    const previous = await treatmentReportForActor(tx, context, input.reportId);
    if (previous.kind !== "APAC" || previous.authorization?.status !== "ATIVA" || previous.authorization.validUntil >= today()) throw new Error("Renovação exige APAC previamente autorizada e vencida.");
    if (day(input.plannedStart) <= previous.authorization.validUntil || input.plannedStart > input.plannedEnd) throw new Error("O novo período deve suceder a validade da APAC anterior.");
    if (await tx.healthTreatmentReport.count({ where: { renewalOfId: previous.id } })) throw new Error("Este laudo APAC já possui uma renovação vinculada.");
    const parsed = reportInput.parse({ id: null, expectedVersion: 0, kind: "APAC", patientId: previous.patientId, unitId: previous.unitId, professionalId: input.professionalId, medicalRecordId: null, diagnosis: previous.diagnosis, diagnosticCode: previous.diagnosticCode, clinicalHistory: previous.clinicalHistory, examinations: previous.examinations, treatmentJustification: previous.treatmentJustification, admissionAt: null, plannedStart: input.plannedStart, plannedEnd: input.plannedEnd, initialApac: false, procedures: previous.procedures.map(item => ({ procedureId: item.procedureId, role: item.role, quantity: item.quantity, performerProfessionalId: item.performerProfessionalId })), reason: input.reason });
    return saveReportTx(tx, context, parsed, previous.id);
  });
}

export async function recordApacPermanence(context: AppContext, raw: unknown) {
  const input = z.object({ reportId: id, reason: note }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    await lockReport(tx, input.reportId);
    const report = await treatmentReportForActor(tx, context, input.reportId);
    if (report.kind !== "APAC" || !report.initialApac || report.status !== "AUTORIZADA" || report.authorization?.status !== "ATIVA" || report.authorization.validUntil < today() || report.authorization.validFrom > today()) throw new Error("Permanência exige APAC inicial, autorizada e vigente.");
    return tx.healthTreatmentReportEvent.create({ data: { reportId: report.id, eventType: "PERMANENCIA", fromStatus: report.status, toStatus: report.status, reason: input.reason, actorUsuarioId: context.user.id } });
  });
}

export async function markAihPaid(context: AppContext, raw: unknown) {
  const input = z.object({ reportId: id, paymentReference: z.string().trim().min(3).max(2000), paidAt: z.coerce.date(), reason: note }).strict().parse(raw);
  if (input.paidAt > new Date()) throw new Error("O pagamento manual não pode ter data futura.");
  return context.prisma.$transaction(async tx => {
    await lockReport(tx, input.reportId);
    const report = await treatmentReportForActor(tx, context, input.reportId);
    if (report.kind !== "AIH" || report.authorization?.status !== "ATIVA" || report.paidManuallyAt || input.paidAt < report.authorization.authorizedAt) throw new Error("AIH deve estar autorizada, ainda não marcada como paga e com data posterior à autorização.");
    await tx.healthTreatmentReport.update({ where: { id: report.id }, data: { paidManuallyAt: input.paidAt, paidManuallyByUsuarioId: context.user.id, manualPaymentReference: input.paymentReference } });
    await tx.healthTreatmentReportEvent.create({ data: { reportId: report.id, eventType: "PAGAMENTO_MANUAL", fromStatus: report.status, toStatus: report.status, reason: `${input.paymentReference} · ${input.reason}`, actorUsuarioId: context.user.id } });
    return { id: report.id };
  });
}

export async function dischargeAihPatient(context: AppContext, raw: unknown) {
  const input = z.object({ reportId: id, dischargedAt: z.coerce.date(), outcome: z.enum(["ALTA", "TRANSFERENCIA", "OBITO"]), reason: note, deathRegistration: z.unknown().optional() }).strict().parse(raw);
  if (input.dischargedAt > new Date()) throw new Error("A saída não pode ocorrer no futuro.");
  return context.prisma.$transaction(async tx => {
    await lockReport(tx, input.reportId);
    const report = await treatmentReportForActor(tx, context, input.reportId);
    if (report.kind !== "AIH" || report.status !== "AUTORIZADA" || report.authorization?.status !== "ATIVA" || report.dischargedAt || !report.admissionAt || input.dischargedAt < report.admissionAt) throw new Error("Confira a AIH autorizada e o período de internação antes da saída.");
    if (input.outcome === "OBITO") {
      const death = z.object({ deathDate: date, registeredAt: date, municipality: z.string().trim().min(1).max(200), cause: note, cidReferenceId: id.nullable().optional() }).strict().parse(input.deathRegistration);
      if (death.deathDate !== input.dischargedAt.toLocaleDateString("en-CA", { timeZone: "America/Sao_Paulo" })) throw new Error("A data do óbito deve corresponder à saída hospitalar.");
      await recordPatientDeathInTransaction(tx, context, report.patientId, death);
    }
    await tx.healthTreatmentReport.update({ where: { id: report.id }, data: { dischargedAt: input.dischargedAt, dischargeOutcome: input.outcome, status: "CONCLUIDA" } });
    await tx.healthTreatmentReportEvent.create({ data: { reportId: report.id, eventType: `SAIDA_${input.outcome}`, fromStatus: report.status, toStatus: "CONCLUIDA", reason: input.reason, actorUsuarioId: context.user.id } });
    return { id: report.id };
  });
}
