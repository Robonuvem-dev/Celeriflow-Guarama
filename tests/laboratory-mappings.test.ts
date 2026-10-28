import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { SQL } from "drizzle-orm";
import { getTableConfig, PgDialect } from "drizzle-orm/pg-core";
import * as diagnostics from "../src/db/schema/health-diagnostics";
import { diagnosticJson, diagnosticOptionalJson } from "../src/db/repositories/health-diagnostics/records";

test("Diagnostics · complete mappings match independent installed catalog", () => {
  const { catalog } = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as {
    catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean; default_expression: string | null }[]; constraints: { schema: string; table_name: string; name: string; type: string; definition: string }[]; indexes: { schema: string; table_name: string; name: string; definition: string }[] };
  };
  const normalize = (value: string) => value.replaceAll('"', "").replace(/\s/g, "").toLowerCase();
  const dialect = new PgDialect();
  let columnsChecked = 0, foreignKeysChecked = 0, defaultsChecked = 0;
  for (const table of Object.values(diagnostics)) {
    const config = getTableConfig(table), columns = catalog.columns.filter(row => row.schema === "public" && row.table_name === config.name);
    assert.equal(config.columns.length, columns.length, config.name);
    for (const column of config.columns) {
      const physical = columns.find(row => row.name === column.name);
      assert.ok(physical, `${config.name}.${column.name}`);
      assert.equal(column.notNull, physical.not_null, `${config.name}.${column.name}`);
      assert.equal(normalize(column.getSQLType()).replace("withouttimezone", ""), normalize(physical.type).replace("withouttimezone", ""));
      assert.equal(column.default !== undefined, physical.default_expression !== null, `${config.name}.${column.name} SQL default`);
      if (column.default !== undefined) {
        const expression = column.default instanceof SQL ? dialect.sqlToQuery(column.default).sql : typeof column.default === "string" ? `'${column.default}'` : String(column.default);
        const normalizeDefault = (value: string) => normalize(value).replace("current_timestamp", "now()").replace("::text", "");
        assert.equal(normalizeDefault(expression), normalizeDefault(physical.default_expression || ""));
        defaultsChecked++;
      }
      columnsChecked++;
    }
    const fks = catalog.constraints.filter(row => row.schema === "public" && row.table_name === config.name && row.type === "f");
    assert.equal(config.foreignKeys.length, fks.length, `${config.name} foreign keys`);
    for (const fk of config.foreignKeys) {
      const physical = fks.find(row => row.name === fk.getName()), reference = fk.reference();
      assert.ok(physical, fk.getName());
      assert.ok(normalize(physical.definition).includes(normalize(`FOREIGN KEY (${reference.columns.map(column => column.name).join(",")}) REFERENCES ${getTableConfig(reference.foreignTable).name}(${reference.foreignColumns.map(column => column.name).join(",")})`)));
      for (const [kind, action] of [["DELETE", fk.onDelete], ["UPDATE", fk.onUpdate]]) {
        const installed = physical.definition.match(new RegExp(`ON ${kind} (CASCADE|RESTRICT|NO ACTION|SET NULL|SET DEFAULT)`))?.[1] ?? "NO ACTION";
        assert.equal((action ?? "no action").toUpperCase(), installed, fk.getName());
      }
      foreignKeysChecked++;
    }
    const indexes = catalog.indexes.filter(row => row.schema === "public" && row.table_name === config.name && !row.name.endsWith("_pkey"));
    assert.deepEqual(config.indexes.map(item => item.config.name).sort(), indexes.map(item => item.name).sort(), `${config.name} installed indexes`);
    for (const check of config.checks) assert.ok(catalog.constraints.some(row => row.schema === "public" && row.table_name === config.name && row.name === check.name && row.type === "c"));
  }
  console.log(`Diagnostics physical mapping: ${Object.keys(diagnostics).length} tables, ${columnsChecked} columns, ${foreignKeysChecked} FKs, ${defaultsChecked} SQL defaults`);
});

test("Diagnostics · JSON preserves null, nested strings and frozen date values", () => {
  const value = { instant: new Date("2026-10-28T01:02:03.004Z"), omitted: undefined, nil: null, value: 0.125, jsonText: '{"amount":"001.00"}', nested: [false, null, "null"] };
  assert.deepEqual(diagnosticJson(value), { instant: "2026-10-28T01:02:03.004Z", nil: null, value: 0.125, jsonText: '{"amount":"001.00"}', nested: [false, null, "null"] });
  assert.equal(diagnosticOptionalJson(undefined), undefined);
  assert.ok(diagnosticOptionalJson(null) instanceof SQL);
  assert.equal(new PgDialect().sqlToQuery(diagnosticOptionalJson(null) as SQL).sql, "'null'::jsonb");
  assert.equal(diagnosticOptionalJson("null"), "null");
});
