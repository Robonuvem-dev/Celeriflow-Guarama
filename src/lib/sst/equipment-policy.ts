import { z } from "zod";

const id = z.string().trim().min(1).max(100);
export const equipmentInput = z.object({
  budgetUnitId: id, materialId: id, kind: z.enum(["EPI", "EPC"]),
  ca: z.string().trim().max(100), caValidUntil: z.string().date().nullable(),
  validityDays: z.coerce.number().int().min(1).max(36500),
  reviewDays: z.coerce.number().int().min(1).max(36500), supplierId: id.nullable(),
  submissionKey: z.string().uuid(),
}).refine((v) => v.kind !== "EPI" || v.ca.length > 0, "EPI exige certificado de aprovação.");
export const deliveryInput = z.object({
  budgetUnitId: id, equipmentId: id, employeeIds: z.array(id).min(1).max(100),
  quantity: z.coerce.number().positive().max(100000), deliveredAt: z.coerce.date(),
  warehouseId: id.nullable(), batchNumber: z.string().trim().max(100).default(""),
  location: z.string().trim().max(300).default(""), notes: z.string().trim().max(2000).default(""),
  submissionKey: z.string().uuid(),
}).superRefine((v, ctx) => {
  if (new Set(v.employeeIds).size !== v.employeeIds.length) ctx.addIssue({ code: "custom", message: "Servidor duplicado na entrega." });
  if (v.deliveredAt > new Date()) ctx.addIssue({ code: "custom", message: "Entrega não pode estar no futuro." });
});
export const equipmentEventInput = z.object({
  itemIds: z.array(id).min(1).max(100), kind: z.enum(["WRITE_OFF", "REVIEW"]),
  quantity: z.coerce.number().positive().max(100000), occurredAt: z.coerce.date(),
  nextReviewAt: z.coerce.date().nullable(), responsiblePersonId: id,
  notes: z.string().trim().min(3).max(2000), submissionKey: z.string().uuid(),
}).superRefine((v, ctx) => {
  if (new Set(v.itemIds).size !== v.itemIds.length) ctx.addIssue({ code: "custom", message: "Item duplicado." });
  if (v.occurredAt > new Date()) ctx.addIssue({ code: "custom", message: "Data não pode estar no futuro." });
  if (v.kind === "REVIEW" && (!v.nextReviewAt || v.nextReviewAt <= v.occurredAt)) ctx.addIssue({ code: "custom", message: "Informe a próxima revisão após a revisão realizada." });
});

export function equipmentDueDate(at: Date, days: number) {
  return new Date(at.getTime() + days * 86400000);
}
export function equipmentUsageDays(start: Date, end: Date) {
  if (end < start) throw new Error("Baixa anterior à entrega.");
  return (end.getTime() - start.getTime()) / 86400000;
}
export function weightedEquipmentAverage(entries: { days: number; quantity: number }[]) {
  const quantity = entries.reduce((sum, entry) => sum + entry.quantity, 0);
  return quantity ? entries.reduce((sum, entry) => sum + entry.days * entry.quantity, 0) / quantity : null;
}

// No acceptance endpoint exists until a homologated adapter can verify genuine evidence.
export const equipmentBiometricIntegration = {
  status: "INTEGRATION_PENDING",
  requirements: ["Leitor e SDK homologados", "Identificação verificada do servidor", "Desafio único vinculado ao hash do recibo", "Verificação no servidor da assinatura do adaptador", "Antirreplay e validade do desafio", "Evidência protegida, retenção e auditoria sem template biométrico em logs"],
} as const;
