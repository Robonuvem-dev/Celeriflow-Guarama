import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import vm from "node:vm";
import test from "node:test";
import ts from "typescript";
import { PGlite } from "@electric-sql/pglite";
import { drizzle } from "drizzle-orm/pglite";
import type { DatabaseExecutor } from "../src/db/transaction";
import { compareDashboardCards } from "../src/lib/platform/dashboard-order";
import { administrationNavigation } from "../src/app/app-domain/administracao/navigation";
import { listMySignatureHistory } from "../src/db/repositories/documents/signature-history";

test("dashboard: módulos alfabéticos e portais/Configurações no final, inclusive com módulos inativos ausentes", () => {
  const cards = [
    { code: "CONFIGURACOES", name: "Configurações" }, { code: "PORTAL_SERVIDOR", name: "Portal do Servidor" },
    { code: "ATENDIMENTO", name: "Atendimento ao Cidadão" }, { code: "TRANSPARENCIA", name: "Portal Transparência" },
    { code: "TRIBUTACAO", name: "Tributário" }, { code: "PORTAL_CIDADAO", name: "Portal do Cidadão" },
    { code: "SANEAMENTO", name: "Água e Saneamento" }, { code: "SOCIAL", name: "Assistência Social" },
    { code: "ASSINATURA_DIGITAL", name: "Assinatura Digital" }, { code: "ADMINISTRACAO", name: "Administração" },
    { code: "SUPORTE_TECNICO", name: "Suporte Técnico" },
  ];
  assert.deepEqual([...cards].sort(compareDashboardCards).map(card => card.code), ["ADMINISTRACAO", "SANEAMENTO", "ASSINATURA_DIGITAL", "SOCIAL", "ATENDIMENTO", "SUPORTE_TECNICO", "TRIBUTACAO", "PORTAL_CIDADAO", "PORTAL_SERVIDOR", "TRANSPARENCIA", "CONFIGURACOES"]);
  assert.deepEqual(cards.filter(card => !["SOCIAL", "SUPORTE_TECNICO"].includes(card.code)).sort(compareDashboardCards).slice(-5).map(card => card.code), ["TRIBUTACAO", "PORTAL_CIDADAO", "PORTAL_SERVIDOR", "TRANSPARENCIA", "CONFIGURACOES"]);
  const management = administrationNavigation.find(group => group.title === "Inteligência gerencial");
  assert.deepEqual(management?.items.map(item => item.href), ["/administracao/indicadores", "/administracao/auditoria"]);
});

