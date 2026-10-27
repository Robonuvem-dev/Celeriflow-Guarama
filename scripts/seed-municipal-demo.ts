import { config } from "dotenv";
import { PrismaClient, type Prisma } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { neonConfig } from "@neondatabase/serverless";
import ws from "ws";
import { mkdirSync, writeFileSync } from "node:fs";
import { demoMaterials, demoMedicines, demoFleet } from "./municipal-demo-catalogs";
import { key as base } from "./municipal-system-dataset";
import { syntheticCpf, syntheticPersonName } from "../src/lib/poc/fixture-catalog";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
neonConfig.webSocketConstructor = ws;
const dataset = "aurora-mg-50k-v1";
const id = (kind: string, index = 0) => `${dataset}:${kind}:${String(index).padStart(3, "0")}`;
const day = (value: string) => new Date(`${value}T12:00:00Z`);
const note = "Base fictícia autorizada: município mineiro de aproximadamente 50 mil habitantes. Não representa operação oficial.";
type Tx = Prisma.TransactionClient;

async function organization(tx: Tx) {
  await tx.state.createMany({ skipDuplicates: true, data: { id: id("state"), uf: "MG", name: "Minas Gerais", ibgeCode: "31" } });
  const state = await tx.state.findUniqueOrThrow({ where: { uf: "MG" } });
  // Fictional municipality: no invented official IBGE identifier.
  await tx.city.createMany({ skipDuplicates: true, data: { id: id("city"), stateId: state.id, name: "Aurora das Veredas", ibgeCode: "DEMO-AV-MG" } });
  await tx.secretariat.createMany({ skipDuplicates: true, data: [
    { id: base("secretariat", 9), name: "Secretaria Municipal de Governo e Planejamento", acronym: "SEGOV", managerName: "Bruna Almeida" },
    { id: base("secretariat", 10), name: "Secretaria Municipal de Agricultura e Desenvolvimento Rural", acronym: "SEMAG", managerName: "Leandro Azevedo" },
    { id: base("secretariat", 11), name: "Secretaria Municipal de Esporte e Lazer", acronym: "SEMEL", managerName: "Camila Ribeiro" },
  ] });
  const areas = [
    [0, "Recursos Humanos"], [0, "Compras e Licitações"], [0, "Patrimônio e Almoxarifado"], [0, "Tecnologia da Informação"],
    [1, "Educação Infantil"], [1, "Ensino Fundamental"], [1, "Transporte e Alimentação Escolar"],
    [2, "Atenção Primária à Saúde"], [2, "Assistência Farmacêutica"], [2, "Vigilância em Saúde"], [2, "Regulação e Transporte Sanitário"],
    [3, "Proteção Social Básica"], [3, "Proteção Social Especial"], [4, "Manutenção de Vias e Estradas"], [4, "Iluminação Pública"],
    [4, "Limpeza Urbana"], [5, "Cultura e Patrimônio Histórico"], [6, "Licenciamento e Fiscalização Ambiental"],
    [7, "Defesa Civil"], [8, "Arrecadação e Fiscalização Tributária"], [8, "Contabilidade e Tesouraria"],
    [9, "Planejamento e Convênios"], [10, "Apoio ao Produtor Rural"], [11, "Esporte Comunitário"],
  ] as const;
  await tx.department.createMany({ skipDuplicates: true, data: areas.map(([sec, name], i) => ({ id: id("department", i), name: `Departamento de ${name}`, secretariatId: base("secretariat", sec), description: note })) });
  const units = [
    [0, "Paço Municipal", "Administrativa", "Praça das Veredas, 100, Centro"],
    [0, "Almoxarifado Central", "Almoxarifado", "Rua Amarelo, 120, Nova Aurora"],
    [1, "Escola Municipal Ipê Amarelo", "Escola", "Rua Serra Clara, 250, Boa Vista"],
    [1, "Escola Municipal Caminho das Veredas", "Escola", "Rua das Palmeiras, 480, Parque das Veredas"],
    [1, "Centro Municipal de Educação Infantil Sementes do Amanhã", "Creche", "Avenida do Ipê, 310, Jardim das Acácias"],
    [2, "UBS Centro", "UBS", "Rua das Veredas, 220, Centro"],
    [2, "UBS Jardim das Acácias", "UBS", "Avenida do Ipê, 420, Jardim das Acácias"],
    [2, "Farmácia Municipal Central", "Farmácia", "Rua das Veredas, 240, Centro"],
    [2, "Centro de Atenção Psicossocial Veredas", "CAPS", "Rua Serra Clara, 160, Boa Vista"],
    [3, "CRAS Nova Aurora", "CRAS", "Avenida das Nascentes, 350, Nova Aurora"],
    [3, "CREAS Municipal", "CREAS", "Rua do Comércio, 95, Vila Esperança"],
    [4, "Garagem e Oficina Municipal", "Garagem", "Rua Amarelo, 180, Nova Aurora"],
    [5, "Biblioteca Municipal Maria das Veredas", "Biblioteca", "Rua do Comércio, 130, Centro"],
    [6, "Centro de Educação Ambiental Nascentes", "Ambiental", "Rua das Palmeiras, 650, Parque das Veredas"],
    [10, "Centro de Apoio ao Produtor Rural", "Administrativa", "Estrada das Nascentes, km 3, Zona Rural"],
    [11, "Ginásio Poliesportivo das Veredas", "Esportiva", "Avenida do Ipê, 800, Jardim das Acácias"],
  ] as const;
  await tx.administrativeUnit.createMany({ skipDuplicates: true, data: units.map(([sec, name, type, address], i) => ({ id: id("unit", i), secretariatId: base("secretariat", sec), name, type, address, managerName: syntheticPersonName(400 + i) })) });
  await tx.costCenter.createMany({ skipDuplicates: true, data: units.map(([sec, name], i) => ({ id: id("cost-center", i), code: `AV-CC-${String(i + 1).padStart(3, "0")}`, name, administrativeUnitId: id("unit", i), secretariatId: base("secretariat", sec), governmentEntityId: "p0-current-exe" })) });
  const jobs = ["Auxiliar Administrativo", "Professor de Educação Básica", "Enfermeiro", "Técnico de Enfermagem", "Médico de Família", "Farmacêutico", "Assistente Social", "Psicólogo", "Motorista", "Operador de Máquinas", "Auxiliar de Serviços Gerais", "Agente Comunitário de Saúde", "Agente de Combate às Endemias", "Fiscal de Tributos", "Pedreiro", "Eletricista", "Merendeiro", "Técnico de Informática", "Técnico Agrícola", "Profissional de Educação Física"];
  await tx.role.createMany({ skipDuplicates: true, data: jobs.map((name, i) => ({ id: id("role", i), name, level: "Servidor", description: note })) });
  await tx.person.createMany({ skipDuplicates: true, data: Array.from({ length: 180 }, (_, i) => ({ id: id("person", i), fullName: i === 0 ? "Bruna Almeida" : `${syntheticPersonName(400 + i)} ${["Moreira", "Almeida", "Rezende", "Tavares", "Amaral", "Figueiredo"][Math.floor(i / 36)]}`, cpf: syntheticCpf(12000 + i).replace(/\D/g, ""), birthDate: day(`${1970 + i % 29}-0${1 + i % 9}-15`), motherName: syntheticPersonName(500 + i), nationality: "Brasileira", birthPlace: "Aurora das Veredas/MG", email: `pessoa.${i + 1}@auroradasveredas.example`, status: "Ativo" })) });
  await tx.address.createMany({ skipDuplicates: true, data: Array.from({ length: 180 }, (_, i) => ({ id: id("address", i), personId: id("person", i), streetId: base("street", i % 6), neighborhoodId: base("neighborhood", i % 6), streetName: ["Rua das Veredas", "Avenida do Ipê", "Rua Serra Clara", "Rua do Comércio", "Avenida das Nascentes", "Rua das Palmeiras"][i % 6], number: String(120 + i * 3), addressType: "Residencial", zone: "Urbana" })) });
  await tx.employee.createMany({ skipDuplicates: true, data: Array.from({ length: 180 }, (_, i) => {
    const job = i % jobs.length;
    const sec = [0, 1, 2, 2, 2, 2, 3, 3, 4, 4, 4, 2, 2, 8, 4, 4, 1, 0, 10, 11][job];
    const unit = [0, 2, 5, 5, 6, 7, 9, 10, 11, 11, 1, 6, 5, 0, 11, 11, 3, 0, 14, 15][job];
    return { id: id("employee", i), personId: id("person", i), name: i === 0 ? "Bruna Almeida" : `${syntheticPersonName(400 + i)} ${["Moreira", "Almeida", "Rezende", "Tavares", "Amaral", "Figueiredo"][Math.floor(i / 36)]}`, cpf: syntheticCpf(12000 + i).replace(/\D/g, ""), registration: `AV${5000 + i}`, roleId: id("role", job), secretariatId: base("secretariat", sec), departmentId: sec < 9 ? base("department", sec) : id("department", sec === 10 ? 22 : 23), unitId: id("unit", unit), salaryBase: [2850, 4867.77, 4750, 3325, 14800, 5200, 4350, 4650, 2680, 3120, 1750, 3036, 3036, 3850, 2490, 2790, 1850, 3680, 3290, 3890][job], contractedHours: job === 4 ? 20 : job === 1 ? 30 : 40, email: `servidor.${5000 + i}@auroradasveredas.example` };
  }) });
}

