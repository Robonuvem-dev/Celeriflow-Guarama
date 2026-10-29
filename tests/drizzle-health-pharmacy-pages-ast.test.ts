import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import test from "node:test";
import { assertBoundCall, assertDrizzleOnly, assertFormAction, assertJsxValues, assertOperationalRenderer, assertReviewedInventory, assertVariableValue, currentSources, digest } from "./helpers/table-migration-contracts";

// Captured BEFORE migration from the main-sync reference whose pharmacy files
// are unchanged from original 5cfa. Never regenerate from migrated working files.
// No Git command, private catalog, machine path or skip fallback is needed in CI.
const jsxBaseline: Record<string, string> = {
  "catalogo/page.tsx": "da32ae4ebd95364dddced5caa2c5d28089924b8bfba3e1da046780fa1b9b0f02",
  "chamadas/page.tsx": "ee9806021969aa2bcce9ff11574d1b65a98205bec06280b301ca533106813b39",
  "dispensacoes/DispensationHistoryCard.tsx": "40bedaa82abd0be48000c2f6befec4ec39897d7e47500fd0c8f7c80b4d96a47a",
  "dispensacoes/page.tsx": "ffe049e7b49f1ab906a6ce57a6c9da477cea840cc435856ca4e769717ecfc41e",
  "HealthReceiptForm.tsx": "5c2f1dd9f8911676990edd2e16a39753ecc323e4d7297c995dfc5adca3a9e8da",
  "inventario/page.tsx": "2e543491f44187b0d241bd2158b12f636cf787b4b9f5375b55cb217232536515",
  "judicial/JudicialCaseForm.tsx": "d087f9f52171fde1d6baed29341b20cfc034d7649a428517c46000f4665f600f",
  "judicial/JudicialDispensationForm.tsx": "06bbbfd30362b3b6f4d364cee7dcaa96bd9bac4026a552c340945dc37e626592",
  "judicial/page.tsx": "f3b53c29f5653a4723c503f71498940126aa4655a2109f8a20a1b592855e18c7",
  "kits/CareProgramForms.tsx": "6c0489aec82eb8211e9cf27324fd4df7d2288944de79d0d2997387212c211445",
  "kits/KitCompositionForm.tsx": "bc2dbbc0849f8302002e83b99982e9d2670d9f765828dc49c0501360a0a24d30",
  "kits/page.tsx": "e43e173c97ae05d8d6cb4b362a6496a44b4bcd876a18620872da6ee66b632918",
  "notas/InvoiceImportForm.tsx": "28022aebd2ca4405c49d488ec3ed1f91ea534028a29414bdd17a2d401cbe5cc3",
  "notas/page.tsx": "43da26ed100b5094ddc22c1ff4c98b23e34c23491294a6099a3b452f57499736",
  "page.tsx": "44d3ed213598c7efabb93f002e773481fee6298b7d2473905e0d67dbf05d5963",
  "requisicoes/page.tsx": "c6f69eeb3fd59bf0e9fa59eaad724bbd4a61ea3a27536b5ee58c9397973b95da",
  "requisicoes/PharmacyRequestForm.tsx": "ad1178b4fa3d6ebc5a747d089cbb897aeaecc0596774b47a5002cbc8b5581081",
};
const unchangedComponents: Record<string, string> = {
  "dispensacoes/DispensationHistoryCard.tsx": "978ac9a4c7fa5ca9725a625a9fbd30eac6738c8924b89f1966b0f39f9ecef7ef",
  "HealthReceiptForm.tsx": "7d405d602e7b88bd62b78a1babb9b9a57dd0a99c43ba30ec1302f7afe279c0bd",
  "judicial/JudicialCaseForm.tsx": "f57e8c3b5b594d8757496011cde0dbb0e017287d59feea98accd650d187918d0",
  "judicial/JudicialDispensationForm.tsx": "e08568d27a75bbecf1ce3f58ee3c1355872f1b337ec4aa408221012f58e2ff11",
  "kits/CareProgramForms.tsx": "aeeb8f3e59e9336d252d1357a92dbaf6373f236ff67efc91e17627792999c348",
  "kits/KitCompositionForm.tsx": "42f6d9671926090f4d4b3d1d1f947fef397c5c12960ba343b835fb134214ce92",
  "notas/InvoiceImportForm.tsx": "02c4b3ea4f6abbe0ab361fffbea4ca9ccab975e4c4fff784c9e4806ff4bd6805",
  "requisicoes/PharmacyRequestForm.tsx": "0f9073df3e698e96ddd5aebea1c29c1208e09722bd56dcf6e1a452fe9d9e5748",
};
const root = "src/app/app-domain/saude/farmacia";
test("Farmácia: fingerprints originais preservados como proveniência, UI atual com gates e executor Drizzle", () => {
  // These are checksums of the ORIGINAL evidence maps above, not regenerated
  // hashes of the authorized current JSX. No Git/history is required in CI.
  assert.equal(digest(JSON.stringify(jsxBaseline)), "d0323a26b36609005d6a65579143aaf8756dee4b8c1c0d73a8927d2a81b64a59");
  assert.equal(digest(JSON.stringify(unchangedComponents)), "908d23b580b05fdd3373dafe536d190e93ae5822724fe5d5ea9e71889ae06b29");
  assertReviewedInventory(currentSources(root), Object.keys(jsxBaseline).map(file => `${root}/${file}`));
  assertDrizzleOnly(currentSources(root));
  for (const file of Object.keys(jsxBaseline)) {
    const text = readFileSync(join(root, file), "utf8");
    assert.doesNotMatch(text, /@prisma|\bPrisma\b|\bprisma\b|\$transaction|\$queryRaw|\bas\s+(?:any|unknown)\b/, file);
    if (file.endsWith("page.tsx")) {
      assert.match(text, /context\.database \?\? db/, `${file}: supplied executor`);
      assertBoundCall(`${root}/${file}`, "@/lib/platform/tenant-context", "getTenantContextForModule", ['"SAUDE"']);
      if (file !== "catalogo/page.tsx") assert.match(text, /context\.user\.hasHealthAccessScope \? context\.user\.allowedHealthUnitIds \|\| \[\] : undefined/, `${file}: original unrestricted/allowed-unit rule`);
    }
  }
  const dispensations = readFileSync(join(root, "dispensacoes/page.tsx"), "utf8");
  assert.match(dispensations, /if \(params\.unitId\) assertHealthUnitAccess\(context\.user, params\.unitId\)/);
  assert.match(dispensations, /T00:00:00-03:00/);
  assert.match(dispensations, /86400000/);
});

