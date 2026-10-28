/**
 * Cenários persistidos para validação do módulo de Cultura, Esporte e Lazer.
 * Pode ser executado novamente sem duplicar os registros de referência.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { createId } from "../src/db/ids";
import { secretariats, departments, roles, employees } from "../src/db/schema/administration";
import { people } from "../src/db/schema/people";
import { companies, suppliers, realEstates, documents } from "../src/db/schema/registry";
import { assets, assetCategories } from "../src/db/schema/assets";
import { documentFolders } from "../src/db/schema/document-workflow";
import { financialYears } from "../src/db/schema/finance-years";
import { purchaseProcesses } from "../src/db/schema/procurement-core";
import { culturalAgents, culturalSpaces, culturalProjects, culturalEvents, culturalActivities, culturalReservations, culturalHeritages, culturalCouncils, culturalFunds } from "../src/db/schema/culture";
import { seedBudgetUnits, seedResourceSources, seedExpenseNatures, seedAppropriations, seedCommitments } from "./specialized-seed-finance";

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

async function main() {
  const secretariat = (await db.select().from(secretariats).where(eq(secretariats.name, "Secretaria de Cultura e Turismo")).limit(1))[0]
    ?? (await db.insert(secretariats).values({ name: "Secretaria de Cultura e Turismo", acronym: "SECULT" }).returning())[0];
  const department = (await db.select().from(departments).where(and(eq(departments.name, "Departamento de Cultura e Eventos"), eq(departments.secretariatId, secretariat.id))).limit(1))[0]
    ?? (await db.insert(departments).values({ name: "Departamento de Cultura e Eventos", secretariatId: secretariat.id }).returning())[0];
  const role = (await db.select().from(roles).where(eq(roles.name, "Gestor Cultural")).limit(1))[0]
    ?? (await db.insert(roles).values({ name: "Gestor Cultural", description: "Coordenação de políticas culturais e eventos." }).returning())[0];
  const [coordinator] = await db.insert(employees).values({ name: "Helena Martins", cpf: "00022233344", registration: "CUL-1001", roleId: role.id, secretariatId: secretariat.id, departmentId: department.id }).onConflictDoUpdate({ target: employees.cpf,
    set: { name: "Helena Martins", roleId: role.id, secretariatId: secretariat.id, departmentId: department.id, isActive: true },
  }).returning();

  const [artistPerson] = await db.insert(people).values({ fullName: "Rafael Nunes", cpf: "00033344455", email: "rafael.nunes@exemplo.gov.br", phonePrimary: "(00) 90000-0001" }).onConflictDoUpdate({ target: people.cpf,
    set: { fullName: "Rafael Nunes", status: "Ativo" },
  }).returning();
  const [producerCompany] = await db.insert(companies).values({ corporateName: "Coletivo Aurora Produções Ltda.", cnpj: "22333444000155", emailPrimary: "contato@auroraproducoes.exemplo" }).onConflictDoUpdate({ target: companies.cnpj,
    set: { corporateName: "Coletivo Aurora Produções Ltda.", status: "Ativo" },
  }).returning();
  const supplier = (await db.select().from(suppliers).where(eq(suppliers.companyId, producerCompany.id)).limit(1))[0]
    ?? (await db.insert(suppliers).values({ companyId: producerCompany.id, category: "Eventos e Cultura", status: "Ativo" }).returning())[0];

  const [artist] = await db.insert(culturalAgents).values({ nome: artistPerson.fullName, tipo: "Artista Individual", segmento: "Música", cpfCnpj: artistPerson.cpf, telefone: artistPerson.phonePrimary, email: artistPerson.email, personId: artistPerson.id }).onConflictDoUpdate({ target: culturalAgents.cpfCnpj,
    set: { nome: artistPerson.fullName, tipo: "Artista Individual", segmento: "Música", telefone: artistPerson.phonePrimary, email: artistPerson.email, personId: artistPerson.id, companyId: null, status: "Ativo", active: true },
  }).returning();
  const [collective] = await db.insert(culturalAgents).values({ nome: producerCompany.corporateName, tipo: "Grupo Cultural", segmento: "Artes Cênicas", cpfCnpj: producerCompany.cnpj, email: producerCompany.emailPrimary, companyId: producerCompany.id }).onConflictDoUpdate({ target: culturalAgents.cpfCnpj,
    set: { nome: producerCompany.corporateName, tipo: "Grupo Cultural", segmento: "Artes Cênicas", email: producerCompany.emailPrimary, personId: null, companyId: producerCompany.id, status: "Ativo", active: true },
  }).returning();

  const [realEstate] = await db.insert(realEstates).values({ municipalInsc: "IMOV-CUL-2026-001", propertyType: "Centro Cultural", streetName: "Rua da Cultura", number: "250", status: "Regular" }).onConflictDoUpdate({ target: realEstates.municipalInsc,
    set: { propertyType: "Centro Cultural", streetName: "Rua da Cultura", number: "250", status: "Regular" },
  }).returning();
  const [assetCategory] = await db.insert(assetCategories).values({ code: "CUL-EQP", name: "Equipamentos Culturais", lifeSpan: 120 }).onConflictDoUpdate({ target: assetCategories.code,
    set: { name: "Equipamentos Culturais", isActive: true },
  }).returning();
  const [soundAsset] = await db.insert(assets).values({ patrimonyNumber: "PAT-CUL-2026-001", name: "Sistema de Som do Centro Cultural", status: "Ativo", acquisitionDate: new Date("2025-10-10"), acquisitionValue: 46000, currentValue: 43000, categoryId: assetCategory.id, departmentId: department.id, realEstateId: realEstate.id, responsibleId: coordinator.id }).onConflictDoUpdate({ target: assets.patrimonyNumber,
    set: { status: "Ativo", categoryId: assetCategory.id, departmentId: department.id, realEstateId: realEstate.id, responsibleId: coordinator.id },
  }).returning();
  const space = (await db.select().from(culturalSpaces).where(eq(culturalSpaces.nome, "Centro Cultural Municipal")).limit(1))[0]
    ?? (await db.insert(culturalSpaces).values({ nome: "Centro Cultural Municipal", tipo: "Centro Cultural", capacidade: 350, status: "Disponível", assetId: soundAsset.id, realEstateId: realEstate.id, responsibleEmployeeId: coordinator.id }).returning())[0];
  await db.update(culturalSpaces).set({ tipo: "Centro Cultural", capacidade: 350, status: "Disponível", active: true, assetId: soundAsset.id, realEstateId: realEstate.id, responsibleEmployeeId: coordinator.id }).where(eq(culturalSpaces.id, space.id));

  const financialYear = await db.transaction(async (tx) => {
    // The historical lookup is year-only; the current physical unique key also
    // includes governmentEntityId. Serialize this seed lookup without inventing an ente.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'SPECIALIZED_SEED_FINANCIAL_YEAR:2026'}))`);
    const [existingYear] = await tx.select().from(financialYears).where(eq(financialYears.year, 2026)).limit(1);
    return (existingYear
      ? await tx.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, existingYear.id)).returning()
      : await tx.insert(financialYears).values({ year: 2026, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") }).returning())[0];
  });
  const [budgetUnit] = await db.insert(seedBudgetUnits).values({ code: "UO-CUL-2026", name: "Unidade Orçamentária de Cultura", secretariatId: secretariat.id }).onConflictDoUpdate({ target: seedBudgetUnits.code, set: { name: "Unidade Orçamentária de Cultura", secretariatId: secretariat.id } }).returning();
  const [resourceSource] = await db.insert(seedResourceSources).values({ code: "REC-CUL-001", name: "Recursos para Cultura" }).onConflictDoUpdate({ target: seedResourceSources.code, set: { name: "Recursos para Cultura" } }).returning();
  const [expenseNature] = await db.insert(seedExpenseNatures).values({ code: "NAT-CUL-001", name: "Fomento a Projetos Culturais" }).onConflictDoUpdate({ target: seedExpenseNatures.code, set: { name: "Fomento a Projetos Culturais" } }).returning();
  const [appropriation] = await db.insert(seedAppropriations).values({ code: "DOT-CUL-2026-001", financialYearId: financialYear.id, budgetUnitId: budgetUnit.id, expenseNatureId: expenseNature.id, resourceSourceId: resourceSource.id, initialValue: 180000, updatedValue: 180000, committedValue: 40000 }).onConflictDoUpdate({ target: seedAppropriations.code,
    set: { financialYearId: financialYear.id, budgetUnitId: budgetUnit.id, expenseNatureId: expenseNature.id, resourceSourceId: resourceSource.id },
  }).returning();
  const [purchaseProcess] = await db.insert(purchaseProcesses).values({ number: "PC-CUL-2026-001", object: "Serviços de produção cultural e locação técnica", type: "Comum", modality: "Pregão", estimatedValue: 40000, status: "Em Andamento", secretariatId: secretariat.id }).onConflictDoUpdate({ target: purchaseProcesses.number,
    set: { object: "Serviços de produção cultural e locação técnica", estimatedValue: 40000, status: "Em Andamento", secretariatId: secretariat.id },
  }).returning();
  const [commitment] = await db.insert(seedCommitments).values({ number: "EMP-CUL-2026-001", date: new Date("2026-07-01"), value: 40000, type: "Ordinário", history: "Fomento ao Festival de Inverno Municipal.", appropriationId: appropriation.id, supplierId: supplier.id, status: "Emitido" }).onConflictDoUpdate({ target: seedCommitments.number,
    set: { value: 40000, history: "Fomento ao Festival de Inverno Municipal.", appropriationId: appropriation.id, supplierId: supplier.id, status: "Emitido" },
  }).returning();

  const [project] = await db.insert(culturalProjects).values({ numero: "PROJ-CUL-2026-001", nome: "Festival de Inverno Municipal", descricao: "Programação cultural com música, teatro e oficinas abertas à comunidade.", categoria: "Fomento Cultural", status: "Aprovado", valorSolicitado: 40000, agenteId: collective.id, appropriationId: appropriation.id, commitmentId: commitment.id, purchaseProcessId: purchaseProcess.id }).onConflictDoUpdate({ target: culturalProjects.numero,
    set: { nome: "Festival de Inverno Municipal", descricao: "Programação cultural com música, teatro e oficinas abertas à comunidade.", categoria: "Fomento Cultural", status: "Aprovado", active: true, valorSolicitado: 40000, agenteId: collective.id, appropriationId: appropriation.id, commitmentId: commitment.id, purchaseProcessId: purchaseProcess.id },
  }).returning();
  const event = (await db.select().from(culturalEvents).where(eq(culturalEvents.nome, "Festival de Inverno Municipal 2026")).limit(1))[0]
    ?? (await db.insert(culturalEvents).values({ nome: "Festival de Inverno Municipal 2026", tipo: "Festival", data: new Date("2026-08-15"), local: "Centro Cultural Municipal", publicoAlvo: "Comunidade em geral", status: "Programado", startsAt: new Date("2026-08-15T18:00:00"), endsAt: new Date("2026-08-17T23:00:00"), spaceId: space.id, responsibleEmployeeId: coordinator.id, projectId: project.id }).returning())[0];
  await db.update(culturalEvents).set({ tipo: "Festival", local: "Centro Cultural Municipal", publicoAlvo: "Comunidade em geral", status: "Programado", active: true, startsAt: new Date("2026-08-15T18:00:00"), endsAt: new Date("2026-08-17T23:00:00"), spaceId: space.id, responsibleEmployeeId: coordinator.id, projectId: project.id }).where(eq(culturalEvents.id, event.id));

  const activity = (await db.select().from(culturalActivities).where(eq(culturalActivities.nome, "Oficina de Música Popular")).limit(1))[0]
    ?? (await db.insert(culturalActivities).values({ nome: "Oficina de Música Popular", modalidade: "Música", publicoAlvo: "Adolescentes e adultos", startsAt: new Date("2026-07-20T19:00:00"), endsAt: new Date("2026-10-20T21:00:00"), spaceId: space.id, instructorEmployeeId: coordinator.id, agentId: artist.id }).returning())[0];
  await db.update(culturalActivities).set({ modalidade: "Música", publicoAlvo: "Adolescentes e adultos", status: "Ativa", active: true, spaceId: space.id, instructorEmployeeId: coordinator.id, agentId: artist.id }).where(eq(culturalActivities.id, activity.id));

  const reservation = (await db.select().from(culturalReservations).where(eq(culturalReservations.purpose, "Ensaio aberto da Oficina de Música")).limit(1))[0]
    ?? (await db.insert(culturalReservations).values({ startsAt: new Date("2026-07-25T18:00:00"), endsAt: new Date("2026-07-25T21:00:00"), purpose: "Ensaio aberto da Oficina de Música", status: "Aprovada", spaceId: space.id, personId: artistPerson.id, eventId: event.id }).returning())[0];
  await db.update(culturalReservations).set({ status: "Aprovada", active: true, spaceId: space.id, personId: artistPerson.id, companyId: null, eventId: event.id }).where(eq(culturalReservations.id, reservation.id));

  const heritage = (await db.select().from(culturalHeritages).where(eq(culturalHeritages.nome, "Centro Cultural Municipal")).limit(1))[0]
    ?? (await db.insert(culturalHeritages).values({ nome: "Centro Cultural Municipal", tipo: "Imóvel Histórico", relevanciaCultural: "Referência para a memória e produção cultural local.", situacaoProtecao: "Inventariado", estadoConservacao: "Bom", realEstateId: realEstate.id }).returning())[0];
  await db.update(culturalHeritages).set({ tipo: "Imóvel Histórico", relevanciaCultural: "Referência para a memória e produção cultural local.", situacaoProtecao: "Inventariado", estadoConservacao: "Bom", status: "Ativo", active: true, realEstateId: realEstate.id }).where(eq(culturalHeritages.id, heritage.id));

  const council = (await db.select().from(culturalCouncils).where(eq(culturalCouncils.nome, "Conselho Municipal de Política Cultural")).limit(1))[0]
    ?? (await db.insert(culturalCouncils).values({ nome: "Conselho Municipal de Política Cultural", tipo: "Conselho", responsavel: "Helena Martins" }).returning())[0];
  await db.insert(culturalFunds).values({ nome: "Fundo Municipal de Cultura", descricao: "Fundo de apoio e financiamento das políticas culturais.", appropriationId: appropriation.id }).onConflictDoUpdate({ target: culturalFunds.nome, set: { descricao: "Fundo de apoio e financiamento das políticas culturais.", status: "Ativo", active: true, appropriationId: appropriation.id } });

  const folder = (await db.select().from(documentFolders).where(eq(documentFolders.name, "Cultura e Lazer")).limit(1))[0]
    ?? (await db.insert(documentFolders).values({ name: "Cultura e Lazer", description: "Documentos de eventos, projetos e conselhos culturais.", departmentId: department.id }).returning())[0];
  const projectDocument = (await db.select().from(documents).where(and(eq(documents.title, "Plano de trabalho - Festival de Inverno 2026"), eq(documents.folderId, folder.id))).limit(1))[0]
    ?? (await db.insert(documents).values({ title: "Plano de trabalho - Festival de Inverno 2026", documentType: "Plano de Trabalho", fileUrl: "/logo1.png", folderId: folder.id, status: "Válido" }).returning())[0];
  const reservationDocument = (await db.select().from(documents).where(and(eq(documents.title, "Termo de uso - Ensaio aberto Oficina de Música"), eq(documents.folderId, folder.id))).limit(1))[0]
    ?? (await db.insert(documents).values({ title: "Termo de uso - Ensaio aberto Oficina de Música", documentType: "Termo de Uso", fileUrl: "/logo1.png", folderId: folder.id, status: "Válido" }).returning())[0];
  const councilDocument = (await db.select().from(documents).where(and(eq(documents.title, "Ata do Conselho Municipal de Política Cultural"), eq(documents.folderId, folder.id))).limit(1))[0]
    ?? (await db.insert(documents).values({ title: "Ata do Conselho Municipal de Política Cultural", documentType: "Ata", fileUrl: "/logo1.png", folderId: folder.id, status: "Válido" }).returning())[0];

  await db.execute(sql`INSERT INTO "CulturaProjetoDocumento" (id, "projectId", "documentId", purpose) VALUES (${createId()}, ${project.id}, ${projectDocument.id}, 'Plano de trabalho') ON CONFLICT ("projectId", "documentId") DO UPDATE SET purpose = 'Plano de trabalho'`);
  await db.execute(sql`INSERT INTO "CulturaEventoDocumento" (id, "eventId", "documentId", purpose) VALUES (${createId()}, ${event.id}, ${projectDocument.id}, 'Programação') ON CONFLICT ("eventId", "documentId") DO UPDATE SET purpose = 'Programação'`);
  await db.execute(sql`INSERT INTO "CulturaReservaDocumento" (id, "reservationId", "documentId", purpose) VALUES (${createId()}, ${reservation.id}, ${reservationDocument.id}, 'Termo de uso') ON CONFLICT ("reservationId", "documentId") DO UPDATE SET purpose = 'Termo de uso'`);
  await db.execute(sql`INSERT INTO "CulturaConselhoDocumento" (id, "councilId", "documentId", purpose) VALUES (${createId()}, ${council.id}, ${councilDocument.id}, 'Ata') ON CONFLICT ("councilId", "documentId") DO UPDATE SET purpose = 'Ata'`);

  console.log("Cenários persistidos de Cultura e Lazer criados ou atualizados.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await connection.pool.end();
  });
