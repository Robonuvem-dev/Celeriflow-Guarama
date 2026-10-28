import { z } from "zod";
import { and, count, eq, gte, lte, ne, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import * as d from "@/db/schema/health-diagnostics";
import { patients } from "@/db/schema/health-registration";
import { healthProfessionals, healthTeams } from "@/db/schema/health-workforce";
import { medicalRecords } from "@/db/schema/health-care";
import { healthServices, healthSpecialties } from "@/db/schema/health-administration";
import { materialStocks, warehouses } from "@/db/schema/assets-stock";
import { lockDiagnosticPlan, requiredDiagnosticRecord } from "@/db/repositories/health-diagnostics/records";
import type { HealthDiagnosticsContext as AppContext } from "@/lib/contracts/health-diagnostics";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { applyStockMovement } from "@/lib/patrimonio/stock-service";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { auditEventTypes } from "@/lib/contracts/audit";

export class SpecializedCareError extends Error {}

export async function saveSpecializedCatalogItem(context: AppContext, input: { category: string; code: string; name: string; referenceValue?: number | null; materialId?: string | null }, connection: DatabaseConnection = databaseConnection) {
  const category = input.category.trim().toUpperCase();
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (!category || !code || name.length < 2 || (input.referenceValue !== null && input.referenceValue !== undefined && input.referenceValue < 0)) throw new SpecializedCareError("Informe categoria, código, nome e valor de referência válidos.");
  return withDatabaseTransaction(connection, async tx => requiredDiagnosticRecord((await tx.insert(d.diagnosticSpecializedCatalog).values({ category, code, name, referenceValue: input.referenceValue, materialId: input.materialId }).onConflictDoUpdate({ target: [d.diagnosticSpecializedCatalog.category, d.diagnosticSpecializedCatalog.code], set: { name, referenceValue: input.referenceValue, materialId: input.materialId, isActive: true } }).returning({ id: d.diagnosticSpecializedCatalog.id }))[0]));
}

const planSchema = z.object({ patientId: z.string().min(1), unitId: z.string().min(1), teamId: z.string().min(1), initialMedicalRecordId: z.string().min(1).nullable().optional(), goals: z.string().trim().min(3).max(4000), carePlan: z.string().trim().min(3).max(4000), plannedConsultations: z.number().int().positive().max(999) }).strict();
const entrySchema = z.object({ planId: z.string().min(1), specialtyId: z.string().min(1).nullable().optional(), healthServiceId: z.string().min(1).nullable().optional(), medicalRecordId: z.string().min(1).nullable().optional(), kind: z.enum(["OPINION", "EVOLUTION", "INTERCONSULTATION", "OUTCOME"]), content: z.string().trim().min(3).max(8000), diagnosisSummary: z.string().trim().max(2000).nullable().optional(), weight: z.number().positive().max(700).nullable().optional(), height: z.number().positive().max(3).nullable().optional() }).strict();
const distributionSchema = z.object({ planId: z.string().min(1), quotaId: z.string().min(1).nullable().optional(), warehouseId: z.string().min(1), materialId: z.string().min(1), batchNumber: z.string().trim().min(1), quantity: z.number().positive(), notes: z.string().trim().max(500).nullable().optional() }).strict();

export async function saveSpecializedSchedule(context: AppContext, input: { teamId: string; unitId: string; month: string; patientCapacity: number }, connection: DatabaseConnection = databaseConnection) {
  if (!/^\d{4}-\d{2}$/.test(input.month) || !Number.isInteger(input.patientCapacity) || input.patientCapacity <= 0) throw new SpecializedCareError("Informe competência e capacidade válidas.");
  assertHealthUnitAccess(context.user, input.unitId);
  return withDatabaseTransaction(connection, async tx => {
    const [team] = await tx.select({ id: healthTeams.id }).from(healthTeams).where(and(eq(healthTeams.id, input.teamId), eq(healthTeams.unitId, input.unitId), eq(healthTeams.isActive, true))).limit(1);
    if (!team) throw new SpecializedCareError("Equipe ativa não encontrada na unidade.");
    return requiredDiagnosticRecord((await tx.insert(d.diagnosticSpecializedSchedules).values(input).onConflictDoUpdate({ target: [d.diagnosticSpecializedSchedules.teamId, d.diagnosticSpecializedSchedules.unitId, d.diagnosticSpecializedSchedules.month], set: { patientCapacity: input.patientCapacity } }).returning({ id: d.diagnosticSpecializedSchedules.id }))[0]);
  });
}

export async function saveSpecializedQuota(context: AppContext, input: { patientId: string; materialId: string; period: string; allowedQuantity: number }, connection: DatabaseConnection = databaseConnection) {
  if (!/^\d{4}-\d{2}$/.test(input.period) || !Number.isFinite(input.allowedQuantity) || input.allowedQuantity <= 0) throw new SpecializedCareError("Informe período e quantidade da cota.");
  return withDatabaseTransaction(connection, async tx => {
    const [patient] = await tx.select({ referenceUnitId: patients.referenceUnitId }).from(patients).where(eq(patients.id, input.patientId)).limit(1);
    if (!patient) throw new SpecializedCareError("Paciente não encontrado.");
    assertHealthUnitAccess(context.user, patient.referenceUnitId || "");
    return requiredDiagnosticRecord((await tx.insert(d.diagnosticSpecializedQuotas).values(input).onConflictDoUpdate({ target: [d.diagnosticSpecializedQuotas.patientId, d.diagnosticSpecializedQuotas.materialId, d.diagnosticSpecializedQuotas.period], set: { allowedQuantity: input.allowedQuantity } }).returning({ id: d.diagnosticSpecializedQuotas.id }))[0]);
  });
}

async function teamProfessional(context: AppContext, teamId: string, executor: DatabaseExecutor) {
  if (!context.user.employeeId) throw new SpecializedCareError("Vincule o usuário autenticado a um profissional de saúde.");
  const [professional] = await executor.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.employeeId, context.user.employeeId), eq(healthProfessionals.isActive, true), eq(healthProfessionals.teamId, teamId))).limit(1);
  if (!professional) throw new SpecializedCareError("O profissional não pertence à equipe multidisciplinar deste plano.");
  return professional;
}

