import { PrismaClient, Prisma } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { municipalReference } from "../src/lib/planejamento/municipal-data";

function cpfFor(index: number) {
  const digits = String(735920100 + index).split("").map(Number);
  for (let length = 9; length <= 10; length++) {
    const remainder = digits.reduce((sum, value, i) => sum + value * (length + 1 - i), 0) % 11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);
  }
  return digits.join("");
}

async function main() {
  const url = process.env.MUNICIPAL_SEED_DATABASE_URL;
  const actorId = process.env.MUNICIPAL_SEED_ACTOR_ID;
  if (!url || !actorId || process.argv[2] !== "--apply" || process.argv.length !== 3) throw new Error("Informe MUNICIPAL_SEED_DATABASE_URL, MUNICIPAL_SEED_ACTOR_ID e --apply.");
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production" || url === process.env.DATABASE_URL || url === process.env.DATABASE_URL_UNPOOLED) throw new Error("A carga exige conexão isolada, diferente da base operacional.");
  const db = new PrismaClient({ adapter: new PrismaPg({ connectionString: url }), transactionOptions: { timeout: 120000 } });
  try {
    const actor = await db.usuario.findFirst({ where: { id: actorId, ativo: true }, include: { perfil: true } });
    if (!actor || actor.perfil.codigo !== "SYSTEM_ADMINISTRATOR") throw new Error("Selecione um administrador técnico ativo da base de destino.");
    await db.$transaction(async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('municipal-planning-reference'))`;
      const marker = await tx.financialAuditLog.findFirst({ where: { action: "MUNICIPAL_REFERENCE_LOADED", entityType: "PLANNING_DATASET", entityId: "VILA_ARAUCArias_2026" } });
      if (marker) return;
      const existingEntities = await tx.governmentEntity.count({ where: { code: { in: ["PMVA", "CMVA"] } } });
      if (existingEntities) throw new Error("Os códigos municipais já existem sem registro desta carga; nenhuma alteração foi aplicada.");
      const entities = new Map<string, string>(), units = new Map<string, string>();
      for (const entity of municipalReference.entities) {
        const row = await tx.governmentEntity.create({ data: { code: entity.code, name: entity.name, type: entity.type } });
        entities.set(entity.code, row.id);
        await tx.planningEntityScope.create({ data: { governmentEntityId: row.id, jurisdiction: entity.jurisdiction } });
      }
      for (const unit of municipalReference.units) {
        const secretariat = await tx.secretariat.create({ data: { name: unit.name, managerName: unit.manager } });
        const row = await tx.budgetUnit.create({ data: { code: unit.code, name: unit.name, secretariatId: secretariat.id } });
        units.set(unit.code, row.id);
        await tx.planningEntityUnit.create({ data: { governmentEntityId: entities.get(unit.entity)!, budgetUnitId: row.id } });
      }
      const camaraUnit = await tx.budgetUnit.findUniqueOrThrow({ where: { id: units.get("01.01")! } });
      const legislature = await tx.camLegislatura.create({ data: { numero: 12, inicio: new Date("2025-01-01T00:00:00Z"), fim: new Date("2028-12-31T00:00:00Z"), descricao: "Legislatura 2025–2028", secretariatId: camaraUnit.secretariatId } });
      const commission = await tx.camComissao.create({ data: { nome: "Comissão de Finanças, Orçamento e Fiscalização", sigla: "CFOF", legislaturaId: legislature.id, descricao: "Análise das peças orçamentárias, acompanhamento fiscal e fiscalização das contas municipais." } });
      for (const [index, councilor] of municipalReference.councilors.entries()) {
        const person = await tx.person.create({ data: { fullName: councilor.name, cpf: cpfFor(index), nationality: "Brasileira", profession: "Vereador" } });
        const employee = await tx.employee.create({ data: { name: councilor.name, cpf: person.cpf, personId: person.id, secretariatId: camaraUnit.secretariatId, registration: String(410 + index) } });
        const row = await tx.camVereador.create({ data: { nomeCompleto: councilor.name, nomeParlamentar: councilor.parliamentary, partido: councilor.party, cpf: person.cpf, personId: person.id, employeeId: employee.id, legislaturaId: legislature.id, status: "Em Exercício" } });
        const cabinet = await tx.camGabinete.create({ data: { vereadorId: row.id, sala: String(101 + index), andar: "Primeiro pavimento", ramal: String(210 + index) } });
        const advisor = await tx.person.create({ data: { fullName: councilor.advisor, cpf: cpfFor(index + 20), nationality: "Brasileira", profession: "Assessor parlamentar" } });
        const advisorEmployee = await tx.employee.create({ data: { name: advisor.fullName, cpf: advisor.cpf, personId: advisor.id, secretariatId: camaraUnit.secretariatId, registration: String(510 + index) } });
        await tx.camAdvisor.create({ data: { personId: advisor.id, employeeId: advisorEmployee.id, cabinetId: cabinet.id, role: "Assessor parlamentar", startsAt: new Date("2025-01-06T00:00:00Z") } });
        if (index < 3) await tx.camComissaoMembro.create({ data: { comissaoId: commission.id, vereadorId: row.id, cargo: index === 0 ? "Presidente" : index === 1 ? "Relator" : "Membro" } });
        if (index === 0) await tx.camMesaDiretora.create({ data: { legislaturaId: legislature.id, vereadorId: row.id, cargo: "Presidente" } });
      }
      const source = await tx.resourceSource.create({ data: { code: "000", name: "Recursos ordinários livres" } });
      const revenue = await tx.revenueNature.create({ data: { code: "1.7.1.1.51.1.1", name: "Cota-parte do Fundo de Participação dos Municípios", degree: 6, shortCode: "101", referenceYear: 2027 } });
      const legislativeRevenue = await tx.revenueNature.create({ data: { code: "TF.01", name: "Transferências financeiras recebidas do Executivo", degree: 1, shortCode: "102", referenceYear: 2027 } });
      const expense = await tx.expenseNature.create({ data: { code: "3.3.90.39", name: "Outros serviços de terceiros — pessoa jurídica" } });
      for (const entity of municipalReference.entities) {
        const entityId = entities.get(entity.code)!;
        const financialYear = await tx.financialYear.upsert({ where: { governmentEntityId_year: { governmentEntityId: entityId, year: 2027 } }, create: { governmentEntityId: entityId, year: 2027, startDate: new Date("2027-01-01T00:00:00Z"), endDate: new Date("2027-12-31T23:59:59.999Z"), status: "Preparação" }, update: {} });
        if (!["Preparação", "Aberto"].includes(financialYear.status)) throw new Error("Exercício 2027 indisponível para planejamento.");
        const ppa = await tx.multiYearPlan.create({ data: { code: `${entity.code}:2026-2029`, name: "Plano Plurianual 2026–2029", startYear: 2026, endYear: 2029, status: "DRAFT", draftedById: actor.id } });
        const ppaInstrument = await tx.planningInstrument.create({ data: { governmentEntityId: entityId, kind: "PPA", code: "2026-2029", title: "Plano Plurianual 2026–2029", startYear: 2026, endYear: 2029, multiYearPlanId: ppa.id, createdById: actor.id } });
        const ldo = await tx.budgetGuideline.create({ data: { financialYearId: financialYear.id, multiYearPlanId: ppa.id, status: "DRAFT", draftedById: actor.id } });
        const ldoInstrument = await tx.planningInstrument.create({ data: { governmentEntityId: entityId, kind: "LDO", code: "2027", title: "Diretrizes Orçamentárias 2027", startYear: 2027, endYear: 2027, budgetGuidelineId: ldo.id, parentId: ppaInstrument.id, projectNumber: "034/2026", createdById: actor.id } });
        const loa = await tx.annualBudgetLaw.create({ data: { financialYearId: financialYear.id, budgetGuidelineId: ldo.id, lawNumber: "2027", totalRevenue: 0, totalExpense: 0, status: "DRAFT", draftedById: actor.id } });
        const loaInstrument = await tx.planningInstrument.create({ data: { governmentEntityId: entityId, kind: "LOA", code: "2027", title: "Orçamento Anual 2027", startYear: 2027, endYear: 2027, annualBudgetLawId: loa.id, parentId: ldoInstrument.id, projectNumber: "052/2026", createdById: actor.id } });
        let total = new Prisma.Decimal(0);
        const programs = municipalReference.programs.filter((p) => entity.code === "CMVA" ? p.unit === "01.01" : p.unit !== "01.01");
        for (const program of programs) {
          const row = await tx.programPPA.create({ data: { multiYearPlanId: ppa.id, code: program.code, name: program.name, type: ["01.01", "02.01"].includes(program.unit) ? "Gestão" : "Finalístico", origin: "Plano de governo e demandas das audiências públicas", guidelines: "Ampliar acesso aos serviços, melhorar resultados e assegurar transparência.", targetAudience: program.audience, financing: "Recursos ordinários livres e transferências legalmente vinculadas", managerName: program.manager, objectives: { create: { code: `${program.code}.01`, description: program.action, indicators: { create: { name: program.product, unit: program.productUnit, baselineValue: Number(program.target) * 0.8, targetValue: Number(program.target) } } } } } });
          const action = await tx.actionPPA.create({ data: { programId: row.id, code: program.actionCode, name: program.action, type: program.actionCode.startsWith("1") ? "Projeto" : "Atividade" } });
          for (const instrument of [ppaInstrument, ldoInstrument, loaInstrument]) {
            for (const year of instrument.kind === "PPA" ? [2026, 2027, 2028, 2029] : [2027]) {
              await tx.planningBudgetLine.create({ data: { instrumentId: instrument.id, kind: "EXPENSE", code: `${program.code}.${year}`, description: program.action, year, budgetUnitId: units.get(program.unit)!, resourceSourceId: source.id, expenseNatureId: expense.id, programId: row.id, actionId: action.id, functionCode: program.functionCode, subfunctionCode: program.subfunctionCode, product: program.product, productUnit: program.productUnit, physicalTarget: program.target, originalValue: program.value } });
              await tx.planningBudgetLine.create({ data: { instrumentId: instrument.id, kind: "REVENUE", code: `R.${program.code}.${year}`, description: entity.code === "CMVA" ? "Transferência financeira do Executivo para manutenção do Legislativo" : "Receitas ordinárias destinadas ao programa", year, budgetUnitId: units.get(program.unit)!, resourceSourceId: source.id, revenueNatureId: entity.code === "CMVA" ? legislativeRevenue.id : revenue.id, originalValue: program.value } });
            }
          }
          await tx.annualBudgetExpenseFixation.create({ data: { annualBudgetLawId: loa.id, code: `${program.code}.2027`, name: program.action, fixedValue: program.value } });
          await tx.annualBudgetRevenueForecast.create({ data: { annualBudgetLawId: loa.id, code: `R.${program.code}.2027`, name: "Receitas ordinárias", estimatedValue: program.value } });
          total = total.plus(program.value);
        }
        await tx.annualBudgetLaw.update({ where: { id: loa.id }, data: { totalRevenue: total, totalExpense: total } });
        await tx.planningCalculationMemory.create({ data: { instrumentId: ldoInstrument.id, title: "Projeção das receitas ordinárias", normativeReference: "LRF, art. 12", methodology: "Atualização da base de arrecadação pelo crescimento estimado do exercício.", assumptions: "Crescimento nominal de 4,5%, manutenção das alíquotas e evolução do nível de atividade local.", baseValue: total.div("1.045").toDecimalPlaces(2), rate: "4.5", resultValue: total, createdById: actor.id } });
      }
      await tx.financialAuditLog.create({ data: { action: "MUNICIPAL_REFERENCE_LOADED", entityType: "PLANNING_DATASET", entityId: "VILA_ARAUCArias_2026", authorUsuarioId: actor.id, payload: { municipality: municipalReference.name, entities: 2, councilors: 9, advisors: 9 } } });
    });
    console.log("Cadastros municipais e instrumentos orçamentários carregados.");
  } finally { await db.$disconnect(); }
}

main().catch(() => { console.error("A carga municipal não foi concluída. Verifique a conexão isolada, o ator e os pré-requisitos do schema."); process.exitCode = 1; });
