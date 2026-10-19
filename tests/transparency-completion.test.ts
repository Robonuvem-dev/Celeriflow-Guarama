import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { PGlite } from "@electric-sql/pglite";
import { Prisma, type PrismaClient } from "@prisma/client";
import { defaultTransparencySettings } from "../src/lib/transparencia/presentation-settings";
import { publishedTransparencyCatalog } from "../src/lib/transparencia/consultation-service";
import { buildTransparencyDiscovery, searchTransparencyDiscovery } from "../src/lib/transparencia/discovery";
import { applyDiscoverySettings, discoverySettingsSchema } from "../src/lib/transparencia/discovery-settings";
import { documentSearchSchema, searchPublishedDocuments } from "../src/lib/transparencia/document-search";
import { pageFeedbackSchema, recordPageFeedback } from "../src/lib/transparencia/page-feedback";

test("gestão editorial reorganiza o hub sem republicar consultas desabilitadas", () => {
  const portal = defaultTransparencySettings();
  portal.queries.contratos = { enabled: false };
  const base = buildTransparencyDiscovery(publishedTransparencyCatalog(portal), portal);
  const settings = discoverySettingsSchema.parse({
    sections: [{ id: "pessoal", title: "Equipe municipal", description: "Quadro público", order: 0, enabled: true }, { id: "atendimento", title: "Atendimento", description: "Canais", order: 20, enabled: false }],
    items: [{ id: "servidores", keywords: "holerite público" }],
    links: [{ id: "link-guia", sectionId: "pessoal", title: "Guia de carreira", description: "Orientações públicas sobre carreiras", href: "https://example.org/guia", enabled: true, order: 0, responsible: "Equipe de RH", reviewedAt: "2026-10-19" }],
  });
  const sections = applyDiscoverySettings(base, settings);
  assert.equal(sections[0].title, "Equipe municipal");
  assert.ok(!sections.some(section => section.id === "atendimento"));
  assert.ok(!sections.flatMap(section => section.items).some(item => item.id === "contratos"));
  assert.ok(searchTransparencyDiscovery(sections, "holerite").some(row => row.item.id === "servidores"));
  assert.equal(sections[0].items.find(item => item.id === "link-guia")?.external, true);
  const link = settings.links[0];
  for (const href of ["javascript:alert(1)", "//example.org", "https://usuario:senha@example.org", "/app-domain/usuarios", "/portal/\\example.org"]) {
    assert.equal(discoverySettingsSchema.safeParse({ links: [{ ...link, href }] }).success, false, href);
  }
  assert.equal(discoverySettingsSchema.safeParse({ shortcuts: ["receitas", "receitas"] }).success, false);
});

test("busca documental executa SQL parametrizado e filtra publicação, entidade, ano e consulta", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("prisma/migrations-ibema/20261013010000_transparency_publications/migration.sql", "utf8"));
    await db.exec(`ALTER TABLE "TransparencyPublication" ADD COLUMN "documentKind" TEXT NOT NULL DEFAULT 'OUTRO';
      INSERT INTO "TransparencyPublication" (id,"publicKey","collectionSlug",entity,year,title,"group","referencePeriod",status,"values","publishedAt","updatedAt")
      SELECT 'pub-'||n, 'pub-'||n, 'publicacoes', 'prefeitura', 2026, 'Saúde — RGF '||n, 'Contas públicas', '2026', 'PUBLISHED', '{}', now(), now() FROM generate_series(1,25) n;
      INSERT INTO "TransparencyPublication" (id,"publicKey","collectionSlug",entity,year,title,"group","referencePeriod",status,"values","publishedAt","updatedAt") VALUES
      ('draft','draft','publicacoes','prefeitura',2026,'Saúde RGF rascunho','Contas','2026','DRAFT','{}',null,now()),
      ('withdrawn','withdrawn','publicacoes','prefeitura',2026,'Saúde RGF retirado','Contas','2026','WITHDRAWN','{}',now(),now()),
      ('camara','camara','publicacoes','camara',2026,'Saúde RGF Câmara','Contas','2026','PUBLISHED','{}',now(),now()),
      ('old','old','publicacoes','prefeitura',2024,'Saúde RGF antigo','Contas','2024','PUBLISHED','{}',now(),now()),
      ('disabled','disabled','contratos','prefeitura',2026,'Saúde RGF oculto','Contas','2026','PUBLISHED','{}',now(),now());`);
    const client = { $queryRaw: async (query: Prisma.Sql) => (await db.query(query.text, query.values)).rows } as unknown as Pick<PrismaClient, "$queryRaw">;
    const settings = defaultTransparencySettings();
    settings.entities[1].enabled = false;
    settings.queries.contratos = { enabled: false };
    const query = documentSearchSchema.parse({ q: "saude RGF", page: 2 });
    const result = await searchPublishedDocuments(client, settings, query);
    assert.equal(result.total, 25);
    assert.equal(result.records.length, 5);
    assert.equal(result.pages, 2);
    assert.ok(result.records.every(row => row.publicKey.startsWith("pub-") && !("values" in row) && !("fileUrl" in row)));
    assert.equal((await searchPublishedDocuments(client, settings, { ...query, page: 999 })).page, 2);
    assert.equal((await searchPublishedDocuments(client, settings, { ...query, q: "' OR 1=1 --" })).total, 0);
    await assert.rejects(searchPublishedDocuments(client, settings, { ...query, year: "2024" }), /não publicados/);
    await assert.rejects(searchPublishedDocuments(client, settings, { ...query, entity: "camara" }), /não publicados/);
    await assert.rejects(searchPublishedDocuments(client, settings, { ...query, collection: "contratos" }), /não publicados/);
  } finally { await db.close(); }
});

