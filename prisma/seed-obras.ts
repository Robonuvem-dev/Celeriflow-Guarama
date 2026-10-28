/**
 * Cenários sintéticos e idempotentes para demonstração do módulo Obras e Serviços.
 */
import "dotenv/config";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { secretariats, departments, roles, employees } from "../src/db/schema/administration";
import { companies, suppliers, realEstates, documents } from "../src/db/schema/registry";
import { assets, assetCategories } from "../src/db/schema/assets";
import { materials, materialCategories, warehouses, materialStocks, materialMovements } from "../src/db/schema/assets-stock";
import { documentFolders } from "../src/db/schema/document-workflow";
import { financialYears } from "../src/db/schema/finance-years";
import { purchaseProcesses, purchaseProcessItems } from "../src/db/schema/procurement-core";
import { purchaseRequests, purchaseRequestItems } from "../src/db/schema/procurement-requests";
import { infrastructureWorks, infrastructureMeasurements, infrastructureServices, infrastructureTeams, infrastructureTeamMembers, infrastructureServiceEmployees, infrastructureServiceTeams, infrastructureServiceEquipment, infrastructureServiceDocuments, infrastructureServicePurchases, infrastructureServiceMaterials } from "../src/db/schema/infrastructure";
import { seedBudgetUnits, seedResourceSources, seedExpenseNatures, seedAppropriations, seedCommitments } from "./specialized-seed-finance";

const connection = createDatabaseConnection(process.env.DATABASE_URL!);
const db = connection.db;

const obras = [
  { numero: "OBR-DEMO-2026-001", nome: "Ampliação da Escola Municipal Aurora", descricao: "Construção de quatro novas salas de aula e adequação de acessibilidade.", local: "Rua das Palmeiras, 180, Centro", tipo: "Construção", valorEstimado: 1250000, status: "Em Execução" },
  { numero: "OBR-DEMO-2026-002", nome: "Recapeamento da Avenida Principal", descricao: "Recapeamento asfáltico e sinalização horizontal em trecho urbano.", local: "Avenida Principal, Bairro Novo", tipo: "Pavimentação", valorEstimado: 840000, status: "Concluída" },
  { numero: "OBR-DEMO-2026-003", nome: "Drenagem do Bairro Alvorada", descricao: "Implantação de rede de drenagem pluvial e bocas de lobo.", local: "Bairro Alvorada", tipo: "Drenagem", valorEstimado: 630000, status: "Paralisada" },
  { numero: "OBR-DEMO-2026-004", nome: "Reforma da UBS Jardim Sul", descricao: "Reforma de cobertura, pintura e adequação dos consultórios.", local: "Praça da Comunidade, 10, Jardim Sul", tipo: "Reforma", valorEstimado: 390000, status: "Em Planejamento" },
] as const;

const measurements = [
  { obraNumero: "OBR-DEMO-2026-001", numero: 1, data: new Date("2026-06-15T12:00:00.000Z"), valorMedido: 185000, status: "Aprovada" },
  { obraNumero: "OBR-DEMO-2026-001", numero: 2, data: new Date("2026-07-15T12:00:00.000Z"), valorMedido: 142500, status: "Em Análise" },
  { obraNumero: "OBR-DEMO-2026-002", numero: 1, data: new Date("2026-05-20T12:00:00.000Z"), valorMedido: 840000, status: "Aprovada" },
  { obraNumero: "OBR-DEMO-2026-003", numero: 1, data: new Date("2026-06-10T12:00:00.000Z"), valorMedido: 72000, status: "Rejeitada" },
] as const;

const services = [
  { protocolo: "OSU-DEMO-2026-001", tipo: "Limpeza", descricao: "Capina e roçada nas áreas públicas do Bairro Alvorada.", local: "Bairro Alvorada", status: "Em Andamento" },
  { protocolo: "OSU-DEMO-2026-002", tipo: "Pavimentação", descricao: "Tapa-buracos em vias prioritárias do centro.", local: "Rua São João e vias adjacentes", status: "Aberto" },
  { protocolo: "OSU-DEMO-2026-003", tipo: "Paisagismo", descricao: "Poda preventiva de árvores na Praça da Matriz.", local: "Praça da Matriz", status: "Concluído" },
  { protocolo: "OSU-DEMO-2026-004", tipo: "Iluminação", descricao: "Substituição de luminárias por LED em trecho da avenida.", local: "Avenida Brasil, Jardim Sul", status: "Em Andamento" },
] as const;

