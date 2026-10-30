import assert from "node:assert/strict";
import test from "node:test";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { X509Certificate } from "node:crypto";
import { PDFDocument } from "pdf-lib";
import { auroraSignatureDocuments, renderAuroraSignatureDocument } from "../scripts/lib/aurora-signature-documents";
import { auroraSignatureMaterial } from "../scripts/lib/aurora-signature-material";
import { assertCentralA1Owner, checkedCentralA1Signature } from "../src/lib/signatures/central-a1-certificate";
import { verifyDocumentHashICPBrasil } from "../src/lib/security/icp-brasil";

test("40 unique one-page PDFs, stable rendering, 14/13/13 distribution and small storage footprint", async () => {
  assert.equal(auroraSignatureDocuments.length, 40);
  assert.equal(new Set(auroraSignatureDocuments.map(entry => entry.title)).size, 40);
  assert.deepEqual(["INTERNAL", "A1_ECPF", "A1_ECNPJ"].map(method => auroraSignatureDocuments.filter(entry => entry.method === method).length), [14, 13, 13]);
  let total = 0;
  const input = { signer: "Amanda Machado Santos", role: "Secretária Municipal de Administração", issuedAt: new Date("2026-09-01T12:00:00Z"), signedAt: new Date("2026-10-30T12:00:00Z"), code: "01234567-89ab-4def-8123-0123456789ab" };
  for (const entry of auroraSignatureDocuments) {
    assert.doesNotMatch(JSON.stringify(entry), /\b(POC|teste|fictício|simulado)\b/i);
    const bytes = await renderAuroraSignatureDocument(entry, input);
    const document = await PDFDocument.load(bytes);
    assert.equal(document.getPageCount(), 1);
    assert.equal(document.getSubject(), "Acervo municipal de apresentação");
    assert.deepEqual(bytes, await renderAuroraSignatureDocument(entry, input));
    total += bytes.length;
  }
  assert.ok(total < 400 * 1024, `40 documentos ocupam ${total} bytes`);
});

test("private Aurora chain clearly identifies its issuer and signs both CPF/CNPJ without weakening verification", async () => {
  const folder = await mkdtemp(join("C:\\Users\\thiag\\AppData\\Local\\Temp\\opencode", "aurora-signature-check-"));
  try {
    const owner = { name: "Amanda Machado Santos", cpf: "52998224725", cnpj: "11222333000181" };
    const material = await auroraSignatureMaterial(folder, owner);
    assert.match(new X509Certificate(material.trustedRootPem).subject, /Autoridade Privada Aurora/);
    assert.deepEqual(await auroraSignatureMaterial(folder, owner), material);
    for (const [kind, leaf, document] of [["A1_ECPF", material.cpf, owner.cpf], ["A1_ECNPJ", material.cnpj, owner.cnpj]] as const) {
      assertCentralA1Owner(leaf.certificatePem, kind, document);
      process.env.AURORA_CHAIN_CHECK_PRIVATE_KEY_PEM = leaf.privateKeyPem;
      const evidence = checkedCentralA1Signature({ certificatePem: leaf.certificatePem, trustedRootPem: material.trustedRootPem, intermediatePems: [], credentialReference: "AURORA_CHAIN_CHECK" }, "document", "a".repeat(64));
      assert.ok(verifyDocumentHashICPBrasil(evidence, { trustedRootCertificatePem: material.trustedRootPem }));
      assert.equal(verifyDocumentHashICPBrasil({ ...evidence, documentHash: "b".repeat(64) }, { trustedRootCertificatePem: material.trustedRootPem }), false);
    }
  } finally {
    delete process.env.AURORA_CHAIN_CHECK_PRIVATE_KEY_PEM;
    await rm(folder, { recursive: true, force: true });
  }
});
