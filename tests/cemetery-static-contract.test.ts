import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import ts from "typescript";
import { getTableColumns, getTableName } from "drizzle-orm";
import { getTableConfig } from "drizzle-orm/pg-core";
import * as tables from "../src/db/schema/cemeteries";
import { assertBoundCall, assertOperationalRenderer, assertReviewedInventory, historicalVisualBaseline } from "./helpers/table-migration-contracts";

function sources(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? sources(join(directory, entry.name)) : /\.(ts|tsx)$/.test(entry.name) ? [join(directory, entry.name)] : []);
}
const owned = ["src/lib/cemeteries", "src/app/app-domain/cemiterios", "src/app/api/cemiterios", "src/components/cemeteries", "src/db/repositories/cemeteries"];
const sourceFiles = [...owned.flatMap(sources), "src/db/schema/cemeteries.ts", "src/lib/contracts/cemeteries-fees.ts", "src/lib/contracts/cemeteries-workflow.ts", "scripts/seed-cemetery-demo.ts"];

test("reserva cemiterial: sintaxe e nenhuma dependência/consulta do ORM removido", () => {
  for (const file of sourceFiles) {
    const source = readFileSync(file, "utf8");
    const compiled = ts.transpileModule(source, { fileName: file, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext, jsx: ts.JsxEmit.Preserve, isolatedModules: true }, reportDiagnostics: true });
    assert.deepEqual((compiled.diagnostics ?? []).filter(item => item.category === ts.DiagnosticCategory.Error).map(item => ts.flattenDiagnosticMessageText(item.messageText, "\n")), [], file);
    assert.ok(!/@prisma\//.test(source), file);
    assert.ok(!/\.(?:\$transaction|\$queryRaw(?:Unsafe)?|\$executeRaw(?:Unsafe)?)\b/.test(source), file);
    assert.ok(!/\b(?:PrismaClient|TransactionClient|Prisma)\b/.test(source), file);
  }
});

test("Cemitérios: proveniência imutável e contratos atuais de acesso, ações e históricos", () => {
  const visualBase = historicalVisualBaseline();
  assert.deepEqual(visualBase.cemetery.decimalException, { path: "src/app/app-domain/cemiterios/taxas/guias/[id]/page.tsx", namespace: "Prisma.Decimal", before: "Prisma.Decimal.max(0, total.minus(paid))", after: "Decimal.max(0, total.minus(paid))" });
  assertReviewedInventory(sourceFiles.filter(file => file.endsWith(".tsx")), Object.keys(visualBase.cemetery.files), ["src/app/app-domain/cemiterios/ProcessRowMenu.tsx"]);
  const structure = "src/components/cemeteries/StructurePages.tsx";
  assertBoundCall(structure, "@/lib/platform/tenant-context", "getTenantContextForModule", ['"CEMITERIOS"'], 2);
  assertBoundCall(structure, "@/lib/platform/tenant-context", "canPerformModuleOperation", ["c.user", '"CEMITERIOS"', 'id === "novo" ? "create" : "update"']);
  for (const name of ["readStructureHistory", "readLotGraves", "readStructureTaxpayers"]) assertBoundCall(structure, "@/db/repositories/cemeteries/structure", name);
  assertBoundCall("src/components/cemeteries/StructureForm.tsx", "@/app/app-domain/cemiterios/estrutura/actions", "saveStructureAction", ["kind", "record.id ? String(record.id) : undefined", "data"]);
  for (const name of ["StructureListPage", "StructureDetailPage"]) assertOperationalRenderer(structure, name);
  const processes = "src/app/app-domain/cemiterios/processos/page.tsx";
  assertBoundCall(processes, "@/lib/platform/tenant-context", "getTenantContextForModule", ['"CEMITERIOS"']);
  assertBoundCall(processes, "@/db/repositories/cemeteries/workflow-pages", "readScheduledProcessPage", ["context.database ?? db", "{ ...filters, cemeteryId }"]);
  for (const operation of ["create", "update"]) assertBoundCall(processes, "@/lib/platform/tenant-context", "canPerformModuleOperation", ["context.user", '"CEMITERIOS"', JSON.stringify(operation)]);
  assertOperationalRenderer(processes);
});

const catalogFile = new URL("./fixtures/installed-physical-catalog.json", import.meta.url);
test("mapeamento cemiterial corresponde ao catálogo instalado, inclusive FK nullable SET NULL", t => {
  const snapshot: { catalog: { columns: { schema: string; table_name: string; name: string; type: string; not_null: boolean }[]; constraints: { schema: string; table_name: string; name: string; definition: string }[] } } = JSON.parse(readFileSync(catalogFile, "utf8"));
  const physical = new Map(snapshot.catalog.columns.filter(column => column.schema === "public").map(column => [`${column.table_name}.${column.name}`, column]));
  const normalize = (type: string) => type.replace(/\s+/g, " ").replace(/\s+\(/g, "(").replace(" without time zone", "").replace("decimal(", "numeric(");
  let checked = 0;
  for (const table of Object.values(tables)) {
    for (const column of Object.values(getTableColumns(table))) {
      const name = `${getTableName(table)}.${column.name}`, installed = physical.get(name);
      assert.ok(installed, name);
      assert.equal(normalize(column.getSQLType()), normalize(installed.type), name);
      assert.equal(column.notNull, installed.not_null, name);
      checked++;
    }
  }
  const installed = snapshot.catalog.constraints.find(constraint => constraint.name === "TaxBurialMovement_deceasedId_fkey");
  assert.equal(installed?.definition, 'FOREIGN KEY ("deceasedId") REFERENCES "TaxDeceased"(id) ON UPDATE CASCADE ON DELETE SET NULL');
  const mapping = getTableConfig(tables.cemeteryMovements).foreignKeys.find(key => key.reference().columns.some(column => column.name === "deceasedId"));
  assert.equal(tables.cemeteryMovements.deceasedId.notNull, false);
  assert.equal(mapping?.onDelete, "set null"); assert.equal(mapping?.onUpdate, "cascade");
  t.diagnostic(JSON.stringify({ columnsChecked: checked, tablesChecked: Object.keys(tables).length, snapshot: "tests/fixtures/installed-physical-catalog.json" }));
});
