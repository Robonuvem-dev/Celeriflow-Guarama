import { config } from "dotenv";
import { syncMaterialCatalog } from "../src/lib/compras/shared-catalog";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { materials as materialTable } from "../src/db/schema/assets-stock";
import { asc, count, isNull, sql } from "drizzle-orm";
config({ path: ".env.local", quiet: true });

async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL!);
  const db = connection.db;
  const apply = process.argv.includes("--apply");
  try {
    const materials = await db.select({ id: materialTable.id, code: materialTable.code, catalogItemId: materialTable.catalogItemId }).from(materialTable).orderBy(asc(materialTable.code));
    const ambiguous = await db.execute(sql`SELECT c.id FROM "CatalogItem" c JOIN "Material" m ON m."catalogItemId"=c.id GROUP BY c.id HAVING count(*)<>1`);
    if (ambiguous.rows.length) throw new Error("Revise os itens com mais de um material vinculado antes da sincronização.");
    let linkedRequests = 0, linkedProcesses = 0;
    if (apply) for (const material of materials) {
      const result = await withDatabaseTransaction(connection, async tx => {
        const catalog = await syncMaterialCatalog(tx, material.id);
        const requests = await tx.execute(sql`UPDATE "PurchaseRequestItem" SET "materialId"=${material.id}, "updatedAt"=clock_timestamp() WHERE "catalogItemId"=${catalog.id} AND "materialId" IS NULL RETURNING id`);
        const processes = await tx.execute(sql`UPDATE "PurchaseProcessItem" SET "materialId"=${material.id}, "updatedAt"=clock_timestamp() WHERE "catalogItemId"=${catalog.id} AND "materialId" IS NULL RETURNING id`);
        return { requests: requests.rows.length, processes: processes.rows.length };
      }, { timeoutMs: 15000 });
      linkedRequests += result.requests; linkedProcesses += result.processes;
    }
    const [{ value: remaining }] = await db.select({ value: count() }).from(materialTable).where(isNull(materialTable.catalogItemId));
    console.log(JSON.stringify({ mode: apply ? "APPLIED" : "READ_ONLY", materials: materials.length, initiallyUnlinked: materials.filter(row => !row.catalogItemId).length, remainingUnlinked: remaining, linkedRequests, linkedProcesses, stockQuantitiesChanged: false }));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
