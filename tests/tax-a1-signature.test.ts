import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { ingestGedDocument } from "../src/lib/documents/document-flow-service";
import { registerA1Certificate, signDocumentVersionWithA1, signDocumentVersionWithA1InTransaction, setA1CertificateStatus } from "../src/lib/signatures/a1-signature-service";
import { verifyDocumentHashICPBrasil } from "../src/lib/security/icp-brasil";

test("A1: assinatura destacada usa hash dos bytes GED, impede duplicidade/revogação e mantém evidência verificável", async () => {
  const f = await createPlanningExecutionFixture();
  const folder = await mkdtemp(join(process.env.CELERIFLOW_POSTGRES_TEST_TEMP ?? tmpdir(), "tax-a1-"));
  const secretKey = "CELERIFLOW_TAX_FIXTURE_PRIVATE_KEY_PEM"; const prior = process.env[secretKey];
  try {
    await f.pg.exec(await readFile("prisma/migrations-ibema/20261015220000_tax_channel_document_integrity/migration.sql", "utf8"));
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
    const ingest = () => ingestGedDocument(f.db, { title: "Original do alvará", documentType: "Alvará", documentClassCode: "TAX_LICENSE_SIGNED", fileUrl: "/private-original-fixture", content: bytes, actorUsuarioId: "ana" });
    const first = await ingest();
    const version = await f.db.documentVersion.findFirstOrThrow({ where: { documentId: first.documentId } });
    assert.equal(version.hashSha256, expectedHash);
    const signature = await signDocumentVersionWithA1(f.db, actor, { documentVersionId: version.id, certificateId: certificate.id, purpose: "GED" });
    await assert.rejects(signDocumentVersionWithA1(f.db, actor, { documentVersionId: version.id, certificateId: certificate.id, purpose: "GED" }), /já assinada/);
    const evidence = await f.db.documentIcpEvidence.findUniqueOrThrow({ where: { documentVersionId: version.id } });
    assert.equal(evidence.documentHash, expectedHash); assert.equal(evidence.documentSignatureId, signature.signatureId);
    const signed = { documentVersionId: version.id, documentHash: expectedHash, canonicalPayload: evidence.canonicalPayload, signedAt: evidence.signedAt, signatureBase64: evidence.signatureBase64, algorithm: "SHA256" as const, certificatePem: evidence.certificatePemSnapshot, certificateSubject: evidence.certificateSubject, certificateIssuer: evidence.certificateIssuer, certificateSerialNumber: evidence.certificateSerial, certificateFingerprint256: evidence.certificateFingerprint };
    assert.equal(verifyDocumentHashICPBrasil(signed, { trustedRootCertificatePem: certificatePem }), true);
    assert.equal(verifyDocumentHashICPBrasil({ ...signed, documentHash: "0".repeat(64) }, { trustedRootCertificatePem: certificatePem }), false);
    assert.equal((await f.db.documentVersion.findUniqueOrThrow({ where: { id: version.id } })).fileUrl, version.fileUrl);
    assert.equal((await f.db.document.findUniqueOrThrow({ where: { id: first.documentId } })).status, "Assinado");
    await setA1CertificateStatus(f.db, certificate.id, "REVOKED");
    const second = await ingest(); const next = await f.db.documentVersion.findFirstOrThrow({ where: { documentId: second.documentId } });
    await assert.rejects(f.db.$transaction(tx => signDocumentVersionWithA1InTransaction(tx, actor, { documentVersionId: next.id, certificateId: certificate.id, purpose: "GED" })), /inativo/);
    assert.equal(await f.db.documentSignature.count({ where: { documentVersionId: next.id } }), 0);
    assert.equal(verifyDocumentHashICPBrasil(signed, { trustedRootCertificatePem: certificatePem }), true);
  } finally {
    if (prior === undefined) delete process.env[secretKey]; else process.env[secretKey] = prior;
    await rm(folder, { recursive: true, force: true }); await f.close();
  }
});
