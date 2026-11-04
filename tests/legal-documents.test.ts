import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import JSZip from "jszip";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { withDatabaseTransaction } from "../src/db/transaction";
import { saveLegalText } from "../src/db/repositories/registry/master-data-operations";
import { bindLegalDocument, listLegalDocuments, readLegalDatabaseDocument, requireLegalDatabaseDocumentSchema, requireLegalDocumentSchema, saveLegalDatabaseDocument } from "../src/db/repositories/registry/legal-documents";
import { legalDatabaseDocumentInput, legalDocumentInput } from "../src/lib/cadastros/legal-document-policy";
import type { AppContext } from "../src/lib/platform/tenant-context";

let f: Awaited<ReturnType<typeof createLocalDrizzleDatabase>>, actor: AppContext, legalId: string, versionId: string;
before(async () => {
  f = await createLocalDrizzleDatabase();
  await f.database.exec(`
    CREATE TABLE "Usuario" (id text PRIMARY KEY); INSERT INTO "Usuario" VALUES ('a'),('b');
    CREATE TABLE "Folder" (id text PRIMARY KEY,name text);
    CREATE TABLE "Document" (id text PRIMARY KEY,title text,"documentType" text,status text,"folderId" text,"createdAt" timestamp DEFAULT now());
    CREATE TABLE "DocumentVersion" (id text PRIMARY KEY,"documentId" text NOT NULL REFERENCES "Document"(id),"versionNumber" int,"fileUrl" text,"hashSha256" text,status text,"createdAt" timestamp DEFAULT now());
    CREATE TABLE "GedEntry" ("documentId" text PRIMARY KEY,filename text,"mimeType" text,"byteLength" int,origin text,"legacyReference" text,"ownerId" text,"departmentId" text,"editorialStatus" text,archived boolean DEFAULT false);
    CREATE TABLE "GedCheckout" ("documentId" text,"ownerId" text,"closedAt" timestamp);
    CREATE TABLE "GedReview" ("documentId" text,status text,stage int,assignments jsonb);
    CREATE TABLE "AuditEvent" (id text PRIMARY KEY,"eventType" text,"targetType" text,"targetId" text,"actorUsuarioId" text REFERENCES "Usuario"(id),"createdAt" timestamp DEFAULT now());
    INSERT INTO "Document" SELECT 'doc-'||i,'Arquivo '||i,'PDF','Válido',NULL,now() FROM generate_series(1,26) i;
    INSERT INTO "DocumentVersion" SELECT 'v-'||i,'doc-'||i,1,'https://storage.invalid/'||i,repeat('a',64),'FINAL',now() FROM generate_series(1,26) i;
    INSERT INTO "GedEntry" ("documentId",filename,"mimeType","byteLength",origin,"legacyReference","ownerId","editorialStatus") SELECT 'doc-'||i,'arquivo-'||i||'.pdf','application/pdf',10,'UPLOAD','','a','RASCUNHO' FROM generate_series(1,26) i;
  `);
  const historical = await readFile("prisma/migrations-ibema/20261010130000_add_master_data_foundation/migration.sql", "utf8");
  for (const name of ["LegalText", "LegalTextVersion"]) { const start = historical.indexOf(`CREATE TABLE "${name}" (`); await f.database.exec(historical.slice(start, historical.indexOf(";", start) + 1)); }
  await f.database.exec('CREATE UNIQUE INDEX ON "LegalTextVersion"("documentId");');
  actor = { database: f.connection.db, user: { id: "a", firebaseUid: "a", email: "a@example.test", name: "Ana", role: "Operador", profileCode: "EDITOR", permissions: "{}", modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null } };
  legalId = await withDatabaseTransaction(f.connection, tx => saveLegalText(tx, null, { type: "Lei", number: "1", summary: "Fixture", governmentLevel: "MUNICIPAL", issuingBody: "Prefeitura", governmentEntityId: null, publicationDate: null, effectiveFrom: null, effectiveUntil: null }, "Texto"));
  const result = await f.database.query<{ id: string }>('SELECT id FROM "LegalTextVersion" WHERE "legalTextId"=$1', [legalId]); versionId = result.rows[0].id;
});
after(async () => { await f?.close(); });
function input(i: number, role: "ORIGINAL" | "ATTACHMENT" = "ATTACHMENT") { return legalDocumentInput.parse({ legalTextId: legalId, legalTextVersionId: versionId, expectedVersion: 1, documentId: `doc-${i}`, documentVersionId: `v-${i}`, role }); }
function bind(i: number, role: "ORIGINAL" | "ATTACHMENT" = "ATTACHMENT", context = actor) { return withDatabaseTransaction(f.connection, tx => bindLegalDocument(tx, context, input(i, role))); }
function list(page = 1, context = actor) { return withDatabaseTransaction(f.connection, tx => listLegalDocuments(tx, context, versionId, page), { isolationLevel: "repeatable read", accessMode: "read only" }); }