async function stock(tx: Tx, actorId: string) {
  const categories = [["EXP", "Expediente e papelaria"], ["LIMP", "Limpeza e higiene"], ["ALIM", "Gêneros alimentícios"], ["OBRA", "Materiais de construção"], ["ELE", "Materiais elétricos"], ["EPI", "Equipamentos de proteção individual"], ["COMB", "Combustíveis e lubrificantes"], ["PECA", "Peças e manutenção automotiva"], ["TI", "Informática"], ["MOB", "Mobiliário"], ["MED", "Medicamentos"], ["HOSP", "Materiais médico-hospitalares"]];
  for (const [code, name] of categories) await tx.materialCategory.upsert({ where: { code }, create: { id: id(`category-${code}`), code, name }, update: {} });
  const cats = await tx.materialCategory.findMany();
  const cat = (code: string) => cats.find(c => c.code === code)!.id;
  await tx.warehouse.createMany({ skipDuplicates: true, data: [
    { id: id("warehouse", 0), name: "Almoxarifado Central — Expediente e Limpeza", address: "Rua Amarelo, 120", city: "Aurora das Veredas", state: "MG", cityId: id("city"), costCenterId: id("cost-center", 1) },
    { id: id("warehouse", 1), name: "Depósito da Alimentação Escolar", address: "Rua Serra Clara, 250", costCenterId: id("cost-center", 2) },
    { id: id("warehouse", 2), name: "Depósito de Obras e Garagem Municipal", address: "Rua Amarelo, 180", costCenterId: id("cost-center", 11) },
    { id: id("warehouse", 3), name: "Farmácia Municipal Central — Estoque", address: "Rua das Veredas, 240", healthUnitId: base("health-unit", 2), costCenterId: id("cost-center", 7) },
    { id: id("warehouse", 4), name: "Farmácia UBS Centro — Dispensação", address: "Rua das Veredas, 220", healthUnitId: base("health-unit", 0), costCenterId: id("cost-center", 5) },
  ] });
  await tx.material.createMany({ skipDuplicates: true, data: demoMaterials.map(([name, category, unitOfMeasure, , quantity], i) => ({ id: id("material", i), code: `AV-MAT-${String(i + 1).padStart(5, "0")}`, name, categoryId: cat(category), unitOfMeasure, minStock: Math.ceil(quantity * 0.2), maxStock: quantity * 2, isPerishable: category === "ALIM", description: note })) });
  await tx.material.createMany({ skipDuplicates: true, data: demoMedicines.map(([name, concentration, presentation, , quantity], i) => ({ id: id("medicine-material", i), code: `AV-MED-${String(i + 1).padStart(5, "0")}`, name: `${name} ${concentration} — ${presentation}`, categoryId: cat("MED"), unitOfMeasure: "UN", isPerishable: true, minStock: Math.ceil(quantity * 0.2), maxStock: quantity * 2, description: note })) });
  await tx.medicine.createMany({ skipDuplicates: true, data: demoMedicines.map(([name, concentration, presentation, , quantity], i) => ({ id: id("medicine", i), materialId: id("medicine-material", i), name, activePrinciple: name, concentration, presentation, isControlled: i >= 38, currentStock: quantity, minStock: Math.ceil(quantity * 0.2) })) });
  await tx.healthMaterialProfile.createMany({ skipDuplicates: true, data: demoMedicines.map(([, , presentation], i) => ({ id: id("medicine-profile", i), materialId: id("medicine-material", i), productKind: i >= 38 ? "CONTROLLED" : "MEDICINE", packaging: presentation, pharmaceuticalComponent: "BASIC", patientReleaseAllowed: true })) });
  const positions: Prisma.MaterialStockCreateManyInput[] = [];
  const movements: Prisma.MaterialMovementCreateManyInput[] = [];
  const add = (materialId: string, warehouse: number, quantity: number, unitCost: number, label: string, expirationDate?: Date) => {
    const stockId = id(`stock-${label}`);
    positions.push({ id: stockId, materialId, warehouseId: id("warehouse", warehouse), quantity, unitCost, batchNumber: expirationDate ? `AV26-${label}` : "", expirationDate });
    movements.push({ id: id(`opening-${label}`), materialId, warehouseId: id("warehouse", warehouse), stockId, quantity, unitValue: unitCost, type: "Ajuste", reason: `Saldo inicial fictício autorizado — ${note}`, idempotencyKey: id(`opening-${label}`), actorUsuarioId: actorId, date: day("2026-10-01") });
  };
  demoMaterials.forEach(([, category, , cost, quantity], i) => add(id("material", i), category === "ALIM" ? 1 : ["OBRA", "ELE", "COMB", "PECA", "EPI"].includes(category) ? 2 : 0, quantity, cost, `material-${i}`, category === "ALIM" ? day("2027-08-31") : undefined));
  demoMedicines.forEach(([, , , cost, quantity], i) => {
    add(id("medicine-material", i), 3, quantity * 0.8, cost, `med-central-${i}`, day("2028-03-31"));
    add(id("medicine-material", i), 4, quantity * 0.2, cost, `med-ubs-${i}`, day("2027-09-30"));
  });
  await tx.materialStock.createMany({ skipDuplicates: true, data: positions });
  await tx.materialMovement.createMany({ skipDuplicates: true, data: movements });
  await tx.medicineBatch.createMany({ skipDuplicates: true, data: demoMedicines.flatMap(([, , , , quantity], i) => [
    { id: id("medicine-batch-central", i), medicineId: id("medicine", i), batchNumber: `AV26-med-central-${i}`, expirationDate: day("2028-03-31"), quantity: quantity * 0.8 },
    { id: id("medicine-batch-ubs", i), medicineId: id("medicine", i), batchNumber: `AV26-med-ubs-${i}`, expirationDate: day("2027-09-30"), quantity: quantity * 0.2 },
  ]) });
}

