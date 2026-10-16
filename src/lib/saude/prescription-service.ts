import { z } from "zod";
import type { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { clinicalRecordForActor } from "./clinical-extension-service";

export const prescriptionLineSchema = z.object({ medicineId: z.string().nullable(), medicineName: z.string().trim().min(1), presentation: z.string().nullable(), dose: z.string().trim().min(1), route: z.string().nullable(), frequency: z.string().trim().min(1), duration: z.string().nullable(), quantity: z.number().positive().nullable(), instructions: z.string().nullable(), prescriptionType: z.enum(["SIMPLE", "SPECIAL", "CONTROLLED", "MANIPULATED"]).optional(), manualGroup: z.string().trim().max(100).nullable().optional(), usageType: z.enum(["ACUTE", "CONTINUOUS"]).default("ACUTE"), treatmentDays: z.number().int().positive().nullable().optional() });

export async function prescribeClinicalLineTx(tx: Prisma.TransactionClient, context: AppContext, medicalRecordId: string, raw: unknown) {
  const input = prescriptionLineSchema.parse(raw), { record, professional } = await clinicalRecordForActor(tx, context, medicalRecordId);
  const medicine = input.medicineId ? await tx.medicine.findFirstOrThrow({ where: { id: input.medicineId, isActive: true }, include: { material: { select: { healthProfile: { select: { prescriptionRecommendation: true, productKind: true } } } } } }) : null;
  const prescriptionType = input.prescriptionType || (medicine?.isControlled ? "CONTROLLED" : medicine?.material?.healthProfile?.productKind === "MANIPULATED" ? "MANIPULATED" : "SIMPLE");
  let prescription = await tx.healthPrescription.findFirst({ where: { medicalRecordId: record.id, prescriptionType, manualGroup: input.manualGroup || null }, orderBy: { createdAt: "desc" } });
  if (!prescription) {
    prescription = await tx.healthPrescription.create({ data: { patientId: record.patientId, professionalId: professional.id, unitId: record.unitId, medicalRecordId: record.id, prescriptionType, manualGroup: input.manualGroup || null, content: `Prescrição ${prescriptionType}` } });
    await tx.healthPrescription.update({ where: { id: prescription.id }, data: { barcode: prescription.id } });
  }
  const instructions = [...new Set([input.instructions, medicine?.material?.healthProfile?.prescriptionRecommendation].filter((value): value is string => !!value))].join("\n") || null;
  await tx.healthPrescriptionItem.create({ data: { prescriptionId: prescription.id, medicineId: input.medicineId, medicineName: medicine?.name || input.medicineName, presentation: input.presentation || medicine?.presentation, dose: input.dose, route: input.route, frequency: input.frequency, duration: input.duration, quantity: input.quantity, instructions, usageType: input.usageType, treatmentDays: input.treatmentDays || null } });
  if (input.usageType === "CONTINUOUS") await tx.healthOngoingMedication.create({ data: { patientId: record.patientId, medicineId: input.medicineId, name: medicine?.name || input.medicineName, dosage: [input.dose, input.frequency].join(" · "), startedAt: record.date, actorUsuarioId: context.user.id } });
  return { id: prescription.id };
}

export async function savePrescriptionTemplate(context: AppContext, raw: unknown) {
  const input = z.object({ name: z.string().trim().min(1), prescriptionType: z.enum(["SIMPLE", "SPECIAL", "CONTROLLED", "MANIPULATED"]), items: z.array(prescriptionLineSchema).min(1) }).strict().parse(raw);
  return context.prisma.healthPrescriptionTemplate.create({ data: { name: input.name, prescriptionType: input.prescriptionType, items: JSON.parse(JSON.stringify(input.items)) } });
}

export async function applyPrescriptionTemplate(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), templateId: z.string().min(1) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const template = await tx.healthPrescriptionTemplate.findFirstOrThrow({ where: { id: input.templateId, isActive: true } });
    const lines = z.array(prescriptionLineSchema).parse(template.items);
    const ids: string[] = [];
    for (const line of lines) ids.push((await prescribeClinicalLineTx(tx, context, input.medicalRecordId, { ...line, prescriptionType: template.prescriptionType })).id);
    return { prescriptionIds: [...new Set(ids)] };
  });
}

export async function regroupPrescriptionItem(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), prescriptionItemId: z.string().min(1), prescriptionType: z.enum(["SIMPLE", "SPECIAL", "CONTROLLED", "MANIPULATED"]), manualGroup: z.string().trim().min(1) }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    const line = await tx.healthPrescriptionItem.findFirstOrThrow({ where: { id: input.prescriptionItemId, prescription: { medicalRecordId: record.id } }, include: { dispensations: true, prescription: true } });
    if (line.dispensations.length) throw new Error("Item já dispensado deve preservar o receituário de origem.");
    const destination = await tx.healthPrescription.create({ data: { patientId: record.patientId, professionalId: record.professionalId, unitId: record.unitId, medicalRecordId: record.id, content: line.prescription.content, prescriptionType: input.prescriptionType, manualGroup: input.manualGroup } });
    await tx.healthPrescription.update({ where: { id: destination.id }, data: { barcode: destination.id } });
    await tx.healthPrescriptionItem.update({ where: { id: line.id }, data: { prescriptionId: destination.id } });
    return { id: destination.id };
  });
}

export async function setClinicalPrescriptionValidity(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), prescriptionId: z.string().min(1), validUntil: z.coerce.date() }).strict().parse(raw);
  return context.prisma.$transaction(async tx => {
    const { record } = await clinicalRecordForActor(tx, context, input.medicalRecordId);
    const prescription = await tx.healthPrescription.findFirstOrThrow({ where: { id: input.prescriptionId, medicalRecordId: record.id } });
    if (input.validUntil < prescription.date) throw new Error("A validade da receita não pode anteceder sua emissão.");
    return tx.healthPrescription.update({ where: { id: prescription.id }, data: { validUntil: input.validUntil }, select: { id: true } });
  });
}
