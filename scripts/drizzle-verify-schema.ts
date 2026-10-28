import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { is } from "drizzle-orm";
import { getTableConfig, PgTable } from "drizzle-orm/pg-core";

type PhysicalColumn = { schema: string; table_name: string; name: string; type: string; not_null: boolean };
type PhysicalConstraint = { schema: string; table_name: string; name: string; type: string; definition: string };
type PhysicalIndex = { schema: string; table_name: string; name: string; definition: string };
const { catalog } = JSON.parse(readFileSync(".agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json", "utf8")) as {
  catalog: { columns: PhysicalColumn[]; constraints: PhysicalConstraint[]; indexes: PhysicalIndex[] };
};
const compactType = (value: string) => value.replace(/\s+/g, " ").replace(/\s+\(/g, "(").replace(/,\s+/g, ",").replace(" without time zone", "");
const failures: string[] = [];
const mapped = new Set<string>();
let columns = 0, foreignKeys = 0;

async function main() {
  for (const file of readdirSync("src/db/schema").filter(name => name.endsWith(".ts"))) {
    const exports = await import(pathToFileURL(resolve(join("src/db/schema", file))).href) as Record<string, unknown>;
    for (const value of Object.values(exports)) {
      if (!is(value, PgTable)) continue;
      const table = getTableConfig(value);
      const schema = table.schema ?? "public";
      const identity = `${schema}.${table.name}`;
      assert.equal(mapped.has(identity), false, `Duplicate table mapping: ${identity}`);
      mapped.add(identity);
      const physical = catalog.columns.filter(column => column.schema === schema && column.table_name === table.name);
      for (const column of table.columns) {
        const expected = physical.find(row => row.name === column.name);
        const label = `${identity}.${column.name}`;
        if (!expected) failures.push(`${label}: column missing in physical catalog`);
        else {
          if (compactType(column.getSQLType()) !== compactType(expected.type)) failures.push(`${label}: type ${column.getSQLType()} != ${expected.type}`);
          if (column.notNull !== expected.not_null) failures.push(`${label}: notNull ${column.notNull} != ${expected.not_null}`);
        }
        columns++;
      }
      for (const fk of table.foreignKeys) {
        const reference = fk.reference();
        const sourceColumns = reference.columns.map(column => column.name);
        const target = getTableConfig(reference.foreignTable);
        const targetColumns = reference.foreignColumns.map(column => column.name);
        const candidates = catalog.constraints.filter(row => row.schema === schema && row.table_name === table.name && row.type === "f");
        const expected = candidates.find(row => {
          const match = /^FOREIGN KEY \(([^)]+)\) REFERENCES ([^(]+)\(([^)]+)\)/.exec(row.definition);
          const names = (part: string) => part.split(",").map(name => name.trim().replaceAll('"', ""));
          return match && JSON.stringify(names(match[1])) === JSON.stringify(sourceColumns) && match[2].trim().replaceAll('"', "").split(".").at(-1) === target.name && JSON.stringify(names(match[3])) === JSON.stringify(targetColumns);
        });
        if (!expected) failures.push(`${identity}(${sourceColumns}): foreign key missing in physical catalog`);
        else {
          const action = (operation: string) => new RegExp(`ON ${operation} (NO ACTION|RESTRICT|CASCADE|SET NULL|SET DEFAULT)`).exec(expected.definition)?.[1].toLowerCase() ?? "no action";
          if ((fk.onDelete ?? "no action") !== action("DELETE")) failures.push(`${identity}(${sourceColumns}): onDelete ${fk.onDelete} != ${action("DELETE")}`);
          if ((fk.onUpdate ?? "no action") !== action("UPDATE")) failures.push(`${identity}(${sourceColumns}): onUpdate ${fk.onUpdate} != ${action("UPDATE")}`);
        }
        foreignKeys++;
      }
    }
  }
  console.log(JSON.stringify({ result: failures.length ? "FAIL" : "PASS", mode: "OFFLINE CATALOG COMPARISON", tables: mapped.size, columns, foreignKeys, failures }, null, 2));
  assert.equal(failures.length, 0, "Schema mapping differs from captured physical catalog");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
