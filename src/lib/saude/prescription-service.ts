import { z } from "zod";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { DatabaseTransaction } from "@/db/transaction";
import { createId } from "@/db/ids";
import { medicines, healthPrescriptions, healthPrescriptionItems, healthPrescriptionTemplates } from "@/db/schema/health-prescriptions";
import { healthOngoingMedications } from "@/db/schema/health-care";
import type { AppContext } from "@/lib/platform/tenant-context";
import { clinicalRecordForActor } from "./clinical-extension-service";
import { runHealthTransaction } from "./health-transaction";

export const prescriptionLineSchema = z.object({ medicineId: z.string().nullable(), medicineName: z.string().trim().min(1), presentation: z.string().nullable(), dose: z.string().trim().min(1), route: z.string().nullable(), frequency: z.string().trim().min(1), duration: z.string().nullable(), quantity: z.number().positive().nullable(), instructions: z.string().nullable(), prescriptionType: z.enum(["SIMPLE", "SPECIAL", "CONTROLLED", "MANIPULATED"]).optional(), manualGroup: z.string().trim().max(100).nullable().optional(), usageType: z.enum(["ACUTE", "CONTINUOUS"]).default("ACUTE"), treatmentDays: z.number().int().positive().nullable().optional() });

export async function prescribeClinicalLineTx(tx: DatabaseTransaction, context: AppContext, medicalRecordId: string, raw: unknown) {
  const input = prescriptionLineSchema.parse(raw), { record, professional } = await clinicalRecordForActor(tx, context, medicalRecordId);
  const medicine = input.medicineId ? (await tx.select().from(medicines).where(and(eq(medicines.id, input.medicineId), eq(medicines.isActive, true))).limit(1))[0] : null;
  if (input.medicineId && !medicine) throw new Error("Medicamento ativo não encontrado.");
  const profile = medicine?.materialId ? (await tx.execute<{ prescriptionRecommendation: string | null; productKind: string }>(sql`SELECT "prescriptionRecommendation", "productKind" FROM "HealthMaterialProfile" WHERE "materialId"=${medicine.materialId} LIMIT 1`)).rows[0] : null;
  const prescriptionType = input.prescriptionType || (medicine?.isControlled ? "CONTROLLED" : profile?.productKind === "MANIPULATED" ? "MANIPULATED" : "SIMPLE");
  let [prescription] = await tx.select().from(healthPrescriptions).where(and(eq(healthPrescriptions.medicalRecordId, record.id), eq(healthPrescriptions.prescriptionType, prescriptionType), input.manualGroup ? eq(healthPrescriptions.manualGroup, input.manualGroup) : isNull(healthPrescriptions.manualGroup))).orderBy(desc(healthPrescriptions.createdAt)).limit(1);
  if (!prescription) {
    const id = createId();
    [prescription] = await tx.insert(healthPrescriptions).values({ id, barcode: id, patientId: record.patientId, professionalId: professional.id, unitId: record.unitId, medicalRecordId: record.id, prescriptionType, manualGroup: input.manualGroup || null, content: `Prescrição ${prescriptionType}` }).returning();
  }
  const instructions = [...new Set([input.instructions, profile?.prescriptionRecommendation].filter((value): value is string => !!value))].join("\n") || null;
  await tx.insert(healthPrescriptionItems).values({ prescriptionId: prescription.id, medicineId: input.medicineId, medicineName: medicine?.name || input.medicineName, presentation: input.presentation || medicine?.presentation, dose: input.dose, route: input.route, frequency: input.frequency, duration: input.duration, quantity: input.quantity, instructions, usageType: input.usageType, treatmentDays: input.treatmentDays || null });
  if (input.usageType === "CONTINUOUS") await tx.insert(healthOngoingMedications).values({ patientId: record.patientId, medicineId: input.medicineId, name: medicine?.name || input.medicineName, dosage: [input.dose, input.frequency].join(" · "), startedAt: record.date, actorUsuarioId: context.user.id });
  return { id: prescription.id };
}

export async function savePrescriptionTemplate(context: AppContext, raw: unknown) {
  const input = z.object({ name: z.string().trim().min(1), prescriptionType: z.enum(["SIMPLE", "SPECIAL", "CONTROLLED", "MANIPULATED"]), items: z.array(prescriptionLineSchema).min(1) }).strict().parse(raw);
  const [template] = await (context.database ?? db).insert(healthPrescriptionTemplates).values({ name: input.name, prescriptionType: input.prescriptionType, items: input.items }).returning();
  return template;
}

export async function applyPrescriptionTemplate(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), templateId: z.string().min(1) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const [template] = await tx.select().from(healthPrescriptionTemplates).where(and(eq(healthPrescriptionTemplates.id, input.templateId), eq(healthPrescriptionTemplates.isActive, true))).limit(1);
    if (!template) throw new Error("Receituário padrão ativo não encontrado.");
    const lines = z.array(prescriptionLineSchema).parse(template.items);
    const ids: string[] = [];
    for (const line of lines) ids.push((await prescribeClinicalLineTx(tx, context, input.medicalRecordId, { ...line, prescriptionType: template.prescriptionType })).id);
    return { prescriptionIds: [...new Set(ids)] };
  });
}

export async function regroupPrescriptionItem(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), prescriptionItemId: z.string().min(1), prescriptionType: z.enum(["SIMPLE", "SPECIAL", "CONTROLLED", "MANIPULATED"]), manualGroup: z.string().trim().min(1) }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    await tx.execute(sql`SELECT id FROM "HealthPrescriptionItem" WHERE id=${input.prescriptionItemId} FOR UPDATE`);
    const [line] = await tx.select({ id: healthPrescriptionItems.id, content: healthPrescriptions.content }).from(healthPrescriptionItems).innerJoin(healthPrescriptions, eq(healthPrescriptions.id, healthPrescriptionItems.prescriptionId)).where(and(eq(healthPrescriptionItems.id, input.prescriptionItemId), eq(healthPrescriptions.medicalRecordId, record.id))).limit(1);
    if (!line) throw new Error("Item não pertence ao atendimento.");
    if ((await tx.execute(sql`SELECT id FROM "MedicineDispensation" WHERE "prescriptionItemId"=${line.id} LIMIT 1`)).rows.length) throw new Error("Item já dispensado deve preservar o receituário de origem.");
    const id = createId();
    const [destination] = await tx.insert(healthPrescriptions).values({ id, barcode: id, patientId: record.patientId, professionalId: record.professionalId, unitId: record.unitId, medicalRecordId: record.id, content: line.content, prescriptionType: input.prescriptionType, manualGroup: input.manualGroup }).returning({ id: healthPrescriptions.id });
    await tx.update(healthPrescriptionItems).set({ prescriptionId: destination.id }).where(eq(healthPrescriptionItems.id, line.id));
    return { id: destination.id };
  });
}

export async function setClinicalPrescriptionValidity(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), prescriptionId: z.string().min(1), validUntil: z.coerce.date() }).strict().parse(raw);
  return runHealthTransaction(context, async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    const [prescription] = await tx.select().from(healthPrescriptions).where(and(eq(healthPrescriptions.id, input.prescriptionId), eq(healthPrescriptions.medicalRecordId, record.id))).limit(1);
    if (!prescription) throw new Error("Receita não pertence ao atendimento.");
    if (input.validUntil < prescription.date) throw new Error("A validade da receita não pode anteceder sua emissão.");
    const [updated] = await tx.update(healthPrescriptions).set({ validUntil: input.validUntil }).where(eq(healthPrescriptions.id, prescription.id)).returning({ id: healthPrescriptions.id });
    return updated;
  });
}
