import { createHash, randomUUID } from "node:crypto";
import { z } from "zod";
import { and, count, desc, eq, gte, isNull, lt, lte, ne, notInArray, or, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import * as d from "@/db/schema/health-diagnostics";
import { healthProfessionals } from "@/db/schema/health-workforce";
import { pageLaboratoryConfigurations } from "@/db/schema/health-pages";
import { documentSignatures, documentVersions } from "@/db/schema/document-workflow";
import { diagnosticJson, diagnosticOptionalJson, lockDiagnosticLabOrder, readDiagnosticLabOrder, readDiagnosticLabReport, requiredDiagnosticRecord } from "@/db/repositories/health-diagnostics/records";
import type { HealthDiagnosticsContext as AppContext } from "@/lib/contracts/health-diagnostics";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { uploadFile } from "@/lib/platform/blob";
import { ingestGedDocument } from "@/lib/documents/document-flow-service";

export class LaboratoryError extends Error {}

const scheduleSchema = z.object({ orderId: z.string().min(1), collectionUnitId: z.string().min(1), scheduledAt: z.coerce.date(), providerSupplierId: z.string().min(1).nullable().optional() }).strict();
const collectSchema = z.object({ orderId: z.string().min(1), sampleBarcode: z.string().trim().min(3).max(120), collectionByThirdParty: z.boolean().default(false) }).strict();
const resultSchema = z.object({ orderId: z.string().min(1), status: z.enum(["PARTIAL", "FINAL"]), values: z.record(z.string(), z.unknown()), interpretation: z.string().trim().max(4000).nullable().optional(), source: z.enum(["MANUAL", "DEVICE"]).default("MANUAL"), deviceCorrelationId: z.string().trim().max(180).nullable().optional() }).strict();

async function professionalForUser(context: AppContext, executor: DatabaseExecutor) {
  if (!context.user.employeeId) throw new LaboratoryError("Vincule o usuário autenticado a um profissional de saúde.");
  const [professional] = await executor.select({ id: healthProfessionals.id }).from(healthProfessionals).where(and(eq(healthProfessionals.employeeId, context.user.employeeId), eq(healthProfessionals.isActive, true))).limit(1);
  if (!professional) throw new LaboratoryError("Profissional de saúde ativo não encontrado.");
  return professional;
}

export async function scheduleLabOrder(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = scheduleSchema.parse(raw);
  assertHealthUnitAccess(context.user, input.collectionUnitId);
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDiagnosticLabOrder(tx, input.orderId);
    const order = await readDiagnosticLabOrder(tx, input.orderId);
    if (!order || !["REQUESTED", "RECOLLECT"].includes(order.status)) throw new LaboratoryError("A solicitação não está disponível para agendamento.");
    assertHealthUnitAccess(context.user, order.collectionUnitId || order.requestUnitId || "");
    if (order.examModel?.duplicateWindowDays) {
      const duplicateSince = new Date(input.scheduledAt);
      duplicateSince.setDate(duplicateSince.getDate() - order.examModel.duplicateWindowDays);
      const [duplicate] = await tx.select({ id: d.diagnosticLabOrders.id }).from(d.diagnosticLabOrders).where(and(ne(d.diagnosticLabOrders.id, order.id), eq(d.diagnosticLabOrders.patientId, order.patientId), order.examModelId === null ? isNull(d.diagnosticLabOrders.examModelId) : eq(d.diagnosticLabOrders.examModelId, order.examModelId), gte(d.diagnosticLabOrders.scheduledAt, duplicateSince), lte(d.diagnosticLabOrders.scheduledAt, input.scheduledAt), notInArray(d.diagnosticLabOrders.status, ["CANCELLED", "RECOLLECT"]))).limit(1);
      if (duplicate) throw new LaboratoryError("Há exame do paciente dentro da janela de repetição configurada.");
    }
    const expectedResultAt = new Date(input.scheduledAt);
    expectedResultAt.setDate(expectedResultAt.getDate() + (order.examModel?.deliveryDays ?? 0));
    if (order.examModelId) {
      const dayStart = new Date(input.scheduledAt); dayStart.setHours(0, 0, 0, 0);
      const dayEnd = new Date(input.scheduledAt); dayEnd.setHours(23, 59, 59, 999);
      const [schedule] = await tx.select().from(d.diagnosticLabSchedules).where(and(eq(d.diagnosticLabSchedules.unitId, input.collectionUnitId), eq(d.diagnosticLabSchedules.examModelId, order.examModelId), eq(d.diagnosticLabSchedules.isActive, true), or(and(gte(d.diagnosticLabSchedules.date, dayStart), lte(d.diagnosticLabSchedules.date, dayEnd)), and(isNull(d.diagnosticLabSchedules.date), eq(d.diagnosticLabSchedules.weekday, input.scheduledAt.getDay()))))).orderBy(desc(d.diagnosticLabSchedules.date)).limit(1);
      if (schedule) {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${`${schedule.id}:${dayStart.toISOString()}`}))`);
        const [occupied] = await tx.select({ total: count() }).from(d.diagnosticLabOrders).where(and(ne(d.diagnosticLabOrders.id, order.id), eq(d.diagnosticLabOrders.collectionUnitId, input.collectionUnitId), eq(d.diagnosticLabOrders.examModelId, order.examModelId), gte(d.diagnosticLabOrders.scheduledAt, dayStart), lte(d.diagnosticLabOrders.scheduledAt, dayEnd), ne(d.diagnosticLabOrders.status, "CANCELLED")));
        if (occupied.total >= schedule.capacity) throw new LaboratoryError("Não há vaga disponível no cronograma do exame para esta data.");
      }
      if (input.providerSupplierId && order.status !== "RECOLLECT") {
        const period = input.scheduledAt.toISOString().slice(0, 7);
        const quota = await tx.update(d.diagnosticLabProviderQuotas).set({ consumedQuantity: sql`${d.diagnosticLabProviderQuotas.consumedQuantity} + 1` }).where(and(eq(d.diagnosticLabProviderQuotas.providerSupplierId, input.providerSupplierId), eq(d.diagnosticLabProviderQuotas.unitId, input.collectionUnitId), eq(d.diagnosticLabProviderQuotas.examModelId, order.examModelId), eq(d.diagnosticLabProviderQuotas.period, period), lt(d.diagnosticLabProviderQuotas.consumedQuantity, d.diagnosticLabProviderQuotas.allowedQuantity))).returning({ id: d.diagnosticLabProviderQuotas.id });
        if (quota.length !== 1) throw new LaboratoryError("A cota do prestador para o exame está indisponível ou esgotada.");
      }
    }
    const updated = requiredDiagnosticRecord((await tx.update(d.diagnosticLabOrders).set({ collectionUnitId: input.collectionUnitId, providerSupplierId: input.providerSupplierId, scheduledAt: input.scheduledAt, expectedResultAt, status: "SCHEDULED", authorizationKey: input.providerSupplierId ? randomUUID() : null }).where(eq(d.diagnosticLabOrders.id, order.id)).returning({ id: d.diagnosticLabOrders.id, status: d.diagnosticLabOrders.status, authorizationKey: d.diagnosticLabOrders.authorizationKey }))[0]);
    await tx.insert(d.diagnosticLabOrderEvents).values({ orderId: order.id, eventType: "SCHEDULED", fromStatus: order.status, toStatus: "SCHEDULED", actorUsuarioId: context.user.id });
    return updated;
  });
}

export async function collectLabSample(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = collectSchema.parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    const professional = await professionalForUser(context, tx);
    await lockDiagnosticLabOrder(tx, input.orderId);
    const order = await readDiagnosticLabOrder(tx, input.orderId);
    if (!order?.collectionUnitId || !["SCHEDULED", "RECOLLECT"].includes(order.status)) throw new LaboratoryError("O exame não está disponível para coleta.");
    assertHealthUnitAccess(context.user, order.collectionUnitId);
    const updated = requiredDiagnosticRecord((await tx.update(d.diagnosticLabOrders).set({ status: "COLLECTED", collectedAt: new Date(), sampleBarcode: input.sampleBarcode, collectionByThirdParty: input.collectionByThirdParty, collectorProfessionalId: professional.id }).where(eq(d.diagnosticLabOrders.id, order.id)).returning({ id: d.diagnosticLabOrders.id, status: d.diagnosticLabOrders.status }))[0]);
    await tx.insert(d.diagnosticLabOrderEvents).values({ orderId: order.id, eventType: "COLLECTED", fromStatus: order.status, toStatus: "COLLECTED", actorUsuarioId: context.user.id });
    return updated;
  });
}

export async function requestLabRecollection(context: AppContext, orderId: string, reason: string, connection: DatabaseConnection = databaseConnection) {
  if (reason.trim().length < 3) throw new LaboratoryError("Informe o motivo da recoleta.");
  return withDatabaseTransaction(connection, async tx => {
    await lockDiagnosticLabOrder(tx, orderId);
    const order = await readDiagnosticLabOrder(tx, orderId);
    if (!order?.collectionUnitId || !["COLLECTED", "RECEIVED", "ENTERED"].includes(order.status)) throw new LaboratoryError("A etapa atual não permite recoleta.");
    assertHealthUnitAccess(context.user, order.collectionUnitId);
    const updated = requiredDiagnosticRecord((await tx.update(d.diagnosticLabOrders).set({ status: "RECOLLECT", sampleBarcode: null, collectedAt: null }).where(eq(d.diagnosticLabOrders.id, order.id)).returning({ id: d.diagnosticLabOrders.id, status: d.diagnosticLabOrders.status }))[0]);
    await tx.insert(d.diagnosticLabOrderEvents).values({ orderId: order.id, eventType: "RECOLLECTION_REQUESTED", fromStatus: order.status, toStatus: "RECOLLECT", reason: reason.trim(), actorUsuarioId: context.user.id });
    return updated;
  });
}

export async function enterLabResult(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const input = resultSchema.parse(raw);
  return withDatabaseTransaction(connection, async (tx) => {
    await lockDiagnosticLabOrder(tx, input.orderId);
    const order = await readDiagnosticLabOrder(tx, input.orderId);
    if (!order?.collectionUnitId || !["COLLECTED", "RECEIVED", "ENTERED"].includes(order.status)) throw new LaboratoryError("O exame não está disponível para digitação de resultado.");
    assertHealthUnitAccess(context.user, order.collectionUnitId);
    const [previous] = await tx.select({ version: d.diagnosticLabResults.version }).from(d.diagnosticLabResults).where(eq(d.diagnosticLabResults.orderId, order.id)).orderBy(desc(d.diagnosticLabResults.version)).limit(1);
    const result = requiredDiagnosticRecord((await tx.insert(d.diagnosticLabResults).values({ orderId: order.id, version: (previous?.version ?? 0) + 1, status: input.status, source: input.source, values: diagnosticJson(input.values), interpretation: input.interpretation, deviceCorrelationId: input.deviceCorrelationId, enteredByUsuarioId: context.user.id }).returning({ id: d.diagnosticLabResults.id, status: d.diagnosticLabResults.status }))[0]);
    await tx.update(d.diagnosticLabOrders).set({ status: "ENTERED" }).where(eq(d.diagnosticLabOrders.id, order.id));
    await tx.insert(d.diagnosticLabOrderEvents).values({ orderId: order.id, eventType: input.status === "FINAL" ? "FINAL_RESULT_ENTERED" : "PARTIAL_RESULT_ENTERED", fromStatus: order.status, toStatus: "ENTERED", actorUsuarioId: context.user.id });
    return result;
  });
}

export async function createLabReport(context: AppContext, input: { orderId: string; title: string; file: File }, connection: DatabaseConnection = databaseConnection) {
  const order = await readDiagnosticLabOrder(connection.db, input.orderId);
  const [final] = await connection.db.select({ id: d.diagnosticLabResults.id }).from(d.diagnosticLabResults).where(and(eq(d.diagnosticLabResults.orderId, input.orderId), eq(d.diagnosticLabResults.status, "FINAL"))).limit(1);
  if (!order?.collectionUnitId || !final) throw new LaboratoryError("O laudo exige um resultado final registrado.");
  assertHealthUnitAccess(context.user, order.collectionUnitId);
  const blob = await uploadFile(input.file);
  const content = new Uint8Array(await input.file.arrayBuffer());
  return ingestGedDocument(connection, { title: input.title, documentType: "LAUDO_LABORATORIAL", documentClassCode: "SAUDE_DOCUMENTO_PADRAO", fileUrl: blob.url, content, actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => {
    await lockDiagnosticLabOrder(tx, order.id);
    const current = await readDiagnosticLabOrder(tx, order.id);
    const [result] = await tx.select({ id: d.diagnosticLabResults.id }).from(d.diagnosticLabResults).where(and(eq(d.diagnosticLabResults.orderId, order.id), eq(d.diagnosticLabResults.status, "FINAL"))).limit(1);
    if (!current?.collectionUnitId || !result) throw new LaboratoryError("O laudo exige um resultado final registrado.");
    assertHealthUnitAccess(context.user, current.collectionUnitId);
    await tx.insert(d.diagnosticLabReports).values({ orderId: order.id, documentId });
  } });
}

export async function reviewLabReport(context: AppContext, reportId: string, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, async (tx) => {
    const professional = await professionalForUser(context, tx);
    const initial = await readDiagnosticLabReport(tx, reportId);
    if (initial) await lockDiagnosticLabOrder(tx, initial.order.id);
    const report = await readDiagnosticLabReport(tx, reportId);
    if (!report?.order.collectionUnitId || report.status !== "DRAFT" || report.order.status !== "ENTERED") throw new LaboratoryError("Laudo indisponível para revisão.");
    assertHealthUnitAccess(context.user, report.order.collectionUnitId);
    await tx.update(d.diagnosticLabOrders).set({ status: "REVIEWED" }).where(eq(d.diagnosticLabOrders.id, report.order.id));
    await tx.insert(d.diagnosticLabOrderEvents).values({ orderId: report.order.id, eventType: "REPORT_REVIEWED", fromStatus: report.order.status, toStatus: "REVIEWED", actorUsuarioId: context.user.id });
    return requiredDiagnosticRecord((await tx.update(d.diagnosticLabReports).set({ status: "REVIEWED", reviewedAt: new Date(), reviewerProfessionalId: professional.id }).where(eq(d.diagnosticLabReports.id, report.id)).returning({ id: d.diagnosticLabReports.id, status: d.diagnosticLabReports.status }))[0]);
  });
}

export async function releaseLabReport(context: AppContext, reportId: string, publishToPatient: boolean, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, async (tx) => {
    const initial = await readDiagnosticLabReport(tx, reportId);
    if (initial) await lockDiagnosticLabOrder(tx, initial.order.id);
    const report = await readDiagnosticLabReport(tx, reportId);
    if (!report?.order.collectionUnitId || report.status !== "REVIEWED") throw new LaboratoryError("Somente laudo revisado pode ser liberado.");
    assertHealthUnitAccess(context.user, report.order.collectionUnitId);
    const [configuration] = await tx.select().from(pageLaboratoryConfigurations).where(and(eq(pageLaboratoryConfigurations.unitId, report.order.collectionUnitId), eq(pageLaboratoryConfigurations.isActive, true))).orderBy(desc(pageLaboratoryConfigurations.createdAt)).limit(1);
    if (configuration?.usesDigitalSignature && !(await tx.select({ id: documentSignatures.id }).from(documentSignatures).innerJoin(documentVersions, eq(documentVersions.id, documentSignatures.documentVersionId)).where(and(eq(documentSignatures.documentId, report.documentId), eq(documentSignatures.status, "SIGNED"), eq(documentVersions.status, "SIGNED"))).limit(1))[0]) throw new LaboratoryError("A configuração da unidade exige assinatura digital concluída antes da liberação.");
    if (publishToPatient && !configuration?.publishesPatientPortal) throw new LaboratoryError("A publicação ao paciente não está habilitada para a unidade.");
    const now = new Date();
    await tx.update(d.diagnosticLabOrders).set({ status: "RELEASED" }).where(eq(d.diagnosticLabOrders.id, report.order.id));
    await tx.insert(d.diagnosticLabOrderEvents).values({ orderId: report.order.id, eventType: "REPORT_RELEASED", fromStatus: "REVIEWED", toStatus: "RELEASED", actorUsuarioId: context.user.id });
    return requiredDiagnosticRecord((await tx.update(d.diagnosticLabReports).set({ status: "RELEASED", releasedAt: now, publishedAt: publishToPatient ? now : null }).where(eq(d.diagnosticLabReports.id, report.id)).returning({ id: d.diagnosticLabReports.id, status: d.diagnosticLabReports.status }))[0]);
  });
}

export async function recordDeviceMessage(context: AppContext, input: { deviceId: string; direction: string; correlationId: string; idempotencyKey: string; payload: string; sanitizedData?: unknown }, connection: DatabaseConnection = databaseConnection) {
  return withDatabaseTransaction(connection, async tx => {
    await tx.execute(sql`select pg_advisory_xact_lock(hashtext(${`HEALTH_DEVICE_MESSAGE:${input.idempotencyKey}`}))`);
    const [existing] = await tx.select({ id: d.diagnosticDeviceMessages.id, status: d.diagnosticDeviceMessages.status }).from(d.diagnosticDeviceMessages).where(eq(d.diagnosticDeviceMessages.idempotencyKey, input.idempotencyKey)).limit(1);
    if (existing) return existing;
    const [device] = await tx.select({ id: d.diagnosticDevices.id, operatorUsuarioIds: d.diagnosticDevices.operatorUsuarioIds }).from(d.diagnosticDevices).where(and(eq(d.diagnosticDevices.id, input.deviceId), eq(d.diagnosticDevices.isActive, true))).limit(1);
    const operators = Array.isArray(device?.operatorUsuarioIds) ? device.operatorUsuarioIds : [];
    if (!device || !operators.includes(context.user.id)) throw new LaboratoryError("Operador sem vínculo ativo com o equipamento.");
    return requiredDiagnosticRecord((await tx.insert(d.diagnosticDeviceMessages).values({ deviceId: device.id, direction: input.direction, correlationId: input.correlationId, idempotencyKey: input.idempotencyKey, status: "RECEIVED", payloadHash: createHash("sha256").update(input.payload).digest("hex"), sanitizedData: diagnosticOptionalJson(input.sanitizedData) }).returning({ id: d.diagnosticDeviceMessages.id, status: d.diagnosticDeviceMessages.status }))[0]);
  });
}