async function main() {
  const obraIds = new Map<string, string>();

  for (const obra of obras) {
    const [saved] = await db.insert(infrastructureWorks).values({ ...obra }).onConflictDoUpdate({ target: infrastructureWorks.numero,
      set: { nome: obra.nome, descricao: obra.descricao, local: obra.local, tipo: obra.tipo, valorEstimado: obra.valorEstimado, status: obra.status, active: true },
    }).returning();
    obraIds.set(obra.numero, saved.id);
  }

  for (const measurement of measurements) {
    const obraId = obraIds.get(measurement.obraNumero);
    if (!obraId) throw new Error(`Obra ausente para a medição ${measurement.numero}.`);
    await db.insert(infrastructureMeasurements).values({ obraId, numero: measurement.numero, data: measurement.data, valorMedido: measurement.valorMedido, status: measurement.status }).onConflictDoUpdate({ target: [infrastructureMeasurements.obraId, infrastructureMeasurements.numero],
      set: { data: measurement.data, valorMedido: measurement.valorMedido, status: measurement.status, active: true },
    });
  }

  for (const service of services) {
    await db.insert(infrastructureServices).values({ ...service }).onConflictDoUpdate({ target: infrastructureServices.protocolo,
      set: { tipo: service.tipo, descricao: service.descricao, local: service.local, status: service.status, active: true },
    });
  }

  const worksSecretariat = (await db.select().from(secretariats).where(eq(secretariats.name, "Secretaria de Obras e Serviços Urbanos")).limit(1))[0]
    ?? (await db.insert(secretariats).values({ name: "Secretaria de Obras e Serviços Urbanos", acronym: "SEOBRAS" }).returning())[0];
  const worksDepartment = (await db.select().from(departments).where(and(eq(departments.name, "Departamento de Manutenção Urbana"), eq(departments.secretariatId, worksSecretariat.id))).limit(1))[0]
    ?? (await db.insert(departments).values({ name: "Departamento de Manutenção Urbana", secretariatId: worksSecretariat.id }).returning())[0];
  const role = (await db.select().from(roles).where(eq(roles.name, "Técnico de Manutenção Urbana")).limit(1))[0]
    ?? (await db.insert(roles).values({ name: "Técnico de Manutenção Urbana", description: "Execução de manutenção de infraestrutura urbana." }).returning())[0];

  const [electrician] = await db.insert(employees).values({ name: "Lucas Ferreira", cpf: "00011122233", registration: "OBR-1001", roleId: role.id, secretariatId: worksSecretariat.id, departmentId: worksDepartment.id }).onConflictDoUpdate({ target: employees.cpf,
    set: { name: "Lucas Ferreira", roleId: role.id, secretariatId: worksSecretariat.id, departmentId: worksDepartment.id, isActive: true },
  }).returning();
  const [driver] = await db.insert(employees).values({ name: "Mariana Costa", cpf: "00011122244", registration: "OBR-1002", roleId: role.id, secretariatId: worksSecretariat.id, departmentId: worksDepartment.id }).onConflictDoUpdate({ target: employees.cpf,
    set: { name: "Mariana Costa", roleId: role.id, secretariatId: worksSecretariat.id, departmentId: worksDepartment.id, isActive: true },
  }).returning();

  const [municipalProperty] = await db.insert(realEstates).values({ municipalInsc: "IMOV-OBR-2026-001", propertyType: "Logradouro Público", streetName: "Avenida Brasil", number: "S/N", status: "Regular" }).onConflictDoUpdate({ target: realEstates.municipalInsc,
    set: { propertyType: "Logradouro Público", streetName: "Avenida Brasil", number: "S/N", status: "Regular" },
  }).returning();
  const [lightingCategory] = await db.insert(assetCategories).values({ code: "OBR-ILUM", name: "Infraestrutura de Iluminação Pública", lifeSpan: 120 }).onConflictDoUpdate({ target: assetCategories.code,
    set: { name: "Infraestrutura de Iluminação Pública", isActive: true },
  }).returning();
  const [equipmentCategory] = await db.insert(assetCategories).values({ code: "OBR-EQP", name: "Máquinas e Equipamentos de Obras", lifeSpan: 120 }).onConflictDoUpdate({ target: assetCategories.code,
    set: { name: "Máquinas e Equipamentos de Obras", isActive: true },
  }).returning();
  const [lightingAsset] = await db.insert(assets).values({ patrimonyNumber: "PAT-OBR-2026-001", name: "Conjunto de Postes LED - Avenida Brasil", description: "Trecho de iluminação pública com luminárias LED.", status: "Ativo", acquisitionDate: new Date("2025-12-15"), acquisitionValue: 68000, currentValue: 64000, categoryId: lightingCategory.id, departmentId: worksDepartment.id, realEstateId: municipalProperty.id, responsibleId: electrician.id }).onConflictDoUpdate({ target: assets.patrimonyNumber,
    set: { status: "Ativo", categoryId: lightingCategory.id, departmentId: worksDepartment.id, realEstateId: municipalProperty.id, responsibleId: electrician.id },
  }).returning();
  const [bucketTruck] = await db.insert(assets).values({ patrimonyNumber: "PAT-OBR-2026-002", name: "Caminhão Munck com Cesto Aéreo", status: "Em uso", acquisitionDate: new Date("2024-08-10"), acquisitionValue: 320000, currentValue: 280000, categoryId: equipmentCategory.id, departmentId: worksDepartment.id, responsibleId: driver.id }).onConflictDoUpdate({ target: assets.patrimonyNumber,
    set: { status: "Em uso", categoryId: equipmentCategory.id, departmentId: worksDepartment.id, responsibleId: driver.id },
  }).returning();

  const [lightingMaterialCategory] = await db.insert(materialCategories).values({ code: "MAT-ILUM", name: "Materiais de Iluminação Pública" }).onConflictDoUpdate({ target: materialCategories.code,
    set: { name: "Materiais de Iluminação Pública", isActive: true },
  }).returning();
  const [ledLamp] = await db.insert(materials).values({ code: "MAT-LED-100W", name: "Luminária LED 100W para via pública", unitOfMeasure: "UN", minStock: 10, maxStock: 100, categoryId: lightingMaterialCategory.id }).onConflictDoUpdate({ target: materials.code,
    set: { name: "Luminária LED 100W para via pública", categoryId: lightingMaterialCategory.id },
  }).returning();
  const warehouse = (await db.select().from(warehouses).where(eq(warehouses.name, "Almoxarifado de Obras")).limit(1))[0]
    ?? (await db.insert(warehouses).values({ name: "Almoxarifado de Obras", type: "Setorial", address: "Pátio Municipal", managerId: driver.id }).returning())[0];
  const lampStock = (await db.select().from(materialStocks).where(and(eq(materialStocks.warehouseId, warehouse.id), eq(materialStocks.materialId, ledLamp.id))).limit(1))[0]
    ?? (await db.insert(materialStocks).values({ warehouseId: warehouse.id, materialId: ledLamp.id, quantity: 50, unitCost: 185 }).returning())[0];

  const [company] = await db.insert(companies).values({ corporateName: "Ilumina Brasil Equipamentos Ltda.", cnpj: "11222333000144" }).onConflictDoUpdate({ target: companies.cnpj,
    set: { corporateName: "Ilumina Brasil Equipamentos Ltda." },
  }).returning();
  const supplier = (await db.select().from(suppliers).where(eq(suppliers.companyId, company.id)).limit(1))[0]
    ?? (await db.insert(suppliers).values({ companyId: company.id, category: "Materiais Elétricos", status: "Ativo" }).returning())[0];

  const financialYear = await db.transaction(async (tx) => {
    // Match the source's year-only lookup on the current ente/year physical key.
    await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'SPECIALIZED_SEED_FINANCIAL_YEAR:2026'}))`);
    const [existingYear] = await tx.select().from(financialYears).where(eq(financialYears.year, 2026)).limit(1);
    return (existingYear
      ? await tx.update(financialYears).set({ status: "Aberto" }).where(eq(financialYears.id, existingYear.id)).returning()
      : await tx.insert(financialYears).values({ year: 2026, startDate: new Date("2026-01-01"), endDate: new Date("2026-12-31") }).returning())[0];
  });
  const [budgetUnit] = await db.insert(seedBudgetUnits).values({ code: "UO-OBR-2026", name: "Unidade Orçamentária de Obras", secretariatId: worksSecretariat.id }).onConflictDoUpdate({ target: seedBudgetUnits.code, set: { name: "Unidade Orçamentária de Obras", secretariatId: worksSecretariat.id } }).returning();
  const [resourceSource] = await db.insert(seedResourceSources).values({ code: "REC-OBR-001", name: "Recursos Ordinários" }).onConflictDoUpdate({ target: seedResourceSources.code, set: { name: "Recursos Ordinários" } }).returning();
  const [expenseNature] = await db.insert(seedExpenseNatures).values({ code: "NAT-OBR-001", name: "Manutenção de Iluminação Pública" }).onConflictDoUpdate({ target: seedExpenseNatures.code, set: { name: "Manutenção de Iluminação Pública" } }).returning();
  const [appropriation] = await db.insert(seedAppropriations).values({ code: "DOT-OBR-2026-001", financialYearId: financialYear.id, budgetUnitId: budgetUnit.id, expenseNatureId: expenseNature.id, resourceSourceId: resourceSource.id, initialValue: 250000, updatedValue: 250000, committedValue: 45000 }).onConflictDoUpdate({ target: seedAppropriations.code,
    set: { financialYearId: financialYear.id, budgetUnitId: budgetUnit.id, expenseNatureId: expenseNature.id, resourceSourceId: resourceSource.id },
  }).returning();
  const [commitment] = await db.insert(seedCommitments).values({ number: "EMP-OBR-2026-001", date: new Date("2026-07-01"), value: 45000, type: "Ordinário", history: "Aquisição de materiais para manutenção de iluminação pública.", appropriationId: appropriation.id, supplierId: supplier.id, status: "Emitido" }).onConflictDoUpdate({ target: seedCommitments.number,
    set: { value: 45000, history: "Aquisição de materiais para manutenção de iluminação pública.", appropriationId: appropriation.id, supplierId: supplier.id, status: "Emitido" },
  }).returning();

  const purchaseRequest = await db.transaction(async (tx) => {
    const [created] = await tx.insert(purchaseRequests).values({ number: "SC-OBR-2026-001", object: "Luminárias LED para manutenção urbana", justification: "Reposição de luminárias em vias públicas.", estimatedValue: 9250, status: "Aprovada", priority: "Alta", secretariatId: worksSecretariat.id, departmentId: worksDepartment.id, requesterId: electrician.id }).onConflictDoNothing({ target: purchaseRequests.number }).returning();
    if (created) {
      await tx.insert(purchaseRequestItems).values({ purchaseRequestId: created.id, materialId: ledLamp.id, quantity: 50, estimatedUnitValue: 185 });
      return created;
    }
    return (await tx.update(purchaseRequests).set({ object: "Luminárias LED para manutenção urbana", justification: "Reposição de luminárias em vias públicas.", estimatedValue: 9250, status: "Aprovada", secretariatId: worksSecretariat.id, departmentId: worksDepartment.id, requesterId: electrician.id }).where(eq(purchaseRequests.number, "SC-OBR-2026-001")).returning())[0];
  });
  const purchaseProcess = await db.transaction(async (tx) => {
    const [created] = await tx.insert(purchaseProcesses).values({ number: "PC-OBR-2026-001", object: "Aquisição de luminárias LED", type: "Comum", modality: "Pregão", estimatedValue: 45000, status: "Em Andamento", secretariatId: worksSecretariat.id }).onConflictDoNothing({ target: purchaseProcesses.number }).returning();
    if (created) {
      await tx.insert(purchaseProcessItems).values({ purchaseProcessId: created.id, materialId: ledLamp.id, quantity: 200, estimatedUnitValue: 185 });
      return created;
    }
    return (await tx.update(purchaseProcesses).set({ object: "Aquisição de luminárias LED", estimatedValue: 45000, status: "Em Andamento", secretariatId: worksSecretariat.id }).where(eq(purchaseProcesses.number, "PC-OBR-2026-001")).returning())[0];
  });

  const [fieldTeam] = await db.insert(infrastructureTeams).values({ code: "EQ-OBR-ILUM-01", name: "Equipe de Iluminação Norte", departmentId: worksDepartment.id }).onConflictDoUpdate({ target: infrastructureTeams.code, set: { name: "Equipe de Iluminação Norte", departmentId: worksDepartment.id, isActive: true } }).returning();
  await db.insert(infrastructureTeamMembers).values({ equipeId: fieldTeam.id, employeeId: electrician.id, isLeader: true }).onConflictDoUpdate({ target: [infrastructureTeamMembers.equipeId, infrastructureTeamMembers.employeeId], set: { isLeader: true, isActive: true } });
  await db.insert(infrastructureTeamMembers).values({ equipeId: fieldTeam.id, employeeId: driver.id }).onConflictDoUpdate({ target: [infrastructureTeamMembers.equipeId, infrastructureTeamMembers.employeeId], set: { isActive: true } });

  const gedFolder = (await db.select().from(documentFolders).where(eq(documentFolders.name, "Obras e Serviços Urbanos")).limit(1))[0]
    ?? (await db.insert(documentFolders).values({ name: "Obras e Serviços Urbanos", description: "Documentos técnicos e ordens de serviço." }).returning())[0];
  const gedDocument = (await db.select().from(documents).where(and(eq(documents.title, "Laudo de manutenção - Avenida Brasil"), eq(documents.folderId, gedFolder.id))).limit(1))[0]
    ?? (await db.insert(documents).values({ title: "Laudo de manutenção - Avenida Brasil", documentType: "Laudo Técnico", fileUrl: "/logo1.png", folderId: gedFolder.id, status: "Válido", notes: "Documento técnico vinculado à manutenção de iluminação." }).returning())[0];

  const [lightingService] = await db.select().from(infrastructureServices).where(eq(infrastructureServices.protocolo, "OSU-DEMO-2026-004")).limit(1);
  if (!lightingService) throw new Error("Ordem de iluminação não encontrada.");
  await db.update(infrastructureServices).set({ departmentId: worksDepartment.id, targetAssetId: lightingAsset.id, budgetAppropriationId: appropriation.id, commitmentId: commitment.id, scheduledFor: new Date("2026-07-22"), estimatedCost: 740 }).where(eq(infrastructureServices.id, lightingService.id));
  await db.insert(infrastructureServiceEmployees).values({ obrasServicoId: lightingService.id, employeeId: electrician.id, role: "Eletricista responsável" }).onConflictDoUpdate({ target: [infrastructureServiceEmployees.obrasServicoId, infrastructureServiceEmployees.employeeId], set: { role: "Eletricista responsável", releasedAt: null } });
  await db.insert(infrastructureServiceTeams).values({ obrasServicoId: lightingService.id, equipeId: fieldTeam.id }).onConflictDoUpdate({ target: [infrastructureServiceTeams.obrasServicoId, infrastructureServiceTeams.equipeId], set: { releasedAt: null } });
  await db.insert(infrastructureServiceEquipment).values({ obrasServicoId: lightingService.id, assetId: bucketTruck.id }).onConflictDoUpdate({ target: [infrastructureServiceEquipment.obrasServicoId, infrastructureServiceEquipment.assetId], set: { releasedAt: null } });
  await db.insert(infrastructureServiceDocuments).values({ obrasServicoId: lightingService.id, documentId: gedDocument.id, purpose: "Laudo técnico" }).onConflictDoUpdate({ target: [infrastructureServiceDocuments.obrasServicoId, infrastructureServiceDocuments.documentId], set: { purpose: "Laudo técnico" } });
  await db.insert(infrastructureServicePurchases).values({ obrasServicoId: lightingService.id, purchaseRequestId: purchaseRequest.id, purpose: "Reposição de luminárias" }).onConflictDoUpdate({ target: [infrastructureServicePurchases.obrasServicoId, infrastructureServicePurchases.purchaseRequestId], set: { purpose: "Reposição de luminárias" } });
  await db.insert(infrastructureServicePurchases).values({ obrasServicoId: lightingService.id, purchaseProcessId: purchaseProcess.id, purpose: "Aquisição de luminárias" }).onConflictDoUpdate({ target: [infrastructureServicePurchases.obrasServicoId, infrastructureServicePurchases.purchaseProcessId], set: { purpose: "Aquisição de luminárias" } });

  const [issuedMovement] = await db.select().from(materialMovements).where(and(eq(materialMovements.obrasServicoId, lightingService.id), eq(materialMovements.materialId, ledLamp.id), eq(materialMovements.reason, "Execução de ordem de serviço"))).limit(1);
  if (!issuedMovement) {
    await db.transaction(async (tx) => {
      await tx.update(materialStocks).set({ quantity: sql`${materialStocks.quantity} - ${4}` }).where(eq(materialStocks.id, lampStock.id));
      await tx.insert(materialMovements).values({ type: "Saída", quantity: 4, unitValue: lampStock.unitCost, reason: "Execução de ordem de serviço", warehouseId: warehouse.id, materialId: ledLamp.id, departmentId: worksDepartment.id, obrasServicoId: lightingService.id });
    });
  }
  await db.insert(infrastructureServiceMaterials).values({ obrasServicoId: lightingService.id, materialId: ledLamp.id, stockId: lampStock.id, quantityPlanned: 4, quantityIssued: 4, unitCost: lampStock.unitCost }).onConflictDoUpdate({ target: [infrastructureServiceMaterials.obrasServicoId, infrastructureServiceMaterials.materialId], set: { stockId: lampStock.id, quantityPlanned: 4, quantityIssued: 4, unitCost: lampStock.unitCost } });

  console.log("Cenários demonstrativos de Obras e Serviços criados ou atualizados.");
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(async () => {
    await connection.pool.end();
  });
