import assert from "node:assert/strict";
import { before, after, test } from "node:test";
import { readFile } from "node:fs/promises";
import { sql, eq } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { canUseGed } from "../src/lib/documents/ged-access";
import { fillGedTemplate, gedQuerySchema, gedZoneSchema, gedStages, parseGedManifest } from "../src/lib/documents/ged-policy";
import { listManagedDocuments, requireManagedDocument } from "../src/db/repositories/documents/ged";
import { checkoutGed, createGedFolder, moveGedFolder, startGedReview, decideGedReview, saveGedSmartFolder, saveGedTerm, deleteManagedFolder, moveManagedDocument } from "../src/lib/documents/ged-service";
import { gedCheckouts, gedReviews, gedEntries, gedSmartFolders } from "../src/db/schema/ged-management";
import type { AppContext } from "../src/lib/platform/tenant-context";

let fixture: Awaited<ReturnType<typeof createLocalDrizzleDatabase>>;
let a: AppContext & { databaseConnection: typeof fixture.connection };
let b: typeof a;
before(async () => {
  fixture = await createLocalDrizzleDatabase();
  await fixture.database.exec(`
    CREATE TABLE "Usuario" (id text PRIMARY KEY,nome text NOT NULL,email text NOT NULL,senha text DEFAULT 'disabled',"firebaseUid" text,ativo boolean DEFAULT true,"perfilId" text,"employeeId" text,"createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now());
    INSERT INTO "Usuario" (id,nome,email) VALUES ('a','Ana','a@example.test'),('b','Bia','b@example.test'),('c','Clara','c@example.test');
    CREATE TABLE "ConfiguracaoModulo" (codigo text,nome text,"updatedAt" timestamp);
    INSERT INTO "ConfiguracaoModulo" VALUES ('ASSINATURA_DIGITAL','Assinatura Digital',now());
    CREATE TABLE "Folder" (id text PRIMARY KEY,name text NOT NULL,description text,"parentId" text,"departmentId" text,"createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now());
    CREATE TABLE "Document" (id text PRIMARY KEY,title text NOT NULL,"documentType" text NOT NULL,"fileUrl" text NOT NULL,"validUntil" timestamp,status text DEFAULT 'Válido',notes text,"documentClassId" text,"publicLabel" text DEFAULT 'Documento',"retentionMonths" integer DEFAULT 60,"personId" text,"companyId" text,"folderId" text,"createdAt" timestamp DEFAULT now(),"updatedAt" timestamp DEFAULT now());
    CREATE TABLE "DocumentVersion" (id text PRIMARY KEY,"documentId" text NOT NULL,"versionNumber" integer NOT NULL,"fileUrl" text NOT NULL,"hashSha256" text NOT NULL,status text DEFAULT 'FINAL',"lockedAt" timestamp,"finalizedAt" timestamp DEFAULT now(),"publicValidationCode" text,"createdAt" timestamp DEFAULT now(),UNIQUE("documentId","versionNumber"));
    CREATE TABLE "AuditEvent" (id text PRIMARY KEY,"eventType" text,"targetType" text,"targetId" text,"actorUsuarioId" text,"createdAt" timestamp DEFAULT now());
    CREATE TABLE "ProtocolNotification" (id text PRIMARY KEY,"userId" text,"processId" text,"sourceModule" text,"entityType" text,"entityId" text,type text,title text,message text,priority text,"dedupeKey" text,"readAt" timestamp,"createdAt" timestamp DEFAULT now());
    CREATE UNIQUE INDEX dedupe ON "ProtocolNotification"("userId","dedupeKey") WHERE "dedupeKey" IS NOT NULL;
  `);
  await fixture.database.exec(await readFile("db/migrations/20261031120000_ged_management/migration.sql", "utf8"));
  await fixture.database.exec('CREATE TABLE "GedOperationLease" ("documentId" text PRIMARY KEY,token text NOT NULL,"expiresAt" timestamptz NOT NULL)');
  await fixture.database.exec(`
    INSERT INTO "Document" (id,title,"documentType","fileUrl") SELECT 'doc-'||i,'Arquivo '||i,'PDF','https://storage.invalid/'||i FROM generate_series(1,44) i;
    INSERT INTO "DocumentVersion" (id,"documentId","versionNumber","fileUrl","hashSha256") SELECT 'version-'||i,'doc-'||i,1,'https://storage.invalid/'||i,repeat('a',64) FROM generate_series(1,44) i;
    INSERT INTO "GedEntry" ("documentId","ownerId","departmentId",filename,"mimeType") SELECT 'doc-'||i,CASE WHEN i<=41 THEN 'a' ELSE 'c' END,CASE WHEN i<=41 THEN 'one' ELSE 'secret' END,'arquivo.pdf','application/pdf' FROM generate_series(1,44) i;
    INSERT INTO "GedTextPage" (id,"versionId",page,text,normalized,method) VALUES
      ('page-1','version-1',2,'Contrato municipal de aquisição de veículos e automóveis.','contrato municipal de aquisicao de veiculos e automoveis.','PDF_TEXT'),
      ('page-2','version-2',1,'Contrato distante com muitas palavras entre os termos aquisição.','contrato distante com muitas palavras entre os termos aquisicao.','PDF_TEXT'),
      ('page-secret','version-44',1,'segredo clínico exclusivo','segredo clinico exclusivo','OCR');
  `);
  const user: AppContext["user"] = { id: "a", firebaseUid: "a", email: "a@example.test", name: "Ana", role: "Operadora", profileCode: "OPERADOR", modulePermissions: [{ code: "DOCUMENTOS", canView: true, canEdit: true }], allowedBudgetUnitIds: [], employeeId: null, departmentId: "one", secretariatId: null };
  a = { database: fixture.connection.db, databaseConnection: fixture.connection, user };
  b = { ...a, user: { ...user, id: "b", firebaseUid: "b", name: "Bia" } };
});
after(async () => { await fixture?.close(); });

