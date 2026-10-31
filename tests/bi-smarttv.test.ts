import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { after, before, test } from "node:test";
import { eq, sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./helpers/local-drizzle-database";
import { defaultDisplayConfig, displayConfigSchema, displayPeriod, displaySlideIsActive, type DisplayConfig } from "../src/lib/bi/display-model";
import { getDisplayEditor, getPublicDisplay, mutateDisplay, previewDisplay, readDisplayImage, saveDisplayImage } from "../src/lib/bi/display-service";
import { biDisplayChannels, biDisplaySnapshots } from "../src/db/schema/bi-display";
import { queryDisplayDataset } from "../src/db/repositories/administration/bi-display";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { NextRequest } from "next/server";
import proxy from "../src/proxy";

let fixture: Awaited<ReturnType<typeof createLocalDrizzleDatabase>>;
let context: AppContext & { databaseConnection: typeof fixture.connection };
let config: DisplayConfig;
const now = new Date("2026-10-31T15:00:00.000Z");

before(async () => {
  fixture = await createLocalDrizzleDatabase();
  // Minimal independent source schema; exercise the actual migration and repositories.
  await fixture.database.exec(`
    CREATE TABLE "Institution" (id text PRIMARY KEY, name text, "logoUrl" text, "createdAt" timestamp DEFAULT now());
    CREATE TABLE "Secretariat" (id text PRIMARY KEY, name text, "isActive" boolean);
    CREATE TABLE "Department" (id text PRIMARY KEY, name text, "secretariatId" text, "isActive" boolean);
    CREATE TABLE "AdministrativeUnit" (id text PRIMARY KEY, "secretariatId" text, "isActive" boolean);
    CREATE TABLE "Employee" (id text PRIMARY KEY, name text, cpf text, "secretariatId" text, "isActive" boolean);
    CREATE TABLE "InternalDemand" (id text PRIMARY KEY, title text, status text, "secretariatId" text, "departmentId" text, deadline timestamp, "createdAt" timestamp);
    CREATE TABLE "AuditEvent" (id text PRIMARY KEY, "actorUsuarioId" text, "eventType" text, "targetType" text, "targetId" text, "createdAt" timestamp DEFAULT now());
    INSERT INTO "Institution" (id,name) VALUES ('city','Município de Teste');
    INSERT INTO "Secretariat" VALUES ('a','Educação',true),('b','Saúde',true);
    INSERT INTO "Department" VALUES ('da','Ensino','a',true);
    INSERT INTO "AdministrativeUnit" VALUES ('ua','a',true);
    INSERT INTO "Employee" VALUES ('ea','PESSOA PRIVADA','12345678900','a',true),('eb','Pessoa Saúde','99999999999','b',true),('eu','Sem lotação','11111111111',null,true);
    INSERT INTO "InternalDemand" VALUES
      ('d1','ASSUNTO PRIVADO',' CONCLUÍDA ','a',null,null,'2026-10-01'),
      ('d2','Segredo','Cancelada','a',null,null,'2026-10-02'),
      ('d3','Pendente','Aberta',null,'da','2026-10-15','2026-10-03'),
      ('d4','Outra área','Resolvida','b',null,null,'2026-10-04'),
      ('d5','Histórico','Aberta','a',null,'2025-01-10','2025-01-01'),
      ('d0','Sem lotação','Aberta',null,null,null,'2026-10-05');
  `);
  await fixture.database.exec(readFileSync("db/migrations/20261031140000_bi_smarttv/migration.sql", "utf8"));
  context = { database: fixture.connection.db, databaseConnection: fixture.connection, user: { id: "operator", name: "Servidor", email: "operator@example.test", firebaseUid: "test", role: "Administrador", profileCode: "ADMIN_SISTEMA", permissions: JSON.stringify({ modules: { ADMINISTRACAO: { update: true, create: true, issueReports: true } } }), modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null } };
  config = defaultDisplayConfig(randomUUID());
  config.slides[0] = { ...config.slides[0], secretariatId: "a", metrics: ["employees", "demands", "resolvedDemands", "cancelledDemands", "openDemands", "overdueDemands"] };
});
after(async () => { await fixture?.close(); });

test("schema limita objetos, duração e vigência; calendário usa o fuso brasileiro", () => {
  assert.equal(displayConfigSchema.safeParse({ ...config, arbitrarySql: "SELECT *" }).success, false);
  assert.equal(displayConfigSchema.safeParse({ ...config, slides: [{ ...config.slides[0], duration: 2 }] }).success, false);
  assert.equal(displayConfigSchema.safeParse({ ...config, slides: [{ ...config.slides[0], kind: "image" }] }).success, false);
  assert.equal(displayConfigSchema.safeParse({ ...config, slides: [config.slides[0], config.slides[0]] }).success, false);
  assert.deepEqual(displayPeriod("month", new Date("2026-11-01T01:00:00Z")), { start: "2026-10-01", label: "10/2026 até a captura" });
  assert.equal(displaySlideIsActive({ startsAt: "2026-10-31T15:00:00Z", endsAt: "2026-10-31T16:00:00Z" }, now.getTime()), true);
  assert.equal(displaySlideIsActive({ startsAt: "", endsAt: now.toISOString() }, now.getTime()), false);
});

test("proxy libera só a entrada pública e mantém editor e rotas semelhantes autenticados", () => {
  const request = (path: string) => new NextRequest(`https://guarama.celeriflow.com.br${path}`, { headers: { host: "guarama.celeriflow.com.br" } });
  assert.equal(proxy(request("/Smarttv")).headers.get("x-middleware-next"), "1");
  assert.equal(proxy(request("/smarttv")).headers.get("location"), "https://guarama.celeriflow.com.br/Smarttv");
  for (const path of ["/Smarttv/privado", "/SmarttvExtra", "/administracao/bi/smarttv"]) assert.match(proxy(request(path)).headers.get("location") ?? "", /\/login\?/);
});

test("rascunho é privado, publicação congela versão e agregação separa resolução/cancelamento e setor", async () => {
  assert.equal((await getPublicDisplay(fixture.connection, now)).status, "empty");
  await mutateDisplay(context, { operation: "save", revision: 0, config });
  assert.equal((await getPublicDisplay(fixture.connection, now)).slides.length, 0);
  await mutateDisplay(context, { operation: "publish", revision: 1, config });
  const display = await getPublicDisplay(fixture.connection, now);
  assert.equal(display.municipality.name, "Município de Teste");
  assert.deepEqual(display.slides[0].dataset?.metrics, { employees: 1, demands: 3, resolvedDemands: 1, cancelledDemands: 1, openDemands: 1, overdueDemands: 1 });
  assert.deepEqual(display.slides[0].dataset?.chart, [{ name: "Educação", value: 3 }]);
  const serialized = JSON.stringify(display);
  for (const privateValue of ["PESSOA PRIVADA", "12345678900", "ASSUNTO PRIVADO", "createdBy", "secretariatId", "draft"]) assert.ok(!serialized.includes(privateValue), privateValue);
  const draft = { ...config, title: "RASCUNHO PRIVADO" };
  await mutateDisplay(context, { operation: "save", revision: 2, config: draft });
  assert.equal((await getPublicDisplay(fixture.connection, now)).title, config.title);
  await assert.rejects(mutateDisplay(context, { operation: "save", revision: 2, config }), /outro servidor/);
});

test("snapshot persiste entre leitores e só recalcula no intervalo configurado", async () => {
  await fixture.connection.db.execute(sql`INSERT INTO "InternalDemand" VALUES ('d6','Dado novo','Aberta','a',null,null,'2026-10-10')`);
  const cached = await getPublicDisplay(fixture.connection, new Date(now.getTime() + 60_000));
  assert.equal(cached.slides[0].dataset?.metrics.demands, 3);
  const refreshed = await getPublicDisplay(fixture.connection, new Date(now.getTime() + 301_000));
  assert.equal(refreshed.slides[0].dataset?.metrics.demands, 4);
  assert.equal(refreshed.slides[0].capturedAt, new Date(now.getTime() + 301_000).toISOString());
});

test("visão municipal inclui registros sem lotação e mantém soma do comparativo", async () => {
  const dataset = await queryDisplayDataset(fixture.connection.db, { ...config.slides[0], secretariatId: "" }, now);
  assert.equal(dataset.metrics.employees, 3);
  assert.equal(dataset.metrics.demands, 6);
  assert.equal(dataset.chart.reduce((sum, item) => sum + item.value, 0), 6);
  assert.equal(dataset.chart.find(item => item.name === "Sem secretaria")?.value, 1);
  assert.equal(dataset.metrics.resolvedDemands! + dataset.metrics.cancelledDemands! + dataset.metrics.openDemands!, dataset.metrics.demands);
});

test("imagem de rascunho não abre publicamente; retirada e restauração preservam versões", async () => {
  const asset = await saveDisplayImage(context, new Uint8Array([1, 2, 3]), "Comunicado");
  assert.equal(await readDisplayImage(asset.id, undefined, fixture.connection), null);
  assert.ok(await readDisplayImage(asset.id, context));
  const withImage = structuredClone(config);
  withImage.slides.push({ ...config.slides[0], id: randomUUID(), title: "Comunicado", kind: "image", imageId: asset.id, metrics: [], chart: "none" });
  await mutateDisplay(context, { operation: "publish", revision: 3, config: withImage });
  assert.ok(await readDisplayImage(asset.id, undefined, fixture.connection));
  const before = await getDisplayEditor(context);
  await mutateDisplay(context, { operation: "withdraw", revision: 4, config: withImage });
  assert.equal((await getPublicDisplay(fixture.connection, now)).status, "empty");
  assert.equal(await readDisplayImage(asset.id, undefined, fixture.connection), null);
  await mutateDisplay(context, { operation: "restore", revision: 5, versionId: before.versions[1].id });
  const restored = await getDisplayEditor(context);
  assert.equal(restored.publishedVersionId, null);
  assert.equal(restored.config.slides.length, 1);
  assert.equal(restored.versions.length, 2);
});

test("perfis de leitura/edição não publicam; referências inválidas não geram versão", async () => {
  const reader = { ...context, user: { ...context.user, profileCode: "LEITOR", permissions: JSON.stringify({ modules: { ADMINISTRACAO: {} } }) } };
  assert.ok(await getDisplayEditor(reader));
  await assert.rejects(mutateDisplay(reader, { operation: "save", revision: 6, config }), /Acesso negado/);
  const editor = { ...reader, user: { ...reader.user, permissions: JSON.stringify({ modules: { ADMINISTRACAO: { update: true } } }) } };
  await assert.rejects(mutateDisplay(editor, { operation: "publish", revision: 6, config }), /Acesso negado/);
  const publisher = { ...reader, user: { ...reader.user, permissions: JSON.stringify({ modules: { ADMINISTRACAO: { issueReports: true } } }) } };
  await assert.rejects(mutateDisplay(publisher, { operation: "publish", revision: 6, config }), /Acesso negado/);
  const invalid = structuredClone(config); invalid.slides[0].secretariatId = "inexistente";
  await assert.rejects(mutateDisplay(context, { operation: "publish", revision: 6, config: invalid }), /Secretaria não encontrada/);
  assert.equal((await getDisplayEditor(context)).revision, 6);
});

test("vigência elimina páginas da publicação; imagem não vaza dataset oculto", async () => {
  const expiring = structuredClone(config);
  expiring.slides[0].endsAt = "2026-10-31T15:01:00Z";
  expiring.slides.push({ ...expiring.slides[0], id: randomUUID(), endsAt: "", startsAt: "2026-10-31T15:02:00Z", title: "Futura" });
  await mutateDisplay(context, { operation: "publish", revision: 6, config: expiring });
  assert.equal((await getPublicDisplay(fixture.connection, now)).slides.length, 1);
  const after = await getPublicDisplay(fixture.connection, new Date(now.getTime() + 121_000));
  assert.equal(after.slides.length, 1); assert.equal(after.slides[0].title, "Futura");
  assert.ok(after.slides[0].dataset, "nova página ativa obtém dados antes do TTL do snapshot");
  const channel = (await fixture.connection.db.select().from(biDisplayChannels))[0];
  await fixture.connection.db.update(biDisplaySnapshots).set({ capturedAt: new Date(now.getTime() - 31 * 60_000), expiresAt: new Date(now.getTime() + 60 * 60_000) }).where(eq(biDisplaySnapshots.versionId, channel.publishedVersionId!));
  assert.equal((await getPublicDisplay(fixture.connection, new Date(now.getTime() + 121_000))).slides[0].dataset, null);
  const preview = await previewDisplay(context, config);
  assert.equal(preview.version, "preview");
  assert.ok(preview.slides[0].dataset);
});

test("retirada continua possível com referência setorial removida e edição local incompleta", async () => {
  await fixture.connection.db.execute(sql`DELETE FROM "Secretariat" WHERE id='a'`);
  await mutateDisplay(context, { operation: "withdraw", revision: 7, config: { incomplete: true } });
  assert.equal((await getPublicDisplay(fixture.connection, now)).status, "empty");
});

test("cache muda o mês no fuso municipal e suporta intervalos maiores que trinta minutos", async () => {
  const monthly = structuredClone(config);
  monthly.refreshSeconds = 3600;
  monthly.slides[0].period = "month";
  monthly.slides[0].secretariatId = "";
  await mutateDisplay(context, { operation: "publish", revision: 8, config: monthly });
  const october = await getPublicDisplay(fixture.connection, new Date("2026-11-01T02:59:00Z"));
  assert.match(october.slides[0].dataset!.periodLabel, /^10\/2026/);
  const november = await getPublicDisplay(fixture.connection, new Date("2026-11-01T03:01:00Z"));
  assert.match(november.slides[0].dataset!.periodLabel, /^11\/2026/);
  assert.equal(november.slides[0].dataset?.metrics.demands, 0);
  const cached = await getPublicDisplay(fixture.connection, new Date("2026-11-01T03:32:00Z"));
  assert.ok(cached.slides[0].dataset);
  assert.equal(cached.slides[0].capturedAt, november.slides[0].capturedAt);
});
