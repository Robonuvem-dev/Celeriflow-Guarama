import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as mappings from "../src/db/schema/planning-pages";
import { assertBoundCall, assertDrizzleOnly, assertJsxProps, assertOperationalRenderer, assertReviewedInventory, currentSources, historicalVisualBaseline } from "./helpers/table-migration-contracts";

const root = "src/components/app-ui/planejamento";
test("Planejamento: proveniência AST imutável e inventário atual Drizzle, incluindo os cinco novos adapters", () => {
  const baseline = historicalVisualBaseline();
  assert.deepEqual(baseline.planning.decimalException, { path: "src/components/app-ui/planejamento/PlanningVersionPage.tsx", namespace: "Prisma.Decimal", before: "new Prisma.Decimal(", after: "new Decimal(" });
  const inventory = currentSources(root);
  assertReviewedInventory(inventory, Object.keys(baseline.planning.files), ["ContextualTables", "PlanningDraftTable", "PlanningList", "PlanningLocalList", "PlanningWorkspace"].map(file => `${root}/${file}.tsx`));
  assertDrizzleOnly(inventory);
  for (const file of ["lookups", "reports", "report-layouts", "publication-response"]) assert.doesNotMatch(readFileSync(`src/lib/planejamento/${file}.ts`, "utf8"), /@prisma|\bprisma\b|\bPrisma\b|as unknown as/);
});

test("Planejamento atual: jurisdição, executor, permissões e actions completos com renderizadores reais", () => {
  const pages = `${root}/PlanningPages.tsx`, management = `${root}/PlanningManagementPage.tsx`;
  assertBoundCall(pages, "@/lib/planejamento/access", "getPlanningContext", ["jurisdiction"], 4);
  assertBoundCall(pages, "@/db/repositories/planning-pages/navigation", "pageEntities", ["pageDatabase(context)", "context", "admin"]);
  assertBoundCall(pages, "@/lib/planejamento/service", "getPlanningInstrument", ["context", "id", "page", "asOf"]);
  for (const operation of ["create", "update"]) assertBoundCall(pages, "@/lib/platform/tenant-context", "canPerformModuleOperation", ["context.user", '"PLANEJAMENTO"', JSON.stringify(operation)]);
  assertBoundCall(management, "@/db/repositories/planning-pages/shared", "pageInstrument", ["database", "context", "id"]);
  for (const moduleCode of ["PLANEJAMENTO", "TRANSPARENCIA", "DOCUMENTOS", "CAMARA"]) assertBoundCall(management, "@/lib/platform/tenant-context", "canPerformModuleOperation", ["context.user", JSON.stringify(moduleCode), '"update"']);
  assertBoundCall(`${root}/PlanningReferencePage.tsx`, "@/db/repositories/planning-pages/catalogs", "pageReferences", ["database", "context", "filters"]);
  assertBoundCall(`${root}/PlanningReferencePage.tsx`, "@/db/repositories/planning/scope", "planningEntityScope", ["context", "governmentEntities.id"]);
  assertBoundCall(`${root}/PlanningForm.tsx`, "@/app/app-domain/planejamento/actions", "savePlanningRecord", ["jurisdiction", "operation", "{ ...input, ...hidden }"]);
  assertBoundCall(`${root}/PlanningForm.tsx`, "@/app/app-domain/planejamento/actions", "previewPlanningImportAction", ["jurisdiction", "{ ...input, ...hidden }"]);
  assertBoundCall(`${root}/PlanningLookupField.tsx`, "@/app/app-domain/planejamento/actions", "searchPlanningOptions");
  for (const name of ["PlanningInstrumentsPage", "PlanningDetailPage"]) assertOperationalRenderer(pages, name);
  for (const name of ["PlanningReferencePage", "PlanningManagementPage", "PlanningMovementHistory"]) assertOperationalRenderer(`${root}/${name}.tsx`, name);
  assertJsxProps(`${root}/PlanningList.tsx`, "OperationalTable", ["columns", "rows", "preferenceId", "caption"]);
  assertJsxProps(`${root}/PlanningList.tsx`, "OperationalLinkPagination", ["page", "total", "values", "pageParam"]);
  assertBoundCall("src/app/app-domain/financeiro/orcamento/planejamento/page.tsx", "next/navigation", "redirect", ['"/planejamento"']);
});

test("Planejamento: quatro mappings completos conferidos com o catálogo físico", () => {
  const catalog = JSON.parse(readFileSync(new URL("./fixtures/installed-physical-catalog.json", import.meta.url), "utf8")) as { catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[] } };
  assert.equal(Object.keys(mappings).length, 4);
  for (const table of Object.values(mappings)) {
    const config = getTableConfig(table), installed = catalog.catalog.columns.filter(row => row.schema === "public" && row.table_name === config.name);
    assert.equal(config.columns.length, installed.length, config.name);
    for (const column of config.columns) { const physical = installed.find(row => row.name === column.name); assert.ok(physical); assert.equal(column.notNull, physical.not_null); assert.equal(column.getSQLType().replace(/\s+/g, ""), physical.type.replace(/without time zone|\s+/g, "")); }
  }
});