test("histórico Drizzle: escopo do signatário, busca antes de paginar, 20/20/1 e clamp", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE "Document" (id text PRIMARY KEY,title text NOT NULL,"documentType" text NOT NULL);
      CREATE TABLE "DocumentVersion" (id text PRIMARY KEY,"versionNumber" integer,"publicValidationCode" text);
      CREATE TABLE "DocumentSignature" (id text PRIMARY KEY,"documentId" text,"documentVersionId" text,"signerUsuarioId" text,status text,provider text,"signedAt" timestamp,"updatedAt" timestamp);
      INSERT INTO "Document" SELECT 'd-'||i, 'Documento '||i, 'Ofício' FROM generate_series(1,43) i;
      INSERT INTO "DocumentVersion" SELECT 'v-'||i, 1, 'validation-'||i FROM generate_series(1,43) i;
      INSERT INTO "DocumentSignature" SELECT 's-'||LPAD(i::text,3,'0'), 'd-'||i, 'v-'||i, CASE WHEN i=43 THEN 'other-user' ELSE 'my-user' END,
        CASE WHEN i=42 THEN 'PENDING' WHEN i=1 THEN 'CANCELLED' ELSE 'SIGNED' END, 'INTERNAL',
        CASE WHEN i=1 THEN NULL ELSE '2026-10-29T12:00:00'::timestamp END, '2026-10-29T12:00:00'::timestamp
        FROM generate_series(1,43) i;`);
    const database = drizzle(pg) as unknown as DatabaseExecutor;
    const pages = await Promise.all([1, 2, 3].map(page => listMySignatureHistory(database, "my-user", page, "")));
    assert.deepEqual(pages.map(page => page.records.length), [20, 20, 1]);
    assert(pages.every(page => page.total === 41));
    assert.equal(new Set(pages.flatMap(page => page.records.map(row => row.id))).size, 41);
    assert.equal(pages[2].records[0].signedAt, null);
    const last = await listMySignatureHistory(database, "my-user", 999, "");
    assert.equal(last.page, 3);
    const matched = await listMySignatureHistory(database, "my-user", 3, "Documento 41");
    assert.equal(matched.total, 1); assert.equal(matched.page, 1); assert.equal(matched.records[0].title, "Documento 41");
    const other = await listMySignatureHistory(database, "other-user", 1, "");
    assert.equal(other.total, 1); assert.equal(other.records[0].id, "s-043");
    const empty = await listMySignatureHistory(database, "my-user", -1, "inexistente");
    assert.equal(empty.total, 0); assert.equal(empty.page, 1); assert.deepEqual(empty.records, []);
  } finally { await pg.close(); }
});

test("endereço antigo da Auditoria mantém os filtros e a página ao redirecionar para Administração", async () => {
  const filename = resolve("src/app/app-domain/auditoria/page.tsx");
  let destination = "";
  const loaded = { exports: {} as { default: (props: { searchParams: Promise<Record<string, string | string[] | undefined>> }) => Promise<never> } };
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { exports: loaded.exports, module: loaded, URLSearchParams, require: () => ({ redirect: (url: string) => { destination = url; throw new Error("redirect"); } }) }, { filename });
  await assert.rejects(loaded.exports.default({ searchParams: Promise.resolve({ page: "3", targetId: "objeto com espaço", eventType: "DOCUMENT_DOWNLOAD", tag: ["A", "B"], missing: undefined }) }), /redirect/);
  const url = new URL(destination, "http://app.localhost");
  assert.equal(url.pathname, "/administracao/auditoria");
  assert.equal(url.searchParams.get("page"), "3");
  assert.equal(url.searchParams.get("targetId"), "objeto com espaço");
  assert.equal(url.searchParams.get("eventType"), "DOCUMENT_DOWNLOAD");
  assert.deepEqual(url.searchParams.getAll("tag"), ["A", "B"]);
  assert.equal(url.searchParams.has("missing"), false);
});

test("cadastro SQL do módulo é idempotente e preserva permissões históricas e ativação já escolhida", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE "ConfiguracaoModulo" (id text PRIMARY KEY,nome text,codigo text UNIQUE,ativo boolean,"dataAtivacao" timestamp,"createdAt" timestamp,"updatedAt" timestamp);
      CREATE TABLE "UsuarioModulo" ("moduloId" text REFERENCES "ConfiguracaoModulo"(id));
      INSERT INTO "ConfiguracaoModulo" VALUES ('audit-module','Auditoria','AUDITORIA',true,NULL,NOW(),NOW());
      INSERT INTO "UsuarioModulo" VALUES ('audit-module');`);
    const sql = readFileSync("db/migrations/20261029173000_digital_signature_module/migration.sql", "utf8");
    await pg.exec(sql);
    assert.equal((await pg.query<{ ativo: boolean }>('SELECT ativo FROM "ConfiguracaoModulo" WHERE codigo=$1', ["AUDITORIA"])).rows[0].ativo, false);
    assert.equal((await pg.query<{ ativo: boolean }>('SELECT ativo FROM "ConfiguracaoModulo" WHERE codigo=$1', ["ASSINATURA_DIGITAL"])).rows[0].ativo, true);
    await pg.exec('UPDATE "ConfiguracaoModulo" SET ativo=false WHERE codigo=\'ASSINATURA_DIGITAL\'');
    await pg.exec(sql);
    assert.equal((await pg.query<{ ativo: boolean }>('SELECT ativo FROM "ConfiguracaoModulo" WHERE codigo=$1', ["ASSINATURA_DIGITAL"])).rows[0].ativo, false);
    assert.equal((await pg.query('SELECT * FROM "UsuarioModulo"')).rows.length, 1);
    assert.equal((await pg.query('SELECT * FROM "ConfiguracaoModulo"')).rows.length, 2);
  } finally { await pg.close(); }
});

