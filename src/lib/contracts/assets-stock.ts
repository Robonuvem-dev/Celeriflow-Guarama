import type { Decimal } from "@/db/decimal";

/** Persisted movement shared with Finance, Health, Procurement, Fleet and SST. */
export interface MaterialMovementRecord {
  id: string; type: string; operation: string; idempotencyKey: string | null;
  quantity: number; unitValue: number | null; quantityDecimal: Decimal | null;
  unitValueDecimal: Decimal | null; totalValueDecimal: Decimal | null;
  date: Date; reason: string | null; warehouseId: string; materialId: string;
  stockId: string | null; supplierId: string | null; departmentId: string | null;
  obrasServicoId: string | null; settlementId: string | null; materialRequestItemId: string | null;
  returnedMovementId: string | null; reversedMovementId: string | null;
  actorUsuarioId: string | null; actorEmployeeId: string | null; inventorySessionId: string | null;
  createdAt: Date; updatedAt: Date;
}