test("a assinatura avulsa não concede leitura ou edição do GED; capacidades explícitas são restritivas", () => {
  const central = { ...a.user, modulePermissions: [{ code: "ASSINATURA_DIGITAL", canView: true, canEdit: true }] };
  assert.equal(canUseGed(central), false);
  assert.equal(canUseGed(central, "edit"), false);
  const explicit = { ...central, permissions: JSON.stringify({ modules: { ASSINATURA_DIGITAL: { blocked: false, ged: { read: true, edit: false } } } }) };
  assert.equal(canUseGed(explicit), true);
  assert.equal(canUseGed(explicit, "edit"), false);
});

test("acervo pagina 20/20/1 no servidor e não revela metadados, trechos ou totais de outro setor", async () => {
  const pages = await Promise.all([1, 2, 3].map(page => listManagedDocuments(a, gedQuerySchema.parse({}), page)));
  assert.deepEqual(pages.map(p => p.documents.length), [20, 20, 1]);
  assert(pages.every(p => p.total === 41));
  assert.equal(new Set(pages.flatMap(p => p.documents.map(d => d.id))).size, 41);
  await assert.rejects(requireManagedDocument(a, "doc-44"), /escopo/);
  const secret = await listManagedDocuments(a, gedQuerySchema.parse({ text: "clínico" }));
  assert.equal(secret.total, 0);
  const emptyDepartment = { ...a, user: { ...a.user, id: "b", departmentId: null } };
  assert.equal((await listManagedDocuments(emptyDepartment, gedQuerySchema.parse({}))).total, 0);
});

test("full text diferencia conteúdo, frase, fragmento e distância e expande thesaurus persistido", async () => {
  const search = async (text: string, mode = "words", distance = 5, thesaurus = false) => (await listManagedDocuments(a, gedQuerySchema.parse({ text, mode, distance, thesaurus }))).documents.map(d => d.id);
  assert.deepEqual(await search("municipal aquisição"), ["doc-1"]);
  assert.equal((await listManagedDocuments(a, gedQuerySchema.parse({ text: "municipal" }))).documents[0].page, 2);
  assert.deepEqual(await search("de aquisição", "phrase"), ["doc-1"]);
  assert.deepEqual(await search("quisic", "fragment"), ["doc-1", "doc-2"]);
  assert.deepEqual(await search("contrato aquisicao", "proximity", 3), ["doc-1"]);
  assert.deepEqual(await search("contrato aquisicao", "proximity", 0), []);
  assert.deepEqual(await search("arquivo"), []); // present only in title/filename
  const admin = { ...a, user: { ...a.user, profileCode: "SYSTEM_ADMINISTRATOR" } };
  await saveGedTerm(admin, "carros", ["automóveis"]);
  assert.deepEqual(await search("carros"), []);
  assert.deepEqual(await search("carros", "words", 5, true), ["doc-1"]);
});

test("checkout concorrente possui um único vencedor e cancelamento por outro usuário é recusado", async () => {
  const result = await Promise.allSettled([checkoutGed(a, "doc-3"), checkoutGed(b, "doc-3")]);
  assert.equal(result.filter(r => r.status === "fulfilled").length, 1);
  const [reservation] = await fixture.connection.db.select().from(gedCheckouts).where(eq(gedCheckouts.documentId, "doc-3"));
  const winner = reservation.ownerId === "a" ? a : b;
  const loser = reservation.ownerId === "a" ? b : a;
  await assert.rejects(checkoutGed(loser, "doc-3", true), /responsável/);
  await checkoutGed(winner, "doc-3", true);
  await checkoutGed(loser, "doc-3");
  await checkoutGed(loser, "doc-3", true);
});

