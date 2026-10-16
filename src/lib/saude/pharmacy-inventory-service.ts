import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { assertHealthUnitAccess } from "@/lib/platform/tenant-context";
import { closeApprovedInventory, createInventorySession, recordInventoryCount, submitInventoryForApproval } from "@/lib/patrimonio/inventory-service";
import { pharmacyDispensationAccess } from "./pharmacy-dispensation-service";

async function sessionForHealth(context: AppContext, sessionId: string) {
  const session = await context.prisma.inventorySession.findUniqueOrThrow({ where: { id: sessionId }, include: { warehouse: true } });
  if (!session.warehouse.healthUnitId) throw new Error("O inventário não pertence a estoque de saúde.");
  assertHealthUnitAccess(context.user, session.warehouse.healthUnitId);
  return session;
}
export async function startPharmacyInventory(context: AppContext, warehouseId: string) {
  z.string().min(1).parse(warehouseId);
  await pharmacyDispensationAccess(context.prisma, context, warehouseId);
  return createInventorySession(context.prisma, { warehouseId, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
}
export async function countPharmacyInventory(context: AppContext, raw: unknown) {
  const input = z.object({ sessionId: z.string().min(1), itemId: z.string().min(1), countedQuantity: z.number().nonnegative(), divergenceType: z.string().optional(), countEvidence: z.string().optional(), adjustmentReason: z.string().optional() }).strict().parse(raw);
  const session = await sessionForHealth(context, input.sessionId);
  if (session.createdByUsuarioId !== context.user.id) throw new Error("A contagem deve ser registrada pelo inventoriante responsável.");
  const item = await context.prisma.inventorySessionItem.findFirst({ where: { id: input.itemId, sessionId: session.id }, select: { stock: { select: { material: { select: { vaccine: { select: { id: true } } } } } } } });
  if (item?.stock.material.vaccine && !Number.isInteger(input.countedQuantity)) throw new Error("Informe número inteiro de doses para o inventário do imunobiológico.");
  return recordInventoryCount(context.prisma, input);
}
export async function submitPharmacyInventory(context: AppContext, sessionId: string) {
  const session = await sessionForHealth(context, sessionId);
  if (session.createdByUsuarioId !== context.user.id) throw new Error("O envio deve ser realizado pelo inventoriante responsável.");
  return submitInventoryForApproval(context.prisma, sessionId);
}
export async function closePharmacyInventory(context: AppContext, raw: unknown) {
  const input = z.object({ sessionId: z.string().min(1), approvalEvidence: z.string().trim().min(1).max(4000) }).strict().parse(raw);
  await sessionForHealth(context, input.sessionId);
  return closeApprovedInventory(context.prisma, { ...input, actor: { usuarioId: context.user.id, employeeId: context.user.employeeId } });
}
