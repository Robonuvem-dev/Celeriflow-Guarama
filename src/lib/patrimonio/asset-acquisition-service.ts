import { and, eq, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { databaseTimestamp } from "@/db/temporal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { assets, assetCategories } from "@/db/schema/assets";
import { departments, employees } from "@/db/schema/administration";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { applyStockMovement } from "./stock-service";
import { nextAssetPatrimonyNumber, nextEquipmentCode } from "./identifiers";

export class AssetAcquisitionError extends Error {}

export type AssetAcquisitionActor = {
  usuarioId: string;
  employeeId?: string | null;
  allowedBudgetUnitIds?: string[];
};

export type AssetAcquisitionInput = {
  purchaseReceiptItemId: string;
  categoryId: string;
  departmentId?: string;
  responsibleId?: string;
};

function required(value: string | undefined, label: string) {
  const normalized = value?.trim();
  if (!normalized) throw new AssetAcquisitionError(`${label} é obrigatório.`);
  return normalized;
}

export function normalizeAssetAcquisitionInput(input: AssetAcquisitionInput) {
  return {
    purchaseReceiptItemId: required(input.purchaseReceiptItemId, "Item do recebimento"),
    categoryId: required(input.categoryId, "Categoria patrimonial"),
    departmentId: input.departmentId?.trim() || undefined,
    responsibleId: input.responsibleId?.trim() || undefined,
  };
}

export async function acquireAssetFromPurchaseReceipt(db: DatabaseConnection, actor: AssetAcquisitionActor, rawInput: AssetAcquisitionInput) {
  const input = normalizeAssetAcquisitionInput(rawInput);
  const actorUsuarioId = required(actor.usuarioId, "Usuário responsável");

  return withDatabaseTransaction(db, async (tx) => {
    const rawReceiptItem = (await tx.execute<{
      id: string; quantity: number; quantityIncorporated: number; unitCost: number; brand: string | null; model: string | null; serialNumber: string | null; warehouseId: string; materialId: string; batchNumber: string;
      materialName: string; materialDescription: string | null; materialType: string; receiptNumber: string; receivedAt: string; receiptStatus: string; supplierId: string; budgetUnitId: string | null; secretariatId: string | null;
    }>(sql`SELECT i.id, i.quantity, i."quantityIncorporated", i."unitCost", i.brand, i.model, i."serialNumber", i."warehouseId", i."materialId", i."batchNumber", m.name AS "materialName", m.description AS "materialDescription", m.type AS "materialType", r.number AS "receiptNumber", r."receivedAt", r.status AS "receiptStatus", c."supplierId", a."budgetUnitId", u."secretariatId"
      FROM "PurchaseReceiptItem" i JOIN "Material" m ON m.id=i."materialId" JOIN "PurchaseReceipt" r ON r.id=i."purchaseReceiptId" JOIN "Contract" c ON c.id=r."contractId"
       LEFT JOIN "Commitment" e ON e.id=r."commitmentId" LEFT JOIN "BudgetAppropriation" a ON a.id=e."appropriationId" LEFT JOIN "BudgetUnit" u ON u.id=a."budgetUnitId" WHERE i.id=${input.purchaseReceiptItemId}`)).rows[0];
    const receiptItem = rawReceiptItem ? { ...rawReceiptItem, receivedAt: databaseTimestamp(rawReceiptItem.receivedAt) } : null;
    if (!receiptItem || receiptItem.receiptStatus !== "APPROVED") {
      throw new AssetAcquisitionError("O tombamento exige um item de recebimento de compra aprovado.");
    }
    const originUnit = receiptItem.budgetUnitId;
    if (actor.allowedBudgetUnitIds && (!originUnit || !actor.allowedBudgetUnitIds.includes(originUnit))) throw new AssetAcquisitionError("Recebimento sem UG conciliada ou fora das unidades gestoras autorizadas.");
    if (receiptItem.quantityIncorporated >= receiptItem.quantity) {
      throw new AssetAcquisitionError("Todos os itens deste recebimento já foram tombados.");
    }
    if (receiptItem.materialType !== "PATRIMONIO") {
      throw new AssetAcquisitionError("Somente itens patrimoniais recebidos podem ser tombados.");
    }
    if (!Number.isInteger(receiptItem.quantity) || !Number.isInteger(receiptItem.quantityIncorporated)) {
      throw new AssetAcquisitionError("O item patrimonial recebido deve possuir quantidade inteira para tombamento unitário.");
    }
    if (receiptItem.serialNumber && receiptItem.quantity !== 1) {
      throw new AssetAcquisitionError("Um item patrimonial com número de série deve ser recebido em quantidade unitária.");
    }
    if (input.responsibleId && !input.departmentId) {
      throw new AssetAcquisitionError("Selecione o setor responsável antes de vincular um servidor.");
    }

    const [category, department, responsible] = await Promise.all([
      tx.select({ id: assetCategories.id }).from(assetCategories).where(and(eq(assetCategories.id, input.categoryId), eq(assetCategories.isActive, true))).limit(1).then(rows => rows[0]),
      input.departmentId ? tx.select({ id: departments.id, secretariatId: departments.secretariatId }).from(departments).where(and(eq(departments.id, input.departmentId), eq(departments.isActive, true))).limit(1).then(rows => rows[0]) : null,
      input.responsibleId ? tx.select({ id: employees.id }).from(employees).where(and(eq(employees.id, input.responsibleId), eq(employees.departmentId, input.departmentId!), eq(employees.isActive, true))).limit(1).then(rows => rows[0]) : null,
    ]);
    if (!category) throw new AssetAcquisitionError("Categoria patrimonial não encontrada ou inativa.");
    if (input.departmentId && !department) throw new AssetAcquisitionError("Setor responsável não encontrado.");
    if (originUnit && (!department || department.secretariatId !== receiptItem.secretariatId)) throw new AssetAcquisitionError("Setor do tombamento deve pertencer à lotação administrativa da UG de origem.");
    if (input.responsibleId && !responsible) throw new AssetAcquisitionError("O servidor responsável deve estar ativo e vinculado ao setor selecionado.");

    const patrimonyNumber = await nextAssetPatrimonyNumber(tx);

    // The compare-and-swap increment makes concurrent tombamentos compete for
    // the same remaining unit instead of over-incorporating the receipt.
    const reserved = await tx.execute<{ id: string }>(sql`UPDATE "PurchaseReceiptItem" SET "quantityIncorporated"="quantityIncorporated"+1, "updatedAt"=clock_timestamp() WHERE id=${receiptItem.id} AND "quantityIncorporated"=${receiptItem.quantityIncorporated} RETURNING id`);
    if (reserved.rows.length !== 1) {
      throw new AssetAcquisitionError("A disponibilidade do recebimento foi alterada por outra operação. Revise e tente novamente.");
    }

    const { movement } = await applyStockMovement(tx, {
      kind: "EXIT",
      sourceType: "ASSET_ACQUISITION",
      warehouseId: receiptItem.warehouseId,
      materialId: receiptItem.materialId,
      batchNumber: receiptItem.batchNumber,
      quantity: 1,
      unitCost: receiptItem.unitCost,
      reason: `Tombamento ${patrimonyNumber} do recebimento ${receiptItem.receiptNumber}`,
      actor,
    });

    const [asset] = await tx.insert(assets).values({
        code: await nextEquipmentCode(tx),
        patrimonyNumber,
        name: receiptItem.materialName,
        description: receiptItem.materialDescription,
        brand: receiptItem.brand,
        model: receiptItem.model,
        serialNumber: receiptItem.serialNumber,
        acquisitionDate: receiptItem.receivedAt,
        incorporationDate: receiptItem.receivedAt,
        acquisitionValue: receiptItem.unitCost,
        currentValue: receiptItem.unitCost,
        acquisitionValueDecimal: new Decimal(String(receiptItem.unitCost)).toDecimalPlaces(2),
        currentValueDecimal: new Decimal(String(receiptItem.unitCost)).toDecimalPlaces(2),
        budgetUnitId: originUnit,
        categoryId: category.id,
        departmentId: department?.id,
        responsibleId: responsible?.id,
        supplierId: receiptItem.supplierId,
        invoiceNumber: receiptItem.receiptNumber,
        purchaseReceiptItemId: receiptItem.id,
        stockMovementId: movement.id,
    }).returning();
    await writeAuditEvent(tx, {
      actorUsuarioId,
      eventType: auditEventTypes.assetAcquiredFromReceipt,
      targetType: "ASSET",
      targetId: asset.id,
    });
    return asset;
  });
}
