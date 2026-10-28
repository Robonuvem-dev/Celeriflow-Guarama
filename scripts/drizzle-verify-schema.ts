import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { is } from "drizzle-orm";
import { getTableConfig, PgEnumColumn, PgTable } from "drizzle-orm/pg-core";

type PhysicalColumn = { schema: string; table_name: string; name: string; type: string; not_null: boolean };
type PhysicalConstraint = { schema: string; table_name: string; name: string; type: string; definition: string };
type PhysicalIndex = { schema: string; table_name: string; name: string; definition: string };
type PhysicalEnum = { schema: string; name: string; label: string; position: number };
const { catalog } = JSON.parse(readFileSync(".agent/drizzle/database-before-2026-10-28T01-26-00.861Z/catalog.json", "utf8")) as {
  catalog: { columns: PhysicalColumn[]; constraints: PhysicalConstraint[]; indexes: PhysicalIndex[]; enums: PhysicalEnum[] };
};
const compactType = (value: string) => value.replace(/\s+/g, " ").replace(/\s+\(/g, "(").replace(/,\s+/g, ",").replace(" without time zone", "");
const failures: string[] = [];
const mapped = new Set<string>();
const mappings = new Map<string, string[]>();
let columns = 0, foreignKeys = 0;

async function main() {
  for (const file of readdirSync("src/db/schema").filter(name => name.endsWith(".ts"))) {
    const exports = await import(pathToFileURL(resolve(join("src/db/schema", file))).href) as Record<string, unknown>;
    for (const [name, value] of Object.entries(exports)) {
      if (!is(value, PgTable)) continue;
      const table = getTableConfig(value);
      const schema = table.schema ?? "public";
      const identity = `${schema}.${table.name}`;
      // Domain repositories may use explicit projections of the same physical
      // table. Check every declaration against the independent catalog so that
      // a partial projection never hides drift in another domain's mapping.
      const declarations = mappings.get(identity) ?? [];
      declarations.push(`${file}:${name}`);
      mappings.set(identity, declarations);
      mapped.add(identity);
      const physical = catalog.columns.filter(column => column.schema === schema && column.table_name === table.name);
      for (const column of table.columns) {
        const expected = physical.find(row => row.name === column.name);
        const label = `${file}:${name} ${identity}.${column.name}`;
        if (!expected) failures.push(`${label}: column missing in physical catalog`);
        else {
          // pgEnum returns its raw identifier from getSQLType(), while PostgreSQL
          // format_type quotes mixed-case identifiers. Compare the same named
          // enum and its complete ordered labels, retaining type checks for text.
          const actualType = is(column, PgEnumColumn) && expected.type.startsWith('"') ? `"${column.enum.enumName.replaceAll('"', '""')}"` : column.getSQLType();
          if (compactType(actualType) !== compactType(expected.type)) failures.push(`${label}: type ${actualType} != ${expected.type}`);
          if (is(column, PgEnumColumn)) {
            const values = catalog.enums.filter(row => row.schema === (column.enum.schema ?? "public") && row.name === column.enum.enumName).sort((a, b) => a.position - b.position).map(row => row.label);
            if (JSON.stringify(column.enumValues) !== JSON.stringify(values)) failures.push(`${label}: enum labels ${JSON.stringify(column.enumValues)} != ${JSON.stringify(values)}`);
          }
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
  const sharedProjections = [...mappings].filter(([, declarations]) => declarations.length > 1).map(([table, declarations]) => ({ table, declarations }));
  console.log(JSON.stringify({ result: failures.length ? "FAIL" : "PASS", mode: "OFFLINE DECLARED-COLUMN CATALOG COMPARISON", tables: mapped.size, declarations: [...mappings.values()].reduce((sum, rows) => sum + rows.length, 0), columns, foreignKeys, sharedProjections, failures }, null, 2));
  assert.equal(failures.length, 0, "Schema mapping differs from captured physical catalog");
}
main().catch(error => { console.error(error.message); process.exitCode = 1; });
