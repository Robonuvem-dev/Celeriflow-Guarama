import { SQL } from "drizzle-orm";
import { PgDialect, getTableConfig, type PgTable } from "drizzle-orm/pg-core";
import type { PGlite } from "@electric-sql/pglite";

const quote = (name: string) => `"${name.replaceAll('"', '""')}"`;

/** Complete scalar projections of shared tables, with their driver types and
 * defaults. Shared-domain required fields/FKs are outside these fixtures; the
 * Construction constraints under test come from the historical SQL migrations. */
export async function createConstructionSharedTables(database: PGlite, tables: PgTable[]) {
  const dialect = new PgDialect();
  for (const table of tables) {
    const config = getTableConfig(table);
    const columns = config.columns.map(column => {
      let fallback = "";
      if (column.default instanceof SQL) fallback = ` DEFAULT ${dialect.sqlToQuery(column.default).sql}`;
      else if (typeof column.default === "string") fallback = ` DEFAULT '${column.default.replaceAll("'", "''")}'`;
      else if (typeof column.default === "number" || typeof column.default === "boolean") fallback = ` DEFAULT ${column.default}`;
      else if (column.default !== undefined && ["json", "jsonb"].includes(column.getSQLType())) fallback = ` DEFAULT '${JSON.stringify(column.default).replaceAll("'", "''")}'::${column.getSQLType()}`;
      return `${quote(column.name)} ${column.getSQLType()}${column.primary ? " PRIMARY KEY" : ""}${column.isUnique ? " UNIQUE" : ""}${fallback}`;
    });
    await database.exec(`CREATE TABLE ${quote(config.name)} (${columns.join(",")})`);
  }
}
