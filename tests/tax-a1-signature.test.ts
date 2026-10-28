import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { eq, sql } from "drizzle-orm";
import { createTaxChainDatabase, firstTaxRow, countTaxRows } from "./helpers/tax-chain-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { documents } from "../src/db/schema/registry";
import { documentVersions, documentIcpEvidence } from "../src/db/schema/document-workflow";
import { ingestGedDocument } from "../src/lib/documents/document-flow-service";
import { registerA1Certificate, signDocumentVersionWithA1, signDocumentVersionWithA1InTransaction, setA1CertificateStatus } from "../src/lib/signatures/a1-signature-service";
import { verifyDocumentHashICPBrasil } from "../src/lib/security/icp-brasil";

test("A1: assinatura destacada usa hash dos bytes GED, impede duplicidade/revogação e mantém evidência verificável", async () => {
  const f = await createTaxChainDatabase();
  const folder = await mkdtemp(join(process.env.CELERIFLOW_POSTGRES_TEST_TEMP ?? tmpdir(), "tax-a1-"));
  const secretKey = "CELERIFLOW_TAX_FIXTURE_PRIVATE_KEY_PEM"; const prior = process.env[secretKey];
  try {
    const windowsOpenSsl = "C:\\Program Files\\Git\\usr\\bin\\openssl.exe";
    const openssl = process.env.CELERIFLOW_TEST_OPENSSL ?? (existsSync(windowsOpenSsl) ? windowsOpenSsl : "openssl");
    // Ephemeral self-signed fixture exercises configured trust; it is not a municipal ICP-Brasil credential.
    execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "key.pem", "-out", "cert.pem", "-days", "1", "-subj", "/CN=Isolated Tax Signature Fixture"], { cwd: folder, stdio: "pipe" });
    const certificatePem = await readFile(join(folder, "cert.pem"), "utf8");
    process.env[secretKey] = await readFile(join(folder, "key.pem"), "utf8");
    const certificate = await registerA1Certificate(f.db, "ana", { alias: "Certificado isolado", ownerName: "Operador", credentialReference: "CELERIFLOW_TAX_FIXTURE", certificatePem, trustedRootPem: certificatePem, purposes: ["GED"] });
    const bytes = new TextEncoder().encode("%PDF-1.7\nOriginal tributário preservado\n%%EOF");
    const expectedHash = createHash("sha256").update(bytes).digest("hex");
    const actor = { id: "ana", name: "Ana", email: "ana@example.org", employeeId: null };
    const ingest = () => ingestGedDocument(f.connection, { title: "Original do alvará", documentType: "Alvará", documentClassCode: "TAX_LICENSE_SIGNED", fileUrl: "/private-original-fixture", content: bytes, actorUsuarioId: "ana" });
    const first = await ingest();
    const version = firstTaxRow(await f.db.select().from(documentVersions).where(eq(documentVersions.documentId, first.documentId)));
    assert.equal(version.hashSha256, expectedHash);
    const signature = await signDocumentVersionWithA1(f.connection, actor, { documentVersionId: version.id, certificateId: certificate.id, purpose: "GED" });
    await assert.rejects(signDocumentVersionWithA1(f.connection, actor, { documentVersionId: version.id, certificateId: certificate.id, purpose: "GED" }), /já assinada/);
    const evidence = firstTaxRow(await f.db.select().from(documentIcpEvidence).where(eq(documentIcpEvidence.documentVersionId, version.id)));
    assert.equal(evidence.documentHash, expectedHash); assert.equal(evidence.documentSignatureId, signature.signatureId);
    const signed = { documentVersionId: version.id, documentHash: expectedHash, canonicalPayload: evidence.canonicalPayload, signedAt: evidence.signedAt, signatureBase64: evidence.signatureBase64, algorithm: "SHA256" as const, certificatePem: evidence.certificatePemSnapshot, certificateSubject: evidence.certificateSubject, certificateIssuer: evidence.certificateIssuer, certificateSerialNumber: evidence.certificateSerial, certificateFingerprint256: evidence.certificateFingerprint };
    assert.equal(verifyDocumentHashICPBrasil(signed, { trustedRootCertificatePem: certificatePem }), true);
    assert.equal(verifyDocumentHashICPBrasil({ ...signed, documentHash: "0".repeat(64) }, { trustedRootCertificatePem: certificatePem }), false);
    assert.equal(firstTaxRow(await f.db.select().from(documentVersions).where(eq(documentVersions.id, version.id))).fileUrl, version.fileUrl);
    assert.equal(firstTaxRow(await f.db.select().from(documents).where(eq(documents.id, first.documentId))).status, "Assinado");
    await setA1CertificateStatus(f.db, certificate.id, "REVOKED");
    const second = await ingest(); const next = firstTaxRow(await f.db.select().from(documentVersions).where(eq(documentVersions.documentId, second.documentId)));
    await assert.rejects(withDatabaseTransaction(f.connection, tx => signDocumentVersionWithA1InTransaction(tx, actor, { documentVersionId: next.id, certificateId: certificate.id, purpose: "GED" })), /inativo/);
    assert.equal(await countTaxRows(f.db, "DocumentSignature", sql`"documentVersionId"=${next.id}`), 0);
    assert.equal(verifyDocumentHashICPBrasil(signed, { trustedRootCertificatePem: certificatePem }), true);
  } finally {
    if (prior === undefined) delete process.env[secretKey]; else process.env[secretKey] = prior;
    await rm(folder, { recursive: true, force: true }); await f.close();
  }
});
