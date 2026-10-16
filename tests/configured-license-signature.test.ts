import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { createHash } from "node:crypto";
import { MockAgent, getGlobalDispatcher, setGlobalDispatcher } from "undici";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { createEconomicRegistrationWithProfile } from "../src/lib/tributacao/economic-profile";
import { publishLicensePolicy, issueConfiguredLicenses } from "../src/lib/tributacao/license-policy";
import { transitionConfiguredLicense } from "../src/lib/tributacao/license-lifecycle";
import { signConfiguredLicense, readSignedLicenseArtifact } from "../src/lib/tributacao/license-signatures";
import { registerA1Certificate } from "../src/lib/signatures/a1-signature-service";

test("Alvará assinado: emissão, bytes privados, assinatura, original após suspensão/cancelamento e adulteração", async () => {
  const f = await createPlanningExecutionFixture();
  const folder = await mkdtemp(join(process.env.CELERIFLOW_POSTGRES_TEST_TEMP ?? tmpdir(), "license-signature-"));
  const keys = ["BLOB_READ_WRITE_TOKEN", "CELERIFLOW_INSTANCE_ID", "VERCEL_BLOB_API_URL", "CELERIFLOW_LICENSE_FIXTURE_PRIVATE_KEY_PEM"] as const;
  const prior = Object.fromEntries(keys.map(key => [key, process.env[key]]));
  const dispatcher = getGlobalDispatcher(); const mock = new MockAgent(); mock.disableNetConnect();
  const files = new Map<string, Buffer>(); const pending: Promise<void>[] = []; let deleted = 0;
  try {
    process.env.BLOB_READ_WRITE_TOKEN = "vercel_blob_rw_isolated_fixture";
    process.env.CELERIFLOW_INSTANCE_ID = "signature-fixture";
    process.env.VERCEL_BLOB_API_URL = "https://signature-api.invalid";
    setGlobalDispatcher(mock);
    const api = mock.get("https://signature-api.invalid");
    const storage = mock.get("https://isolated.private.blob.vercel-storage.com");
    api.intercept({ method: "PUT", path: /./ }).reply(options => {
      const path = new URL(options.path, "https://signature-api.invalid").searchParams.get("pathname")!;
      assert.ok(path.startsWith("instances/signature-fixture/documents/processos/"));
      const body = options.body;
      pending.push((async () => {
        const chunks: Buffer[] = [];
        if (typeof body === "string" || Buffer.isBuffer(body)) chunks.push(Buffer.from(body));
        else if (body instanceof Blob) chunks.push(Buffer.from(await body.arrayBuffer()));
        else if (body) for await (const chunk of body as AsyncIterable<Uint8Array>) chunks.push(Buffer.from(chunk));
        files.set(path, Buffer.concat(chunks));
      })());
      const url = `https://isolated.private.blob.vercel-storage.com/${path}`;
      return { statusCode: 200, data: { url, pathname: path, downloadUrl: `${url}?download=1`, contentType: "application/pdf", contentDisposition: "attachment", etag: "fixture" } };
    }).persist();
    api.intercept({ method: "POST", path: /./ }).reply(() => { deleted++; return { statusCode: 200, data: {} }; }).persist();
    storage.intercept({ method: "GET", path: /./ }).reply(options => {
      const bytes = files.get(options.path.slice(1)); assert.ok(bytes, "O download deve usar o arquivo enviado.");
      return { statusCode: 200, data: bytes, responseOptions: { headers: { "content-type": "application/pdf" } } };
    }).persist();
    for (const name of ["20261015100000_tax_property_cadastral_history", "20261015130000_economic_profile_history", "20261015180000_configured_license_policy", "20261015220000_tax_channel_document_integrity"]) await f.pg.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    const openssl = process.env.CELERIFLOW_TEST_OPENSSL ?? (existsSync("C:\\Program Files\\Git\\usr\\bin\\openssl.exe") ? "C:\\Program Files\\Git\\usr\\bin\\openssl.exe" : "openssl");
    execFileSync(openssl, ["req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", "key.pem", "-out", "cert.pem", "-days", "1", "-subj", "/CN=Isolated License Signature Fixture"], { cwd: folder, stdio: "pipe" });
    const pem = await readFile(join(folder, "cert.pem"), "utf8");
    process.env.CELERIFLOW_LICENSE_FIXTURE_PRIVATE_KEY_PEM = await readFile(join(folder, "key.pem"), "utf8");
    const certificate = await registerA1Certificate(f.db, "ana", { alias: "Alvará isolado", ownerName: "Operador", credentialReference: "CELERIFLOW_LICENSE_FIXTURE", certificatePem: pem, trustedRootPem: pem, purposes: ["GED"] });
    await f.db.taxpayer.create({ data: { id: "payer", taxpayerType: "PF", status: "Ativo" } });
    const address = { street: "Rua", number: "1", complement: "", neighborhood: "Centro", city: "Município", state: "PR", zipCode: "" };
    const registration = await createEconomicRegistrationWithProfile(f.db, f.actor, { municipalInsc: "SIGNED-1", taxpayerId: "payer", taxRegime: "Normal", profile: { registrationId: "NEW", expectedVersion: 0, governmentEntityId: "ente", budgetUnitId: "ug", accountantTaxpayerId: null, accountantCrc: "", companyType: "Autônomo", realEstateIds: [], primaryCnae: "1234567", secondaryCnaes: [], partners: [], contractNumber: "", contractDate: null, companyAddress: address, correspondenceAddress: address, latitude: null, longitude: null, provisionalUntil: null, validateCompanyDebt: false, validatePartnerDebts: false, documentIds: [], processId: null, reason: "Cadastro da emissão" } });
    const policy = await publishLicensePolicy(f.db, f.actor, { expectedVersion: 0, governmentEntityId: "ente", budgetUnitId: "ug", year: new Date().getUTCFullYear(), code: "SIGNED", name: "Funcionamento", active: true, validityDays: 30, requireDebtClearance: false, includePartnerDebts: false, requireFeePayment: false, feeTaxId: null, allowExempt: false, paymentGraceUntil: null, layoutTitle: "Alvará de funcionamento", layoutText: "Condições da licença", legalBasis: "Norma municipal informada" });
    const [license] = await issueConfiguredLicenses(f.db, f.actor, [{ policyId: policy.entityId, expectedPolicyVersion: 1, registrationId: registration.id, expectedRegistrationUpdatedAt: registration.updatedAt.toISOString(), processId: null, feeAssessmentId: null, exempt: false, exemptionReason: "", reason: "Emissão autorizada" }]);
    const actor = { ...f.actor, name: "Ana", email: "ana@example.org" };
    const input = { licenseId: license.id, expectedUpdatedAt: license.updatedAt.toISOString(), certificateId: certificate.id };
    await assert.rejects(signConfiguredLicense(f.db, { ...actor, allowedBudgetUnitIds: [] }, input), /UG autorizada/);
    const signed = await signConfiguredLicense(f.db, actor, input); await Promise.all(pending);
    const original = await readSignedLicenseArtifact(f.db, license.qrCode!);
    assert.equal(original.valid, true); assert.equal(Buffer.from(original.bytes).subarray(0, 5).toString(), "%PDF-");
    assert.equal(createHash("sha256").update(original.bytes).digest("hex"), original.signature.documentHash);
    const version = await f.db.documentVersion.findFirstOrThrow({ where: { documentId: signed.documentId } });
    assert.deepEqual(original.bytes, new Uint8Array(files.get(new URL(version.fileUrl).pathname.slice(1))!));
    await assert.rejects(signConfiguredLicense(f.db, actor, input), /já possui original assinado/); await Promise.all(pending);
    assert.equal(deleted, 1); assert.equal(await f.db.taxRegistryEntry.count({ where: { entityId: license.id, category: "LICENSE_SIGNATURE" } }), 1);
    const suspended = await transitionConfiguredLicense(f.db, f.actor, { licenseId: license.id, expectedUpdatedAt: license.updatedAt.toISOString(), status: "Suspenso", reason: "Suspensão fundamentada" });
    const historical = await readSignedLicenseArtifact(f.db, license.qrCode!);
    assert.equal(historical.valid, false); assert.equal(historical.licenseStatus, "Suspenso"); assert.deepEqual(historical.bytes, original.bytes);
    const cancelled = await transitionConfiguredLicense(f.db, f.actor, { licenseId: license.id, expectedUpdatedAt: suspended.updatedAt.toISOString(), status: "Cancelado", reason: "Cancelamento definitivo" });
    assert.equal((await readSignedLicenseArtifact(f.db, license.qrCode!)).licenseStatus, "Cancelado");
    await assert.rejects(signConfiguredLicense(f.db, actor, { ...input, expectedUpdatedAt: cancelled.updatedAt.toISOString() }), /vigente/);
    files.set(new URL(version.fileUrl).pathname.slice(1), Buffer.from("%PDF-1.7 adulterado"));
    await assert.rejects(readSignedLicenseArtifact(f.db, license.qrCode!), /Integridade/);
  } finally {
    await Promise.allSettled(pending); setGlobalDispatcher(dispatcher); await mock.close();
    for (const key of keys) { if (prior[key] === undefined) delete process.env[key]; else process.env[key] = prior[key]; }
    await rm(folder, { recursive: true, force: true }); await f.close();
  }
});