export async function createSpecializedPlan(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = planSchema.parse(raw);
  assertHealthUnitAccess(context.user, input.unitId);
  return withDatabaseTransaction(connection, async (tx) => {
    await teamProfessional(context, input.teamId, tx);
    const [patient, team, record] = await Promise.all([
      tx.select({ id: patients.id }).from(patients).where(and(eq(patients.id, input.patientId), eq(patients.status, "Ativo"))).limit(1).then(rows => rows[0]),
      tx.select({ id: healthTeams.id }).from(healthTeams).where(and(eq(healthTeams.id, input.teamId), eq(healthTeams.unitId, input.unitId), eq(healthTeams.isActive, true))).limit(1).then(rows => rows[0]),
      input.initialMedicalRecordId ? tx.select({ id: medicalRecords.id }).from(medicalRecords).where(and(eq(medicalRecords.id, input.initialMedicalRecordId), eq(medicalRecords.patientId, input.patientId), eq(medicalRecords.unitId, input.unitId))).limit(1).then(rows => rows[0]) : null,
    ]);
    if (!patient || !team || (input.initialMedicalRecordId && !record)) throw new SpecializedCareError("Paciente, equipe ou prontuário de origem inválido.");
    const month = new Date().toISOString().slice(0, 7);
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${team.id}:${input.unitId}:${month}`}))`);
    const [schedule] = await tx.select().from(d.diagnosticSpecializedSchedules).where(and(eq(d.diagnosticSpecializedSchedules.teamId, team.id), eq(d.diagnosticSpecializedSchedules.unitId, input.unitId), eq(d.diagnosticSpecializedSchedules.month, month))).limit(1);
    if (schedule) {
      const [activePlans] = await tx.select({ total: count() }).from(d.diagnosticSpecializedPlans).where(and(eq(d.diagnosticSpecializedPlans.teamId, team.id), eq(d.diagnosticSpecializedPlans.unitId, input.unitId), ne(d.diagnosticSpecializedPlans.status, "CANCELLED"), gte(d.diagnosticSpecializedPlans.startedAt, new Date(`${month}-01T00:00:00.000Z`))));
      if (activePlans.total >= schedule.patientCapacity) throw new SpecializedCareError("A capacidade mensal configurada para a equipe foi atingida.");
    }
    return requiredDiagnosticRecord((await tx.insert(d.diagnosticSpecializedPlans).values({ ...input, createdByUsuarioId: context.user.id }).returning({ id: d.diagnosticSpecializedPlans.id, status: d.diagnosticSpecializedPlans.status }))[0]);
  });
}