test("árvore aceita quatro níveis e recusa ciclos sem modificar a estrutura", async () => {
  const root = await createGedFolder(a, "Secretaria", null);
  const year = await createGedFolder(a, "2026", root.id);
  const type = await createGedFolder(a, "Contratos", year.id);
  const leaf = await createGedFolder(a, "Compras", type.id);
  await assert.rejects(moveGedFolder(a, root.id, leaf.id, "Secretaria"), /descendente/);
  await assert.rejects(deleteManagedFolder(a, root.id), /Realocar/);
  await moveGedFolder(a, leaf.id, root.id, "Compras realocadas");
  await moveManagedDocument(a, "doc-1", leaf.id);
  await assert.rejects(deleteManagedFolder(a, leaf.id), /Realocar/);
  await moveManagedDocument(a, "doc-1", null);
  await deleteManagedFolder(a, leaf.id);
});

test("consenso espera todos os participantes; homologação exige quatro fases e preserva versão vinculada", async () => {
  const assignments = { ELABORACAO: ["a"], CONSENSO: ["a", "b"], APROVACAO: ["b"], HOMOLOGACAO: ["a"] };
  const review = await startGedReview(a, "doc-4", assignments, "2035-01-01T00:00:00Z");
  await assert.rejects(checkoutGed(b, "doc-4"), /fluxo editorial/);
  await assert.rejects(decideGedReview(b, review.id, "APPROVE", "Tentativa antecipada"), /responsável/);
  await decideGedReview(a, review.id, "APPROVE", "Elaboração concluída");
  await decideGedReview(a, review.id, "APPROVE", "Concordo com a versão");
  let [current] = await fixture.connection.db.select().from(gedReviews).where(eq(gedReviews.id, review.id));
  assert.equal(current.stage, 1);
  await assert.rejects(decideGedReview(a, review.id, "APPROVE", "Repetição"));
  await decideGedReview(b, review.id, "APPROVE", "Consenso concluído");
  await decideGedReview(b, review.id, "APPROVE", "Aprovado");
  await decideGedReview(a, review.id, "APPROVE", "Homologado");
  [current] = await fixture.connection.db.select().from(gedReviews).where(eq(gedReviews.id, review.id));
  assert.equal(current.status, "COMPLETED"); assert.equal(current.versionId, "version-4");
  const [entry] = await fixture.connection.db.select().from(gedEntries).where(eq(gedEntries.documentId, "doc-4"));
  assert.equal(entry.editorialStatus, "HOMOLOGADO");
  const notification = await fixture.connection.db.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM "ProtocolNotification" WHERE "entityId"='doc-4'`);
  assert.equal(notification.rows[0].total, 5);
  assert.equal(gedStages.length, 4);
});

test("pasta inteligente guarda regra validada e o resultado acompanha a mudança de situação", async () => {
  const query = gedQuerySchema.parse({ status: "HOMOLOGADO" });
  const folder = await saveGedSmartFolder(a, "Homologados", query, false);
  const [saved] = await fixture.connection.db.select().from(gedSmartFolders).where(eq(gedSmartFolders.id, folder.id));
  assert.equal((await listManagedDocuments(a, saved.query)).total, 1);
  await fixture.connection.db.update(gedEntries).set({ editorialStatus: "RASCUNHO" }).where(eq(gedEntries.documentId, "doc-4"));
  assert.equal((await listManagedDocuments(a, saved.query)).total, 0);
});

test("zonas validam limites e modelos exigem todos os marcadores sem reinterpretar valores", () => {
  assert.throws(() => gedZoneSchema.parse({ page: 1, label: "Número", x: 0.9, y: 0.1, width: 0.2, height: 0.1 }));
  assert.equal(gedZoneSchema.parse({ page: 1, label: "Número", x: 0.1, y: 0.1, width: 0.2, height: 0.1 }).rotation, 0);
  assert.throws(() => fillGedTemplate("Ofício para {{nome}}", {}), /nome/);
  assert.equal(fillGedTemplate("Ofício {{numero}} para {{nome}}", { numero: "10", nome: "Ana {{outro}}" }), "Ofício 10 para Ana {{outro}}");
});

test("manifesto legado suporta aspas, delimitadores e hierarquia e rejeita nomes repetidos/caminhos relativos", () => {
  const rows = parseGedManifest('filename;title;folderPath;classCode;legacyReference\nscan.pdf;"Contrato; aquisição";Secretaria/2026/Contratos;CONTRATO;CX-1\n');
  assert.equal(rows[0].title, "Contrato; aquisição");
  assert.deepEqual(rows[0].folderPath, ["Secretaria", "2026", "Contratos"]);
  assert.throws(() => parseGedManifest("filename,folderPath\nscan.pdf,../restrito"), /inválido/);
  assert.throws(() => parseGedManifest("filename\nscan.pdf\nscan.pdf"), /repetidos/);
});