async function fleet(tx: Tx, actorId: string) {
  await tx.assetCategory.createMany({ skipDuplicates: true, data: { id: id("fleet-asset-category"), code: "AV-FROTA", name: "Veículos e máquinas municipais", lifeSpan: 120 } });
  await tx.asset.createMany({ skipDuplicates: true, data: demoFleet.map(([brand, model, name, year, , sec, value], i) => ({ id: id("fleet-asset", i), patrimonyNumber: `AV-FROTA-${String(i + 1).padStart(5, "0")}`, name: `${brand} ${model} — ${name}`, brand, model, serialNumber: `AV26${String(i + 1).padStart(13, "0")}`, acquisitionDate: day(`${year}-03-15`), acquisitionValue: value, currentValue: value * 0.85, acquisitionValueDecimal: value, currentValueDecimal: value * 0.85, categoryId: id("fleet-asset-category"), departmentId: sec < 9 ? base("department", sec) : id("department", 22), description: note })) });
  await tx.fleetUnit.createMany({ skipDuplicates: true, data: demoFleet.map(([brand, model, purpose, year, category, sec], i) => ({ id: id("fleet", i), code: `AV-${String(i + 1).padStart(3, "0")}`, name: `${brand} ${model} — ${purpose}`, brand, model, year, category, plate: category === "VEICULO" ? `QAV${Math.floor(i / 10)}${"ABCDEFGHJK"[i % 10]}${String(i + 10).slice(-2)}` : null, renavam: category === "VEICULO" ? `${String(7100000000 + i).padStart(10, "0")}${i % 10}` : null, assetId: id("fleet-asset", i), departmentId: sec < 9 ? base("department", sec) : id("department", 22), notes: `${note} Identificadores sintéticos. Chassi/série no patrimônio vinculado.`, createdById: actorId })) });
  await tx.fleetUnitControl.createMany({ skipDuplicates: true, data: demoFleet.map(([, , species, year, category, , , fuelType, tankCapacity], i) => ({ unitId: id("fleet", i), species, color: "Branco", fuelType, tankCapacity, meterType: category === "VEICULO" ? "HODOMETRO" : "HORIMETRO", currentReading: category === "VEICULO" ? 25000 + i * 2100 : 800 + i * 75, acquisitionDate: day(`${year}-03-15`), allowedLicenseCategories: category === "VEICULO" ? [i >= 16 ? "D" : "B"] : [] })) });
  await tx.fleetDocument.createMany({ skipDuplicates: true, data: demoFleet.filter(row => row[4] === "VEICULO").map((_, i) => ({ id: id("fleet-license", i), unitId: id("fleet", i), kind: "OBRIGACAO", type: "LICENCIAMENTO", reference: "2026", title: "Licenciamento anual 2026 — referência fictícia", dueAt: day("2026-12-31"), status: "PENDENTE", value: 35.62, createdById: actorId, notes: note })) });
  await tx.fleetPlan.createMany({ skipDuplicates: true, data: demoFleet.map(([, , , , category], i) => ({ id: id("fleet-plan", i), unitId: id("fleet", i), title: "Revisão preventiva periódica", type: "PREVENTIVA", services: "Verificar óleo, filtros, freios, pneus e condições de segurança.", firstDueAt: day("2026-11-15"), nextDueAt: day("2026-11-15"), intervalDays: 180, estimatedCost: category === "VEICULO" ? 1200 : 2800, createdById: actorId })) });
}

