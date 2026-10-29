import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import test from "node:test";
import { assertArchivedInventory, assertBoundCall, assertDrizzleOnly, assertFormAction, assertJsxValues, assertOperationalRenderer, assertVariableValue, currentSources, migrationProvenance } from "./helpers/table-migration-contracts";

function files(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? files(path.join(directory, entry.name)) : [path.join(directory, entry.name)]);
}
const pages = currentSources("src/app/app-domain/sst");

test("SST: evidência histórica preservada; inventário revisado e fronteira Drizzle atual", () => {
  assert.equal(migrationProvenance.originalInlineEvidence.sst.jsxSha256, "b9865c728366e50925ae78b6a47ce52e6c747978374bdcb7ddd0449a476e2305");
  assertArchivedInventory("sst", pages);
  assertDrizzleOnly(pages, true);
});

test("SST atual: UG clínica, concessões, permissões e payload completo de programas", () => {
  const root = "src/app/app-domain/sst", aso = `${root}/aso/page.tsx`;
  assertBoundCall(aso, "@/lib/platform/tenant-context", "getTenantContextForModule", ['"SST"']);
  assertBoundCall(aso, "@/lib/sst/database", "sstDatabase", ["context"]);
  assertBoundCall(aso, "@/lib/sst/esocial-service", "integrationUnits", ["context"]);
  assertBoundCall(aso, "@/db/repositories/sst/access", "findSstClinicalGrant", ["database", "context.user.id", "unit.id"]);
  assertBoundCall(aso, "@/db/repositories/sst-pages/aso", "readSstAsosPage", ["database", "invalidDates ? [] : params.budgetUnitId ? unit ? [unit.id] : [] : units.map(item => item.id)", "params", "from?.success ? from.data : undefined", "to?.success ? to.data : undefined"]);
  assertVariableValue(aso, "canCreate", '!!unit && canPerformModuleOperation(context.user, "SST", "create") && (isSystemAdministrator(context.user) || !!grant?.canAssess)');
  for (const operation of ["update", "issueReports"]) assertBoundCall(aso, "@/lib/platform/tenant-context", "canPerformModuleOperation", ["context.user", '"SST"', JSON.stringify(operation)]);
  for (const action of ["saveSstAsoSettings", "saveSstAsoVacationSource"]) assertFormAction(aso, "./actions", action);
  assertOperationalRenderer(aso);
  assertBoundCall(`${root}/programas/ProgramForm.tsx`, "./actions", "saveSstProgram", ["form"]);
  assertBoundCall(`${root}/programas/actions.ts`, "@/lib/platform/tenant-context", "getTenantContextForModuleOperation", ['"SST"', '"create"']);
  assertJsxValues(`${root}/programas/ProgramForm.tsx`, "SstSelectionTable", { name: '"groupId"', selected: "selected", onSelectionAction: "setSelected" });
  assertBoundCall(`${root}/_components/SstSelectionTable.tsx`, "./draft-payload", "selectionDraftEntries", ["name", "selected", "items.map(item => item.id)"]);
  assertOperationalRenderer(`${root}/_components/SstSelectionTable.tsx`, "SstSelectionTable");
  assertOperationalRenderer(`${root}/_components/QuestionnaireAnswersEditor.tsx`, "QuestionnaireAnswersEditor");
});

test("SST: TSX/readers/DTOs have no legacy ORM dependencies or page-level SQL", () => {
  for (const file of [...pages, ...files("src/db/repositories/sst-pages"), "src/lib/contracts/sst-pages.ts"]) {
    const text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /@prisma\/client|\bPrisma\b|\bprisma\b|\$queryRaw|\$transaction|@ts-ignore|@ts-nocheck/, file);
    if (file.endsWith(".tsx")) assert.doesNotMatch(text, /drizzle-orm|@\/db\/schema|\bsstRows\b|\b(?:database|executor|db)\.(?:select|execute|query|transaction)\s*[(<]/, file);
  }
});
