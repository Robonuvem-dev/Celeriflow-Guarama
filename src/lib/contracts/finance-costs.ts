import type { Decimal } from "@/db/decimal";
import type { JsonValue } from "@/db/json";

export type MunicipalCostFilters = { expenseFrom?: Date; expenseUntil?: Date; appropriationFrom?: Date; appropriationUntil?: Date; sourceType?: string; itemId?: string };
export type MunicipalCostObject = { id: string; financialYearId: string; budgetUnitId: string | null; code: string; description: string; detailedDescription: string; parentId: string | null; sourceKey: string; sourceSnapshot: JsonValue; isActive: boolean; createdAt: Date };
export type MunicipalCostItem = { id: string; financialYearId: string; identifier: string; description: string; detailedDescription: string; identificationClass: string; behavior: string; isActive: boolean; createdAt: Date };
export type MunicipalCostObjectItem = { id: string; objectId: string; itemId: string; copiedFromId: string | null; createdAt: Date };
export type MunicipalCostRule = { id: string; financialYearId: string; budgetUnitId: string; title: string; sourceType: string; selector: JsonValue; shares: JsonValue; priority: number; effectiveFrom: Date; effectiveUntil: Date | null; isActive: boolean; retiredAt: Date | null; retirementReason: string | null; actorId: string; createdAt: Date };
export type MunicipalCostPolicy = { id: string; governmentEntityId: string; effectiveFrom: Date; enabled: boolean; sourceTypes: JsonValue; reason: string; actorId: string; createdAt: Date };
export type MunicipalCostSource = { id: string; financialYearId: string; budgetUnitId: string; sourceType: string; sourceId: string; expenseDate: Date; amount: Decimal; status: string; snapshot: JsonValue; createdAt: Date };
export type MunicipalCostReduction = { id: string; sourceId: string; date: Date; amount: Decimal; reason: string; actorId: string; idempotencyKey: string; snapshot: JsonValue; createdAt: Date };
export type MunicipalCostMovement = { id: string; sourceId: string; kind: string; date: Date; reason: string; actorId: string; idempotencyKey: string; referenceMovementId: string | null; snapshot: JsonValue; createdAt: Date };
export type MunicipalCostAllocation = { id: string; movementId: string; objectId: string; itemId: string; amount: Decimal };
export type MunicipalCostMovementWithAllocations = MunicipalCostMovement & { allocations: MunicipalCostAllocation[]; correction: { id: string } | null };
export type MunicipalCostSourceWithHistory = MunicipalCostSource & { reductions: MunicipalCostReduction[]; movements: MunicipalCostMovementWithAllocations[] };
