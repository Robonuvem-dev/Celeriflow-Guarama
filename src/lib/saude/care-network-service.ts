import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { and, eq, gt, lt, ne, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { Decimal } from "@/db/decimal";
import { healthProfessionals, healthProfessionalAssignments, healthProfessionalShifts, healthMaintainers, healthUnits } from "@/db/schema/health-workforce";
import { employees } from "@/db/schema/administration";
import { people } from "@/db/schema/people";
import { addresses, companies } from "@/db/schema/registry";
import { healthCareAgreements, healthCareCoverages } from "@/db/schema/health-agreements";
import { procurementCovenants } from "@/db/schema/procurement-instruments";
import { healthSpecialties } from "@/db/schema/health-administration";
import { healthSusProcedures } from "@/db/schema/health-catalogs";
import { runHealthTransaction } from "./health-transaction";

export async function saveHealthProfessionalContact(context: AppContext, raw: unknown) {
  const input = z.object({ professionalId: z.string().min(1), phone: z.string().trim().max(50), email: z.string().trim().email().nullable(), zipCode: z.string().trim().max(20), streetName: z.string().trim().max(200), number: z.string().trim().max(30) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const [professional] = await tx.select({ id: healthProfessionals.id, unitId: healthProfessionals.unitId, employeeId: healthProfessionals.employeeId, employee: { personId: employees.personId } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(eq(healthProfessionals.id, input.professionalId)).limit(1);
    if (!professional) throw new Error("Profissional não encontrado.");
    const assignments = await tx.select({ unitId: healthProfessionalAssignments.unitId }).from(healthProfessionalAssignments).where(and(eq(healthProfessionalAssignments.professionalId, professional.id), eq(healthProfessionalAssignments.isActive, true)));
    if (professional.unitId) assertHealthUnitAccess(context.user, professional.unitId);
    else if (context.user.hasHealthAccessScope && !assignments.some(assignment => context.user.allowedHealthUnitIds?.includes(assignment.unitId))) throw new Error("Profissional fora das unidades autorizadas.");
    if (!professional.employee.personId) throw new Error("Vincule o servidor ao cadastro único antes de alterar seus dados pessoais.");
    await tx.update(people).set({ phonePrimary: input.phone || null, email: input.email }).where(eq(people.id, professional.employee.personId));
    await tx.update(employees).set({ phone: input.phone || null, email: input.email }).where(eq(employees.id, professional.employeeId));
    if (input.streetName) await tx.insert(addresses).values({ personId: professional.employee.personId, addressType: "Residencial", zipCode: input.zipCode || null, streetName: input.streetName, number: input.number || null });
    return { professionalId: professional.id };
  });
}

export async function saveProfessionalWorkingHours(context: AppContext, raw: unknown) {
  const input = z.object({ assignmentId: z.string().min(1), weekday: z.number().int().min(0).max(6), startTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), endTime: z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), validFrom: z.coerce.date().nullable(), validUntil: z.coerce.date().nullable() }).strict().parse(raw);
  if (input.endTime <= input.startTime || input.validFrom && input.validUntil && input.validUntil < input.validFrom) throw new Error("Confira horário e vigência do expediente.");
  return runHealthTransaction(context, async tx => {
    await tx.execute(sql`SELECT id FROM "HealthProfessionalAssignment" WHERE id=${input.assignmentId} FOR UPDATE`);
    const [assignment] = await tx.select({ id: healthProfessionalAssignments.id, unitId: healthProfessionalAssignments.unitId }).from(healthProfessionalAssignments).where(eq(healthProfessionalAssignments.id, input.assignmentId)).limit(1);
    if (!assignment) throw new Error("Vínculo profissional não encontrado.");
    assertHealthUnitAccess(context.user, assignment.unitId);
    const [overlaps] = await tx.select({ id: healthProfessionalShifts.id }).from(healthProfessionalShifts).where(and(eq(healthProfessionalShifts.assignmentId, input.assignmentId), eq(healthProfessionalShifts.weekday, input.weekday), eq(healthProfessionalShifts.isActive, true), ne(healthProfessionalShifts.startTime, input.startTime), lt(healthProfessionalShifts.startTime, input.endTime), gt(healthProfessionalShifts.endTime, input.startTime))).limit(1);
    if (overlaps) throw new Error("O expediente se sobrepõe a outro período do mesmo vínculo.");
    await tx.update(healthProfessionalAssignments).set({ validFrom: input.validFrom, validUntil: input.validUntil }).where(eq(healthProfessionalAssignments.id, assignment.id));
    const [shift] = await tx.insert(healthProfessionalShifts).values({ assignmentId: assignment.id, weekday: input.weekday, startTime: input.startTime, endTime: input.endTime }).onConflictDoUpdate({ target: [healthProfessionalShifts.assignmentId, healthProfessionalShifts.weekday, healthProfessionalShifts.startTime], set: { endTime: input.endTime, isActive: true } }).returning();
    return shift;
  });
}

export async function saveHealthMaintainer(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), companyId: z.string().min(1), bankName: z.string().trim().max(200), agency: z.string().trim().max(50), account: z.string().trim().max(100), supportServices: z.array(z.string().trim().min(1)).max(100), characterization: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    if (!(await tx.select({ id: companies.id }).from(companies).where(and(eq(companies.id, input.companyId), eq(companies.status, "Ativo"))).limit(1)).length) throw new Error("Selecione a pessoa jurídica ativa da mantenedora.");
    const { id, ...data } = input;
    const [maintainer] = id ? await tx.update(healthMaintainers).set(data).where(eq(healthMaintainers.id, id)).returning() : await tx.insert(healthMaintainers).values(data).returning();
    if (!maintainer) throw new Error("Mantenedora não encontrada.");
    return maintainer;
  });
}