async function peopleAndServices(tx: Tx) {
  await tx.payrollEvent.createMany({ skipDuplicates: true, data: { id: id("salary-event"), code: "AV-VENC-BASE", name: "Vencimento básico — cenário fictício", type: "Vencimento" } });
  const employees = await tx.employee.findMany({ where: { id: { startsWith: `${dataset}:employee:` } } });
  const total = employees.reduce((sum, e) => sum + (e.salaryBase || 0), 0);
  await tx.payroll.createMany({ skipDuplicates: true, data: { id: id("payroll"), competence: "10/2026", type: "Mensal", status: "Aberta", totalValue: total, totalValueDecimal: total.toFixed(2) } });
  await tx.payrollItem.createMany({ skipDuplicates: true, data: employees.map(e => ({ id: `${id("payroll-item")}:${e.id}`, payrollId: id("payroll"), employeeId: e.id, eventId: id("salary-event"), value: e.salaryBase || 0, valueDecimal: e.salaryBase || 0, reference: `${e.contractedHours}h semanais — rascunho fictício, somente salário base` })) });
  await tx.vacation.createMany({ skipDuplicates: true, data: employees.slice(0, 30).map((e, i) => ({ id: id("vacation", i), employeeId: e.id, acquisitionStart: day("2025-01-01"), acquisitionEnd: day("2025-12-31"), enjoymentStart: day("2026-12-01"), enjoymentEnd: day("2026-12-30"), days: 30, status: "Programada" })) });
  await tx.academicPeriod.createMany({ skipDuplicates: true, data: Array.from({ length: 3 }, (_, i) => ({ id: id("academic-period", i), schoolId: base("school", i), code: "2026", name: "Ano letivo 2026", year: 2026, modality: "Regular", startDate: day("2026-02-02"), endDate: day("2026-12-18"), status: "Em andamento" })) });
  await tx.schoolSubject.createMany({ skipDuplicates: true, data: ["Língua Portuguesa", "Matemática", "Ciências", "História", "Geografia", "Arte", "Educação Física"].map((name, i) => ({ id: id("subject", i), code: `AV-DISC-${i + 1}`, name })) });
  await tx.schoolShift.createMany({ skipDuplicates: true, data: Array.from({ length: 6 }, (_, i) => ({ id: id("school-shift", i), schoolId: base("school", Math.floor(i / 2)), name: i % 2 ? "Tarde" : "Manhã", type: i % 2 ? "Vespertino" : "Matutino", startTime: i % 2 ? "13:00" : "07:00", endTime: i % 2 ? "17:30" : "11:30", weekdays: [1, 2, 3, 4, 5] })) });
  await tx.classDiary.createMany({ skipDuplicates: true, data: Array.from({ length: 12 }, (_, i) => ({ id: id("diary", i), classId: base("class", i % 6), teacherId: base("teacher", i % 2), subjectId: id("subject", i % 2), date: day(i < 6 ? "2026-10-19" : "2026-10-20"), stage: "4º Bimestre", contentTaught: i % 2 ? "Leitura, interpretação de texto e produção escrita." : "Números naturais e resolução de problemas.", status: "Aberto" })) });
  await tx.processMovement.createMany({ skipDuplicates: true, data: Array.from({ length: 20 }, (_, i) => ({ id: id("process-movement", i), processId: base("process", i), toDepartmentId: base("department", i % 9), reason: "Encaminhamento inicial para análise — cenário fictício.", status: "AWAITING_RECEIPT" })) });
  await tx.envLicense.createMany({ skipDuplicates: true, data: Array.from({ length: 6 }, (_, i) => ({ id: id("environment-license", i), enterpriseId: base("enterprise", i), licenseNumber: `AV-LAS-2026-${String(i + 1).padStart(4, "0")}`, licenseType: "Simplificada", issueDate: day("2026-09-01"), validUntil: day("2028-09-01"), status: "Em Análise" })) });
}

