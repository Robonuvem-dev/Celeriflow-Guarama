import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/neon-serverless";
import { PgDialect, getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import { SQL } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import * as stockSchema from "@/db/schema/assets-stock";
import * as assetSchema from "@/db/schema/assets";
import { auditEvents } from "@/db/schema/audit";

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Small explicit domain schema without generated client metadata. The driver
 * adapter below implements PostgreSQL query results, not a model/delegate API. */
export async function createAssetsFixture(extraTables: PgTable[] = []) {
  const pg = new PGlite();
  const dialect = new PgDialect();
  const tables: PgTable[] = [...Object.values(stockSchema), ...Object.values(assetSchema), auditEvents, ...extraTables];
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      let fallback = "";
      if (column.default instanceof SQL) fallback = ` DEFAULT ${dialect.sqlToQuery(column.default).sql}`;
      else if (typeof column.default === "string") fallback = ` DEFAULT '${column.default.replaceAll("'", "''")}'`;
      else if (typeof column.default === "number" || typeof column.default === "boolean") fallback = ` DEFAULT ${column.default}`;
      else if (column.default !== undefined && (column.getSQLType() === "jsonb" || column.getSQLType() === "json")) fallback = ` DEFAULT '${JSON.stringify(column.default).replaceAll("'", "''")}'::${column.getSQLType()}`;
      return `${quote(column.name)} ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : column.notNull ? " NOT NULL" : ""}${column.isUnique ? " UNIQUE" : ""}${fallback}`;
    });
    await pg.exec(`CREATE TABLE ${quote(config.name)} (${columns.join(",")})`);
    for (const index of config.indexes) {
      const fields = index.config.columns.map(column => {
        if (!("name" in column) || typeof column.name !== "string") throw new Error("Expression index needs an explicit fixture declaration.");
        return quote(column.name);
      });
      await pg.exec(`CREATE ${index.config.unique ? "UNIQUE " : ""}INDEX ${quote(index.config.name!)} ON ${quote(config.name)} (${fields.join(",")})`);
    }
  }
  await pg.exec(`CREATE TABLE "SequenceCounter" (id TEXT PRIMARY KEY, key TEXT UNIQUE, value INTEGER NOT NULL DEFAULT 0, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP NOT NULL);
    CREATE TABLE "Settlement" (id TEXT PRIMARY KEY, status TEXT);
    CREATE TABLE "PurchaseReceipt" (id TEXT PRIMARY KEY, number TEXT, "receivedAt" TIMESTAMP, status TEXT, "contractId" TEXT);
    CREATE TABLE "PurchaseReceiptItem" (id TEXT PRIMARY KEY, "purchaseReceiptId" TEXT, "materialId" TEXT, "warehouseId" TEXT, quantity DOUBLE PRECISION, "quantityIncorporated" DOUBLE PRECISION DEFAULT 0, "unitCost" DOUBLE PRECISION, "batchNumber" TEXT DEFAULT '', brand TEXT, model TEXT, "serialNumber" TEXT, "updatedAt" TIMESTAMP);
    CREATE TABLE "Contract" (id TEXT PRIMARY KEY, "supplierId" TEXT);
    CREATE TABLE "Commitment" (id TEXT PRIMARY KEY, "appropriationId" TEXT, "purchaseReceiptId" TEXT);
    CREATE TABLE "BudgetAppropriation" (id TEXT PRIMARY KEY, "budgetUnitId" TEXT);
    CREATE TABLE "BudgetUnit" (id TEXT PRIMARY KEY, "secretariatId" TEXT);
    CREATE TABLE "AccountingTransaction" (id TEXT PRIMARY KEY, "reversalOfId" TEXT);
    CREATE TABLE "Department" (id TEXT PRIMARY KEY, name TEXT, description TEXT, "secretariatId" TEXT, "isActive" BOOLEAN DEFAULT true, "createdAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP DEFAULT CURRENT_TIMESTAMP);
    CREATE TABLE "Employee" (id TEXT PRIMARY KEY, "departmentId" TEXT, "isActive" BOOLEAN DEFAULT true);
    INSERT INTO "Warehouse" (id,name,"updatedAt") VALUES ('warehouse-1','Almoxarifado',CURRENT_TIMESTAMP);
    INSERT INTO "MaterialCategory" (id,code,name,"updatedAt") VALUES ('category-1','MAT','Material',CURRENT_TIMESTAMP);
    INSERT INTO "Material" (id,code,name,"categoryId","updatedAt") VALUES ('material-1','MAT000001','Material','category-1',CURRENT_TIMESTAMP);
    INSERT INTO "AssetCategory" (id,code,name,"updatedAt") VALUES ('asset-category','ASSET','Equipamento',CURRENT_TIMESTAMP);`);
  let queue: Promise<void> = Promise.resolve();
  const query = async (config: string | { text: string; rowMode?: "array" }, values: unknown[] = []) => {
    const result = await pg.query(typeof config === "string" ? config : config.text, values, {
      rowMode: typeof config === "string" ? "object" : config.rowMode ?? "object",
      parsers: { 1114: value => value, 1184: value => value, 1082: value => value },
    });
    return { ...result, rowCount: result.affectedRows ?? result.rows.length };
  };
  const pool = {
    query,
    async connect() {
      const previous = queue;
      let unlock!: () => void;
      queue = new Promise<void>(resolve => { unlock = resolve; });
      await previous;
      return { query, on() {}, removeListener() {}, release() { unlock(); } };
    },
  };
  // Only the wire-driver shape differs. Production Drizzle's SQL generation,
  // row mapping, transaction boundaries and domain functions are exercised.
  const connection = { db: drizzle({ client: pool as unknown as DatabaseConnection["pool"] }), pool } as unknown as DatabaseConnection;
  return { pg, connection, close: () => pg.close() };
}
