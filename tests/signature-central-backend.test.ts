import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { readFile } from "node:fs/promises";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import ts from "typescript";
import { eq, sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { centralA1Certificates } from "./helpers/central-a1-certificates";
import { withDatabaseTransaction } from "../src/db/transaction";
import type { Database } from "../src/db/connection";
import { db } from "../src/db/client";
import { saveCentralA1Integration } from "../src/lib/signatures/central-a1";
import { centralRecords, centralSigners } from "../src/db/schema/signature-central";
import { centralHash, signCentralInternal, verifyCentralEvidence, type CentralEnvelope } from "../src/lib/signatures/central-evidence";
import { hashCentralPassword, verifyCentralPassword } from "../src/lib/signatures/central-password";
import { assertCentralBlobPath, CENTRAL_RETENTION_MS, readCentralFile, type CentralBlobStore } from "../src/lib/signatures/central-storage";
import { centralTransaction, downloadCentralFile, getCentralReceipt, listCentralSignatureRecords, listCentralSigners, normalizeCentralDocument, saveCentralDocumentType, saveCentralSigner, searchCentralOrigins, signCentralFile, validateCentralSignature } from "../src/lib/signatures/central-service";
import { authorizeCentralCron, runCentralRetention } from "../src/lib/signatures/central-retention";
import { centralFile, centralHttpError, centralMultipart } from "../src/lib/signatures/central-http";
import { createCentralRateLimiter } from "../src/lib/signatures/central-rate-limit";
import { CentralCredentialError } from "../src/lib/signatures/central-error";
import type { AppContext } from "../src/lib/platform/tenant-context";

let fixture: Awaited<ReturnType<typeof createLocalDrizzleDatabase>>;
let context: AppContext & { databaseConnection: Awaited<ReturnType<typeof createLocalDrizzleDatabase>>["connection"] };
let signerId: string, typeId: string, manualCompanyId: string;
const blobs = new Map<string, Buffer>();
let putCount = 0, failPut = false, failDelete = false;
const storage: CentralBlobStore = {
  async put(path, bytes) { assertCentralBlobPath(path); putCount++; blobs.set(path, Buffer.from(bytes)); if (failPut) throw new Error("uncertain put"); },
  async get(path) { assertCentralBlobPath(path); return blobs.get(path) ?? null; },
  async delete(path) { assertCentralBlobPath(path); if (failDelete) throw new Error("delete unavailable"); blobs.delete(path); },
};
const file = (text = "Documento original") => new File([text], "contrato.txt", { type: "text/plain" });
const input = () => ({ file: file(), signerId, documentTypeId: typeId, method: "INTERNAL" as const, password: "senha-pessoal-teste", requestId: randomUUID() });

before(async () => {
  process.env.CELERIFLOW_INSTANCE_ID = "central-offline-test";
  process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  fixture = await createLocalDrizzleDatabase();
  await fixture.database.exec(`
    CREATE TABLE "Usuario" ("id" text PRIMARY KEY, "nome" text NOT NULL DEFAULT 'Ator', "email" text NOT NULL DEFAULT 'offline@example.test', "senha" text NOT NULL DEFAULT 'disabled', "firebaseUid" text, "ativo" boolean NOT NULL DEFAULT true, "perfilId" text NOT NULL DEFAULT 'test', "employeeId" text, "createdAt" timestamp NOT NULL DEFAULT now(), "updatedAt" timestamp NOT NULL DEFAULT now());
    CREATE TABLE "Person" ("id" text PRIMARY KEY, "fullName" text, "socialName" text, "cpf" text, "rg" text, "rgIssuer" text, "birthDate" timestamp, "gender" text, "raceColor" text, "nationality" text, "birthPlace" text, "maritalStatus" text, "profession" text, "educationLevel" text, "motherName" text, "fatherName" text, "motherUnknown" boolean DEFAULT false, "fatherUnknown" boolean DEFAULT false, "status" text DEFAULT 'Ativo', "deathDate" timestamp, "estateApplied" boolean DEFAULT false, "phonePrimary" text, "phoneSecondary" text, "whatsapp" text, "email" text, "emailSecondary" text, "createdAt" timestamp DEFAULT now(), "updatedAt" timestamp DEFAULT now());
    CREATE TABLE "Role" ("id" text PRIMARY KEY, "name" text);
    CREATE TABLE "Employee" ("id" text PRIMARY KEY, "name" text NOT NULL, "cpf" text, "registration" text, "email" text, "phone" text, "isActive" boolean DEFAULT true, "salaryBase" double precision DEFAULT 0, "contractedHours" integer DEFAULT 220, "roleId" text, "secretariatId" text, "departmentId" text, "unitId" text, "personId" text, "createdAt" timestamp DEFAULT now(), "updatedAt" timestamp DEFAULT now());
    INSERT INTO "Usuario" ("id", "employeeId") VALUES ('actor', NULL), ('signer-account','employee'), ('stranger',NULL);
    INSERT INTO "Role" VALUES ('role','Analista');
    INSERT INTO "Person" ("id","fullName","cpf") VALUES ('person','Nome canônico','52998224725');
    INSERT INTO "Employee" ("id","name","cpf","roleId","personId") VALUES ('employee','Nome canônico','52998224725','role','person');
  `);
  await fixture.database.exec(await readFile(new URL("../db/migrations/20261029190000_signature_central/migration.sql", import.meta.url), "utf8"));
  context = { database: fixture.connection.db, databaseConnection: fixture.connection, user: { id: "actor", firebaseUid: "offline", email: "actor@example.test", name: "Ator", role: "operador", profileCode: "OPERADOR", modulePermissions: [{ code: "ASSINATURA_DIGITAL", canView: true, canEdit: true }], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null } };
  const signer = await saveCentralSigner(context, { kind: "SERVIDOR", name: "Nome client não confiável", role: "Cargo client", documentId: "529.982.247-25", phone: "", mobile: "", email: "", validUntil: "2035-12-31T23:59:59.999Z", active: true, employeeId: "employee", personId: "person", accountUserId: "signer-account", password: "senha-pessoal-teste" });
  signerId = signer.id;
  typeId = (await saveCentralDocumentType(context, { name: "Contrato", description: "Documento", active: true })).id;
});
after(async () => { await fixture?.close(); });

test("scrypt salts, password boundaries, canonical identities and write-only password", async () => {
  const a = await hashCentralPassword("senha-pessoal-teste"), b = await hashCentralPassword("senha-pessoal-teste");
  assert.notEqual(a, b); assert.equal(await verifyCentralPassword("senha-pessoal-teste", a), true); assert.equal(await verifyCentralPassword("errada", a), false);
  assert.equal(await verifyCentralPassword("teste", "bad"), false);
  await assert.rejects(hashCentralPassword("curta"));
  assert.equal(normalizeCentralDocument("04.252.011/0001-10"), "04252011000110");
  assert.throws(() => normalizeCentralDocument("11111111111"));
  const [signer] = await listCentralSigners(context);
  assert.equal(signer.name, "Nome canônico"); assert.equal(signer.role, "Analista"); assert.equal(signer.hasPassword, true);
  assert.equal("passwordHash" in signer, false);
  const before = (await fixture.connection.db.select().from(centralSigners))[0].passwordHash;
  await saveCentralSigner(context, { ...signer, password: "" });
  assert.equal((await fixture.connection.db.select().from(centralSigners))[0].passwordHash, before);
  await assert.rejects(saveCentralSigner(context, { ...signer, documentId: "04252011000110" }), /divergente/);
  await assert.rejects(saveCentralSigner(context, { ...signer, accountUserId: "stranger" }), /incompatível/);
  assert.equal((await searchCentralOrigins(context, "SERVIDOR", "No")).length, 1);
  assert.deepEqual(await searchCentralOrigins(context, "SERVIDOR", "N"), []);
});

test("production context database:db uses only its offline global pool; injected mismatch never falls back", async () => {
  const globalDatabase = globalThis as typeof globalThis & { celeriflowDatabase?: typeof fixture.connection };
  const previous = globalDatabase.celeriflowDatabase;
  let acquisitions = 0;
  const safePool = new Proxy(fixture.connection.pool, {
    get(pool, property) {
      if (property === "connect") return () => { acquisitions++; return pool.connect(); };
      const value: unknown = Reflect.get(pool, property, pool);
      return typeof value === "function" ? value.bind(pool) : value;
    },
  });
  globalDatabase.celeriflowDatabase = { db: fixture.connection.db, pool: safePool };
  try {
    const normalContext: AppContext = { user: context.user, database: db };
    const created = await saveCentralDocumentType(normalContext, { name: "Produção offline", description: "Proxy normal com pool exclusivamente local", active: true });
    assert.ok(created.id); assert.equal(acquisitions, 1);
    const baseline = acquisitions;
    await assert.rejects(centralTransaction({ user: context.user, database: fixture.connection.db }, async () => assert.fail("must not run")), /injetado requer databaseConnection/);
    await assert.rejects(centralTransaction({ user: context.user }, async () => assert.fail("must not use implicit global")), /requer databaseConnection/);
    const differentDatabase = new Proxy(fixture.connection.db, {});
    await assert.rejects(centralTransaction({ user: context.user, database: differentDatabase, databaseConnection: fixture.connection }, async () => assert.fail("must not run")), /incompatível/);
    assert.equal(acquisitions, baseline);
  } finally {
    if (previous) globalDatabase.celeriflowDatabase = previous;
    else delete globalDatabase.celeriflowDatabase;
  }
});

test("manual CPF/CNPJ registration, validated contacts, optional proven accounts and canonical linked citizen", async () => {
  const manual = { kind: "CIDADAO" as const, name: "Cidadã manual", role: "Responsável", documentId: "111.444.777-35", phone: "+55 (54) 3333-4444", mobile: "(54) 99999-1234", email: "manual@example.test", validUntil: "2035-12-31T23:59:59.999Z", active: true, employeeId: null, personId: null, accountUserId: null, password: "senha-pessoal-teste" };
  await assert.rejects(saveCentralSigner(context, { ...manual, password: "" }), /inicial/);
  for (const invalid of [{ name: " " }, { name: "a".repeat(201) }, { role: "a".repeat(161) }, { documentId: "11111111111" }, { email: "broken-email" }, { phone: "telefone" }, { mobile: "123" }]) {
    await assert.rejects(saveCentralSigner(context, { ...manual, ...invalid }), error => (error as { status: number }).status === 400);
  }
  await assert.rejects(saveCentralSigner(context, { ...manual, accountUserId: "stranger", email: "offline@example.test" }), /incompatível/);
  await assert.rejects(saveCentralSigner(context, { ...manual, personId: "person" }), /divergente/);
  await assert.rejects(saveCentralSigner(context, { ...manual, employeeId: "employee" }), /vínculo canônico/);
  const personal = await saveCentralSigner(context, manual);
  assert.equal(personal.name, manual.name); assert.equal(personal.role, manual.role); assert.equal(personal.personId, null); assert.equal(personal.employeeId, null);
  const signed = await signCentralFile(context, { ...input(), signerId: personal.id }, storage);
  assert.equal(signed.signerDocument, "11144477735"); assert.equal((await getCentralReceipt(context, signed.id)).verified, true);
  await assert.rejects(signCentralFile(context, { ...input(), signerId: personal.id, password: "wrong-password" }, storage), /Senha pessoal/);
  await fixture.connection.db.update(centralSigners).set({ active: false }).where(eq(centralSigners.id, personal.id));
  await assert.rejects(signCentralFile(context, { ...input(), signerId: personal.id }, storage), /inativo/);
  const company = await saveCentralSigner(context, { ...manual, name: "Empresa manual", documentId: "11.222.333/0001-81", email: "empresa@example.test" });
  manualCompanyId = company.id;
  assert.equal(company.documentId, "11222333000181"); assert.equal(company.personId, null);
  assert.equal((await signCentralFile(context, { ...input(), signerId: company.id }, storage)).signerDocument, company.documentId);
  await fixture.database.exec(`INSERT INTO "Person" (id,"fullName",cpf,email,profession) VALUES ('linked-person','Nome cidadão canônico','12345678909','linked@example.test','Cargo canônico'); INSERT INTO "Usuario" (id,email) VALUES ('linked-account','linked@example.test');`);
  const linked = await saveCentralSigner(context, { ...manual, name: "Injetado", role: "Injetado", documentId: "12345678909", personId: "linked-person", accountUserId: "linked-account", email: "different-input@example.test" });
  assert.equal(linked.name, "Nome cidadão canônico"); assert.equal(linked.role, "Cargo canônico");
  assert.equal((await getCentralReceipt(context, (await signCentralFile(context, { ...input(), signerId: linked.id }, storage)).id)).verified, true);
  await fixture.database.exec(`UPDATE "Usuario" SET email='changed@example.test' WHERE id='linked-account'`);
  await assert.rejects(signCentralFile(context, { ...input(), signerId: linked.id }, storage), /incompatível/);
});

test("real bytes hash, 90 days, snapshot proof, idempotent retry, ownership and public masking", async () => {
  const request = input(), count = putCount;
  const record = await signCentralFile(context, request, storage);
  assert.equal(record.hashSha256, centralHash(Buffer.from("Documento original")));
  assert.equal(new Date(record.expiresAt).getTime() - new Date(record.signedAt).getTime(), CENTRAL_RETENTION_MS);
  assert.equal((await signCentralFile(context, request, storage)).id, record.id);
  assert.equal(putCount, count + 1);
  await assert.rejects(signCentralFile(context, { ...request, file: file("outro") }, storage), /outro conteúdo/);
  const receipt = await getCentralReceipt(context, record.id);
  assert.equal(receipt.verified, true); assert.ok(receipt.evidence);
  assert.equal(verifyCentralEvidence(receipt.evidence), true);
  const tampered = structuredClone(receipt.evidence); tampered.envelope.signer.name = "Fraude";
  assert.equal(verifyCentralEvidence(tampered), false);
  const publicResult = await validateCentralSignature({ code: record.code, file: file() }, fixture.connection.db);
  assert.equal(publicResult.valid, true);
  const json = JSON.stringify(publicResult);
  assert.equal(json.includes("52998224725"), false); assert.equal(json.includes("blobPath"), false); assert.equal(json.includes("accountUserId"), false);
  assert.equal((await validateCentralSignature({ code: record.code, file: file("alterado") }, fixture.connection.db)).valid, false);
  assert.equal((await downloadCentralFile(context, record.id, storage)).bytes.toString(), "Documento original");
  const stranger = { ...context, user: { ...context.user, id: "stranger" } };
  await assert.rejects(downloadCentralFile(stranger, record.id, storage), /não encontrado/);
  await assert.rejects(getCentralReceipt(stranger, record.id), /não encontrado/);
  assert.equal((await listCentralSignatureRecords(stranger)).length, 0);
  const owner = { ...context, user: { ...context.user, id: "signer-account" } };
  assert.equal((await getCentralReceipt(owner, record.id)).record.id, record.id);
  const rotated = process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM;
  delete process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM;
  assert.equal((await validateCentralSignature({ code: record.code }, fixture.connection.db)).valid, true);
  await assert.rejects(signCentralFile(context, input(), storage), /não configurada/);
  process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM = rotated;
});

test("uncertain upload is durable, retry overwrites same path without duplicate; DB failure recovery", async () => {
  const request = input(); failPut = true;
  await assert.rejects(signCentralFile(context, request, storage), error => (error as { status: number }).status === 503); failPut = false;
  const [pending] = await fixture.connection.db.select().from(centralRecords).where(eq(centralRecords.requestId, request.requestId));
  assert.equal(pending.status, "PENDING"); assert.ok(blobs.has(pending.blobPath));
  const signed = await signCentralFile(context, request, storage); assert.equal(signed.id, pending.id);
  assert.equal((await fixture.connection.db.select().from(centralRecords).where(eq(centralRecords.requestId, request.requestId))).length, 1);
  // Actual PostgreSQL trigger failure after upload; intent remains committed.
  await fixture.database.exec(`CREATE FUNCTION central_test_fail() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW."status"='SIGNED' THEN RAISE EXCEPTION 'offline commit failure'; END IF; RETURN NEW; END $$; CREATE TRIGGER central_test_fail BEFORE UPDATE ON "SignatureCentralRecord" FOR EACH ROW EXECUTE FUNCTION central_test_fail();`);
  const dbFailure = input();
  await assert.rejects(signCentralFile(context, dbFailure, storage));
  const [failed] = await fixture.connection.db.select().from(centralRecords).where(eq(centralRecords.requestId, dbFailure.requestId));
  assert.equal(failed.status, "PENDING"); assert.ok(blobs.has(failed.blobPath));
  await fixture.database.exec(`DROP TRIGGER central_test_fail ON "SignatureCentralRecord"; DROP FUNCTION central_test_fail();`);
  assert.equal((await signCentralFile(context, dbFailure, storage)).id, failed.id);
});

test("A1 complete signing pipeline on same connection, historical certificate snapshot and envelope/file tampering", async () => {
  const certificates = await centralA1Certificates();
  try {
    await fixture.database.exec(`CREATE TABLE "DigitalCertificate" (id text PRIMARY KEY,alias text NOT NULL UNIQUE,"ownerName" text NOT NULL,provider text NOT NULL DEFAULT 'ENV_REFERENCE',"credentialReference" text NOT NULL,"certificatePem" text NOT NULL,"intermediatePems" jsonb NOT NULL DEFAULT '[]',"trustedRootPem" text NOT NULL,subject text NOT NULL,issuer text NOT NULL,"serialNumber" text NOT NULL,fingerprint256 text NOT NULL UNIQUE,"validFrom" timestamp NOT NULL,"validTo" timestamp NOT NULL,status text NOT NULL DEFAULT 'ACTIVE',purposes jsonb NOT NULL DEFAULT '[]',"createdByUsuarioId" text NOT NULL,"createdAt" timestamp NOT NULL DEFAULT NOW(),"updatedAt" timestamp NOT NULL DEFAULT NOW());`);
    await fixture.database.exec(await readFile(new URL("../db/migrations/20261029190100_signature_central_a1/migration.sql", import.meta.url), "utf8"));
    process.env.CENTRAL_BACKEND_A1_FIXTURE_PRIVATE_KEY_PEM = certificates.cpf.privateKeyPem;
    const integration = await withDatabaseTransaction(fixture.connection, tx => saveCentralA1Integration({ ...context, database: tx as unknown as Database, user: { ...context.user, profileCode: "SYSTEM_ADMINISTRATOR" } }, {
      kind: "A1_ECPF", alias: "Backend fixture", ownerName: "Nome declarado não probatório", documentId: "52998224725", credentialReference: "CENTRAL_BACKEND_A1_FIXTURE", certificatePem: certificates.cpf.certificatePem, intermediatePems: certificates.intermediatePems, trustedRootPem: certificates.trustedRootPem, active: true,
    }));
    const certificateContext = { ...context, user: { ...context.user, id: "signer-account", employeeId: "employee" } };
    const certificateInput = { ...input(), password: "", method: "A1_ECPF" as const, integrationId: integration.id };
    await assert.rejects(signCentralFile(context, certificateInput, storage), /vinculado à sua conta/);
    const record = await signCentralFile(certificateContext, certificateInput, storage);
    assert.equal(record.method, "A1_ECPF");
    const receipt = await getCentralReceipt(certificateContext, record.id);
    assert.equal(receipt.verified, true);
    assert.equal(receipt.evidence?.kind, "A1");
    if (receipt.evidence?.kind !== "A1") throw new Error("expected A1 proof");
    assert.equal(receipt.evidence.evidence.documentHash, receipt.evidence.envelopeHash);
    assert.notEqual(receipt.evidence.evidence.documentHash, record.hashSha256);
    delete process.env.CENTRAL_BACKEND_A1_FIXTURE_PRIVATE_KEY_PEM;
    await fixture.database.exec(`UPDATE "SignatureCentralA1Integration" SET active=false`);
    assert.equal((await validateCentralSignature({ code: record.code, file: file() }, fixture.connection.db)).valid, true);
    const altered = structuredClone(receipt.evidence); altered.envelope.file.hashSha256 = "f".repeat(64);
    assert.equal(verifyCentralEvidence(altered), false);
    const badChain = structuredClone(receipt.evidence); badChain.trustedRootPem = certificates.none.certificatePem;
    assert.equal(verifyCentralEvidence(badChain), false);
    const wrongOwner = structuredClone(receipt.evidence); wrongOwner.envelope.signer.documentId = "11144477735";
    assert.equal(verifyCentralEvidence(wrongOwner), false);
    process.env.CENTRAL_BACKEND_A1_FIXTURE_PRIVATE_KEY_PEM = certificates.cnpj.privateKeyPem;
    const companyIntegration = await withDatabaseTransaction(fixture.connection, tx => saveCentralA1Integration({ ...context, database: tx as unknown as Database, user: { ...context.user, profileCode: "SYSTEM_ADMINISTRATOR" } }, {
      kind: "A1_ECNPJ", alias: "Empresa manual backend", ownerName: "Empresa", documentId: "11222333000181", credentialReference: "CENTRAL_BACKEND_A1_FIXTURE", certificatePem: certificates.cnpj.certificatePem, intermediatePems: certificates.intermediatePems, trustedRootPem: certificates.trustedRootPem, active: true,
    }));
    await fixture.database.exec(`INSERT INTO "Person" ("id","fullName","cpf","email") VALUES ('company-person','Empresa','11222333000181','offline@example.test'); UPDATE "SignatureCentralSigner" SET "accountUserId"='actor' WHERE id='${manualCompanyId}';`);
    const companyRecord = await signCentralFile(context, { ...input(), password: "", signerId: manualCompanyId, method: "A1_ECNPJ", integrationId: companyIntegration.id }, storage);
    assert.equal(companyRecord.method, "A1_ECNPJ"); assert.equal(companyRecord.signerDocument, "11222333000181");
    const companyReceipt = await getCentralReceipt(context, companyRecord.id);
    assert.equal(companyReceipt.verified, true); assert.equal(companyReceipt.evidence!.envelope.signer.personId, null);
    assert.equal(companyReceipt.evidence!.envelope.signer.employeeId, null);
    assert.equal((await validateCentralSignature({ code: companyRecord.code, file: file() }, fixture.connection.db)).valid, true);
  } finally { delete process.env.CENTRAL_BACKEND_A1_FIXTURE_PRIVATE_KEY_PEM; await certificates.close(); }
});

test("concurrent same-request retries serialize and upload a single original", async () => {
  const request = input(), before = putCount;
  const [a, b] = await Promise.all([signCentralFile(context, request, storage), signCentralFile(context, request, storage)]);
  assert.equal(a.id, b.id); assert.equal(putCount, before + 1);
  assert.equal((await fixture.connection.db.select().from(centralRecords).where(eq(centralRecords.requestId, request.requestId))).length, 1);
});

test("personal password, validity, active source and granular permissions enforced", async () => {
  await assert.rejects(signCentralFile(context, { ...input(), password: "senha-errada" }, storage), error => error instanceof CentralCredentialError && error.code === "CENTRAL_INVALID_PASSWORD");
  const denied = { ...context, user: { ...context.user, modulePermissions: [] } };
  await assert.rejects(signCentralFile(denied, input(), storage), /permissão/);
  const readonly = { ...context, user: { ...context.user, modulePermissions: [{ code: "ASSINATURA_DIGITAL", canView: true, canEdit: false }] } };
  await assert.rejects(saveCentralDocumentType(readonly, { name: "Bloqueado", description: "", active: true }), /permissão/);
  await fixture.connection.db.update(centralSigners).set({ active: false }).where(eq(centralSigners.id, signerId));
  await assert.rejects(signCentralFile(context, input(), storage), /inativo/);
  await fixture.connection.db.update(centralSigners).set({ active: true, validUntil: new Date("2020-01-01") }).where(eq(centralSigners.id, signerId));
  await assert.rejects(signCentralFile(context, input(), storage), /validade/);
  await fixture.connection.db.update(centralSigners).set({ validUntil: new Date("2035-12-31") }).where(eq(centralSigners.id, signerId));
  await fixture.database.exec(`UPDATE "Employee" SET "isActive"=false WHERE "id"='employee'`);
  await assert.rejects(signCentralFile(context, input(), storage), /Vínculo inativo/);
  await fixture.database.exec(`UPDATE "Employee" SET "isActive"=true WHERE "id"='employee'`);
});

test("retention fails closed, retries delete, preserves receipt/proof; namespace isolation", async () => {
  assert.throws(() => assertCentralBlobPath("instances/other/signature-central/x/original"));
  assert.throws(() => assertCentralBlobPath("instances/central-offline-test/documents/x"));
  assert.throws(() => assertCentralBlobPath("instances/central-offline-test/signature-central/../x"));
  const record = await signCentralFile(context, input(), storage);
  const [row] = await fixture.connection.db.select().from(centralRecords).where(eq(centralRecords.id, record.id));
  // Move the clock using a real, backdated signed snapshot, not inconsistent metadata.
  const envelope = structuredClone(row.evidence!.envelope);
  envelope.signedAt = new Date(Date.now() - CENTRAL_RETENTION_MS - 10000).toISOString();
  envelope.expiresAt = new Date(new Date(envelope.signedAt).getTime() + CENTRAL_RETENTION_MS).toISOString();
  await fixture.connection.db.update(centralRecords).set({ signedAt: new Date(envelope.signedAt), expiresAt: new Date(envelope.expiresAt), evidence: signCentralInternal(envelope) }).where(eq(centralRecords.id, row.id));
  await assert.rejects(downloadCentralFile(context, record.id, storage), error => (error as { status: number }).status === 410);
  failDelete = true;
  const failed = await runCentralRetention(fixture.connection, storage);
  assert.ok(failed.failures.some(f => f.id === row.id));
  assert.equal((await fixture.connection.db.select().from(centralRecords).where(eq(centralRecords.id, row.id)))[0].storageDeletedAt, null);
  failDelete = false;
  const removed = await runCentralRetention(fixture.connection, storage); assert.ok(removed.deleted >= 1);
  assert.equal(blobs.has(row.blobPath), false);
  assert.equal((await getCentralReceipt(context, row.id)).verified, true);
  assert.equal((await validateCentralSignature({ code: row.code, file: file() }, fixture.connection.db)).valid, true);
  assert.equal((await runCentralRetention(fixture.connection, storage)).deleted, 0);
  process.env.CRON_SECRET = "offline-secret";
  assert.equal(authorizeCentralCron("Bearer offline-secret"), true); assert.equal(authorizeCentralCron("Bearer wrong"), false);
  delete process.env.CRON_SECRET; assert.equal(authorizeCentralCron("Bearer undefined"), false);
});

test("abandoned upload cleanup is durable and retry restores original at same path", async () => {
  const request = input(); failPut = true;
  await assert.rejects(signCentralFile(context, request, storage)); failPut = false;
  const [pending] = await fixture.connection.db.select().from(centralRecords).where(eq(centralRecords.requestId, request.requestId));
  await fixture.connection.db.update(centralRecords).set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(centralRecords.id, pending.id));
  await runCentralRetention(fixture.connection, storage);
  assert.equal(blobs.has(pending.blobPath), false);
  const [cleaned] = await fixture.connection.db.select().from(centralRecords).where(eq(centralRecords.id, pending.id));
  assert.ok(cleaned.storageDeletedAt); assert.equal(cleaned.status, "PENDING"); assert.equal(cleaned.evidence, null);
  failPut = true;
  await assert.rejects(signCentralFile(context, request, storage)); failPut = false;
  const [rearmed] = await fixture.connection.db.select().from(centralRecords).where(eq(centralRecords.id, pending.id));
  assert.equal(rearmed.storageDeletedAt, null); assert.ok(blobs.has(pending.blobPath));
  await fixture.connection.db.update(centralRecords).set({ createdAt: new Date(Date.now() - 25 * 60 * 60 * 1000) }).where(eq(centralRecords.id, pending.id));
  await runCentralRetention(fixture.connection, storage);
  assert.equal(blobs.has(pending.blobPath), false);
  const record = await signCentralFile(context, request, storage);
  assert.equal(record.id, pending.id); assert.equal(record.storageDeletedAt, null); assert.ok(blobs.has(pending.blobPath));
});

