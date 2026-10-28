import { eq } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { equipmentCustodies, materials } from "@/db/schema/assets-stock";
import { nextEquipmentCode } from "./identifiers";

export class EquipmentCustodyError extends Error {}

export async function recordEquipmentCustody(tx: DatabaseTransaction, input: { materialId: string; quantity: number; departmentId: string; responsibleId: string; stockMovementId: string }) {
  const [material] = await tx.select({ name: materials.name, type: materials.type }).from(materials).where(eq(materials.id, input.materialId)).limit(1);
  if (!material) throw new EquipmentCustodyError("Material não encontrado.");
  if (material.type !== "PATRIMONIO") return;
  if (!Number.isInteger(input.quantity)) throw new EquipmentCustodyError("A entrega de equipamentos deve informar quantidade inteira.");
  for (let unit = 0; unit < input.quantity; unit++) {
    await tx.insert(equipmentCustodies).values({ code: await nextEquipmentCode(tx), name: material.name, materialId: input.materialId, departmentId: input.departmentId, responsibleId: input.responsibleId, stockMovementId: input.stockMovementId });
  }
}