export async function addSpecializedPlanEntry(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = entrySchema.parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDiagnosticPlan(tx, input.planId);
    const [plan] = await tx.select().from(d.diagnosticSpecializedPlans).where(eq(d.diagnosticSpecializedPlans.id, input.planId)).limit(1);
    if (!plan || plan.status !== "ACTIVE") throw new SpecializedCareError("Plano terapêutico ativo não encontrado.");
    assertHealthUnitAccess(context.user, plan.unitId);
    const professional = await teamProfessional(context, plan.teamId, tx);
    const bmi = input.weight && input.height ? Number((input.weight / (input.height * input.height)).toFixed(2)) : null;
    const [specialty, service, record] = await Promise.all([
      input.specialtyId ? tx.select({ id: healthSpecialties.id }).from(healthSpecialties).where(and(eq(healthSpecialties.id, input.specialtyId), eq(healthSpecialties.isActive, true))).limit(1).then(rows => rows[0]) : null,
      input.healthServiceId ? tx.select({ id: healthServices.id }).from(healthServices).where(and(eq(healthServices.id, input.healthServiceId), eq(healthServices.isActive, true))).limit(1).then(rows => rows[0]) : null,
      input.medicalRecordId ? tx.select({ id: medicalRecords.id }).from(medicalRecords).where(and(eq(medicalRecords.id, input.medicalRecordId), eq(medicalRecords.patientId, plan.patientId), eq(medicalRecords.unitId, plan.unitId))).limit(1).then(rows => rows[0]) : null,
    ]);
    if ((input.specialtyId && !specialty) || (input.healthServiceId && !service) || (input.medicalRecordId && !record)) throw new SpecializedCareError("Especialidade, serviço ou prontuário incompatível com o plano.");
    const entry = requiredDiagnosticRecord((await tx.insert(d.diagnosticSpecializedEntries).values({ ...input, professionalId: professional.id, bmi }).returning({ id: d.diagnosticSpecializedEntries.id }))[0]);
    if (input.kind === "EVOLUTION") await tx.update(d.diagnosticSpecializedPlans).set({ completedConsultations: sql`${d.diagnosticSpecializedPlans.completedConsultations} + 1` }).where(eq(d.diagnosticSpecializedPlans.id, plan.id));
    return entry;
  });
}

export async function distributeSpecializedMaterial(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = distributionSchema.parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDiagnosticPlan(tx, input.planId);
    const [plan] = await tx.select().from(d.diagnosticSpecializedPlans).where(eq(d.diagnosticSpecializedPlans.id, input.planId)).limit(1);
    if (!plan || plan.status !== "ACTIVE") throw new SpecializedCareError("Plano terapêutico ativo não encontrado.");
    assertHealthUnitAccess(context.user, plan.unitId);
    if (!context.user.employeeId || !(await tx.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.employeeId, context.user.employeeId), eq(healthProfessionals.isActive, true), eq(healthProfessionals.teamId, plan.teamId))).limit(1))[0]) throw new SpecializedCareError("O profissional não pertence à equipe multidisciplinar deste plano.");
    const [stock] = await tx.select({ id: materialStocks.id, unitCost: materialStocks.unitCost, blockedAt: materialStocks.blockedAt, expirationDate: materialStocks.expirationDate, warehouse: { healthUnitId: warehouses.healthUnitId } }).from(materialStocks).innerJoin(warehouses, eq(warehouses.id, materialStocks.warehouseId)).where(and(eq(materialStocks.warehouseId, input.warehouseId), eq(materialStocks.materialId, input.materialId), eq(materialStocks.batchNumber, input.batchNumber))).limit(1);
    if (!stock || stock.warehouse.healthUnitId !== plan.unitId || stock.blockedAt || (stock.expirationDate && stock.expirationDate < new Date())) throw new SpecializedCareError("Lote indisponível para a unidade do plano.");
    if (input.quotaId) {
      const quota = await tx.update(d.diagnosticSpecializedQuotas).set({ consumedQuantity: sql`${d.diagnosticSpecializedQuotas.consumedQuantity} + ${input.quantity}` }).where(and(eq(d.diagnosticSpecializedQuotas.id, input.quotaId), eq(d.diagnosticSpecializedQuotas.patientId, plan.patientId), eq(d.diagnosticSpecializedQuotas.materialId, input.materialId), lte(d.diagnosticSpecializedQuotas.consumedQuantity, sql`${d.diagnosticSpecializedQuotas.allowedQuantity} - ${input.quantity}`))).returning({ id: d.diagnosticSpecializedQuotas.id });
      if (quota.length !== 1) throw new SpecializedCareError("A entrega ultrapassa a cota disponível do paciente.");
    }
    const { movement } = await applyStockMovement(tx, { kind: "EXIT", warehouseId: input.warehouseId, materialId: input.materialId, batchNumber: input.batchNumber, quantity: input.quantity, reason: `DISTRIBUICAO_PLANO:${plan.id}`, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: context.user.allowedBudgetUnitIds } });
    await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.administrativeMutation, targetType: "MATERIAL_MOVEMENT", targetId: movement.id });
    return requiredDiagnosticRecord((await tx.insert(d.diagnosticSpecializedDistributions).values({ planId: plan.id, quotaId: input.quotaId, patientId: plan.patientId, warehouseId: input.warehouseId, materialId: input.materialId, stockId: stock.id, movementId: movement.id, quantity: input.quantity, referenceValue: stock.unitCost, deliveredByUsuarioId: context.user.id, notes: input.notes }).returning({ id: d.diagnosticSpecializedDistributions.id }))[0]);
  });
}

