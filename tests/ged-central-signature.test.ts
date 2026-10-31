import assert from "node:assert/strict";
import { generateKeyPairSync, randomUUID } from "node:crypto";
import { before, after, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { loadMigrationSet } from "../scripts/database-migrate-files.mjs";
import { documents } from "../src/db/schema/registry";
import { documentClasses, documentVersions } from "../src/db/schema/document-workflow";
import { gedCentralSignatures, gedEntries } from "../src/db/schema/ged-management";
import { centralRecords } from "../src/db/schema/signature-central";
import { saveCentralDocumentType, saveCentralSigner, verifyCentralRecord } from "../src/lib/signatures/central-service";
import { signGedVersionInCentral } from "../src/lib/documents/ged-central-signature";
import { gedHash } from "../src/lib/documents/ged-storage";
import { requestGedSignatures } from "../src/lib/documents/ged-service";
import type { AppContext } from "../src/lib/platform/tenant-context";
import type { CentralBlobStore } from "../src/lib/signatures/central-storage";

let fixture: Awaited<ReturnType<typeof createLocalDrizzleDatabase>>;
let context: AppContext & { databaseConnection: typeof fixture.connection };
let signerId: string, typeId: string;
const previousKey = process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM;
const previousInstance = process.env.CELERIFLOW_INSTANCE_ID;
const bytes = Buffer.from("Contrato homologado do acervo, original imutável.");
const files = new Map<string, Buffer>();
let uncertain = true;
const storage: CentralBlobStore = { async put(path, content) { files.set(path, Buffer.from(content)); if (uncertain) { uncertain = false; throw new Error("Resposta Blob perdida"); } }, async get(path) { return files.get(path) ?? null; }, async delete(path) { files.delete(path); } };
before(async () => {
  process.env.CELERIFLOW_INSTANCE_ID = "ged-isolated-test";
  process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM = generateKeyPairSync("ed25519").privateKey.export({ format: "pem", type: "pkcs8" }).toString();
  fixture = await createLocalDrizzleDatabase();
  for (const migration of loadMigrationSet().migrations) await fixture.database.exec(migration.executionSql);
  await fixture.database.exec(`INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('ged-profile','GED_TEST','GED','{}',now()); INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('ged-actor','Ana','ged@example.test','ged-profile',now());`);
  context = { database: fixture.connection.db, databaseConnection: fixture.connection, user: { id: "ged-actor", firebaseUid: "isolated", email: "ged@example.test", name: "Ana", role: "Operadora", profileCode: "OPERADOR", modulePermissions: [{ code: "DOCUMENTOS", canView: true, canEdit: true }, { code: "ASSINATURA_DIGITAL", canView: true, canEdit: true }], allowedBudgetUnitIds: [], employeeId: null, departmentId: "one", secretariatId: null } };
  signerId = (await saveCentralSigner(context, { kind: "CIDADAO", name: "Signatário", role: "Cidadão", documentId: "52998224725", phone: "", mobile: "", email: "", validUntil: "2035-01-01T00:00:00Z", active: true, personId: null, employeeId: null, accountUserId: null, password: "senha-isolada-teste" })).id;
  typeId = (await saveCentralDocumentType(context, { name: "Tipo GED teste", description: "Fixture", active: true })).id;
  const [documentClass] = await fixture.connection.db.insert(documentClasses).values({ code: "GED_TEST", label: "Teste", signaturePolicy: "INTERNAL_ALLOWED" }).returning();
  await fixture.connection.db.insert(documents).values({ id: "ged-doc", title: "Contrato", documentType: "Arquivo", fileUrl: "fixture:original", documentClassId: documentClass.id });
  await fixture.connection.db.insert(documentVersions).values({ id: "ged-version", documentId: "ged-doc", versionNumber: 1, fileUrl: "fixture:original", hashSha256: gedHash(bytes) });
  await fixture.connection.db.insert(gedEntries).values({ documentId: "ged-doc", ownerId: context.user.id, departmentId: "one", filename: "contrato.txt", mimeType: "text/plain", byteLength: bytes.length, editorialStatus: "HOMOLOGADO" });
});
after(async () => { if (previousKey === undefined) delete process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM; else process.env.SIGNATURE_CENTRAL_PRIVATE_KEY_PEM = previousKey; if (previousInstance === undefined) delete process.env.CELERIFLOW_INSTANCE_ID; else process.env.CELERIFLOW_INSTANCE_ID = previousInstance; await fixture?.close(); });

test("assinatura de origem GED preserva intenção durável após falha Blob, reusa UUID e vincula comprovante à versão", async () => {
  const input = { documentId: "ged-doc", versionId: "ged-version", requestId: randomUUID(), signerId, documentTypeId: typeId, method: "INTERNAL" as const, password: "senha-isolada-teste" };
  const dependencies = { connection: fixture.connection, storage, readFile: async (url: string, hash?: string) => { assert.equal(url, "fixture:original"); assert.equal(hash, gedHash(bytes)); return bytes; } };
  await assert.rejects(signGedVersionInCentral(context, input, dependencies), /Operação indisponível/);
  const [pending] = await fixture.connection.db.select().from(centralRecords);
  assert.equal(pending.status, "PENDING");
  assert.equal((await fixture.connection.db.execute(sql`SELECT 1 FROM "GedOperationLease"`)).rows.length, 0);
  assert.equal((await fixture.connection.db.select().from(gedCentralSignatures)).length, 0);
  const signed = await signGedVersionInCentral(context, input, dependencies);
  assert.equal(signed.id, pending.id);
  const retry = await signGedVersionInCentral(context, input, dependencies);
  assert.equal(retry.code, signed.code);
  const [record] = await fixture.connection.db.select().from(centralRecords);
  assert.equal(verifyCentralRecord(record), true);
  assert.equal(record.hashSha256, gedHash(bytes));
  assert.equal((await fixture.connection.db.select().from(gedCentralSignatures))[0].versionId, "ged-version");
  assert.equal((await fixture.connection.db.select().from(documentVersions))[0].fileUrl, "fixture:original");
  assert.equal(files.size, 1);
});

test("origem GED recusa acesso cruzado e política ICP para método interno antes de gravar novo registro", async () => {
  const input = { documentId: "ged-doc", versionId: "ged-version", requestId: randomUUID(), signerId, documentTypeId: typeId, method: "INTERNAL" as const, password: "senha-isolada-teste" };
  const dependencies = { connection: fixture.connection, storage, readFile: async () => bytes };
  await assert.rejects(signGedVersionInCentral({ ...context, user: { ...context.user, id: "other", departmentId: "two" } }, input, dependencies), /escopo/);
  await fixture.connection.db.update(documentClasses).set({ signaturePolicy: "ICP_REQUIRED" }).where(eq(documentClasses.code, "GED_TEST"));
  await assert.rejects(signGedVersionInCentral(context, input, dependencies), /política/);
  assert.equal((await fixture.connection.db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "SignatureCentralRecord"`)).rows[0].total, 1);
});

test("solicitação interna compartilha a transação GED e reserva somente a versão homologada vigente", { timeout: 15_000 }, async () => {
  const [documentClass] = await fixture.connection.db.insert(documentClasses).values({ code: "GED_REQUEST_TEST", label: "Teste de solicitação", signaturePolicy: "INTERNAL_ALLOWED" }).returning();
  await fixture.connection.db.insert(documents).values({ id: "ged-request", title: "Versão exata", documentType: "Arquivo", fileUrl: "fixture:request", documentClassId: documentClass.id });
  await fixture.connection.db.insert(documentVersions).values([1, 2].map(number => ({ id: `ged-request-v${number}`, documentId: "ged-request", versionNumber: number, fileUrl: "fixture:request", hashSha256: gedHash(bytes), publicValidationCode: `CFV-${String(number).repeat(20)}` })));
  await fixture.connection.db.insert(gedEntries).values({ documentId: "ged-request", ownerId: context.user.id, departmentId: "one", filename: "contrato.txt", mimeType: "text/plain", byteLength: bytes.length, editorialStatus: "HOMOLOGADO" });
  const requested = await requestGedSignatures(context, "ged-request", [context.user.id]);
  assert.equal(requested.documentVersionId, "ged-request-v2");
  const rows = await fixture.connection.db.select().from(documentVersions).where(eq(documentVersions.documentId, "ged-request"));
  assert.equal(rows.find(row => row.id === "ged-request-v1")?.status, "FINAL");
  assert.equal(rows.find(row => row.id === "ged-request-v2")?.status, "PENDING_SIGNATURE");
});
