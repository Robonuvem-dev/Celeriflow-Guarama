import assert from "node:assert/strict";
import test from "node:test";
import { createHash } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import ts from "typescript";

// Captured before editing each of the 20 helpers. Fingerprints cover thrown
// expressions and complete named validation schemas, normalizing only the
// Decimal constructor's former namespace. They do not claim SQL equivalence.
const baseline = [
  ["additional-forms", "d56fba3879b82f29e9f50eb89cd6eadda2d78a4115dcaeaed40030d4ab0c4aa4", "readItbiAdditionalForms"],
  ["attachments", "075cbabc0e253d2fbca2f0211c637e6eb8333b0c79e2818c98a43687889215ee", "linkItbiPropertyAttachments"],
  ["contestation", "be05af55be5031ceb20077f441c5775e68fde74c9af30920e72b359516d2c9e3", "requestItbiContestation requestItbiContestationInTransaction decideItbiContestation"],
  ["correspondence", "3c2c4886615090977cdfa903c10331d6c6b1eb7b2026738458b8ac1e09a14457", "configureItbiCorrespondence transferItbiProfileInTransaction reverseItbiProfileInTransaction"],
  ["dam-pdf", "2e572fac73461bf023810c18d4aeba52c6bdf9596ad67d924699cab509544453", "renderItbiDamPdf"],
  ["data-adjustment", "c2eb2a146ecd9f4dde5e1218e4331511be5c4d74cc447e221edf76afc9db95ef", "itbiDataAdjustmentSchema applyItbiDataAdjustment"],
  ["document-models", "3119e59eee215352343f89c9f7f8e8c26fe28fd724793c16e2805baa3d841ec2", "itbiDocumentModelSchema publishItbiDocumentModel issueConfiguredItbiDocument renderConfiguredItbiDocument"],
  ["draft-storage", "10529556e1c4c3c39a96a2b079d5223a2f148e2981222003fabdbaa78f34d99b", "itbiDraftUploadSchema itbiDraftUploadPrefix registerOnlineItbiDraftUpload"],
  ["entry-policy", "312c7e711370abe24600150e722e4e58d9ce1c539e6dd9469905c006cea90ab7", "itbiEntryPolicySchema publishItbiEntryPolicy evaluateItbiEntryPolicy"],
  ["expiry", "501d9a78b1f35e9fefd2afa9923b072a39c953036deba5c9686288448f0ac514", "itbiExpiryPolicySchema publishItbiExpiryPolicy cancelOverdueItbiProcesses"],
  ["fiscal-treatment", "25103e8676e5ba3fcdcef3906e8632447b5205fbcdc02d91cf5252a6d1762db8", "decideItbiFiscalTreatment"],
  ["history", "d266eeddf71f6892613bac10e448a3a7710c227f34527915b7216689a676e965", "attributeItbiHistory"],
  ["online", "5c5013f8de27cdcb8315de7353ff21e1f63ca3994477faa0ef3c19bcfc18c63b", "onlineItbiPolicySchema publishOnlineItbiPolicy configureItbiNotary readOnlineItbiEntitlements assertOnlineItbiDraftAccess previewOnlineItbiProperty submitOnlineItbi"],
  ["ownership", "4db2bc2ddfe65f0f5199d969a663e811b52cac7ddabe7031b35ee7e033b3b7cc", "transferPaidItbiInTransaction transferItbiManually reversePaidItbiInTransaction"],
  ["parameters", "101d1865fec1ef70c52489ebc49758709f2434d3a0daa7c5921796e3abae18eb", "saveItbiTransactionType"],
  ["portal-storage", "9d315ab06569071141d75387f5ca9cb52f6db2ee90eee4661bf376c0af4c007a", "itbiUploadTypes itbiUploadLimit itbiUploadPrefix assertItbiContent registerInternalItbiUpload registerItbiPortalUpload downloadItbiProcessAttachment"],
  ["process-channel", "8425aabc48e0627f75d9324d7af80a867fdf0abf1747e8b4f0f85110551e82d3", "requestPortalItbiContestation assertInternalItbiProcessAccess readInternalItbiChannel readPortalItbiChannel assertPortalItbiAccess grantItbiProcessAccess assertNoPendingItbiAdjustments sendInternalItbiMessage sendPortalItbiMessage"],
  ["process-pdf", "84ba75e3393c3e8ba13bbac44a2f117a7a6a74a5847cb8709fea8aa246af0a23", "renderItbiProcessPdf"],
  ["property-collection", "9d61ce86893f1c0b65c83dfe8b1bd2bb82a47b84024a37e65282a8ef484f6dd2", "createItbiPropertyCollection"],
  ["rectification", "ff2d9e00772eba2475c9ca00391bf0e8daba5e3b985388d6a77e692e2643ff09", "rectifyTransferredItbi"],
] as const;

test("ITBI: 20 helpers preserve exports, error expressions and validation schemas without legacy persistence", () => {
  const actual = readdirSync("src/lib/tributacao").filter(name => /^itbi-.*\.ts$/.test(name)).sort();
  assert.deepEqual(actual, baseline.map(([name]) => `itbi-${name}.ts`).sort());
  const printer = ts.createPrinter({ removeComments: true });
  for (const [name, hash, names] of baseline) {
    const file = `src/lib/tributacao/itbi-${name}.ts`, text = readFileSync(file, "utf8");
    assert.doesNotMatch(text, /@prisma\/client|\bPrisma\b|\bprisma\b|\$queryRaw|\$transaction|GetPayload/);
    const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
    const guards: string[] = [], schemas: string[] = [];
    function visit(node: ts.Node) {
      if (ts.isThrowStatement(node)) guards.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
      if (ts.isVariableDeclaration(node) && ts.isIdentifier(node.name) && /schema$/i.test(node.name.text) && node.initializer) schemas.push(printer.printNode(ts.EmitHint.Unspecified, node, source));
      ts.forEachChild(node, visit);
    }
    visit(source);
    assert.equal(createHash("sha256").update(JSON.stringify({ guards, schemas })).digest("hex"), hash, file);
    const exports = source.statements.flatMap(statement => {
      if (!ts.canHaveModifiers(statement) || !ts.getModifiers(statement)?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword)) return [];
      if (ts.isFunctionDeclaration(statement)) return statement.name ? [statement.name.text] : [];
      return ts.isVariableStatement(statement) ? statement.declarationList.declarations.flatMap(declaration => ts.isIdentifier(declaration.name) ? [declaration.name.text] : []) : [];
    });
    assert.deepEqual(exports, names.split(" "), file);
  }
});
