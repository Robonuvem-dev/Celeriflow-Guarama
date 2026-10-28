import { config } from "dotenv";
import { desc, eq, ne, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { Decimal } from "../src/db/decimal";
import type { JsonValue } from "../src/db/json";
import { withDatabaseTransaction } from "../src/db/transaction";
import { departments, employees, secretariats } from "../src/db/schema/administration";
import { people } from "../src/db/schema/people";
import { companies, realEstates, taxpayers } from "../src/db/schema/registry";
import { processSubjects, processTypes } from "../src/db/schema/processes";
import { taxes } from "../src/db/schema/taxation-core";
import { constructionConfigVersions, constructionDistributionVersions, constructionProfessionals } from "../src/db/schema/construction-core";
import { constructionCompanyProfileEvents, constructionCompanyProfiles, constructionProfessionalEmployers, constructionStaffRoles, constructionTerms } from "../src/db/schema/construction-portal";
import { constructionDefinitionVersions, constructionPropertyZones, constructionZoneVersions } from "../src/db/schema/construction-viability";
import { constructionDocumentTemplateVersions } from "../src/db/schema/construction-documents";
import { constructionTaxRuleVersions } from "../src/db/schema/construction-taxation";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Conexão do banco não configurada.");
const connection = createDatabaseConnection(connectionString);
const prefix = "construction-demo-";
const actor = "CONSTRUCTION_DEMO_SEED";
const start = new Date("2026-01-01T00:00:00Z");
const apply = process.argv.includes("--apply");
async function main() {
try {
  if (!apply) {
    console.log("Prévia: cria secretaria/setor/servidores sintéticos, assunto, parâmetros, checklist, termo e zona demonstrativos. Não cria usuários Firebase nem concede permissões a usuários reais. Execute com --apply para persistir.");
  } else {
    const result = await withDatabaseTransaction(connection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('CONSTRUCTION_DEMO_SEED'))`);
      const [official] = await tx.select({ id: constructionConfigVersions.id }).from(constructionConfigVersions).where(ne(constructionConfigVersions.publishedBy, actor)).limit(1);
      if (official) throw new Error("Existe configuração publicada por outro responsável. O seed não substitui parâmetros existentes.");
      const secretariatId = `${prefix}secretariat`; const departmentId = `${prefix}department`;
      await tx.insert(secretariats).values({ id: secretariatId, name: "DEMONSTRAÇÃO — Urbanismo", acronym: "DEMO" }).onConflictDoNothing({ target: secretariats.id });
      await tx.insert(departments).values({ id: departmentId, secretariatId, name: "DEMONSTRAÇÃO — Engenharia", description: "Setor sintético de homologação; não representa lotação municipal oficial." }).onConflictDoNothing({ target: departments.id });
      for (const [key, name, role] of [["analyst", "Fernanda Cristina Moura", "ANALYST"], ["manager", "Roberto Luiz Campos", "MANAGER"], ["inspector", "Marcos Vinícius Teixeira", "INSPECTOR"]] as const) {
        const employeeId = `${prefix}${key}`;
        await tx.insert(employees).values({ id: employeeId, name, registration: `DEMO-${key}`, departmentId, secretariatId }).onConflictDoNothing({ target: employees.id });
        await tx.insert(constructionStaffRoles).values({ employeeId, departmentId, role, startsAt: start }).onConflictDoNothing({ target: [constructionStaffRoles.employeeId, constructionStaffRoles.departmentId, constructionStaffRoles.role, constructionStaffRoles.startsAt] });
      }
      const processTypeId = `${prefix}process-type`; const subjectId = `${prefix}subject`;
      const personId = `${prefix}person`;
      await tx.insert(people).values({ id: personId, fullName: "Eduardo Augusto Figueiredo", cpf: "00000000191", profession: "Engenheiro civil", email: "eduardo.figueiredo@auroradasveredas.example" }).onConflictDoNothing({ target: people.id });
      await tx.insert(constructionProfessionals).values({ id: `${prefix}professional`, personId, professionalType: "ENGINEER", council: "CREA", registration: "DEMO-SEM-VALIDADE", startsAt: start }).onConflictDoNothing({ target: [constructionProfessionals.council, constructionProfessionals.registration] });
      const taxpayerId = `${prefix}taxpayer`; const realEstateId = `${prefix}property`;
      await tx.insert(taxpayers).values({ id: taxpayerId, taxpayerType: "PF", personId, municipalInsc: "DEMO-CPF-001", fiscalNotes: "Registro sintético para homologação; sem obrigações tributárias oficiais." }).onConflictDoNothing({ target: taxpayers.id });
      await tx.insert(realEstates).values({ id: realEstateId, municipalInsc: "DEMO-IMOVEL-001", taxpayerId, registration: "DEMO-SEM-MATRICULA-OFICIAL", streetName: "Rua das Nascentes", number: "1", landArea: 200, builtArea: 0, propertyUse: "Residencial" }).onConflictDoNothing({ target: realEstates.id });
      const companyId = `${prefix}company`; const companyEnd = new Date("2027-12-31T00:00:00Z");
      await tx.insert(companies).values({ id: companyId, corporateName: "Veredas Engenharia e Construções Ltda.", tradeName: "Veredas Engenharia", cnpj: "00000000000191", municipalInsc: "DEMO-CNPJ-001", emailPrimary: "contato@veredasengenharia.example" }).onConflictDoNothing({ target: companies.id });
      await tx.insert(constructionCompanyProfiles).values({ companyId, startsAt: start, endsAt: companyEnd, legalReference: "Habilitação sintética de homologação, sem validade oficial", createdBy: actor }).onConflictDoNothing({ target: constructionCompanyProfiles.companyId });
      const [profile] = await tx.select().from(constructionCompanyProfiles).where(eq(constructionCompanyProfiles.companyId, companyId)).limit(1);
      if (!(await tx.select({ id: constructionCompanyProfileEvents.id }).from(constructionCompanyProfileEvents).where(eq(constructionCompanyProfileEvents.profileId, profile.id)).limit(1)).length) await tx.insert(constructionCompanyProfileEvents).values({ profileId: profile.id, actorId: actor, before: {}, after: JSON.parse(JSON.stringify(profile)) as JsonValue });
      await tx.insert(constructionProfessionalEmployers).values({ professionalId: `${prefix}professional`, companyId, startsAt: start, endsAt: companyEnd }).onConflictDoNothing({ target: [constructionProfessionalEmployers.professionalId, constructionProfessionalEmployers.companyId, constructionProfessionalEmployers.startsAt] });
      await tx.insert(processTypes).values({ id: processTypeId, name: "Licenciamento urbanístico", initialDepartmentId: departmentId, requiresInterested: true }).onConflictDoNothing({ target: processTypes.id });
      await tx.insert(processSubjects).values({ id: subjectId, name: "Obras e parcelamento do solo", processTypeId, initialDepartmentId: departmentId, requiresInterested: true }).onConflictDoNothing({ target: processSubjects.id });
      let [configuration] = await tx.select().from(constructionConfigVersions).where(eq(constructionConfigVersions.publishedBy, actor)).orderBy(desc(constructionConfigVersions.version)).limit(1);
      if (!configuration) [configuration] = await tx.insert(constructionConfigVersions).values({ version: 1, freeRevisions: 1, correctionDays: 30, checkPropertyDebts: true, subjectIds: [subjectId], areaWeights: { existingArea: 1, expandedArea: 1, irregularArea: 1, renovationArea: 0, demolitionArea: 0 }, instructions: "DEMONSTRAÇÃO — parâmetros sintéticos para homologação. Não representam legislação municipal. Informe áreas sem sobreposição e apresente projeto e identificação profissional. Documentos gerados devem exibir DEMONSTRAÇÃO / SEM VALIDADE OFICIAL.", publishedBy: actor }).returning();
      const definitions = [
        { kind: "FORM", definition: { fields: [{ key: "projectReference", label: "Referência do projeto (DEMONSTRAÇÃO)", type: "TEXT", required: true, options: [] }], checks: [], documents: [{ label: "Projeto arquitetônico", required: true }] } },
        { kind: "VIABILITY", definition: { fields: [], checks: [{ key: "territory", label: "Zoneamento e índices conferidos (DEMONSTRAÇÃO)", required: true }], documents: [] } },
        { kind: "PERMIT", definition: { fields: [], checks: [{ key: "urbanRules", label: "Parâmetros urbanísticos conferidos (DEMONSTRAÇÃO)", required: true }, { key: "responsibility", label: "Responsabilidade técnica conferida", required: true }], documents: [{ label: "Projeto arquitetônico", required: true }] } },
        { kind: "INSPECTION", definition: { fields: [], checks: [{ key: "execution", label: "Execução compatível com projeto aprovado", required: true }], documents: [{ label: "Relatório fotográfico", required: true }] } },
        { kind: "COMPLETION", definition: { fields: [], checks: [{ key: "inspections", label: "Vistorias obrigatórias concluídas", required: true }], documents: [{ label: "Relatório de conclusão", required: true }] } },
      ];
      for (const definition of definitions) if (!(await tx.select({ id: constructionDefinitionVersions.id }).from(constructionDefinitionVersions).where(eq(constructionDefinitionVersions.kind, definition.kind)).limit(1)).length) await tx.insert(constructionDefinitionVersions).values({ ...definition, version: 1, publishedBy: actor });
      if (!(await tx.select({ id: constructionTerms.id }).from(constructionTerms).limit(1)).length) await tx.insert(constructionTerms).values({ version: 1, text: "DEMONSTRAÇÃO — Declaro que as informações e documentos enviados correspondem ao projeto informado e que tenho autorização para atuar neste processo. Reconheço que estes dados e documentos são destinados a testes de homologação, sem efeito de licença ou validade oficial. Este texto deve ser substituído pelo termo aprovado pelo município antes da operação oficial.", publishedBy: actor });
      if (!(await tx.select({ id: constructionZoneVersions.id }).from(constructionZoneVersions).where(eq(constructionZoneVersions.code, "DEMO-ZR")).limit(1)).length) await tx.insert(constructionZoneVersions).values({ code: "DEMO-ZR", version: 1, name: "DEMONSTRAÇÃO — Zona residencial", legalBasis: "Regra sintética de teste; não é plano diretor municipal.", startsAt: start, allowedPurposeIds: ["construction-purpose-01"], allowedCategories: ["BUILDING", "SUBDIVISION"], minimumLandArea: new Decimal("100"), maxFloorAreaRatio: new Decimal("1.5"), automatic: true, publishedBy: actor });
      const [zone] = await tx.select({ id: constructionZoneVersions.id }).from(constructionZoneVersions).where(eq(constructionZoneVersions.code, "DEMO-ZR")).orderBy(desc(constructionZoneVersions.version)).limit(1);
      await tx.insert(constructionPropertyZones).values({ realEstateId, zoneId: zone.id }).onConflictDoNothing({ target: constructionPropertyZones.realEstateId });
      if (!(await tx.select({ id: constructionDistributionVersions.id }).from(constructionDistributionVersions).where(eq(constructionDistributionVersions.departmentId, departmentId)).limit(1)).length) await tx.insert(constructionDistributionVersions).values({ departmentId, version: 1, strategy: "LOWEST_LOAD", publishedBy: actor });
      for (const [kind, amount, name] of [["PERMIT", "100", "Taxa de análise e aprovação de projeto"], ["REANALYSIS", "50", "Taxa de reanálise de projeto"], ["HABITE_SE", "75", "Taxa de vistoria para habite-se"], ["SUBDIVISION", "100", "Taxa de análise de parcelamento"], ["INSPECTION", "25", "Taxa de vistoria de obra"], ["CORRECTION", "20", "Taxa de retificação de licença"], ["RENEWAL", "40", "Taxa de renovação de licença"]] as const) {
        const taxId = `${prefix}tax-${kind.toLowerCase()}`;
        await tx.insert(taxes).values({ id: taxId, code: `DEMO-CIVIL-${kind}`, name, taxType: "Taxa", description: "Parâmetro sintético; não corresponde à tabela legal municipal." }).onConflictDoNothing({ target: taxes.id });
        if (!(await tx.select({ id: constructionTaxRuleVersions.id }).from(constructionTaxRuleVersions).where(eq(constructionTaxRuleVersions.kind, kind)).limit(1)).length) await tx.insert(constructionTaxRuleVersions).values({ kind, version: 1, taxId, startsAt: start, fixedAmount: new Decimal(amount), amountPerSquareMeter: new Decimal("0"), legalBasis: "DEMONSTRAÇÃO — regra sintética, sem validade legal", guideInstructions: "DEMONSTRAÇÃO — não efetuar pagamento bancário. Usar baixa/isenção autorizada de teste.", demonstration: true, publishedBy: actor });
      }
      for (const [kind, name] of [["VIABILITY", "Viabilidade"], ["PERMIT", "Alvará"], ["OCCUPANCY", "Habite-se"]] as const) if (!(await tx.select({ id: constructionDocumentTemplateVersions.id }).from(constructionDocumentTemplateVersions).where(eq(constructionDocumentTemplateVersions.kind, kind)).limit(1)).length) await tx.insert(constructionDocumentTemplateVersions).values({ kind, version: 1, title: `DEMONSTRAÇÃO — ${name}`, body: "DEMONSTRAÇÃO / SEM VALIDADE OFICIAL\nNúmero: {{number}}\nProtocolo: {{protocol}}\nInteressado: {{applicant}}\nImóveis: {{properties}}\nCategoria: {{category}} / {{locationType}}\nÁrea preservada no pedido: {{totalArea}} m²\nEmissão: {{issuedAt}}\nEste documento integra o percurso de homologação técnica, com parâmetros sintéticos. Não constitui autorização municipal oficial.", stamp: "DEMONSTRAÇÃO / SEM VALIDADE OFICIAL — documento de teste", signaturePolicy: "INTERNAL_ALLOWED", createdBy: actor });
      return { configurationId: configuration.id, departmentId, processTypeId, subjectId, personId, taxpayerId, realEstateId, mode: "DEMONSTRATION", accessGrantedToRealUsers: false };
    }, { timeoutMs: 60_000 });
    console.log(JSON.stringify(result, null, 2));
  }
} finally { await connection.pool.end(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha ao preparar demonstração civil."); process.exitCode = 1; });