test("tampering signed columns invalidates public proof; file-only returns every matching record", async () => {
  const a = await signCentralFile(context, input(), storage), b = await signCentralFile(context, input(), storage);
  const result = await validateCentralSignature({ file: file() }, fixture.connection.db);
  assert.ok(result.records.some(r => r.code === a.code)); assert.ok(result.records.some(r => r.code === b.code));
  await fixture.connection.db.update(centralRecords).set({ hashSha256: "a".repeat(64) }).where(eq(centralRecords.id, a.id));
  assert.equal((await validateCentralSignature({ code: a.code }, fixture.connection.db)).valid, false);
  await assert.rejects(downloadCentralFile(context, a.id, storage), /Evidência inválida/);
});

test("physical format limits and bounded multipart, technical failure is unavailable", async () => {
  await assert.rejects(readCentralFile(new File(["not pdf"], "fake.pdf", { type: "application/pdf" })), /conteúdo físico/);
  await assert.rejects(readCentralFile(new File([Buffer.alloc(3 * 1024 * 1024 + 1)], "big.txt", { type: "text/plain" })), /3 MiB/);
  await assert.rejects(readCentralFile(new File([Buffer.from([0xff])], "fake.txt", { type: "text/plain" })), /conteúdo físico/);
  const data = new FormData(); data.set("file", file()); data.set("code", randomUUID());
  const parsed = await centralMultipart(new Request("https://offline.test", { method: "POST", body: data }));
  assert.equal(centralFile(parsed, true)?.name, "contrato.txt");
  data.append("file", file());
  await assert.rejects(centralMultipart(new Request("https://offline.test", { method: "POST", body: data })), /duplicados/);
  assert.equal(centralHttpError(new Error("sensitive provider message")).status, 503);
  assert.equal((await centralHttpError(new Error("secret")).text()).includes("secret"), false);
});

