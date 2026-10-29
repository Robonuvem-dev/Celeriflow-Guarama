import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as mappings from "../src/db/schema/works-pages";
import { assertBoundCall, assertDrizzleOnly, assertOperationalRenderer, assertReviewedInventory, currentSources, historicalVisualBaseline } from "./helpers/table-migration-contracts";

const root = "src/app/app-domain/obras";

test("Obras: todos os TSX sem dependência Prisma ativa e com sintaxe válida", () => {
  const inventory = currentSources(root);
  assertDrizzleOnly(inventory);
});

test("Obras: proveniência antiga preservada; setor, leitores e actions da UI operacional atual", () => {
  const baseline = historicalVisualBaseline();
  assertReviewedInventory(currentSources(root), Object.keys(baseline.works.files), [`${root}/relatorios/WorksReportsClient.tsx`]);
  const list = `${root}/construcao-civil/page.tsx`, detail = `${root}/construcao-civil/[id]/page.tsx`;
  for (const file of [list, detail]) {
    assertBoundCall(file, "@/lib/platform/tenant-context", "getTenantContextForModule", ['"OBRAS"']);
    assertBoundCall(file, "@/lib/obras/construction-access", "resolveConstructionAccess", ["context"]);
    assertOperationalRenderer(file);
  }
  assertBoundCall(list, "@/db/repositories/works-pages/cases", "loadPageCaseList", ["context.database ?? db", "access", "{ category, q, page: params.page }"]);
  assertBoundCall(detail, "@/db/repositories/works-pages/cases", "findPageCaseDetail", ["database", "access", "id"]);
  assertBoundCall(detail, "@/lib/platform/tenant-context", "canViewModule", ["context.user", '"PROCESSOS"']);
  const rules = `${root}/construcao-civil/regras/ConstructionRulesClient.tsx`;
  assertBoundCall(rules, "../rules-actions", "publishConstructionDefinition", ["{ kind, definition: data }"]);
  for (const name of ["publishConstructionDistribution", "publishConstructionZone", "linkConstructionPropertyZone"]) assertBoundCall(rules, "../rules-actions", name);
  assertOperationalRenderer(rules);
  const projects = `${root}/components/ObrasProjetosClient.tsx`;
  for (const name of ["createObra", "updateObra", "inactivateObra"]) assertBoundCall(projects, "../actions", name);
  assertOperationalRenderer(projects, "ObrasProjetosClient");
});

test("Obras: mappings exclusivos completos e compatíveis com o catálogo físico", () => {
  const captured = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as { catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[] } };
  for (const table of Object.values(mappings)) {
    const config = getTableConfig(table);
    const columns = captured.catalog.columns.filter(column => column.schema === "public" && column.table_name === config.name);
    assert.equal(config.columns.length, columns.length, config.name);
    for (const column of config.columns) {
      const physical = columns.find(value => value.name === column.name);
      assert.ok(physical, `${config.name}.${column.name}`);
      assert.equal(column.notNull, physical.not_null, `${config.name}.${column.name} nullability`);
      const declared = column.getSQLType().replace(/\s+/g, "").toLowerCase();
      const installed = physical.type.replace(/without time zone/g, "").replace(/\s+/g, "").toLowerCase();
      assert.equal(declared, installed, `${config.name}.${column.name} physical type`);
    }
  }
});
