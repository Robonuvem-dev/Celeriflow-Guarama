import { config } from "dotenv";
import { and, asc, desc, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import type { JsonObject } from "../src/db/json";
import { withDatabaseTransaction } from "../src/db/transaction";
import { users, accessProfiles } from "../src/db/schema/identity";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { constructionConfigVersions } from "../src/db/schema/construction-core";
import { constructionDocumentTemplateVersions } from "../src/db/schema/construction-documents";
import { constructionTerms } from "../src/db/schema/construction-portal";
import { constructionDefinitionVersions, constructionPropertyZones, constructionZoneVersions } from "../src/db/schema/construction-viability";
import { createHash } from "node:crypto";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const digest = (value: unknown) => createHash("sha256").update(JSON.stringify(value)).digest("hex");
async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  const db = connection.db;
  try {
    const apply = process.argv.includes("--apply");
    const [actor] = await db.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(and(eq(users.ativo, true), eq(accessProfiles.codigo, "SYSTEM_ADMINISTRATOR"))).limit(1);
    if (!actor) throw new Error("Administrador ativo indisponível.");
    const report = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('AURORA_CONSTRUCTION_NAMES_V2'))`);
      const sourceActor = "CONSTRUCTION_DEMO_SEED";
      const templates = await tx.select().from(constructionDocumentTemplateVersions).where(eq(constructionDocumentTemplateVersions.createdBy, sourceActor)).orderBy(asc(constructionDocumentTemplateVersions.id));
      const definitions = await tx.select().from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.publishedBy, sourceActor)).orderBy(asc(constructionDefinitionVersions.id));
      const configurations = await tx.select().from(constructionConfigVersions).where(eq(constructionConfigVersions.publishedBy, sourceActor)).orderBy(asc(constructionConfigVersions.id));
      const terms = await tx.select().from(constructionTerms).where(eq(constructionTerms.publishedBy, sourceActor)).orderBy(asc(constructionTerms.id));
      const zones = await tx.select().from(constructionZoneVersions).where(and(eq(constructionZoneVersions.publishedBy, sourceActor), eq(constructionZoneVersions.code, "DEMO-ZR"))).orderBy(asc(constructionZoneVersions.id));
      const originalHash = digest({ templates, definitions, configurations, terms, zones });
      const result: Array<{ model: string; sourceId: string; revisionId: string; created: boolean }> = [];
      async function audit(model: string, sourceId: string, revisionId: string, created: boolean) {
        result.push({ model, sourceId, revisionId, created: apply && created });
        if (apply && created) await tx.insert(financialAuditLogs).values({ action: "CONSTRUCTION_CATALOG_NAME_REVISION", entityType: model, entityId: revisionId, authorUsuarioId: actor.id, payload: { sourceId, sourceActor, historicalVersionPreserved: true, fictional: true, authorizationsPreserved: true } });
      }
      for (const source of templates) {
        const id = `aurora-names-v2:template:${source.id}`;
        const [prior] = await tx.select().from(constructionDocumentTemplateVersions).where(eq(constructionDocumentTemplateVersions.id, id)).limit(1);
        const [latest] = await tx.select().from(constructionDocumentTemplateVersions).where(eq(constructionDocumentTemplateVersions.kind, source.kind)).orderBy(desc(constructionDocumentTemplateVersions.version)).limit(1);
        if (!prior && latest?.id !== source.id) throw new Error("Modelo urbanístico possui edição posterior; preservar a configuração do operador.");
        const titles: Record<string, string> = { VIABILITY: "Consulta de viabilidade urbanística", PERMIT: "Alvará de construção — referência documental", OCCUPANCY: "Habite-se — referência documental" };
        if (apply && !prior) await tx.insert(constructionDocumentTemplateVersions).values({ id, kind: source.kind, version: source.version + 1, title: titles[source.kind] || source.kind, body: "Aurora das Veredas — acompanhamento urbanístico\nNúmero: {{number}}\nProtocolo: {{protocol}}\nInteressado: {{applicant}}\nImóveis: {{properties}}\nCategoria: {{category}} / {{locationType}}\nÁrea informada: {{totalArea}} m²\nEmissão: {{issuedAt}}\nDocumento de referência, sem efeito de autorização municipal ou licença de obra.", stamp: "REFERÊNCIA DOCUMENTAL — SEM VALIDADE OFICIAL", signaturePolicy: source.signaturePolicy, createdBy: actor.id });
        await audit("ConstructionDocumentTemplateVersion", source.id, id, !prior);
      }
      const labels: Record<string, string> = { projectReference: "Referência do projeto", territory: "Zoneamento e índices conferidos", urbanRules: "Parâmetros urbanísticos conferidos" };
      for (const source of definitions) {
        const id = `aurora-names-v2:definition:${source.id}`;
        const [prior] = await tx.select().from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.id, id)).limit(1);
        const [latest] = await tx.select().from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, source.kind)).orderBy(desc(constructionDefinitionVersions.version)).limit(1);
        if (!prior && latest?.id !== source.id) throw new Error("Checklist urbanístico possui edição posterior; preservar a configuração do operador.");
        const definition = JSON.parse(JSON.stringify(source.definition)) as Record<string, JsonObject[]>;
        for (const group of ["fields", "checks"]) for (const field of definition[group] || []) if (typeof field.key === "string" && labels[field.key]) field.label = labels[field.key];
        if (apply && !prior) await tx.insert(constructionDefinitionVersions).values({ id, kind: source.kind, version: source.version + 1, definition, publishedBy: actor.id });
        await audit("ConstructionDefinitionVersion", source.id, id, !prior);
      }
      for (const source of configurations) {
        const id = `aurora-names-v2:construction:${source.id}`;
        const [prior] = await tx.select().from(constructionConfigVersions).where(eq(constructionConfigVersions.id, id)).limit(1);
        const [latest] = await tx.select().from(constructionConfigVersions).orderBy(desc(constructionConfigVersions.version)).limit(1);
        if (!prior && latest?.id !== source.id) throw new Error("Parâmetros urbanísticos possuem edição posterior; preservar a configuração do operador.");
        if (apply && !prior) await tx.insert(constructionConfigVersions).values({ id, version: source.version + 1, freeRevisions: source.freeRevisions, correctionDays: source.correctionDays, checkPropertyDebts: source.checkPropertyDebts, subjectIds: source.subjectIds, areaWeights: source.areaWeights, instructions: "Informe as áreas sem sobreposição. Apresente projeto arquitetônico, identificação profissional e documentos do interessado. A análise deve observar a edição vigente dos parâmetros e o rito administrativo aplicável.", publishedBy: actor.id });
        await audit("ConstructionConfigVersion", source.id, id, !prior);
      }
      for (const source of terms) {
        const id = `aurora-names-v2:term:${source.id}`;
        const [prior] = await tx.select().from(constructionTerms).where(eq(constructionTerms.id, id)).limit(1);
        const [latest] = await tx.select().from(constructionTerms).orderBy(desc(constructionTerms.version)).limit(1);
        if (!prior && latest?.id !== source.id) throw new Error("Termo urbanístico possui edição posterior; preservar a configuração do operador.");
        if (apply && !prior) await tx.insert(constructionTerms).values({ id, version: source.version + 1, text: "Declaro que as informações e documentos correspondem ao projeto informado e que tenho autorização para atuar neste processo. Reconheço que o registro da solicitação e os documentos de referência não constituem licença, autorização de obra ou ato municipal oficial, que dependem de análise e emissão pela autoridade competente.", publishedBy: actor.id });
        await audit("ConstructionTermVersion", source.id, id, !prior);
      }
      for (const source of zones) {
        const id = `aurora-names-v2:zone:${source.id}`;
        const [prior] = await tx.select().from(constructionZoneVersions).where(eq(constructionZoneVersions.id, id)).limit(1);
        if (apply && !prior) {
          await tx.insert(constructionZoneVersions).values({ id, code: "AV-ZR-01", version: 1, name: "Zona Residencial Jardim das Acácias", legalBasis: source.legalBasis, startsAt: source.startsAt, endsAt: source.endsAt, allowedPurposeIds: source.allowedPurposeIds, allowedCategories: source.allowedCategories, minimumLandArea: source.minimumLandArea, maxFloorAreaRatio: source.maxFloorAreaRatio, automatic: source.automatic, publishedBy: actor.id });
          await tx.update(constructionPropertyZones).set({ zoneId: id }).where(and(eq(constructionPropertyZones.realEstateId, "construction-demo-property"), eq(constructionPropertyZones.zoneId, source.id)));
        }
        await audit("ConstructionZoneVersion", source.id, id, !prior);
      }
      const after = {
        templates: await tx.select().from(constructionDocumentTemplateVersions).where(eq(constructionDocumentTemplateVersions.createdBy, sourceActor)).orderBy(asc(constructionDocumentTemplateVersions.id)),
        definitions: await tx.select().from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.publishedBy, sourceActor)).orderBy(asc(constructionDefinitionVersions.id)),
        configurations: await tx.select().from(constructionConfigVersions).where(eq(constructionConfigVersions.publishedBy, sourceActor)).orderBy(asc(constructionConfigVersions.id)),
        terms: await tx.select().from(constructionTerms).where(eq(constructionTerms.publishedBy, sourceActor)).orderBy(asc(constructionTerms.id)),
        zones: await tx.select().from(constructionZoneVersions).where(and(eq(constructionZoneVersions.publishedBy, sourceActor), eq(constructionZoneVersions.code, "DEMO-ZR"))).orderBy(asc(constructionZoneVersions.id)),
      };
      if (digest(after) !== originalHash) throw new Error("Edições históricas urbanísticas divergiram.");
      return { mode: apply ? "APPLY" : "PREVIEW", revisions: result, historyPreserved: true };
    }, { timeoutMs: 120000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na revisão urbanística."); process.exitCode = 1; });
