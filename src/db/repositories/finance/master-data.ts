import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { createId } from "../../ids";
import { PersistenceError } from "../../errors";

export type FinanceMasterDataType = "budgetUnit" | "resourceSource" | "revenueNature" | "expenseNature";
type MasterDataInput = { code: string; name: string; secretariatId?: string; procurementOriginPolicy?: "NONE" | "PROCUREMENT_SOURCE" | "CONTRACT" };
const tables = { budgetUnit: "BudgetUnit", resourceSource: "ResourceSource", revenueNature: "RevenueNature", expenseNature: "ExpenseNature" } as const;

// These writes affect only the four shared financial registries. Classification
// references and their published PlanningCatalogEntry(versionId) stay intact.
export async function insertFinanceMasterData(db: DatabaseExecutor, type: FinanceMasterDataType, input: MasterDataInput): Promise<void> {
  const additionalColumn = type === "budgetUnit" ? sql`,"secretariatId"` : type === "expenseNature" ? sql`,"procurementOriginPolicy"` : sql``;
  const additionalValue = type === "budgetUnit" ? sql`,${input.secretariatId!}` : type === "expenseNature" ? sql`,${input.procurementOriginPolicy ?? "NONE"}::"ProcurementOriginPolicy"` : sql``;
  await db.execute(sql`INSERT INTO ${sql.identifier(tables[type])} (id,code,name,"updatedAt"${additionalColumn}) VALUES (${createId()},${input.code.trim()},${input.name.trim()},${new Date()}${additionalValue})`);
}

export async function updateFinanceMasterData(db: DatabaseExecutor, type: FinanceMasterDataType, id: string, input: MasterDataInput): Promise<void> {
  const additional = type === "budgetUnit" ? sql`,"secretariatId"=${input.secretariatId!}` : type === "expenseNature" ? sql`,"procurementOriginPolicy"=${input.procurementOriginPolicy ?? "NONE"}::"ProcurementOriginPolicy"` : sql``;
  const result = await db.execute(sql`UPDATE ${sql.identifier(tables[type])} SET code=${input.code.trim()},name=${input.name.trim()},"updatedAt"=${new Date()}${additional} WHERE id=${id} RETURNING id`);
  if (!result.rows.length) throw new PersistenceError("not-found", "Cadastro financeiro não encontrado.");
}

export async function deleteFinanceMasterData(db: DatabaseExecutor, type: FinanceMasterDataType, id: string): Promise<void> {
  const result = await db.execute(sql`DELETE FROM ${sql.identifier(tables[type])} WHERE id=${id} RETURNING id`);
  if (!result.rows.length) throw new PersistenceError("not-found", "Cadastro financeiro não encontrado.");
}
