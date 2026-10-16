import { config } from "dotenv";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { createHash } from "node:crypto";

config({ path: ".env.local", quiet: true }); config({ quiet: true }); neonConfig.webSocketConstructor = ws;
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function main() {
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString: process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL! }) });
  try {
    const apply = process.argv.includes("--apply");
    const actor = await db.usuario.findFirstOrThrow({ where: { ativo: true, perfil: { codigo: "SYSTEM_ADMINISTRATOR" } }, select: { id: true } });
    const report = await db.$transaction(async tx => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('AURORA_CONSTRUCTION_NAMES_V2'))`;
      const sourceActor = "CONSTRUCTION_DEMO_SEED";
      const templates = await tx.constructionDocumentTemplateVersion.findMany({ where: { createdBy: sourceActor }, orderBy: { id: "asc" } });
      const definitions = await tx.constructionDefinitionVersion.findMany({ where: { publishedBy: sourceActor }, orderBy: { id: "asc" } });
      const configurations = await tx.constructionConfigVersion.findMany({ where: { publishedBy: sourceActor }, orderBy: { id: "asc" } });
      const terms = await tx.constructionTermVersion.findMany({ where: { publishedBy: sourceActor }, orderBy: { id: "asc" } });
      const zones = await tx.constructionZoneVersion.findMany({ where: { publishedBy: sourceActor, code: "DEMO-ZR" }, orderBy: { id: "asc" } });
      const originalHash = digest({ templates, definitions, configurations, terms, zones });
      const result: Array<{ model: string; sourceId: string; revisionId: string; created: boolean }> = [];
      async function audit(model: string, sourceId: string, revisionId: string, created: boolean) {
        result.push({ model, sourceId, revisionId, created: apply && created });
        if (apply && created) await tx.financialAuditLog.create({ data: { action: "CONSTRUCTION_CATALOG_NAME_REVISION", entityType: model, entityId: revisionId, authorUsuarioId: actor.id, payload: { sourceId, sourceActor, historicalVersionPreserved: true, fictional: true, authorizationsPreserved: true } } });
      }
      for (const source of templates) {
        const id = `aurora-names-v2:template:${source.id}`;
        const prior = await tx.constructionDocumentTemplateVersion.findUnique({ where: { id } });
        const latest = await tx.constructionDocumentTemplateVersion.findFirst({ where: { kind: source.kind }, orderBy: { version: "desc" } });
        if (!prior && latest?.id !== source.id) throw new Error("Modelo urbanístico possui edição posterior; preservar a configuração do operador.");
        if (apply && !prior) await tx.constructionDocumentTemplateVersion.create({ data: { id, kind: source.kind, version: source.version + 1, title: { VIABILITY: "Consulta de viabilidade urbanística", PERMIT: "Alvará de construção — referência documental", OCCUPANCY: "Habite-se — referência documental" }[source.kind] || source.kind, body: "Aurora das Veredas — acompanhamento urbanístico\nNúmero: {{number}}\nProtocolo: {{protocol}}\nInteressado: {{applicant}}\nImóveis: {{properties}}\nCategoria: {{category}} / {{locationType}}\nÁrea informada: {{totalArea}} m²\nEmissão: {{issuedAt}}\nDocumento de referência, sem efeito de autorização municipal ou licença de obra.", stamp: "REFERÊNCIA DOCUMENTAL — SEM VALIDADE OFICIAL", signaturePolicy: source.signaturePolicy, createdBy: actor.id } });
        await audit("ConstructionDocumentTemplateVersion", source.id, id, !prior);
      }
      const labels: Record<string, string> = { projectReference: "Referência do projeto", territory: "Zoneamento e índices conferidos", urbanRules: "Parâmetros urbanísticos conferidos" };
      for (const source of definitions) {
        const id = `aurora-names-v2:definition:${source.id}`;
        const prior = await tx.constructionDefinitionVersion.findUnique({ where: { id } });
        const latest = await tx.constructionDefinitionVersion.findFirst({ where: { kind: source.kind }, orderBy: { version: "desc" } });
        if (!prior && latest?.id !== source.id) throw new Error("Checklist urbanístico possui edição posterior; preservar a configuração do operador.");
        const definition = JSON.parse(JSON.stringify(source.definition)) as Record<string, Array<Record<string, unknown>>>;
        for (const group of ["fields", "checks"]) for (const field of definition[group] || []) if (typeof field.key === "string" && labels[field.key]) field.label = labels[field.key];
        if (apply && !prior) await tx.constructionDefinitionVersion.create({ data: { id, kind: source.kind, version: source.version + 1, definition: definition as Prisma.InputJsonObject, publishedBy: actor.id } });
        await audit("ConstructionDefinitionVersion", source.id, id, !prior);
      }
      for (const source of configurations) {
        const id = `aurora-names-v2:construction:${source.id}`;
        const prior = await tx.constructionConfigVersion.findUnique({ where: { id } });
        const latest = await tx.constructionConfigVersion.findFirst({ orderBy: { version: "desc" } });
        if (!prior && latest?.id !== source.id) throw new Error("Parâmetros urbanísticos possuem edição posterior; preservar a configuração do operador.");
        if (apply && !prior) await tx.constructionConfigVersion.create({ data: { id, version: source.version + 1, freeRevisions: source.freeRevisions, correctionDays: source.correctionDays, checkPropertyDebts: source.checkPropertyDebts, subjectIds: source.subjectIds, areaWeights: source.areaWeights as Prisma.InputJsonValue, instructions: "Informe as áreas sem sobreposição. Apresente projeto arquitetônico, identificação profissional e documentos do interessado. A análise deve observar a edição vigente dos parâmetros e o rito administrativo aplicável.", publishedBy: actor.id } });
        await audit("ConstructionConfigVersion", source.id, id, !prior);
      }
      for (const source of terms) {
        const id = `aurora-names-v2:term:${source.id}`;
        const prior = await tx.constructionTermVersion.findUnique({ where: { id } });
        const latest = await tx.constructionTermVersion.findFirst({ orderBy: { version: "desc" } });
        if (!prior && latest?.id !== source.id) throw new Error("Termo urbanístico possui edição posterior; preservar a configuração do operador.");
        if (apply && !prior) await tx.constructionTermVersion.create({ data: { id, version: source.version + 1, text: "Declaro que as informações e documentos correspondem ao projeto informado e que tenho autorização para atuar neste processo. Reconheço que o registro da solicitação e os documentos de referência não constituem licença, autorização de obra ou ato municipal oficial, que dependem de análise e emissão pela autoridade competente.", publishedBy: actor.id } });
        await audit("ConstructionTermVersion", source.id, id, !prior);
      }
      for (const source of zones) {
        const id = `aurora-names-v2:zone:${source.id}`;
        const prior = await tx.constructionZoneVersion.findUnique({ where: { id } });
        if (apply && !prior) {
          await tx.constructionZoneVersion.create({ data: { id, code: "AV-ZR-01", version: 1, name: "Zona Residencial Jardim das Acácias", legalBasis: source.legalBasis, startsAt: source.startsAt, endsAt: source.endsAt, allowedPurposeIds: source.allowedPurposeIds, allowedCategories: source.allowedCategories, minimumLandArea: source.minimumLandArea, maxFloorAreaRatio: source.maxFloorAreaRatio, automatic: source.automatic, publishedBy: actor.id } });
          await tx.constructionPropertyZone.updateMany({ where: { realEstateId: "construction-demo-property", zoneId: source.id }, data: { zoneId: id } });
        }
        await audit("ConstructionZoneVersion", source.id, id, !prior);
      }
      const after = {
        templates: await tx.constructionDocumentTemplateVersion.findMany({ where: { createdBy: sourceActor }, orderBy: { id: "asc" } }),
        definitions: await tx.constructionDefinitionVersion.findMany({ where: { publishedBy: sourceActor }, orderBy: { id: "asc" } }),
        configurations: await tx.constructionConfigVersion.findMany({ where: { publishedBy: sourceActor }, orderBy: { id: "asc" } }),
        terms: await tx.constructionTermVersion.findMany({ where: { publishedBy: sourceActor }, orderBy: { id: "asc" } }),
        zones: await tx.constructionZoneVersion.findMany({ where: { publishedBy: sourceActor, code: "DEMO-ZR" }, orderBy: { id: "asc" } }),
      };
      if (digest(after) !== originalHash) throw new Error("Edições históricas urbanísticas divergiram.");
      return { mode: apply ? "APPLY" : "PREVIEW", revisions: result, historyPreserved: true };
    }, { timeout: 120000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na revisão urbanística."); process.exitCode = 1; });
