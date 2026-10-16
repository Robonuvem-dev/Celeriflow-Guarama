import { config } from "dotenv";
import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!connectionString) throw new Error("Conexão do banco não configurada.");
const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }), transactionOptions: { timeout: 60000 } });
const prefix = "construction-demo-";
const actor = "CONSTRUCTION_DEMO_SEED";
const start = new Date("2026-01-01T00:00:00Z");
const apply = process.argv.includes("--apply");
async function main() {
try {
  if (!apply) {
    console.log("Prévia: cria secretaria/setor/servidores sintéticos, assunto, parâmetros, checklist, termo e zona demonstrativos. Não cria usuários Firebase nem concede permissões a usuários reais. Execute com --apply para persistir.");
  } else {
    const result = await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('CONSTRUCTION_DEMO_SEED'))`;
      const official = await tx.constructionConfigVersion.findFirst({ where: { publishedBy: { not: actor } }, select: { id: true } });
      if (official) throw new Error("Existe configuração publicada por outro responsável. O seed não substitui parâmetros existentes.");
      const secretariatId = `${prefix}secretariat`; const departmentId = `${prefix}department`;
      await tx.secretariat.upsert({ where: { id: secretariatId }, create: { id: secretariatId, name: "DEMONSTRAÇÃO — Urbanismo", acronym: "DEMO" }, update: {} });
      await tx.department.upsert({ where: { id: departmentId }, create: { id: departmentId, secretariatId, name: "DEMONSTRAÇÃO — Engenharia", description: "Setor sintético de homologação; não representa lotação municipal oficial." }, update: {} });
      for (const [key, name, role] of [["analyst", "Fernanda Cristina Moura", "ANALYST"], ["manager", "Roberto Luiz Campos", "MANAGER"], ["inspector", "Marcos Vinícius Teixeira", "INSPECTOR"]] as const) {
        const employeeId = `${prefix}${key}`;
        await tx.employee.upsert({ where: { id: employeeId }, create: { id: employeeId, name, registration: `DEMO-${key}`, departmentId, secretariatId }, update: {} });
        await tx.constructionStaffRole.upsert({ where: { employeeId_departmentId_role_startsAt: { employeeId, departmentId, role, startsAt: start } }, create: { employeeId, departmentId, role, startsAt: start }, update: {} });
      }
      const processTypeId = `${prefix}process-type`; const subjectId = `${prefix}subject`;
      const personId = `${prefix}person`;
      await tx.person.upsert({ where: { id: personId }, create: { id: personId, fullName: "Eduardo Augusto Figueiredo", cpf: "00000000191", profession: "Engenheiro civil", email: "eduardo.figueiredo@auroradasveredas.example" }, update: {} });
      await tx.constructionProfessional.upsert({ where: { council_registration: { council: "CREA", registration: "DEMO-SEM-VALIDADE" } }, create: { id: `${prefix}professional`, personId, professionalType: "ENGINEER", council: "CREA", registration: "DEMO-SEM-VALIDADE", startsAt: start }, update: {} });
      const taxpayerId = `${prefix}taxpayer`; const realEstateId = `${prefix}property`;
      await tx.taxpayer.upsert({ where: { id: taxpayerId }, create: { id: taxpayerId, taxpayerType: "PF", personId, municipalInsc: "DEMO-CPF-001", fiscalNotes: "Registro sintético para homologação; sem obrigações tributárias oficiais." }, update: {} });
      await tx.realEstate.upsert({ where: { id: realEstateId }, create: { id: realEstateId, municipalInsc: "DEMO-IMOVEL-001", taxpayerId, registration: "DEMO-SEM-MATRICULA-OFICIAL", streetName: "Rua das Nascentes", number: "1", landArea: 200, builtArea: 0, propertyUse: "Residencial" }, update: {} });
      const companyId = `${prefix}company`; const companyEnd = new Date("2027-12-31T00:00:00Z");
      await tx.company.upsert({ where: { id: companyId }, create: { id: companyId, corporateName: "Veredas Engenharia e Construções Ltda.", tradeName: "Veredas Engenharia", cnpj: "00000000000191", municipalInsc: "DEMO-CNPJ-001", emailPrimary: "contato@veredasengenharia.example" }, update: {} });
      const profile = await tx.constructionCompanyProfile.upsert({ where: { companyId }, create: { companyId, startsAt: start, endsAt: companyEnd, legalReference: "Habilitação sintética de homologação, sem validade oficial", createdBy: actor }, update: {} });
      if (!await tx.constructionCompanyProfileEvent.findFirst({ where: { profileId: profile.id }, select: { id: true } })) await tx.constructionCompanyProfileEvent.create({ data: { profileId: profile.id, actorId: actor, before: {}, after: JSON.parse(JSON.stringify(profile)) } });
      await tx.constructionProfessionalEmployer.upsert({ where: { professionalId_companyId_startsAt: { professionalId: `${prefix}professional`, companyId, startsAt: start } }, create: { professionalId: `${prefix}professional`, companyId, startsAt: start, endsAt: companyEnd }, update: {} });
      await tx.processType.upsert({ where: { id: processTypeId }, create: { id: processTypeId, name: "Licenciamento urbanístico", initialDepartmentId: departmentId, requiresInterested: true }, update: {} });
      await tx.subject.upsert({ where: { id: subjectId }, create: { id: subjectId, name: "Obras e parcelamento do solo", processTypeId, initialDepartmentId: departmentId, requiresInterested: true }, update: {} });
      let configuration = await tx.constructionConfigVersion.findFirst({ where: { publishedBy: actor }, orderBy: { version: "desc" } });
      if (!configuration) configuration = await tx.constructionConfigVersion.create({ data: { version: 1, freeRevisions: 1, correctionDays: 30, checkPropertyDebts: true, subjectIds: [subjectId], areaWeights: { existingArea: 1, expandedArea: 1, irregularArea: 1, renovationArea: 0, demolitionArea: 0 }, instructions: "DEMONSTRAÇÃO — parâmetros sintéticos para homologação. Não representam legislação municipal. Informe áreas sem sobreposição e apresente projeto e identificação profissional. Documentos gerados devem exibir DEMONSTRAÇÃO / SEM VALIDADE OFICIAL.", publishedBy: actor } });
      const definitions = [
        { kind: "FORM", definition: { fields: [{ key: "projectReference", label: "Referência do projeto (DEMONSTRAÇÃO)", type: "TEXT", required: true, options: [] }], checks: [], documents: [{ label: "Projeto arquitetônico", required: true }] } },
        { kind: "VIABILITY", definition: { fields: [], checks: [{ key: "territory", label: "Zoneamento e índices conferidos (DEMONSTRAÇÃO)", required: true }], documents: [] } },
        { kind: "PERMIT", definition: { fields: [], checks: [{ key: "urbanRules", label: "Parâmetros urbanísticos conferidos (DEMONSTRAÇÃO)", required: true }, { key: "responsibility", label: "Responsabilidade técnica conferida", required: true }], documents: [{ label: "Projeto arquitetônico", required: true }] } },
        { kind: "INSPECTION", definition: { fields: [], checks: [{ key: "execution", label: "Execução compatível com projeto aprovado", required: true }], documents: [{ label: "Relatório fotográfico", required: true }] } },
        { kind: "COMPLETION", definition: { fields: [], checks: [{ key: "inspections", label: "Vistorias obrigatórias concluídas", required: true }], documents: [{ label: "Relatório de conclusão", required: true }] } },
      ];
      for (const definition of definitions) if (!await tx.constructionDefinitionVersion.findFirst({ where: { kind: definition.kind }, select: { id: true } })) await tx.constructionDefinitionVersion.create({ data: { ...definition, version: 1, publishedBy: actor } });
      if (!await tx.constructionTermVersion.findFirst({ select: { id: true } })) await tx.constructionTermVersion.create({ data: { version: 1, text: "DEMONSTRAÇÃO — Declaro que as informações e documentos enviados correspondem ao projeto informado e que tenho autorização para atuar neste processo. Reconheço que estes dados e documentos são destinados a testes de homologação, sem efeito de licença ou validade oficial. Este texto deve ser substituído pelo termo aprovado pelo município antes da operação oficial.", publishedBy: actor } });
      if (!await tx.constructionZoneVersion.findFirst({ where: { code: "DEMO-ZR" }, select: { id: true } })) await tx.constructionZoneVersion.create({ data: { code: "DEMO-ZR", version: 1, name: "DEMONSTRAÇÃO — Zona residencial", legalBasis: "Regra sintética de teste; não é plano diretor municipal.", startsAt: start, allowedPurposeIds: ["construction-purpose-01"], allowedCategories: ["BUILDING", "SUBDIVISION"], minimumLandArea: "100", maxFloorAreaRatio: "1.5", automatic: true, publishedBy: actor } });
      const zone = await tx.constructionZoneVersion.findFirstOrThrow({ where: { code: "DEMO-ZR" }, orderBy: { version: "desc" }, select: { id: true } });
      await tx.constructionPropertyZone.upsert({ where: { realEstateId }, create: { realEstateId, zoneId: zone.id }, update: {} });
      if (!await tx.constructionDistributionVersion.findFirst({ where: { departmentId }, select: { id: true } })) await tx.constructionDistributionVersion.create({ data: { departmentId, version: 1, strategy: "LOWEST_LOAD", publishedBy: actor } });
      for (const [kind, amount, name] of [["PERMIT", "100", "Taxa de análise e aprovação de projeto"], ["REANALYSIS", "50", "Taxa de reanálise de projeto"], ["HABITE_SE", "75", "Taxa de vistoria para habite-se"], ["SUBDIVISION", "100", "Taxa de análise de parcelamento"], ["INSPECTION", "25", "Taxa de vistoria de obra"], ["CORRECTION", "20", "Taxa de retificação de licença"], ["RENEWAL", "40", "Taxa de renovação de licença"]] as const) {
        const taxId = `${prefix}tax-${kind.toLowerCase()}`;
        await tx.tax.upsert({ where: { id: taxId }, create: { id: taxId, code: `DEMO-CIVIL-${kind}`, name, taxType: "Taxa", description: "Parâmetro sintético; não corresponde à tabela legal municipal." }, update: {} });
        if (!await tx.constructionTaxRuleVersion.findFirst({ where: { kind }, select: { id: true } })) await tx.constructionTaxRuleVersion.create({ data: { kind, version: 1, taxId, startsAt: start, fixedAmount: amount, amountPerSquareMeter: "0", legalBasis: "DEMONSTRAÇÃO — regra sintética, sem validade legal", guideInstructions: "DEMONSTRAÇÃO — não efetuar pagamento bancário. Usar baixa/isenção autorizada de teste.", demonstration: true, publishedBy: actor } });
      }
      for (const [kind, name] of [["VIABILITY", "Viabilidade"], ["PERMIT", "Alvará"], ["OCCUPANCY", "Habite-se"]] as const) if (!await tx.constructionDocumentTemplateVersion.findFirst({ where: { kind }, select: { id: true } })) await tx.constructionDocumentTemplateVersion.create({ data: { kind, version: 1, title: `DEMONSTRAÇÃO — ${name}`, body: "DEMONSTRAÇÃO / SEM VALIDADE OFICIAL\nNúmero: {{number}}\nProtocolo: {{protocol}}\nInteressado: {{applicant}}\nImóveis: {{properties}}\nCategoria: {{category}} / {{locationType}}\nÁrea preservada no pedido: {{totalArea}} m²\nEmissão: {{issuedAt}}\nEste documento integra o percurso de homologação técnica, com parâmetros sintéticos. Não constitui autorização municipal oficial.", stamp: "DEMONSTRAÇÃO / SEM VALIDADE OFICIAL — documento de teste", signaturePolicy: "INTERNAL_ALLOWED", createdBy: actor } });
      return { configurationId: configuration.id, departmentId, processTypeId, subjectId, personId, taxpayerId, realEstateId, mode: "DEMONSTRATION", accessGrantedToRealUsers: false };
    });
    console.log(JSON.stringify(result, null, 2));
  }
} finally { await db.$disconnect(); }
}
main().catch((error) => { console.error(error instanceof Error ? error.message : "Falha ao preparar demonstração civil."); process.exitCode = 1; });
