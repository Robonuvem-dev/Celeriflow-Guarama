import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { createHash, createPrivateKey, generateKeyPairSync } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import { eq, sql } from "drizzle-orm";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { centralA1Integrations } from "../src/db/schema/signature-central-a1";
import { digitalCertificates } from "../src/db/schema/document-workflow";
import { certificateOwner, centralSigningConfigurationStatus } from "../src/lib/signatures/central-a1-certificate";
import { listCentralA1Integrations, saveCentralA1Integration, signCentralA1Envelope, suspendCentralA1Integration, getCentralA1PublicConfiguration, type CentralA1Input } from "../src/lib/signatures/central-a1";
import { verifyDocumentHashICPBrasil } from "../src/lib/security/icp-brasil";
import { centralA1Certificates } from "./helpers/central-a1-certificates";

test("Central A1: crypto real, prova de titular/OID, permissões, transação, snapshots e rollback SQL offline", async () => {
  const fixtures = await centralA1Certificates();
  const pg = new PGlite();
  const database = drizzle(pg);
  const prior = process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM;
  const context: AppContext = { user: { id: "admin-fixture", firebaseUid: "fixture", name: "Fixture", email: "fixture@example.invalid", role: "ADMIN", profileCode: "SYSTEM_ADMINISTRATOR", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null }, database: database as unknown as AppContext["database"] };
  const reader = { ...context, user: { ...context.user, profileCode: "READER", modulePermissions: [{ code: "ASSINATURA_DIGITAL", canView: true, canEdit: false }] } };
  const operator = { ...reader, user: { ...reader.user, modulePermissions: [{ code: "ASSINATURA_DIGITAL", canView: true, canEdit: true }] } };
  const denied = { ...reader, user: { ...reader.user, modulePermissions: [] } };
  const input: CentralA1Input = { kind: "A1_ECPF", alias: "CPF isolado", ownerName: "Rótulo sem força probatória", documentId: "529.982.247-25", credentialReference: "CENTRAL_A1_FIXTURE", certificatePem: fixtures.cpf.certificatePem, intermediatePems: fixtures.intermediatePems, trustedRootPem: fixtures.trustedRootPem, active: true };
  try {
    // Existing public inventory fixture, followed by the exact new migration.
    await pg.exec(`CREATE TABLE "DigitalCertificate" (id text PRIMARY KEY,alias text NOT NULL UNIQUE,"ownerName" text NOT NULL,provider text NOT NULL DEFAULT 'ENV_REFERENCE',"credentialReference" text NOT NULL,"certificatePem" text NOT NULL,"intermediatePems" jsonb NOT NULL DEFAULT '[]',"trustedRootPem" text NOT NULL,subject text NOT NULL,issuer text NOT NULL,"serialNumber" text NOT NULL,fingerprint256 text NOT NULL UNIQUE,"validFrom" timestamp NOT NULL,"validTo" timestamp NOT NULL,status text NOT NULL DEFAULT 'ACTIVE',purposes jsonb NOT NULL DEFAULT '[]',"createdByUsuarioId" text NOT NULL,"createdAt" timestamp NOT NULL DEFAULT NOW(),"updatedAt" timestamp NOT NULL DEFAULT NOW());`);
    await pg.exec(await readFile("db/migrations/20261029190100_signature_central_a1/migration.sql", "utf8"));
    process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM = fixtures.cpf.privateKeyPem;
    assert.deepEqual(certificateOwner(fixtures.cpf.certificatePem), { kind: "A1_ECPF", documentId: "52998224725" });
    assert.deepEqual(certificateOwner(fixtures.cnpj.certificatePem), { kind: "A1_ECNPJ", documentId: "11222333000181" });
    await assert.rejects(saveCentralA1Integration(operator, input), /Acesso negado/);
    await assert.rejects(saveCentralA1Integration(context, { ...input, documentId: "11144477735" }), /não corresponde/);
    await assert.rejects(saveCentralA1Integration(context, { ...input, kind: "A1_ECNPJ", documentId: "11222333000181" }), /não corresponde/);
    await assert.rejects(saveCentralA1Integration(context, { ...input, certificatePem: fixtures.none.certificatePem, active: false }), /comprovar o titular/);
    await assert.rejects(saveCentralA1Integration(context, { ...input, trustedRootPem: fixtures.none.certificatePem }), /raiz/);
    await assert.rejects(saveCentralA1Integration(context, { ...input, intermediatePems: [] }), /raiz/);
    process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM = fixtures.cnpj.privateKeyPem;
    await assert.rejects(saveCentralA1Integration(context, input), /não corresponde/);
    const passphraseKey = "CENTRAL_A1_FIXTURE_PRIVATE_KEY_PASSPHRASE";
    const previousPassphrase = process.env[passphraseKey];
    try {
      process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM = createPrivateKey(fixtures.cpf.privateKeyPem).export({ type: "pkcs8", format: "pem", cipher: "aes-256-cbc", passphrase: "fixture-only-passphrase" }).toString();
      process.env[passphraseKey] = "fixture-only-passphrase";
      const { checkedCentralA1Signature } = await import("../src/lib/signatures/central-a1-certificate");
      assert(checkedCentralA1Signature(input, "encrypted-key-fixture", "0".repeat(64)).signatureBase64);
      process.env[passphraseKey] = "wrong-fixture-passphrase";
      assert.throws(() => checkedCentralA1Signature(input, "encrypted-key-fixture", "0".repeat(64)));
    } finally {
      if (previousPassphrase === undefined) delete process.env[passphraseKey]; else process.env[passphraseKey] = previousPassphrase;
    }
    process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM = fixtures.expired.privateKeyPem;
    await assert.rejects(saveCentralA1Integration(context, { ...input, certificatePem: fixtures.expired.certificatePem }), /validade/);
    delete process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM;
    await assert.rejects(saveCentralA1Integration(context, input), /indisponível/);
    assert.equal((await listCentralA1Integrations(reader)).length, 0);

    process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM = fixtures.cpf.privateKeyPem;
    const saved = await saveCentralA1Integration(context, input);
    assert.equal(saved.documentId, "52998224725");
    // Route boundary uses real services and PGlite; only session resolution is substituted.
    const filename = resolve("src/app/app-domain/assinatura-digital/integracoes/api/route.ts");
    const compiled = ts.transpileModule(await readFile(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    const loaded = { exports: {} as typeof import("../src/app/app-domain/assinatura-digital/integracoes/api/route") };
    const require = createRequire(filename);
    let routeContext = context;
    vm.runInNewContext(compiled, { module: loaded, exports: loaded.exports, Buffer, URL, require: (name: string) => name === "@/lib/platform/tenant-context" ? { getTenantContextForModule: async () => routeContext, getTenantContextForModuleOperation: async () => routeContext } : require(name) }, { filename });
    const route = loaded.exports;
    const request = (method: string, data?: unknown, origin = "https://central.example.invalid") => new Request(`https://central.example.invalid/assinatura-digital/integracoes/api`, { method, headers: { origin, "content-type": "application/json" }, body: data === undefined ? undefined : JSON.stringify(data) });
    assert.equal((await route.GET(request("GET"))).headers.get("Cache-Control"), "no-store");
    assert.equal((await route.POST(request("POST", { ...input, id: saved.id, ownerName: "Rótulo atualizado via API" }))).status, 200);
    assert.equal((await route.POST(request("POST", { ...input, id: saved.id }, "https://other.example.invalid"))).status, 403);
    const secretFieldResponse = await route.POST(request("POST", { ...input, id: saved.id, privateKeyPem: "NEVER-PERSIST-PRIVATE-SECRET" }));
    assert.equal(secretFieldResponse.status, 400);
    const secretFieldError = JSON.stringify(await secretFieldResponse.json());
    assert(!secretFieldError.includes("NEVER-PERSIST-PRIVATE-SECRET") && !secretFieldError.includes(fixtures.cpf.privateKeyPem));
    assert.equal((await route.POST(request("POST", { oversized: "a".repeat(385000) }))).status, 400);
    routeContext = reader;
    assert.equal((await route.POST(request("POST", { ...input, id: saved.id }))).status, 403);
    assert.equal((await route.PATCH(request("PATCH", { id: saved.id, active: false }))).status, 403);
    assert.equal((await route.GET(new Request(`https://central.example.invalid/assinatura-digital/integracoes/api?id=${saved.id}`))).status, 403);
    routeContext = context;
    assert.equal((await route.PATCH(request("PATCH", { id: saved.id, active: false }))).status, 200);
    assert.equal((await route.POST(request("POST", { ...input, id: saved.id }))).status, 200);
    const publicConfigurationResponse = await route.GET(new Request(`https://central.example.invalid/assinatura-digital/integracoes/api?id=${saved.id}`));
    assert.equal(publicConfigurationResponse.status, 200);
    const publicConfiguration = (await publicConfigurationResponse.json()).configuration;
    assert.deepEqual(Object.keys(publicConfiguration).sort(), ["id", "kind", "alias", "ownerName", "documentId", "active", "credentialReference", "certificatePem", "intermediatePems", "trustedRootPem"].sort());
    assert.deepEqual(publicConfiguration.intermediatePems, fixtures.intermediatePems.map(pem => pem.trim()));
    assert(!JSON.stringify(publicConfiguration).includes("PRIVATE KEY") && !JSON.stringify(publicConfiguration).includes("PASSPHRASE"));
    await assert.rejects(listCentralA1Integrations(denied), /Acesso negado/);
    await assert.rejects(getCentralA1PublicConfiguration(reader, saved.id), /Acesso negado/);
    const hash = createHash("sha256").update('canonical-envelope-containing-real-file-hash').digest("hex");
    const signInput = { integrationId: saved.id, method: "A1_ECPF" as const, signerDocument: saved.documentId, recordId: "record-fixture", envelopeHash: hash };
    await assert.rejects(signCentralA1Envelope(reader, signInput), /Acesso negado/);
    await assert.rejects(signCentralA1Envelope(operator, { ...signInput, method: "A1_ECNPJ" }), /incompatível/);
    await assert.rejects(signCentralA1Envelope(operator, { ...signInput, signerDocument: "11144477735" }), /incompatível/);
    const signed = await signCentralA1Envelope(operator, signInput);
    const nested = await database.transaction(tx => signCentralA1Envelope({ ...operator, database: tx as unknown as AppContext["database"] }, signInput));
    assert.equal(nested.evidence.documentHash, hash);
    assert.equal(signed.evidence.documentHash, hash);
    assert.equal(signed.evidence.documentVersionId, signInput.recordId);
    const historical = JSON.parse(JSON.stringify(signed));
    historical.evidence.signedAt = new Date(historical.evidence.signedAt);
    const verify = () => verifyDocumentHashICPBrasil(historical.evidence, { intermediateCertificatePems: historical.intermediatePems, trustedRootCertificatePem: historical.trustedRootPem });
    assert.equal(verify(), true);
    assert.equal(verifyDocumentHashICPBrasil({ ...historical.evidence, documentHash: "0".repeat(64) }, { intermediateCertificatePems: signed.intermediatePems, trustedRootCertificatePem: signed.trustedRootPem }), false);

    // Unique fingerprint conflict rolls the certificate mutation and integration update back.
    process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM = fixtures.cnpj.privateKeyPem;
    await assert.rejects(saveCentralA1Integration(context, { ...input, kind: "A1_ECNPJ", documentId: "04252011000110", certificatePem: fixtures.cnpj.certificatePem }), /não corresponde/);
    const companyResponse = await route.POST(request("POST", { ...input, kind: "A1_ECNPJ", alias: "CNPJ isolado", documentId: "11222333000181", certificatePem: fixtures.cnpj.certificatePem }));
    assert.equal(companyResponse.status, 200);
    const company = (await companyResponse.json()).integration;
    await assert.rejects(saveCentralA1Integration(context, { ...input, id: saved.id, alias: "Alias conflitante", kind: "A1_ECNPJ", documentId: company.documentId, certificatePem: fixtures.cnpj.certificatePem }));
    assert.equal((await getCentralA1PublicConfiguration(context, saved.id)).alias, input.alias);
    await assert.rejects(saveCentralA1Integration(context, { ...input, kind: "A1_ECPF", certificatePem: fixtures.cnpj.certificatePem }), /não corresponde/);
    const signedCompany = await signCentralA1Envelope(operator, { ...signInput, integrationId: company.id, method: "A1_ECNPJ", signerDocument: company.documentId });
    assert.equal(signedCompany.kind, "A1_ECNPJ");

    process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM = fixtures.cpf.privateKeyPem;
    await database.update(digitalCertificates).set({ purposes: ["GED", "SIGNATURE_CENTRAL"] }).where(eq(digitalCertificates.id, saved.certificateId));
    await assert.rejects(signCentralA1Envelope(operator, signInput), /exclusiva/);
    await database.update(digitalCertificates).set({ purposes: ["SIGNATURE_CENTRAL"] }).where(eq(digitalCertificates.id, saved.certificateId));
    delete process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM;
    const configurationBeforeSuspension = await getCentralA1PublicConfiguration(context, saved.id);
    const certificatesBeforeSuspension = await database.select().from(digitalCertificates).where(eq(digitalCertificates.id, saved.certificateId));
    await suspendCentralA1Integration(context, saved.id);
    assert.deepEqual(await getCentralA1PublicConfiguration(context, saved.id), { ...configurationBeforeSuspension, active: false });
    assert.deepEqual(await database.select().from(digitalCertificates).where(eq(digitalCertificates.id, saved.certificateId)), certificatesBeforeSuspension);
    await assert.rejects(signCentralA1Envelope(operator, signInput), /suspensa/);
    assert.equal(verify(), true);
    process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM = fixtures.cpf.privateKeyPem;
    await saveCentralA1Integration(context, { ...input, id: saved.id, alias: "Atualizado" });
    assert.equal((await listCentralA1Integrations(reader)).find(r => r.id === saved.id)?.alias, "Atualizado");
    process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM = fixtures.rotatedCpf.privateKeyPem;
    await saveCentralA1Integration(context, { ...input, id: saved.id, certificatePem: fixtures.rotatedCpf.certificatePem });
    const afterRotation = await signCentralA1Envelope(operator, signInput);
    assert.notEqual(afterRotation.evidence.certificateFingerprint256, signed.evidence.certificateFingerprint256);
    assert.equal(verify(), true);
    const inventory = JSON.stringify(await listCentralA1Integrations(reader));
    assert(!inventory.includes("PRIVATE KEY") && !inventory.includes("PASSPHRASE") && !inventory.includes("BEGIN CERTIFICATE"));
    const stored = JSON.stringify(await database.select().from(digitalCertificates));
    assert(!stored.includes("PRIVATE KEY") && !stored.includes("PASSPHRASE"));
    await assert.rejects(database.delete(digitalCertificates).where(eq(digitalCertificates.id, saved.certificateId)), /./);
    await assert.rejects(database.insert(centralA1Integrations).values({ certificateId: "missing", kind: "A1_ECPF", alias: "Missing", ownerName: "Missing", documentId: "52998224725" }), /./);
    await assert.rejects(database.execute(sql`INSERT INTO "SignatureCentralA1Integration" (id,"certificateId",kind,alias,"ownerName","documentId") VALUES ('invalid',${saved.certificateId},'A1_ECPF','invalid','invalid','11222333000181')`), /./);
    await pg.exec('DROP TABLE "SignatureCentralA1Integration";');
    assert.equal((await database.select().from(digitalCertificates)).length, 2);
    await pg.exec(await readFile("db/migrations/20261029190100_signature_central_a1/migration.sql", "utf8"));
    assert.equal((await database.select().from(centralA1Integrations)).length, 0);
  } finally {
    if (prior === undefined) delete process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM; else process.env.CENTRAL_A1_FIXTURE_PRIVATE_KEY_PEM = prior;
    await pg.close(); await fixtures.close();
  }
});

test("status interno verifica chave real e só retorna indicadores públicos", () => {
  const oldKey = process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM, oldBlob = process.env.BLOB_READ_WRITE_TOKEN;
  try {
    delete process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM; delete process.env.BLOB_READ_WRITE_TOKEN;
    assert.deepEqual(centralSigningConfigurationStatus(), { internalKeyPresent: false, internalKeyValid: false, blobConfigured: false });
    process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM = "invalid-private-secret";
    assert.equal(centralSigningConfigurationStatus().internalKeyValid, false);
    process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM = generateKeyPairSync("rsa", { modulusLength: 2048 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    process.env.BLOB_READ_WRITE_TOKEN = "isolated-token-never-returned";
    assert.deepEqual(centralSigningConfigurationStatus(), { internalKeyPresent: true, internalKeyValid: true, blobConfigured: true });
    process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM = generateKeyPairSync("ed25519").privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    assert.equal(centralSigningConfigurationStatus().internalKeyValid, true);
    process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM = generateKeyPairSync("ec", { namedCurve: "prime256v1" }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    assert.equal(centralSigningConfigurationStatus().internalKeyValid, true);
    process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM = generateKeyPairSync("rsa", { modulusLength: 1024 }).privateKey.export({ type: "pkcs8", format: "pem" }).toString();
    assert.equal(centralSigningConfigurationStatus().internalKeyValid, false);
  } finally {
    if (oldKey === undefined) delete process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM; else process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM = oldKey;
    if (oldBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = oldBlob;
  }
});