test("sem migração, recurso responde indisponível; migração aplica apenas na fixture", async () => {
  await assert.rejects(withDatabaseTransaction(f.connection, requireLegalDocumentSchema), { status: 503 });
  const migration = await readFile("db/migrations/20261102150000_cf33_legal_documents/migration.sql", "utf8");
  await f.database.exec(`BEGIN; ${migration} ROLLBACK;`);
  await assert.rejects(withDatabaseTransaction(f.connection, requireLegalDocumentSchema), { status: 503 });
  await f.database.exec(migration);
  await withDatabaseTransaction(f.connection, requireLegalDocumentSchema);
});
test("original reutiliza documentId, fixa versão e audita uma vez inclusive no replay", async () => {
  const id = await bind(1, "ORIGINAL"); assert.equal(await bind(1, "ORIGINAL"), id);
  const rows = await f.database.query<{ documentId: string }>('SELECT "documentId" FROM "LegalTextVersion" WHERE id=$1', [versionId]); assert.equal(rows.rows[0].documentId, "doc-1");
  const audits = await f.database.query<{ count: number }>('SELECT count(*)::int AS count FROM "AuditEvent" WHERE "targetId"=$1', [id]); assert.equal(audits.rows[0].count, 1);
  await assert.rejects(bind(2, "ORIGINAL"), { status: 409 });
});
test("anexos paginam 20/2, filtram acesso antes da contagem e não criam cópias no GED", async () => {
  for (let i = 2; i <= 22; i++) await bind(i);
  assert.equal((await list()).rows.length, 20); assert.equal((await list(2)).rows.length, 2); assert.equal((await list()).total, 22);
  const outsider = { ...actor, user: { ...actor.user, id: "b" } }; assert.equal((await list(1, outsider)).total, 0);
  await assert.rejects(bind(23, "ATTACHMENT", outsider));
  const count = await f.database.query<{ count: number }>('SELECT count(*)::int AS count FROM "Document"'); assert.equal(count.rows[0].count, 26);
});
test("alteração futura no GED não muda versão/hash do original jurídico", async () => {
  await f.database.exec(`INSERT INTO "DocumentVersion" VALUES ('v-new','doc-1',2,'https://storage.invalid/new',repeat('b',64),'FINAL',now())`);
  const row = (await list()).rows.find(row => row.documentId === "doc-1")!;
  assert.equal(row.documentVersionId, "v-1"); assert.equal(row.versionNumber, 1); assert.equal(row.hash, "a".repeat(64));
});
test("versão jurídica antiga, documento alterado ou reservado não deixam vínculo parcial", async () => {
  await assert.rejects(withDatabaseTransaction(f.connection, tx => bindLegalDocument(tx, actor, { ...input(23), expectedVersion: 2 })), { status: 409 });
  await assert.rejects(withDatabaseTransaction(f.connection, tx => bindLegalDocument(tx, actor, { ...input(23), documentVersionId: "v-24" })), { status: 409 });
  await f.database.exec(`INSERT INTO "GedCheckout" VALUES ('doc-23','a',NULL)`); await assert.rejects(bind(23), { status: 409 });
  await f.database.exec(`DELETE FROM "GedCheckout"`); assert.equal((await list()).total, 22);
});
test("falha de auditoria reverte vínculo e SQL impede remoção/alteração do histórico", async () => {
  await f.database.exec(`CREATE FUNCTION reject_cf33_audit() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'fixture'; END; $$; CREATE TRIGGER reject_audit BEFORE INSERT ON "AuditEvent" FOR EACH ROW EXECUTE FUNCTION reject_cf33_audit();`);
  await assert.rejects(bind(24)); assert.equal((await list()).total, 22);
  await f.database.exec('DROP TRIGGER reject_audit ON "AuditEvent"');
  await assert.rejects(f.database.exec(`DELETE FROM "LegalTextDocument"`));
  await assert.rejects(f.database.exec(`UPDATE "LegalTextDocument" SET label='Alterado'`));
});
test("vínculos concorrentes idênticos têm o mesmo ID e não duplicam auditoria", async () => {
  const ids = await Promise.all([bind(25), bind(25)]); assert.equal(ids[0], ids[1]); assert.equal((await list()).total, 23);
});
test("documento original legado permanece exclusivo e a nova revisão pode ser anexada sem cópia", async () => {
  await withDatabaseTransaction(f.connection, tx => saveLegalText(tx, legalId, { type: "Lei", number: "1", summary: "Fixture", governmentLevel: "MUNICIPAL", issuingBody: "Prefeitura", governmentEntityId: null, publicationDate: null, effectiveFrom: null, effectiveUntil: null }, "Texto revisado", 1));
  const versions = await f.database.query<{ id: string }>('SELECT id FROM "LegalTextVersion" WHERE "legalTextId"=$1 AND "versionNumber"=2', [legalId]);
  const next = { ...input(1, "ORIGINAL"), legalTextVersionId: versions.rows[0].id, expectedVersion: 2, documentVersionId: "v-new" };
  await assert.rejects(withDatabaseTransaction(f.connection, tx => bindLegalDocument(tx, actor, next)), { status: 409 });
  await withDatabaseTransaction(f.connection, tx => bindLegalDocument(tx, actor, { ...next, role: "ATTACHMENT" }));
  const data = await withDatabaseTransaction(f.connection, tx => listLegalDocuments(tx, actor, next.legalTextVersionId));
  assert.equal(data.rows[0].documentVersionId, "v-new"); assert.equal(data.rows[0].versionNumber, 2);
});


