import { eq, getTableColumns, sql } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import type { JsonValue } from "../../json";
import { JsonNull } from "../../json";
import { healthLabExamModels } from "../../schema/health-laboratory";
import { diagnosticLabOrders, diagnosticLabReports } from "../../schema/health-diagnostics";

export function requiredDiagnosticRecord<T>(record: T | null | undefined): T {
  if (!record) throw new Error("Registro assistencial não encontrado.");
  return record;
}

/** JSON wire boundary only, never recursively interpret JSON-looking strings. */
export function diagnosticJson(value: unknown): JsonValue {
  return JSON.parse(JSON.stringify(value));
}

export function diagnosticOptionalJson(value: unknown) {
  return value === undefined ? undefined : value === null ? JsonNull : diagnosticJson(value);
}

export async function lockDiagnosticLabOrder(tx: DatabaseTransaction, orderId: string) {
  await tx.execute(sql`select id from "HealthLabOrder" where id = ${orderId} for update`);
}

export async function lockDiagnosticPlan(tx: DatabaseTransaction, planId: string) {
  await tx.execute(sql`select id from "SpecializedTherapeuticPlan" where id = ${planId} for update`);
}

export async function readDiagnosticLabOrder(executor: DatabaseExecutor, id: string) {
  const [row] = await executor.select({ order: getTableColumns(diagnosticLabOrders), examModel: { id: healthLabExamModels.id, deliveryDays: healthLabExamModels.deliveryDays, duplicateWindowDays: healthLabExamModels.duplicateWindowDays } }).from(diagnosticLabOrders)
    .leftJoin(healthLabExamModels, eq(healthLabExamModels.id, diagnosticLabOrders.examModelId)).where(eq(diagnosticLabOrders.id, id)).limit(1);
  return row ? { ...row.order, examModel: row.examModel } : null;
}

export async function readDiagnosticLabReport(executor: DatabaseExecutor, id: string) {
  const [row] = await executor.select({ report: getTableColumns(diagnosticLabReports), order: getTableColumns(diagnosticLabOrders) }).from(diagnosticLabReports)
    .innerJoin(diagnosticLabOrders, eq(diagnosticLabOrders.id, diagnosticLabReports.orderId)).where(eq(diagnosticLabReports.id, id)).limit(1);
  return row ? { ...row.report, order: row.order } : null;
}