test("avaliação da página possui persistência própria, idempotência e limpeza por retenção", async () => {
  const db = new PGlite();
  try {
    await db.exec(await readFile("prisma/migrations-ibema/20261019010000_transparency_page_feedback/migration.sql", "utf8"));
    const client = { transparencyPageFeedback: {
      create: async ({ data }: { data: { submissionKey: string; page: string; collectionSlug?: string; rating: number; comment: string } }) => {
        try { await db.query(`INSERT INTO "TransparencyPageFeedback" (id,"submissionKey",page,"collectionSlug",rating,comment) VALUES ($1,$2,$3,$4,$5,$6)`, [randomUUID(), data.submissionKey, data.page, data.collectionSlug || null, data.rating, data.comment]); }
        catch (error) { if ((error as { code?: string }).code === "23505") throw new Prisma.PrismaClientKnownRequestError("Duplicada", { code: "P2002", clientVersion: "test" }); throw error; }
      },
      findUnique: async ({ where }: { where: { submissionKey: string } }) => (await db.query(`SELECT * FROM "TransparencyPageFeedback" WHERE "submissionKey"=$1`, [where.submissionKey])).rows[0],
      deleteMany: async ({ where }: { where: { createdAt: { lt: Date } } }) => db.query(`DELETE FROM "TransparencyPageFeedback" WHERE "createdAt" < $1`, [where.createdAt.lt]),
    } } as unknown as Pick<PrismaClient, "transparencyPageFeedback">;
    const input = pageFeedbackSchema.parse({ submissionKey: randomUUID(), page: "HOME", rating: 4, comment: "Informações fáceis de localizar." });
    await db.query(`INSERT INTO "TransparencyPageFeedback" (id,"submissionKey",page,rating,"createdAt") VALUES ('old',$1,'HOME',1,now() - interval '366 days')`, [randomUUID()]);
    await recordPageFeedback(client, input);
    await recordPageFeedback(client, input);
    assert.equal((await db.query<{ count: number }>(`SELECT count(*)::int AS count FROM "TransparencyPageFeedback"`)).rows[0].count, 1);
    await assert.rejects(recordPageFeedback(client, { ...input, rating: 5 }), /outro conteúdo/);
    for (const invalid of [{ ...input, rating: 0 }, { ...input, rating: 6 }, { ...input, comment: "a".repeat(2001) }, { ...input, website: "spam" }, { ...input, page: "CONSULTATION" }, { ...input, collectionSlug: "despesas" }]) assert.equal(pageFeedbackSchema.safeParse(invalid).success, false);
    await assert.rejects(db.query(`INSERT INTO "TransparencyPageFeedback" (id,"submissionKey",page,rating) VALUES ('invalid',$1,'HOME',7)`, [randomUUID()]));
  } finally { await db.close(); }
});
