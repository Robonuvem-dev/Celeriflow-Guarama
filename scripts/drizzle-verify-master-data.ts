import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import ts from "typescript";
import { config } from "dotenv";
import { createDatabaseConnection } from "../src/db/connection";
import { loadMasterDataPage } from "../src/db/repositories/registry/master-data-queries";
import { loadConsistencyIssues, loadConsistencyRuns, loadRegistryDashboard, loadRegistryOrganogram } from "../src/db/repositories/registry/overview";
import { readCanonicalDatabaseIdentityIssues } from "../src/db/repositories/registry/consistency";
import * as identifiers from "../src/lib/identifiers/brazilian-identifiers";
import type { MasterDataCatalog, MasterDataColumn, MasterDataField, MasterDataRow } from "../src/app/app-domain/cadastros/master-data-types";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
type PageResult = { rows: MasterDataRow[]; total: number; fields: MasterDataField[]; columns: MasterDataColumn[] };
type PageReader = (input: { catalog: MasterDataCatalog; searchParams: Promise<Record<string, string>> }) => Promise<PageResult>;

// Evaluate only the data section of the trusted, tracked page. Imports and JSX
// are removed by AST; the original query, projection, columns and field code
// remain the independent oracle. No source files are written or replaced.
function pageDataReader(source: string, context: object, loader = loadMasterDataPage): PageReader {
  const file = ts.createSourceFile("master-data-page.tsx", source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const transformed = ts.transform(file, [transformation => root => {
    const visit: ts.Visitor = node => {
      if (ts.isImportDeclaration(node)) return undefined;
      if (ts.isFunctionDeclaration(node) && node.name?.text === "renderMasterDataPage" && node.body) {
        const statements = node.body.statements.filter(statement => !ts.isReturnStatement(statement));
        const cut = statements.findIndex(statement => ts.isVariableStatement(statement) && statement.declarationList.declarations.some(declaration => ts.isIdentifier(declaration.name) && declaration.name.text === "tabLinks"));
        assert.ok(cut >= 0);
        return ts.factory.updateFunctionDeclaration(node, node.modifiers?.filter(modifier => modifier.kind !== ts.SyntaxKind.ExportKeyword), node.asteriskToken, node.name, node.typeParameters, node.parameters, node.type,
          ts.factory.createBlock([...statements.slice(0, cut), ts.factory.createReturnStatement(ts.factory.createObjectLiteralExpression(["rows", "total", "columns", "fields"].map(name => ts.factory.createShorthandPropertyAssignment(name))))], true));
      }
      return ts.visitEachChild(node, visit, transformation);
    };
    return ts.visitNode(root, visit) as ts.SourceFile;
  }]);
  try {
    const text = ts.createPrinter().printFile(transformed.transformed[0]);
    const compiled = ts.transpileModule(text, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
    const exports = {};
    return new Function("exports", "getTenantContextForModule", "loadMasterDataPage", "db", `${compiled}\nreturn renderMasterDataPage;`)(exports, async () => context, loader, null) as PageReader;
  } finally { transformed.dispose(); }
}

async function main() {
  assert.ok(process.env.DATABASE_URL);
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(process.env.DATABASE_URL);
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  // Keep an independent oracle after migrating the shared integrity reader.
  const integritySource = execFileSync("git", ["show", "3f05dcd:src/lib/cadastros/identity-integrity.ts"], { encoding: "utf8" });
  const integrityCode = ts.transpileModule(integritySource, { compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS } }).outputText;
  const integrityExports: { readCanonicalIdentityIssues?: (tx: unknown) => Promise<unknown> } = {};
  new Function("exports", "require", integrityCode)(integrityExports, (id: string) => { assert.equal(id, "@/lib/identifiers/brazilian-identifiers"); return identifiers; });
  const readLegacyIntegrity = integrityExports.readCanonicalIdentityIssues;
  assert.ok(readLegacyIntegrity);
  const path = "src/app/app-domain/cadastros/master-data-page.tsx";
  const before = pageDataReader(execFileSync("git", ["show", `3f05dcd:${path}`], { encoding: "utf8" }), { prisma: legacy });
  const after = pageDataReader(readFileSync(path, "utf8"), { database: connection.db });
  const catalogs: MasterDataCatalog[] = ["families", "entities", "costCenters", "cities", "neighborhoods", "streets", "banks", "branches", "taxes", "currencies", "products", "cbos", "signers", "legalTexts"];
  const scenarios: Record<string, string>[] = [{}, { q: "a" }, { q: "%_" }, { q: "' OR 1=1 --" }, { page: "2" }, { q: "missing-drizzle-master-fixture" }];
  let comparisons = 0;
  function normalize(result: PageResult, catalog: MasterDataCatalog): PageResult {
    // Only cost-center selectors lacked ordering in the original contract.
    return { ...result, fields: result.fields.map(field => catalog === "costCenters" && field.options ? { ...field, options: [...field.options].sort((a, b) => a.value.localeCompare(b.value)) } : field) };
  }
  try {
    for (const catalog of catalogs) for (const search of scenarios) {
      const input = { catalog, searchParams: Promise.resolve(search) };
      const expected = await before(input), actual = await after(input);
      assert.deepEqual(normalize(actual, catalog), normalize(expected, catalog), `${catalog} ${JSON.stringify(search)}`);
      comparisons++;
    }
    const db = connection.db;
    assert.deepEqual(await readCanonicalDatabaseIdentityIssues(db), await legacy.$transaction(tx => readLegacyIntegrity(tx)));
    comparisons++;
    const totals = await Promise.all([legacy.person.count(), legacy.company.count(), legacy.supplier.count(), legacy.realEstate.count(), legacy.family.count(), legacy.governmentEntity.count(), legacy.costCenter.count(), legacy.city.count(), legacy.legalText.count(), legacy.bank.count(), legacy.currency.count(), legacy.catalogItem.count()]);
    const latest = await legacy.masterDataConsistencyRun.findFirst({ where: { area: "CADASTROS", status: "CONCLUIDA" }, orderBy: { startedAt: "desc" }, select: { _count: { select: { issues: { where: { status: "ABERTA" } } } } } });
    assert.deepEqual(await loadRegistryDashboard(db), { persons: totals[0], companies: totals[1], suppliers: totals[2], realEstates: totals[3], geral: totals[4] + totals[5], estrutura: totals[6] + totals[7], referencias: totals[8] + totals[9] + totals[10] + totals[11], qualidade: latest?._count.issues || 0 });
    comparisons++;
    const expectedOrganogram = await legacy.secretariat.findMany({ include: { departments: { orderBy: { name: "asc" } }, units: { orderBy: { name: "asc" } } }, orderBy: { name: "asc" } });
    assert.deepEqual(await loadRegistryOrganogram(db), expectedOrganogram);
    comparisons++;
    for (const requested of [undefined, "missing-drizzle-master-fixture"]) {
      const runs = await legacy.masterDataConsistencyRun.findMany({ where: { area: "CADASTROS" }, include: { _count: { select: { issues: true } } }, orderBy: { startedAt: "desc" }, take: 8 });
      const selectedRun = await legacy.masterDataConsistencyRun.findFirst({ where: { area: "CADASTROS", ...(requested ? { id: requested } : {}) }, orderBy: { startedAt: "desc" }, select: { id: true } });
      assert.deepEqual(await loadConsistencyRuns(db, requested), { runs, selectedRun });
      for (const page of [1, 2]) {
        const where = { area: "CADASTROS", runId: selectedRun?.id || "__none__" };
        assert.deepEqual(await loadConsistencyIssues(db, where.runId, page), { issues: await legacy.masterDataConsistencyIssue.findMany({ where, orderBy: [{ severity: "asc" }, { detectedAt: "desc" }], skip: (page - 1) * 20, take: 20 }), total: await legacy.masterDataConsistencyIssue.count({ where }) });
        comparisons++;
      }
      comparisons++;
    }
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY", comparisons, catalogs: catalogs.length, scenariosPerCatalog: scenarios.length, scope: "Exact legacy data/columns/fields/selector order, dashboard, organogram, canonical integrity and quality pagination" }, null, 2));
  } finally { await legacy.$disconnect(); await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