test("future migration enforces FK, status, size and proof state using real PostgreSQL", async () => {
  await assert.rejects(fixture.connection.db.update(centralSigners).set({ accountUserId: "missing-user" }).where(eq(centralSigners.id, signerId)));
  const record = await signCentralFile(context, input(), storage);
  await assert.rejects(fixture.connection.db.execute(sql`UPDATE "SignatureCentralRecord" SET status='UNKNOWN' WHERE id=${record.id}`));
  await assert.rejects(fixture.connection.db.execute(sql`UPDATE "SignatureCentralRecord" SET "byteLength"=3145729 WHERE id=${record.id}`));
  await assert.rejects(fixture.connection.db.execute(sql`UPDATE "SignatureCentralRecord" SET evidence=NULL WHERE id=${record.id}`));
  await assert.rejects(fixture.connection.db.execute(sql`DELETE FROM "SignatureCentralSigner" WHERE id=${signerId}`));
  await assert.rejects(fixture.connection.db.execute(sql`DELETE FROM "SignatureCentralDocumentType" WHERE id=${typeId}`));
  await assert.rejects(fixture.connection.db.execute(sql`UPDATE "SignatureCentralSigner" SET "employeeId"=NULL WHERE id=${signerId}`));
  await assert.rejects(fixture.connection.db.execute(sql`UPDATE "SignatureCentralSigner" SET "employeeId"='employee' WHERE id=${manualCompanyId}`));
  await assert.rejects(fixture.connection.db.execute(sql`UPDATE "SignatureCentralSigner" SET kind='INVALID' WHERE id=${manualCompanyId}`));
});