test("assinatura central: permissão própria, identidade da sessão e reautenticação recente antes de assinar", async () => {
  const filename = resolve("src/app/app-domain/assinatura-digital/actions.ts");
  const require = createRequire(filename);
  const calls: string[] = [];
  let principal = { firebaseUid: "session-user", authTime: Math.floor(Date.now() / 1000) };
  let denied = false;
  const loaded = { exports: {} as { signPendingDocument: (id: string, token: string) => Promise<{ error: string | null }> } };
  const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  vm.runInNewContext(output, { exports: loaded.exports, module: loaded, Date, Error, require: (name: string) => {
    if (name === "@/lib/documents/ged-access") return { getUnifiedSignatureContext: async (create: boolean) => { assert.equal(create, true); calls.push("ASSINATURA_DIGITAL:create"); if (denied) throw new Error("Acesso negado"); return { user: { id: "actor", firebaseUid: "session-user" } }; } };
    if (name === "@/lib/platform/tenant-context") return { getTenantContextForModuleOperation: async (code: string, operation: string) => { calls.push(`${code}:${operation}`); if (denied) throw new Error("Acesso negado"); return { user: { id: "actor", firebaseUid: "session-user" } }; } };
    if (name === "@/lib/platform/session") return { getIdTokenPrincipal: async () => principal };
    if (name === "@/lib/signatures/internal-signature") return { registerInternalDocumentSignature: async (_context: unknown, id: string) => { calls.push(`signed:${id}`); } };
    if (name === "next/headers") return { headers: async () => new Map() };
    if (name === "next/cache") return { revalidatePath: () => {} };
    return require(name);
  } }, { filename });
  const sign = loaded.exports.signPendingDocument;
  assert.equal((await sign("document-1", "token")).error, null);
  assert.deepEqual(calls, ["ASSINATURA_DIGITAL:create", "signed:document-1"]);
  calls.length = 0; principal = { ...principal, firebaseUid: "other-user" };
  assert.match((await sign("document-1", "token")).error ?? "", /sessão atual/); assert.equal(calls.length, 1);
  principal = { firebaseUid: "session-user", authTime: Math.floor(Date.now() / 1000) - 600 };
  assert.match((await sign("document-1", "token")).error ?? "", /expirou/);
  principal = { firebaseUid: "session-user", authTime: Math.floor(Date.now() / 1000) + 600 };
  assert.match((await sign("document-1", "token")).error ?? "", /expirou/);
  calls.length = 0; denied = true;
  assert.match((await sign("document-1", "token")).error ?? "", /Acesso negado/); assert.deepEqual(calls, ["ASSINATURA_DIGITAL:create"]);
});

test("ações de modelos anteriores não alteram documentos comuns ou gerenciados e aceitam somente os campos do cadastro", async () => {
  const pg = new PGlite();
  try {
    await pg.exec(`CREATE TABLE "Document" (id text PRIMARY KEY,title text NOT NULL,"documentType" text NOT NULL,"fileUrl" text NOT NULL,notes text,status text,"updatedAt" timestamp DEFAULT now());
      CREATE TABLE "GedEntry" ("documentId" text PRIMARY KEY);
      INSERT INTO "Document" VALUES ('legacy','Modelo anterior','Modelo','original:legacy',NULL,'Ativo',now()),('managed','Modelo gerenciado','Modelo','original:managed',NULL,'Ativo',now()),('ordinary','Contrato','Arquivo','original:contract',NULL,'Válido',now());
      INSERT INTO "GedEntry" VALUES ('managed');`);
    const database = drizzle(pg);
    const filename = resolve("src/app/app-domain/documentos/modelos/actions.ts");
    const require = createRequire(filename);
    const loaded = { exports: {} as { updateModelo: (id: string, data: Record<string, unknown>) => Promise<void>; deleteModelo: (id: string) => Promise<void> } };
    const output = ts.transpileModule(readFileSync(filename, "utf8"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
    vm.runInNewContext(output, { exports: loaded.exports, module: loaded, require: (name: string) => {
      if (name === "@/db/client") return { db: database };
      if (name === "@/db/schema/registry") return require(resolve("src/db/schema/registry.ts"));
      if (name === "@/lib/platform/tenant-context") return { getTenantContextForModuleOperation: async (code: string, operation: string) => { assert.equal(code, "DOCUMENTOS"); assert(["update", "delete"].includes(operation)); } };
      if (name === "next/cache") return { revalidatePath: () => {} };
      return require(name);
    } }, { filename });
    await loaded.exports.updateModelo("legacy", { title: "Modelo revisto", fileUrl: "changed:forbidden", documentType: "Arquivo" });
    const [legacy] = (await pg.query<{ title: string; fileUrl: string; documentType: string }>('SELECT title,"fileUrl","documentType" FROM "Document" WHERE id=\'legacy\'')).rows;
    assert.equal(legacy.title, "Modelo revisto"); assert.equal(legacy.fileUrl, "original:legacy"); assert.equal(legacy.documentType, "Modelo");
    for (const id of ["managed", "ordinary"]) {
      await assert.rejects(loaded.exports.updateModelo(id, { title: "Alteração indevida" }), /não encontrado/);
      await assert.rejects(loaded.exports.deleteModelo(id), /não encontrado/);
    }
    await assert.rejects(loaded.exports.updateModelo("legacy", { status: "Assinado" }));
    await loaded.exports.deleteModelo("legacy");
    const remaining = (await pg.query<{ id: string }>('SELECT id FROM "Document" ORDER BY id')).rows.map(row => row.id);
    assert.deepEqual(remaining, ["managed", "ordinary"]);
  } finally { await pg.close(); }
});