test("Farmácia atual: escopo por unidade, quatorze actions e payloads integrais independentes da tabela", () => {
  const page = `${root}/page.tsx`;
  assertVariableValue(page, "unitIds", "context.user.hasHealthAccessScope ? context.user.allowedHealthUnitIds || [] : undefined");
  assertBoundCall(page, "@/db/repositories/health-pharmacy-pages/stock", "readPharmacyStockPage", ["context.database ?? db", "unitIds", "{ q, filter, requestedPage: positivePage(first(params.page)) }"]);
  for (const action of ["createHealthProductAction", "createHealthWarehouseAction", "configureReceiptApprovalAction", "dispenseAction", "dispatchTransferAction", "receiveTransferAction", "writeOffAction", "dispatchPharmacyIntegrationAction", "saveMedicineInteractionAction", "saveDosageTemplateAction", "createPharmacyRequestAction", "setStockBlockAction", "toggleControlledBookAction", "approveHealthReceiptAction"]) assertFormAction(page, "./actions", action);
  assertOperationalRenderer(page);
  for (const [file, action] of [["judicial/JudicialCaseForm.tsx", "createJudicialCaseAction"], ["judicial/JudicialDispensationForm.tsx", "dispenseJudicialCaseAction"], ["kits/KitCompositionForm.tsx", "saveKitAction"], ["requisicoes/PharmacyRequestForm.tsx", "createPharmacyRequestManagerAction"]]) assertFormAction(`${root}/${file}`, "./actions", action);
  for (const file of ["kits/KitCompositionForm.tsx", "requisicoes/PharmacyRequestForm.tsx"]) assertJsxValues(`${root}/${file}`, "input", { type: '"hidden"', name: '"items"', value: "JSON.stringify(items.map(item => ({ materialId: item.materialId, quantity: Number(item.quantity) })))" });
  for (const action of ["previewPharmacyInvoiceAction", "importPharmacyInvoiceAction"]) assertBoundCall(`${root}/notas/InvoiceImportForm.tsx`, "./actions", action);
  assertBoundCall(`${root}/HealthReceiptForm.tsx`, "./actions", "saveHealthReceiptAction");
});
