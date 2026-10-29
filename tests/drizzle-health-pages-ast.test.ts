import test from "node:test";
import { assertBoundCall, assertDrizzleOnly, assertFormAction, assertJsxProps, assertJsxValues, assertOperationalRenderer, assertReviewedInventory, currentSources, historicalHealthBaseline } from "./helpers/table-migration-contracts";

const root = "src/app/app-domain/saude";
test("Saúde: evidência JSX histórica imutável e inventário atual completo/Drizzle-only", () => {
  const baseline = historicalHealthBaseline();
  const files = currentSources(root).filter(file => !file.startsWith(`${root}/farmacia/`));
  assertReviewedInventory(files, Object.keys(baseline.files).map(file => `${root}/${file}`), ["HealthPageTools.tsx", "HealthReadTable.tsx", "producao/laudos/TreatmentReportsTable.tsx"].map(file => `${root}/${file}`));
  assertDrizzleOnly(files);
});

test("Saúde atual: executor autorizado, gates granulares, actions AIH/APAC e seleção entre páginas", () => {
  const administration = `${root}/administracao/page.tsx`;
  assertBoundCall(administration, "@/lib/platform/tenant-context", "getTenantContextForModule", ['"SAUDE"']);
  assertBoundCall(administration, "@/lib/platform/tenant-context", "isSystemAdministrator", ["context.user"]);
  for (const operation of ["create", "update"]) assertBoundCall(administration, "@/lib/platform/tenant-context", "canPerformModuleOperation", ["context.user", '"SAUDE"', JSON.stringify(operation)]);
  assertBoundCall(administration, "@/db/repositories/health-pages/administration", "healthAdministrationPageData", ["database", "{ tab, situation, query, requestedPage, usageFrom, usageUntil }"]);
  assertJsxProps(administration, "AdministracaoClient", ["canCreate", "canUpdate", "canManageAccess", "page", "total"]);
  assertOperationalRenderer(administration);
  const client = `${root}/administracao/AdministracaoClient.tsx`;
  for (const tab of ["UnitsTab", "ProfessionalsTab", "CatalogTab", "GroupsTab", "HolidaysTab"]) assertJsxProps(client, tab, ["canUpdate", "onEdit", "onClose"]);
  assertJsxProps(client, "AccessTab", ["canManage", "profiles", "employees", "units"]);
  const reports = `${root}/producao/laudos/page.tsx`;
  assertBoundCall(reports, "@/lib/platform/tenant-context", "getTenantContextForModule", ['"SAUDE"']);
  for (const action of ["createIssuerAction", "createNumberRangeAction", "configureAihCancellationAction"]) assertFormAction(reports, "./actions", action);
  assertOperationalRenderer(reports);
  assertJsxValues(`${root}/producao/laudos/TreatmentReportsTable.tsx`, "input", { type: '"hidden"', name: '"reportId"', value: "id", form: '"bulk-authorization"' });
});
