import type { Prisma } from "@prisma/client";
import { nextEquipmentCode } from "./identifiers";

export class EquipmentCustodyError extends Error {}

export async function recordEquipmentCustody(tx: Prisma.TransactionClient, input: { materialId: string; quantity: number; departmentId: string; responsibleId: string; stockMovementId: string }) {
  const material = await tx.material.findUniqueOrThrow({ where: { id: input.materialId }, select: { name: true, type: true } });
  if (material.type !== "PATRIMONIO") return;
  if (!Number.isInteger(input.quantity)) throw new EquipmentCustodyError("A entrega de equipamentos deve informar quantidade inteira.");
  for (let unit = 0; unit < input.quantity; unit++) {
    await tx.equipmentCustody.create({ data: { code: await nextEquipmentCode(tx), name: material.name, materialId: input.materialId, departmentId: input.departmentId, responsibleId: input.responsibleId, stockMovementId: input.stockMovementId } });
  }
}
