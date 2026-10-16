import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";

export async function saveHealthProfessionalContact(context: AppContext, raw: unknown) {
  const input = z.object({ professionalId: z.string().min(1), phone: z.string().trim().max(50), email: z.string().trim().email().nullable(), zipCode: z.string().trim().max(20), streetName: z.string().trim().max(200), number: z.string().trim().max(30) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const professional = await tx.healthProfessional.findUniqueOrThrow({ where: { id: input.professionalId }, include: { employee: true, assignments: { where: { isActive: true } } } });
    if (professional.unitId) assertHealthUnitAccess(context.user, professional.unitId);
    else if (context.user.hasHealthAccessScope && !professional.assignments.some(assignment => context.user.allowedHealthUnitIds?.includes(assignment.unitId))) throw new Error("Profissional fora das unidades autorizadas.");
    if (!professional.employee.personId) throw new Error("Vincule o servidor ao cadastro único antes de alterar seus dados pessoais.");
    await tx.person.update({ where: { id: professional.employee.personId }, data: { phonePrimary: input.phone || null, email: input.email } });
    await tx.employee.update({ where: { id: professional.employeeId }, data: { phone: input.phone || null, email: input.email } });
    if (input.streetName) await tx.address.create({ data: { personId: professional.employee.personId, addressType: "Residencial", zipCode: input.zipCode || null, streetName: input.streetName, number: input.number || null } });
    return { professionalId: professional.id };
  });
}

export async function saveProfessionalWorkingHours(context: AppContext, raw: unknown) {
  const input = z.object({ assignmentId: z.string().min(1), weekday: z.number().int().min(0).max(6), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), validFrom: z.coerce.date().nullable(), validUntil: z.coerce.date().nullable() }).strict().parse(raw);
  if (input.endTime <= input.startTime || input.validFrom && input.validUntil && input.validUntil < input.validFrom) throw new Error("Confira horário e vigência do expediente.");
  return context.prisma.$transaction(async tx => {
    const assignment = await tx.healthProfessionalAssignment.findUniqueOrThrow({ where: { id: input.assignmentId } });
    assertHealthUnitAccess(context.user, assignment.unitId);
    const overlaps = await tx.healthProfessionalShift.findFirst({ where: { assignmentId: input.assignmentId, weekday: input.weekday, isActive: true, startTime: { not: input.startTime, lt: input.endTime }, endTime: { gt: input.startTime } } });
    if (overlaps) throw new Error("O expediente se sobrepõe a outro período do mesmo vínculo.");
    await tx.healthProfessionalAssignment.update({ where: { id: assignment.id }, data: { validFrom: input.validFrom, validUntil: input.validUntil } });
    return tx.healthProfessionalShift.upsert({ where: { assignmentId_weekday_startTime: { assignmentId: assignment.id, weekday: input.weekday, startTime: input.startTime } }, create: { assignmentId: assignment.id, weekday: input.weekday, startTime: input.startTime, endTime: input.endTime }, update: { endTime: input.endTime, isActive: true } });
  });
}

export async function saveHealthMaintainer(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), companyId: z.string().min(1), bankName: z.string().trim().max(200), agency: z.string().trim().max(50), account: z.string().trim().max(100), supportServices: z.array(z.string().trim().min(1)).max(100), characterization: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    if (!await tx.company.count({ where: { id: input.companyId, status: "Ativo" } })) throw new Error("Selecione a pessoa jurídica ativa da mantenedora.");
    const data = { ...input, id: undefined };
    return input.id ? tx.healthMaintainer.update({ where: { id: input.id }, data }) : tx.healthMaintainer.create({ data });
  });
}

export async function configureHealthUnitNetwork(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), maintainerId: z.string().nullable(), pharmacyReportingUnitId: z.string().nullable(), spontaneousProviderUnitId: z.string().nullable() }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  return context.prisma.$transaction(async tx => {
    for (const id of [input.unitId, input.pharmacyReportingUnitId, input.spontaneousProviderUnitId].filter((id): id is string => Boolean(id))) if (!await tx.healthUnit.count({ where: { id, isActive: true } })) throw new Error("Selecione unidades ativas.");
    if (input.maintainerId && !await tx.healthMaintainer.count({ where: { id: input.maintainerId } })) throw new Error("Mantenedora não encontrada.");
    const { unitId, ...data } = input;
    return tx.healthUnit.update({ where: { id: unitId }, data });
  });
}

export async function saveHealthCareAgreement(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(200), covenantId: z.string().nullable().optional(), validFrom: z.coerce.date(), validUntil: z.coerce.date().nullable(), isActive: z.boolean().default(true) }).strict().parse(raw);
  if (input.validUntil && input.validUntil < input.validFrom) throw new Error("A vigência final deve ser posterior à inicial.");
  if (input.covenantId && !await context.prisma.covenant.count({ where: { id: input.covenantId } })) throw new Error("Convênio administrativo de origem não encontrado.");
  const data = { ...input, id: undefined };
  return input.id ? context.prisma.healthCareAgreement.update({ where: { id: input.id }, data }) : context.prisma.healthCareAgreement.create({ data });
}

export async function saveHealthCareCoverage(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), agreementId: z.string().min(1), unitId: z.string().min(1), specialtyId: z.string().nullable(), procedureId: z.string().nullable(), validFrom: z.coerce.date(), validUntil: z.coerce.date().nullable(), unitValue: z.string().regex(/^\d+(\.\d{1,6})?$/).nullable(), auxiliaryTable: z.string().trim().max(200).nullable(), isActive: z.boolean().default(true) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (!input.specialtyId && !input.procedureId) throw new Error("Informe especialidade ou procedimento da cobertura.");
  if (input.validUntil && input.validUntil < input.validFrom) throw new Error("Confira a vigência da cobertura.");
  if (!await context.prisma.healthCareAgreement.count({ where: { id: input.agreementId, isActive: true } })) throw new Error("Selecione convênio assistencial ativo.");
  if (input.specialtyId && !await context.prisma.healthSpecialty.count({ where: { id: input.specialtyId, isActive: true } })) throw new Error("Especialidade ativa não encontrada.");
  if (input.procedureId && !await context.prisma.healthSusProcedure.count({ where: { id: input.procedureId, isActive: true } })) throw new Error("Procedimento ativo não encontrado.");
  const data = { ...input, id: undefined };
  return input.id ? context.prisma.healthCareCoverage.update({ where: { id: input.id }, data }) : context.prisma.healthCareCoverage.create({ data });
}
