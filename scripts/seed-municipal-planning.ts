import { and, count, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { Decimal } from "../src/db/decimal";
import * as t from "../src/db/schema/municipal-setup-tools";
import { municipalRequired, municipalTechnicalActor, openMunicipalSetupConnection } from "./lib/municipal-setup-tools";
import { municipalReference } from "../src/lib/planejamento/municipal-data";

function cpfFor(index: number) {
  const digits = String(735920100 + index).split("").map(Number);
  for (let length = 9; length <= 10; length++) {
    const remainder = digits.reduce((sum, value, i) => sum + value * (length + 1 - i), 0) % 11;
    digits.push(remainder < 2 ? 0 : 11 - remainder);
  }
  return digits.join("");
}

export async function seedMunicipalPlanning(connection: DatabaseConnection, actorId: string) {
    const actor = await municipalTechnicalActor(connection.db, actorId);
    await withDatabaseTransaction(connection, async (tx) => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext('municipal-planning-reference'))::text`);
      const [marker] = await tx.select({ id: t.audits.id }).from(t.audits).where(and(eq(t.audits.action, "MUNICIPAL_REFERENCE_LOADED"), eq(t.audits.entityType, "PLANNING_DATASET"), eq(t.audits.entityId, "VILA_ARAUCArias_2026"))).limit(1);
      if (marker) return;
       const [{ total: existingEntities }] = await tx.select({ total: count() }).from(t.entities).where(inArray(t.entities.code, ["PMVA", "CMVA"]));
      if (existingEntities) throw new Error("Os códigos municipais já existem sem registro desta carga; nenhuma alteração foi aplicada.");
      const entities = new Map<string, string>(), units = new Map<string, string>();
      for (const entity of municipalReference.entities) {
        const [row] = await tx.insert(t.entities).values({ code: entity.code, name: entity.name, type: entity.type }).returning();
        entities.set(entity.code, row.id);
        await tx.insert(t.scopes).values({ governmentEntityId: row.id, jurisdiction: entity.jurisdiction });
      }
      for (const unit of municipalReference.units) {
        const [secretariat] = await tx.insert(t.secretariats).values({ name: unit.name, managerName: unit.manager }).returning();
        const [row] = await tx.insert(t.units).values({ code: unit.code, name: unit.name, secretariatId: secretariat.id }).returning();
        units.set(unit.code, row.id);
        await tx.insert(t.bindings).values({ governmentEntityId: entities.get(unit.entity)!, budgetUnitId: row.id });
      }
      const camaraUnit = municipalRequired((await tx.select().from(t.units).where(eq(t.units.id, units.get("01.01")!)).limit(1))[0], "UG Câmara");
      const [legislature] = await tx.insert(t.legislatures).values({ numero: 12, inicio: new Date("2025-01-01T00:00:00Z"), fim: new Date("2028-12-31T00:00:00Z"), descricao: "Legislatura 2025–2028", secretariatId: camaraUnit.secretariatId }).returning();
      const [commission] = await tx.insert(t.commissions).values({ nome: "Comissão de Finanças, Orçamento e Fiscalização", sigla: "CFOF", legislaturaId: legislature.id, descricao: "Análise das peças orçamentárias, acompanhamento fiscal e fiscalização das contas municipais." }).returning();
      for (const [index, councilor] of municipalReference.councilors.entries()) {
        const [person] = await tx.insert(t.people).values({ fullName: councilor.name, cpf: cpfFor(index), nationality: "Brasileira", profession: "Vereador" }).returning();
        const [employee] = await tx.insert(t.employees).values({ name: councilor.name, cpf: person.cpf, personId: person.id, secretariatId: camaraUnit.secretariatId, registration: String(410 + index) }).returning();
        const [row] = await tx.insert(t.councilors).values({ nomeCompleto: councilor.name, nomeParlamentar: councilor.parliamentary, partido: councilor.party, cpf: person.cpf, personId: person.id, employeeId: employee.id, legislaturaId: legislature.id, status: "Em Exercício" }).returning();
        const [cabinet] = await tx.insert(t.cabinets).values({ vereadorId: row.id, sala: String(101 + index), andar: "Primeiro pavimento", ramal: String(210 + index) }).returning();
        const [advisor] = await tx.insert(t.people).values({ fullName: councilor.advisor, cpf: cpfFor(index + 20), nationality: "Brasileira", profession: "Assessor parlamentar" }).returning();
        const [advisorEmployee] = await tx.insert(t.employees).values({ name: advisor.fullName, cpf: advisor.cpf, personId: advisor.id, secretariatId: camaraUnit.secretariatId, registration: String(510 + index) }).returning();
        await tx.insert(t.advisors).values({ personId: advisor.id, employeeId: advisorEmployee.id, cabinetId: cabinet.id, role: "Assessor parlamentar", startsAt: new Date("2025-01-06T00:00:00Z") });
        if (index < 3) await tx.insert(t.members).values({ comissaoId: commission.id, vereadorId: row.id, cargo: index === 0 ? "Presidente" : index === 1 ? "Relator" : "Membro" });
        if (index === 0) await tx.insert(t.board).values({ legislaturaId: legislature.id, vereadorId: row.id, cargo: "Presidente" });
      }
      const [source] = await tx.insert(t.sources).values({ code: "000", name: "Recursos ordinários livres" }).returning();
      const [revenue] = await tx.insert(t.revenues).values({ code: "1.7.1.1.51.1.1", name: "Cota-parte do Fundo de Participação dos Municípios", degree: 6, shortCode: "101", referenceYear: 2027 }).returning();
      const [legislativeRevenue] = await tx.insert(t.revenues).values({ code: "TF.01", name: "Transferências financeiras recebidas do Executivo", degree: 1, shortCode: "102", referenceYear: 2027 }).returning();
      const [expense] = await tx.insert(t.expenses).values({ code: "3.3.90.39", name: "Outros serviços de terceiros — pessoa jurídica" }).returning();
      for (const entity of municipalReference.entities) {
        const entityId = entities.get(entity.code)!;
        await tx.insert(t.years).values({ governmentEntityId: entityId, year: 2027, startDate: new Date("2027-01-01T00:00:00Z"), endDate: new Date("2027-12-31T23:59:59.999Z"), status: "Preparação" }).onConflictDoNothing({ target: [t.years.governmentEntityId, t.years.year] });
        const financialYear = municipalRequired((await tx.select().from(t.years).where(and(eq(t.years.governmentEntityId, entityId), eq(t.years.year, 2027))).limit(1))[0], "Exercício 2027");
        if (!["Preparação", "Aberto"].includes(financialYear.status)) throw new Error("Exercício 2027 indisponível para planejamento.");
        const [ppa] = await tx.insert(t.ppas).values({ code: `${entity.code}:2026-2029`, name: "Plano Plurianual 2026–2029", startYear: 2026, endYear: 2029, status: "DRAFT", draftedById: actor.id }).returning();
        const [ppaInstrument] = await tx.insert(t.instruments).values({ governmentEntityId: entityId, kind: "PPA", code: "2026-2029", title: "Plano Plurianual 2026–2029", startYear: 2026, endYear: 2029, multiYearPlanId: ppa.id, createdById: actor.id }).returning();
        const [ldo] = await tx.insert(t.ldos).values({ financialYearId: financialYear.id, multiYearPlanId: ppa.id, status: "DRAFT", draftedById: actor.id }).returning();
        const [ldoInstrument] = await tx.insert(t.instruments).values({ governmentEntityId: entityId, kind: "LDO", code: "2027", title: "Diretrizes Orçamentárias 2027", startYear: 2027, endYear: 2027, budgetGuidelineId: ldo.id, parentId: ppaInstrument.id, projectNumber: "034/2026", createdById: actor.id }).returning();
        const [loa] = await tx.insert(t.loas).values({ financialYearId: financialYear.id, budgetGuidelineId: ldo.id, lawNumber: "2027", totalRevenue: new Decimal('0'), totalExpense: new Decimal('0'), status: "DRAFT", draftedById: actor.id }).returning();
        const [loaInstrument] = await tx.insert(t.instruments).values({ governmentEntityId: entityId, kind: "LOA", code: "2027", title: "Orçamento Anual 2027", startYear: 2027, endYear: 2027, annualBudgetLawId: loa.id, parentId: ldoInstrument.id, projectNumber: "052/2026", createdById: actor.id }).returning();
        let total = new Decimal(0);
        const programs = municipalReference.programs.filter((p) => entity.code === "CMVA" ? p.unit === "01.01" : p.unit !== "01.01");
        for (const program of programs) {
          const [row] = await tx.insert(t.programs).values({ multiYearPlanId: ppa.id, code: program.code, name: program.name, type: ["01.01", "02.01"].includes(program.unit) ? "Gestão" : "Finalístico", origin: "Plano de governo e demandas das audiências públicas", guidelines: "Ampliar acesso aos serviços, melhorar resultados e assegurar transparência.", targetAudience: program.audience, financing: "Recursos ordinários livres e transferências legalmente vinculadas", managerName: program.manager }).returning();
          const [objective] = await tx.insert(t.objectives).values({ programId: row.id, code: `${program.code}.01`, description: program.action }).returning();
          await tx.insert(t.indicators).values({ objectiveId: objective.id, name: program.product, unit: program.productUnit, baselineValue: Number(program.target) * 0.8, targetValue: Number(program.target) });
          const [action] = await tx.insert(t.actions).values({ programId: row.id, code: program.actionCode, name: program.action, type: program.actionCode.startsWith("1") ? "Projeto" : "Atividade" }).returning();
          for (const instrument of [ppaInstrument, ldoInstrument, loaInstrument]) {
            for (const year of instrument.kind === "PPA" ? [2026, 2027, 2028, 2029] : [2027]) {
              await tx.insert(t.lines).values({ instrumentId: instrument.id, kind: "EXPENSE", code: `${program.code}.${year}`, description: program.action, year, budgetUnitId: units.get(program.unit)!, resourceSourceId: source.id, expenseNatureId: expense.id, programId: row.id, actionId: action.id, functionCode: program.functionCode, subfunctionCode: program.subfunctionCode, product: program.product, productUnit: program.productUnit, physicalTarget: new Decimal(program.target), originalValue: new Decimal(program.value) });
              await tx.insert(t.lines).values({ instrumentId: instrument.id, kind: "REVENUE", code: `R.${program.code}.${year}`, description: entity.code === "CMVA" ? "Transferência financeira do Executivo para manutenção do Legislativo" : "Receitas ordinárias destinadas ao programa", year, budgetUnitId: units.get(program.unit)!, resourceSourceId: source.id, revenueNatureId: entity.code === "CMVA" ? legislativeRevenue.id : revenue.id, originalValue: new Decimal(program.value) });
            }
          }
          await tx.insert(t.fixations).values({ annualBudgetLawId: loa.id, code: `${program.code}.2027`, name: program.action, fixedValue: new Decimal(program.value) });
          await tx.insert(t.forecasts).values({ annualBudgetLawId: loa.id, code: `R.${program.code}.2027`, name: "Receitas ordinárias", estimatedValue: new Decimal(program.value) });
          total = total.plus(program.value);
        }
        await tx.update(t.loas).set({ totalRevenue: total, totalExpense: total }).where(eq(t.loas.id, loa.id));
        await tx.insert(t.memories).values({ instrumentId: ldoInstrument.id, title: "Projeção das receitas ordinárias", normativeReference: "LRF, art. 12", methodology: "Atualização da base de arrecadação pelo crescimento estimado do exercício.", assumptions: "Crescimento nominal de 4,5%, manutenção das alíquotas e evolução do nível de atividade local.", baseValue: total.div("1.045").toDecimalPlaces(2), rate: new Decimal("4.5"), resultValue: total, createdById: actor.id });
      }
      await tx.insert(t.audits).values({ action: "MUNICIPAL_REFERENCE_LOADED", entityType: "PLANNING_DATASET", entityId: "VILA_ARAUCArias_2026", authorUsuarioId: actor.id, payload: { municipality: municipalReference.name, entities: 2, councilors: 9, advisors: 9 } });
    }, { timeoutMs: 120000 });
}
async function main() {
  const url = process.env.MUNICIPAL_SEED_DATABASE_URL;
  const actorId = process.env.MUNICIPAL_SEED_ACTOR_ID;
  if (!url || !actorId || process.argv[2] !== "--apply" || process.argv.length !== 3) throw new Error("Informe MUNICIPAL_SEED_DATABASE_URL, MUNICIPAL_SEED_ACTOR_ID e --apply.");
  if (process.env.VERCEL_ENV === "production" || process.env.NODE_ENV === "production" || url === process.env.DATABASE_URL || url === process.env.DATABASE_URL_UNPOOLED) throw new Error("A carga exige conexão isolada, diferente da base operacional.");
  const connection = openMunicipalSetupConnection(url);
  try {
    await seedMunicipalPlanning(connection, actorId);
    console.log("Cadastros municipais e instrumentos orçamentários carregados.");
  } finally { await connection.pool.end(); }
}

if (require.main === module) main().catch(() => { console.error("A carga municipal não foi concluída. Verifique a conexão isolada, o ator e os pré-requisitos do schema."); process.exitCode = 1; });
