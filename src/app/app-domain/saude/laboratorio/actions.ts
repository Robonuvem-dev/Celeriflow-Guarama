"use server";

import { revalidatePath } from "next/cache";
import { assertHealthUnitAccess, getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { collectLabSample, createLabReport, enterLabResult, releaseLabReport, requestLabRecollection, reviewLabReport, scheduleLabOrder } from "@/lib/saude/laboratory-service";
import { eq, sql } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { createId } from "@/db/ids";
import { healthLabExamModels } from "@/db/schema/health-laboratory";
import { diagnosticDevices, diagnosticLabSchedules, diagnosticLabProviderQuotas } from "@/db/schema/health-diagnostics";

const text = (data: FormData, name: string) => String(data.get(name) || "").trim();
const refresh = () => revalidatePath("/saude/laboratorio");

export async function saveExamModelAction(data: FormData): Promise<void> {
  await getTenantContextForModuleOperation("SAUDE", "create");
  const code = text(data, "code"); const name = text(data, "name");
  if (!code || !name) throw new Error("Informe código e nome do exame.");
  await withDatabaseTransaction(databaseConnection, async tx => {
    const values = { name, procedureId: text(data, "procedureId") || null, bench: text(data, "bench") || null, preparation: text(data, "preparation") || null, performedInternally: data.get("performedInternally") === "on", deliveryDays: Number(data.get("deliveryDays") || 0), duplicateWindowDays: Number(data.get("duplicateWindowDays") || 0) };
    const id = createId();
    const [model] = await tx.insert(healthLabExamModels).values({ id, code, ...values }).onConflictDoUpdate({ target: healthLabExamModels.code, set: { ...values, isActive: true } }).returning({ id: healthLabExamModels.id });
    // Nested material creation belonged only to the insert branch of the old upsert.
    if (model.id === id && text(data, "materialId")) await tx.execute(sql`INSERT INTO "HealthLabExamMaterial" (id,"examModelId","materialId",quantity) VALUES (${createId()},${model.id},${text(data, "materialId")},${Number(data.get("materialQuantity") || 1)})`);
  }); refresh();
}

export async function saveExamScheduleAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  assertHealthUnitAccess(context.user, text(data, "unitId"));
  await (context.database ?? db).insert(diagnosticLabSchedules).values({ examModelId: text(data, "examModelId"), unitId: text(data, "unitId"), date: text(data, "date") ? new Date(`${text(data, "date")}T12:00:00`) : null, weekday: text(data, "weekday") ? Number(data.get("weekday")) : null, capacity: Number(data.get("capacity")) }); refresh();
}

export async function saveProviderQuotaAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const key = { providerSupplierId: text(data, "providerSupplierId"), unitId: text(data, "unitId"), examModelId: text(data, "examModelId"), period: text(data, "period") };
  assertHealthUnitAccess(context.user, key.unitId);
  await (context.database ?? db).insert(diagnosticLabProviderQuotas).values({ ...key, allowedQuantity: Number(data.get("allowedQuantity")) }).onConflictDoUpdate({ target: [diagnosticLabProviderQuotas.providerSupplierId, diagnosticLabProviderQuotas.unitId, diagnosticLabProviderQuotas.examModelId, diagnosticLabProviderQuotas.period], set: { allowedQuantity: Number(data.get("allowedQuantity")) } }); refresh();
}

export async function saveAssistentialDeviceAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const database = context.database ?? db;
  const code = text(data, "code");
  const unitId = text(data, "unitId");
  const [existing] = await database.select({ unitId: diagnosticDevices.unitId }).from(diagnosticDevices).where(eq(diagnosticDevices.code, code)).limit(1);
  if (existing) assertHealthUnitAccess(context.user, existing.unitId || "");
  assertHealthUnitAccess(context.user, unitId);
  const values = { name: text(data, "name"), deviceType: text(data, "deviceType"), protocol: text(data, "protocol"), unitId: unitId || null, operatorUsuarioIds: [context.user.id] };
  await database.insert(diagnosticDevices).values({ code, domain: "LABORATORY", ...values }).onConflictDoUpdate({ target: diagnosticDevices.code, set: { ...values, isActive: true } }); refresh();
}

export async function scheduleOrderAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  await scheduleLabOrder(context, { orderId: text(data, "orderId"), collectionUnitId: text(data, "collectionUnitId"), scheduledAt: text(data, "scheduledAt"), providerSupplierId: text(data, "providerSupplierId") || null });
  refresh();
}

export async function collectSampleAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await collectLabSample(context, { orderId: text(data, "orderId"), sampleBarcode: text(data, "sampleBarcode"), collectionByThirdParty: data.get("collectionByThirdParty") === "on" });
  refresh();
}

export async function enterResultAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  const value = text(data, "value");
  await enterLabResult(context, { orderId: text(data, "orderId"), status: text(data, "status"), values: { result: value, unit: text(data, "unitOfMeasure") || null }, interpretation: text(data, "interpretation") || null, source: "MANUAL" });
  refresh();
}

export async function recollectAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await requestLabRecollection(context, text(data, "orderId"), text(data, "reason"));
  refresh();
}

export async function createReportAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "create");
  const file = data.get("file");
  if (!(file instanceof File) || file.size === 0) throw new Error("Selecione o arquivo do laudo.");
  await createLabReport(context, { orderId: text(data, "orderId"), title: text(data, "title"), file });
  refresh();
}

export async function reviewReportAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await reviewLabReport(context, text(data, "reportId"));
  refresh();
}

export async function releaseReportAction(data: FormData): Promise<void> {
  const context = await getTenantContextForModuleOperation("SAUDE", "update");
  await releaseLabReport(context, text(data, "reportId"), data.get("publishToPatient") === "on");
  refresh();
}