test("33.11: grava Word (.docx) e LibreOffice (.odt) diretamente no banco sem conversão, lista sem ler BLOB e preserva imutabilidade", async () => {
  const migration = await readFile("db/migrations/20261103160000_cf33_database_files_and_import/migration.sql", "utf8");
  await f.database.exec(migration);
  await withDatabaseTransaction(f.connection, requireLegalDatabaseDocumentSchema);

  const versions = await f.database.query<{ id: string }>('SELECT id FROM "LegalTextVersion" WHERE "legalTextId"=$1 AND "versionNumber"=2', [legalId]);
  const v2Id = versions.rows[0].id;

  const docxZip = new JSZip();
  docxZip.file("[Content_Types].xml", "<Types/>");
  docxZip.file("word/document.xml", "<w:document><w:body><w:p><w:r><w:t>Texto integral Word</w:t></w:r></w:p></w:body></w:document>");
  const docxBytes = await docxZip.generateAsync({ type: "nodebuffer" });

  const odtZip = new JSZip();
  odtZip.file("mimetype", "application/vnd.oasis.opendocument.text");
  odtZip.file("content.xml", "<office:document-content><office:body><office:text><text:p>Anexo LibreOffice</text:p></office:text></office:body></office:document-content>");
  const odtBytes = await odtZip.generateAsync({ type: "nodebuffer" });

  const docxInput = legalDatabaseDocumentInput.parse({
    legalTextId: legalId,
    legalTextVersionId: v2Id,
    expectedVersion: 2,
    role: "ORIGINAL",
    filename: "lei-1-consolidada.docx",
    contentBase64: docxBytes.toString("base64"),
  });
  const odtInput = legalDatabaseDocumentInput.parse({
    legalTextId: legalId,
    legalTextVersionId: v2Id,
    expectedVersion: 2,
    role: "ATTACHMENT",
    filename: "anexo-unico.odt",
    contentBase64: odtBytes.toString("base64"),
  });

  const docxId = await withDatabaseTransaction(f.connection, tx => saveLegalDatabaseDocument(tx, actor, docxInput));
  const replayId = await withDatabaseTransaction(f.connection, tx => saveLegalDatabaseDocument(tx, actor, docxInput));
  assert.equal(replayId, docxId);

  const odtId = await withDatabaseTransaction(f.connection, tx => saveLegalDatabaseDocument(tx, actor, odtInput));
  assert.notEqual(odtId, docxId);

  const listed = await withDatabaseTransaction(f.connection, tx => listLegalDocuments(tx, actor, v2Id));
  const dbRows = listed.rows.filter(r => r.storage === "DATABASE");
  assert.equal(dbRows.length, 2);
  assert.ok(dbRows.some(r => r.id === docxId && r.filename === "lei-1-consolidada.docx" && r.role === "ORIGINAL"));
  assert.ok(dbRows.some(r => r.id === odtId && r.filename === "anexo-unico.odt" && r.role === "ATTACHMENT"));

  const downloadedDocx = await withDatabaseTransaction(f.connection, tx => readLegalDatabaseDocument(tx, v2Id, docxId));
  assert.ok(downloadedDocx);
  assert.equal(Buffer.compare(downloadedDocx.bytes, docxBytes), 0);
  assert.equal(downloadedDocx.mimeType, "application/vnd.openxmlformats-officedocument.wordprocessingml.document");

  const downloadedOdt = await withDatabaseTransaction(f.connection, tx => readLegalDatabaseDocument(tx, v2Id, odtId));
  assert.ok(downloadedOdt);
  assert.equal(Buffer.compare(downloadedOdt.bytes, odtBytes), 0);
  assert.equal(downloadedOdt.mimeType, "application/vnd.oasis.opendocument.text");

  await assert.rejects(f.database.exec(`DELETE FROM "LegalTextDatabaseDocument"`));
  await assert.rejects(f.database.exec(`UPDATE "LegalTextDatabaseDocument" SET filename='alterado.docx'`));
  await assert.rejects(f.database.exec(`DELETE FROM "LegalTextDatabaseDocumentBlob"`));
});