export async function configureHealthUnitNetwork(context: AppContext, raw: unknown) {
  const input = z.object({ unitId: z.string().min(1), maintainerId: z.string().nullable(), pharmacyReportingUnitId: z.string().nullable(), spontaneousProviderUnitId: z.string().nullable() }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  return runHealthTransaction(context, async tx => {
    for (const id of [input.unitId, input.pharmacyReportingUnitId, input.spontaneousProviderUnitId].filter((id): id is string => Boolean(id))) if (!(await tx.select({ id: healthUnits.id }).from(healthUnits).where(and(eq(healthUnits.id, id), eq(healthUnits.isActive, true))).limit(1)).length) throw new Error("Selecione unidades ativas.");
    if (input.maintainerId && !(await tx.select({ id: healthMaintainers.id }).from(healthMaintainers).where(eq(healthMaintainers.id, input.maintainerId)).limit(1)).length) throw new Error("Mantenedora não encontrada.");
    const { unitId, ...data } = input;
    const [unit] = await tx.update(healthUnits).set(data).where(eq(healthUnits.id, unitId)).returning();
    if (!unit) throw new Error("Unidade não encontrada.");
    return unit;
  });
}

export async function saveHealthCareAgreement(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), code: z.string().trim().min(1).max(60), name: z.string().trim().min(1).max(200), covenantId: z.string().nullable().optional(), validFrom: z.coerce.date(), validUntil: z.coerce.date().nullable(), isActive: z.boolean().default(true) }).strict().parse(raw);
  if (input.validUntil && input.validUntil < input.validFrom) throw new Error("A vigência final deve ser posterior à inicial.");
  const database = context.database ?? db;
  if (input.covenantId && !(await database.select({ id: procurementCovenants.id }).from(procurementCovenants).where(eq(procurementCovenants.id, input.covenantId)).limit(1)).length) throw new Error("Convênio administrativo de origem não encontrado.");
  const { id, ...data } = input;
  const [agreement] = id ? await database.update(healthCareAgreements).set(data).where(eq(healthCareAgreements.id, id)).returning() : await database.insert(healthCareAgreements).values(data).returning();
  if (!agreement) throw new Error("Convênio assistencial não encontrado.");
  return agreement;
}

export async function saveHealthCareCoverage(context: AppContext, raw: unknown) {
  const input = z.object({ id: z.string().optional(), agreementId: z.string().min(1), unitId: z.string().min(1), specialtyId: z.string().nullable(), procedureId: z.string().nullable(), validFrom: z.coerce.date(), validUntil: z.coerce.date().nullable(), unitValue: z.string().regex(/^\d+(\.\d{1,6})?$/).nullable(), auxiliaryTable: z.string().trim().max(200).nullable(), isActive: z.boolean().default(true) }).strict().parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  if (!input.specialtyId && !input.procedureId) throw new Error("Informe especialidade ou procedimento da cobertura.");
  if (input.validUntil && input.validUntil < input.validFrom) throw new Error("Confira a vigência da cobertura.");
  const database = context.database ?? db;
  if (!(await database.select({ id: healthCareAgreements.id }).from(healthCareAgreements).where(and(eq(healthCareAgreements.id, input.agreementId), eq(healthCareAgreements.isActive, true))).limit(1)).length) throw new Error("Selecione convênio assistencial ativo.");
  if (input.specialtyId && !(await database.select({ id: healthSpecialties.id }).from(healthSpecialties).where(and(eq(healthSpecialties.id, input.specialtyId), eq(healthSpecialties.isActive, true))).limit(1)).length) throw new Error("Especialidade ativa não encontrada.");
  if (input.procedureId && !(await database.select({ id: healthSusProcedures.id }).from(healthSusProcedures).where(and(eq(healthSusProcedures.id, input.procedureId), eq(healthSusProcedures.isActive, true))).limit(1)).length) throw new Error("Procedimento ativo não encontrado.");
  const { id, unitValue, ...fields } = input, data = { ...fields, unitValue: unitValue === null ? null : new Decimal(unitValue) };
  const [coverage] = id ? await database.update(healthCareCoverages).set(data).where(eq(healthCareCoverages.id, id)).returning() : await database.insert(healthCareCoverages).values(data).returning();
  if (!coverage) throw new Error("Cobertura não encontrada.");
  return coverage;
}