test("initial document types preserve existing registrations and deactivations on replay", async () => {
  const migration = await readFile(new URL("../db/migrations/20261030120000_signature_central_document_types/migration.sql", import.meta.url), "utf8");
  const before = await fixture.database.query(`SELECT id FROM "SignatureCentralDocumentType"`);
  await fixture.database.exec(migration);
  const existing = await fixture.database.query<{ id: string }>(`SELECT id FROM "SignatureCentralDocumentType" WHERE name='Contrato'`);
  assert.equal(existing.rows[0].id, typeId);
  await fixture.database.exec(`UPDATE "SignatureCentralDocumentType" SET active=false WHERE name='Ofício'`);
  await fixture.database.exec(migration);
  const types = await fixture.database.query<{ name: string; active: boolean }>(`SELECT name, active FROM "SignatureCentralDocumentType"`);
  assert.equal(types.rows.length, before.rows.length + 10);
  assert.equal(types.rows.find(type => type.name === "Ofício")?.active, false);
  assert.equal(types.rows.find(type => type.name === "Requerimento")?.active, true);
});

test("API boundaries: multipart single-file, masked public validation, private endpoints and cron", async () => {
  type Route = { POST(request: Request): Promise<Response>; GET(request: Request, context: { params: Promise<{ id: string }> }): Promise<Response> };
  let routeContext = context;
  let signCalls = 0, validationCalls = 0;
  let instrumentedRecord: Awaited<ReturnType<typeof signCentralFile>> | undefined;
  const services = await import("../src/lib/signatures/central-service");
  const fakeSessionRealServices = {
    ...services,
    signCentralFile: (ctx: AppContext, value: Parameters<typeof signCentralFile>[1]) => { signCalls++; return instrumentedRecord ? Promise.resolve(instrumentedRecord) : signCentralFile(ctx, value, storage); },
    validateCentralSignature: (value: Parameters<typeof validateCentralSignature>[0]) => { validationCalls++; return validateCentralSignature(value, fixture.connection.db); },
    downloadCentralFile: (ctx: AppContext, id: string) => downloadCentralFile(ctx, id, storage),
  };
  const load = async (path: string): Promise<Route> => {
    const filename = resolve(path), require = createRequire(filename), routeModule = { exports: {} };
    const compiled = ts.transpileModule(await readFile(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(compiled, { module: routeModule, exports: routeModule.exports, Buffer, URL, Request, Response, File,
      require: (name: string) => name === "@/lib/platform/tenant-context" ? { getTenantContextForModule: async () => routeContext, getTenantContextForModuleOperation: async () => routeContext } :
        name === "@/lib/signatures/central-service" ? fakeSessionRealServices :
        name === "@/lib/signatures/central-retention" ? { authorizeCentralCron, runCentralRetention: () => runCentralRetention(fixture.connection, storage) } : require(name),
    }, { filename });
    return routeModule.exports as Route;
  };
  const sign = await load("src/app/api/assinatura-digital/assinar/route.ts"), validate = await load("src/app/api/assinatura-digital/validar/route.ts");
  const download = await load("src/app/api/assinatura-digital/documentos/[id]/route.ts"), receipt = await load("src/app/api/assinatura-digital/comprovantes/[id]/route.ts");
  const retention = await load("src/app/api/assinatura-digital/retencao/route.ts");
  const data = new FormData(); data.set("file", file()); data.set("signerId", signerId); data.set("documentTypeId", typeId); data.set("method", "INTERNAL"); data.set("password", "senha-pessoal-teste"); data.set("requestId", randomUUID());
  data.set("url", "https://untrusted.invalid/arbitrary"); data.set("hashSha256", "f".repeat(64));
  const result = await sign.POST(new Request("https://offline.test/api/assinatura-digital/assinar", { method: "POST", body: data }));
  assert.equal(result.status, 200); assert.equal(result.headers.get("cache-control"), "no-store");
  const body = await result.json(); assert.equal(body.record.hashSha256, centralHash("Documento original"));
  const params = { params: Promise.resolve({ id: body.record.id }) };
  const original = await download.GET(new Request("https://offline.test"), params);
  assert.equal(original.status, 200); assert.equal(await original.text(), "Documento original"); assert.equal(original.headers.has("location"), false);
  assert.equal((await receipt.GET(new Request("https://offline.test"), params)).status, 200);
  routeContext = { ...context, user: { ...context.user, id: "stranger" } };
  assert.equal((await download.GET(new Request("https://offline.test"), params)).status, 404);
  routeContext = context;
  const publicData = new FormData(); publicData.set("code", body.record.code); publicData.set("file", file());
  const verified = await validate.POST(new Request("https://offline.test", { method: "POST", body: publicData }));
  assert.equal(verified.status, 200); assert.equal((await verified.json()).valid, true);
  publicData.set("file", file("alterado"));
  const invalid = await validate.POST(new Request("https://offline.test", { method: "POST", body: publicData }));
  assert.equal(invalid.status, 200); assert.equal((await invalid.json()).valid, false);
  assert.equal((await retention.GET(new Request("https://offline.test"), params)).status, 401);
  process.env.CRON_SECRET = "isolated-cron";
  assert.equal((await retention.GET(new Request("https://offline.test", { headers: { authorization: "Bearer isolated-cron" } }), params)).status, 200);
  delete process.env.CRON_SECRET;
  data.set("file", new File(["bad"], "bad.pdf", { type: "application/pdf" }));
  assert.equal((await sign.POST(new Request("https://offline.test", { method: "POST", body: data }))).status, 400);
  data.set("file", file());
  const batchIds = new Set<string>([body.record.id]);
  // Twenty REAL individual signatures with distinct retry IDs; no 429 in the
  // standard UI batch, using the production route limiter and core service.
  for (let i = 0; i < 19; i++) {
    data.set("requestId", randomUUID());
    const response = await sign.POST(new Request("https://offline.test", { method: "POST", body: data }));
    assert.equal(response.status, 200);
    const record = (await response.json()).record;
    batchIds.add(record.id);
  }
  assert.equal(batchIds.size, 20);
  // The remaining budget is a route/service-instrumentation test: no redundant
  // crypto is needed to prove the 60/61 boundary. One invalid-file attempt above
  // also consumed a request, so 21 attempts have been counted so far.
  instrumentedRecord = body.record;
  for (let i = 0; i < 39; i++) assert.equal((await sign.POST(new Request("https://offline.test", { method: "POST", body: data }))).status, 200);
  const callsBeforeBlock = signCalls;
  data.set("signerId", randomUUID());
  const actorBlocked = await sign.POST(new Request("https://offline.test", { method: "POST", body: data }));
  assert.equal(actorBlocked.status, 429); assert.ok(Number(actorBlocked.headers.get("retry-after")) >= 1);
  assert.equal(actorBlocked.headers.get("cache-control"), "no-store"); assert.equal(signCalls, callsBeforeBlock);
  routeContext = { ...context, user: { ...context.user, id: "stranger" } }; data.set("signerId", signerId);
  const signerBlocked = await sign.POST(new Request("https://offline.test", { method: "POST", body: data }));
  assert.equal(signerBlocked.status, 429); assert.equal(signCalls, callsBeforeBlock);
  instrumentedRecord = undefined;
  data.set("signerId", manualCompanyId);
  // Ten unrelated 400s must not consume the separate password-failure budget.
  data.set("file", new File(["bad"], "bad.pdf", { type: "application/pdf" }));
  for (let i = 0; i < 10; i++) assert.equal((await sign.POST(new Request("https://offline.test", { method: "POST", body: data }))).status, 400);
  data.set("file", file()); data.set("password", "wrong-password");
  for (let i = 0; i < 9; i++) assert.equal((await sign.POST(new Request("https://offline.test", { method: "POST", body: data }))).status, 403);
  const credentialBlocked = await sign.POST(new Request("https://offline.test", { method: "POST", body: data }));
  assert.equal(credentialBlocked.status, 429); assert.ok(Number(credentialBlocked.headers.get("retry-after")) >= 1);
  const callsAfterFailures = signCalls;
  data.set("password", "senha-pessoal-teste");
  assert.equal((await sign.POST(new Request("https://offline.test", { method: "POST", body: data }))).status, 429);
  assert.equal(signCalls, callsAfterFailures); // blocked before another scrypt
  for (let i = 0; i < 8; i++) assert.equal((await validate.POST(new Request("https://offline.test", { method: "POST", body: publicData }))).status, 200);
  const validationsBeforeBlock = validationCalls;
  const publicBlocked = await validate.POST(new Request("https://offline.test", { method: "POST", body: publicData }));
  assert.equal(publicBlocked.status, 429); assert.ok(Number(publicBlocked.headers.get("retry-after")) >= 1); assert.equal(validationCalls, validationsBeforeBlock);
  assert.equal((await validate.POST(new Request("https://offline.test", { method: "POST", body: publicData, headers: { "x-forwarded-for": "198.51.100.20, 198.51.100.21" } }))).status, 200);
});

test("central limiter: 60 attempts, 10 credential failures, exact window expiry and positive Retry-After", () => {
  let now = 0;
  const limiter = createCentralRateLimiter({ clock: () => now });
  for (let i = 0; i < 60; i++) {
    assert.equal(limiter.attempt("actor", "actor").allowed, true);
    assert.equal(limiter.attempt("signer", "signer").allowed, true);
    assert.equal(limiter.credentialStatus("signer").allowed, true);
  }
  assert.deepEqual(limiter.attempt("actor", "actor"), { allowed: false, retryAfterSeconds: 60 });
  assert.equal(limiter.attempt("signer", "signer").allowed, false);
  for (let i = 0; i < 9; i++) assert.equal(limiter.credentialFailure("password-signer").allowed, true);
  assert.equal(limiter.credentialFailure("password-signer").allowed, false);
  assert.equal(limiter.credentialStatus("password-signer").allowed, false);
  now = 59_999;
  assert.deepEqual(limiter.attempt("actor", "actor"), { allowed: false, retryAfterSeconds: 1 });
  assert.deepEqual(limiter.credentialStatus("password-signer"), { allowed: false, retryAfterSeconds: 1 });
  now = 60_000; // >= boundary, never one more 429 with Retry-After: 0
  assert.equal(limiter.attempt("actor", "actor").allowed, true);
  assert.equal(limiter.attempt("signer", "signer").allowed, true);
  assert.equal(limiter.credentialStatus("password-signer").allowed, true);
  assert.equal(limiter.credentialFailure("password-signer").allowed, true);
});

test("central limiter: bounded map expires keys without evicting live budgets", () => {
  let now = 1000;
  const limiter = createCentralRateLimiter({ clock: () => now, maxEntries: 2 });
  assert.equal(limiter.attempt("actor", "a").allowed, true);
  assert.equal(limiter.attempt("signer", "s").allowed, true);
  assert.deepEqual(limiter.attempt("actor", "new"), { allowed: false, retryAfterSeconds: 60 });
  assert.equal(limiter.size, 2);
  for (let i = 1; i < 60; i++) assert.equal(limiter.attempt("actor", "a").allowed, true);
  assert.equal(limiter.attempt("actor", "a").allowed, false);
  now = 61_000;
  assert.equal(limiter.attempt("actor", "new").allowed, true);
  assert.equal(limiter.size, 1);
  assert.throws(() => createCentralRateLimiter({ maxEntries: 0 }));
});

test("canonical proof detects envelope, key, fingerprint, hash and signature tampering", () => {
  const now = Date.now();
  const envelope: CentralEnvelope = { version: 1, instanceId: "central-offline-test", recordId: randomUUID(), code: randomUUID(), actorId: "actor", signer: { id: "s", name: "N", role: "R", documentId: "52998224725", kind: "SERVIDOR", employeeId: "e", personId: "p", accountUserId: null, validUntil: "2035-01-01T00:00:00.000Z" }, documentType: { id: "t", name: "Contrato" }, file: { filename: "a.txt", mimeType: "text/plain", byteLength: 1, hashSha256: centralHash("a") }, method: "INTERNAL", integrationId: null, signedAt: new Date(now).toISOString(), expiresAt: new Date(now + CENTRAL_RETENTION_MS).toISOString() };
  const proof = signCentralInternal(envelope); assert.equal(verifyCentralEvidence(proof), true);
  for (const mutate of [
    (p: typeof proof) => { p.canonical += " "; },
    (p: typeof proof) => { p.envelopeHash = "0".repeat(64); },
    (p: typeof proof) => { p.envelope.file.hashSha256 = "0".repeat(64); },
    (p: typeof proof) => { if (p.kind === "INTERNAL") p.signatureBase64 = "AAAA"; },
    (p: typeof proof) => { if (p.kind === "INTERNAL") p.fingerprint = "0".repeat(64); },
    (p: typeof proof) => { if (p.kind === "INTERNAL") p.publicKeyPem = "invalid"; },
  ]) { const copy = structuredClone(proof); mutate(copy); assert.equal(verifyCentralEvidence(copy), false); }
});