async function finance(tx: Tx) {
  await tx.financialYear.createMany({ skipDuplicates: true, data: { id: id("financial-year"), year: 2026, governmentEntityId: "p0-current-exe", startDate: day("2026-01-01"), endDate: day("2026-12-31"), status: "Aberto" } });
  const sources = [["1.500.000", "Recursos não vinculados de impostos"], ["1.540.000", "Transferências do FUNDEB — impostos e transferências de impostos"], ["1.600.000", "Transferências fundo a fundo de recursos do SUS — manutenção"], ["1.660.000", "Transferências do Fundo Nacional de Assistência Social"]];
  for (const [code, name] of sources) await tx.resourceSource.upsert({ where: { code }, create: { id: id(`source-${code}`), code, name, referenceYear: 2026 }, update: {} });
  const natures = [["3.1.90.11", "Vencimentos e vantagens fixas — pessoal civil"], ["3.3.90.30", "Material de consumo"], ["3.3.90.39", "Outros serviços de terceiros — pessoa jurídica"], ["4.4.90.52", "Equipamentos e material permanente"], ["4.4.90.51", "Obras e instalações"]];
  for (const [code, name] of natures) await tx.expenseNature.upsert({ where: { code }, create: { id: id(`nature-${code}`), code, name }, update: {} });
  const source = await tx.resourceSource.findMany();
  const nature = await tx.expenseNature.findMany();
  // R$ 240 million illustrative annual budget; not an approved legal instrument.
  const envelopes = [28000000, 72000000, 65000000, 12000000, 35000000, 6000000, 5000000, 5000000, 12000000];
  await tx.budgetAppropriation.createMany({ skipDuplicates: true, data: envelopes.flatMap((value, sec) => natures.map(([code], i) => ({ id: id("appropriation", sec * 5 + i), code: `AV-2026-${sec + 1}-${i + 1}`, financialYearId: id("financial-year"), budgetUnitId: base("budget-unit", sec), expenseNatureId: nature.find(n => n.code === code)!.id, resourceSourceId: source.find(s => s.code === sources[sec === 1 ? 1 : sec === 2 ? 2 : sec === 3 ? 3 : 0][0])!.id, initialValue: value * [0.5, 0.2, 0.15, 0.1, 0.05][i], updatedValue: value * [0.5, 0.2, 0.15, 0.1, 0.05][i], initialValueDecimal: (value * [0.5, 0.2, 0.15, 0.1, 0.05][i]).toFixed(2), updatedValueDecimal: (value * [0.5, 0.2, 0.15, 0.1, 0.05][i]).toFixed(2) }))) });
  await tx.bankAccount.createMany({ skipDuplicates: true, data: sources.map(([, name], i) => ({ id: id("bank-account", i), bankName: "Banco do Brasil", agency: "4821-0", accountNumber: `${980100 + i}-0`, purpose: `${name} — conta fictícia sem conexão bancária`, currentBalance: 0, currentBalanceDecimal: 0, resourceSourceId: source.find(s => s.code === sources[i][0])!.id })) });
}

async function main() {
  if (!process.argv.includes("--apply")) {
    console.log(JSON.stringify({ mode: "PREVIEW", dataset, people: 180, employees: 180, materials: demoMaterials.length, medicines: demoMedicines.length, fleet: demoFleet.length, note }, null, 2));
    return;
  }
  const connectionString = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Conexão Neon não configurada.");
  const db = new PrismaClient({ adapter: new PrismaNeon({ connectionString }), transactionOptions: { timeout: 240000, maxWait: 30000 } });
  try {
    await db.institution.findFirstOrThrow({ where: { city: "Aurora das Veredas", state: "MG" } });
    const actor = await db.usuario.findFirstOrThrow({ where: { ativo: true, perfil: { codigo: "SYSTEM_ADMINISTRATOR" } } });
    const stages = { organization, stock: (tx: Tx) => stock(tx, actor.id), fleet: (tx: Tx) => fleet(tx, actor.id), peopleAndServices, finance };
    for (const [stage, seed] of Object.entries(stages)) {
      await db.$transaction(async tx => {
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${dataset}))`;
        const marker = id(`completed-${stage}`);
        if (await tx.auditEvent.findUnique({ where: { id: marker } })) return;
        await seed(tx);
        await tx.auditEvent.create({ data: { id: marker, eventType: "MUNICIPAL_DEMO_SEEDED", targetType: "DEMO_DATASET", targetId: dataset, actorUsuarioId: actor.id } });
      });
      console.log(JSON.stringify({ stage, status: "OK" }));
    }
    const counts = { secretariats: await db.secretariat.count(), departments: await db.department.count(), administrativeUnits: await db.administrativeUnit.count(), people: await db.person.count(), employees: await db.employee.count(), materials: await db.material.count(), warehouses: await db.warehouse.count(), stocks: await db.materialStock.count(), medicines: await db.medicine.count(), medicineBatches: await db.medicineBatch.count(), fleet: await db.fleetUnit.count(), assets: await db.asset.count(), appropriations: await db.budgetAppropriation.count() };
    mkdirSync(".next/cache/data-review", { recursive: true });
    writeFileSync(".next/cache/data-review/municipal-demo-result.json", JSON.stringify({ dataset, completedAt: new Date().toISOString(), counts, note }, null, 2));
    console.log(JSON.stringify(counts, null, 2));
  } finally { await db.$disconnect(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
