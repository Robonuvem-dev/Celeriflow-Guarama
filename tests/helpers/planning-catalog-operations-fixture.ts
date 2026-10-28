import { readFile, readdir } from "node:fs/promises";
import { eq } from "drizzle-orm";
import { Decimal } from "../../src/db/decimal";
import { accessProfiles, users } from "../../src/db/schema/identity";
import { secretariats } from "../../src/db/schema/administration";
import { governmentEntities } from "../../src/db/schema/master-data";
import { financialYears } from "../../src/db/schema/finance-years";
import { planningAppropriations, planningBudgetLaws, planningBudgetUnits, planningEntityScopes, planningEntityUnits, planningGuidelines, planningInstruments, planningLines, planningMultiYearPlans } from "../../src/db/schema/planning-budget";
import { planningActions, planningFixations, planningForecasts, planningIndicators, planningObjectives, planningPrograms, planningResourceSources, planningRevenueNatures, planningExpenseNatures } from "../../src/db/schema/planning-legal";
import type { PlanningContext } from "../../src/lib/planejamento/access";
import type { PermissionUser } from "../../src/lib/contracts/identity";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Full original SQL replay, including FKs, legal/catalog immutability, credit
 * guards and outbox integrity. No generated ORM metadata or Planning fixtures. */
export async function createPlanningCatalogOperationsFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const name of migrations) {
      try { await fixture.database.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8")); }
      catch (error) { throw new Error(`Histórico SQL da fixture de catálogo: ${name}`, { cause: error }); }
    }
    const db = fixture.connection.db;
    await db.insert(accessProfiles).values({ id: "co-profile", codigo: "CO_LEGAL", nome: "Planejamento municipal", permissoes: "{}" });
    await db.insert(users).values(["author", "approver", "sanctioner"].map(role => ({ id: `co-${role}`, nome: role, email: `${role}@catalog.invalid`, perfilId: "co-profile" })));
    await db.insert(secretariats).values({ id: "co-secretariat", name: "Administração municipal" });
    await db.insert(governmentEntities).values([
      { id: "co-entity", code: "CO", name: "Ente executivo", type: "PREFEITURA" },
      { id: "co-legislative", code: "CL", name: "Câmara", type: "CAMARA" },
      { id: "co-other", code: "CX", name: "Outro ente executivo", type: "PREFEITURA" },
    ]);
    await db.insert(planningEntityScopes).values([{ governmentEntityId: "co-entity", jurisdiction: "EXECUTIVE" }, { governmentEntityId: "co-legislative", jurisdiction: "LEGISLATIVE" }, { governmentEntityId: "co-other", jurisdiction: "EXECUTIVE" }]);
    await db.insert(planningBudgetUnits).values(["unit", "restricted", "legislative-unit", "other-unit"].map((name, index) => ({ id: `co-${name}`, code: `CO.${index}`, name, secretariatId: "co-secretariat" })));
    await db.insert(planningEntityUnits).values([{ budgetUnitId: "co-unit", governmentEntityId: "co-entity" }, { budgetUnitId: "co-restricted", governmentEntityId: "co-entity" }, { budgetUnitId: "co-legislative-unit", governmentEntityId: "co-legislative" }, { budgetUnitId: "co-other-unit", governmentEntityId: "co-other" }]);
    await db.insert(planningResourceSources).values([{ id: "co-source", code: "CO.500", name: "Recursos livres" }, { id: "co-source-2", code: "CO.600", name: "Recursos vinculados" }]);
    await db.insert(planningRevenueNatures).values({ id: "co-revenue", code: "CO.1", name: "Receita municipal", degree: 6, shortCode: "R01", referenceYear: 2026 });
    await db.insert(planningExpenseNatures).values({ id: "co-expense", code: "CO.3", name: "Serviços municipais" });
    const permissions = JSON.stringify({ modules: Object.fromEntries(["PLANEJAMENTO", "FINANCEIRO", "CAMARA", "CADASTROS"].map(code => [code, { showDashboardCard: true, blocked: false, create: true, update: true, delete: true, issueReports: true, legalApproval: true }])) });
    const user: PermissionUser = { id: "co-author", name: "Responsável pela elaboração", firebaseUid: "co-author", email: "author@catalog.invalid", role: "Planejador", profileCode: "CO_LEGAL", permissions, modulePermissions: ["PLANEJAMENTO", "FINANCEIRO", "CAMARA", "CADASTROS"].map(code => ({ code, canView: true, canEdit: true })), allowedBudgetUnitIds: ["co-unit"], employeeId: null, departmentId: null, secretariatId: null };
    // The shared PlanningContext handoff removes its inherited legacy client.
    // Intentionally supply only the real connection/executor; no compatibility cast.
    const context: PlanningContext = { user, jurisdiction: "EXECUTIVE", connection: fixture.connection, database: db };
    const actor = (role: "author" | "approver" | "sanctioner", base = context): PlanningContext => ({ ...base, user: { ...base.user, id: `co-${role}` } });
    async function chain(prefix: string, options: { year?: number; entityId?: string; status?: string } = {}) {
      const year = options.year ?? 2026, entityId = options.entityId ?? "co-entity", status = options.status ?? "DRAFT";
      const financialYearId = `${entityId}:${year}`;
      await db.insert(financialYears).values({ id: financialYearId, year, governmentEntityId: entityId, status: "Aberto", startDate: new Date(`${year}-01-01T00:00:00.000Z`), endDate: new Date(`${year}-12-31T23:59:59.999Z`) }).onConflictDoNothing();
      const legal = { status, sanctionedAt: status === "DRAFT" ? null : new Date(`${year}-01-01T00:00:00.000Z`), legalActNumber: status === "DRAFT" ? null : `Lei-${prefix}` };
      await db.insert(planningMultiYearPlans).values({ id: `${prefix}:ppa`, code: `${prefix}:ppa`, name: prefix, startYear: year, endYear: year + 3, status: "DRAFT" });
      await db.insert(planningGuidelines).values({ id: `${prefix}:ldo`, financialYearId, multiYearPlanId: `${prefix}:ppa`, status: "DRAFT" });
      await db.insert(planningBudgetLaws).values({ id: `${prefix}:loa`, lawNumber: `${prefix}:loa`, financialYearId, budgetGuidelineId: `${prefix}:ldo`, totalRevenue: new Decimal(0), totalExpense: new Decimal(0), metadata: { planningInternalExecution: true, planningInternalAccounting: false }, status: "DRAFT" });
      const ppa = `${prefix}:piece-ppa`, ldo = `${prefix}:piece-ldo`, loa = `${prefix}:piece-loa`;
      const common = { governmentEntityId: entityId, title: prefix, startYear: year, createdById: user.id };
      await db.insert(planningInstruments).values({ ...common, id: ppa, kind: "PPA", code: ppa, endYear: year + 3, multiYearPlanId: `${prefix}:ppa` });
      await db.insert(planningInstruments).values({ ...common, id: ldo, kind: "LDO", code: ldo, endYear: year, parentId: ppa, budgetGuidelineId: `${prefix}:ldo` });
      await db.insert(planningInstruments).values({ ...common, id: loa, kind: "LOA", code: loa, endYear: year, parentId: ldo, annualBudgetLawId: `${prefix}:loa` });
      await db.insert(planningPrograms).values({ id: `${prefix}:program`, multiYearPlanId: `${prefix}:ppa`, code: "001", name: "Atendimento municipal", type: "Finalístico", origin: "Diagnóstico", guidelines: "Acesso", targetAudience: "População", financing: "Recursos livres", managerName: "Gestão" });
      await db.insert(planningObjectives).values({ id: `${prefix}:objective`, programId: `${prefix}:program`, code: "01", description: "Ampliar cobertura" });
      await db.insert(planningIndicators).values({ id: `${prefix}:indicator`, objectiveId: `${prefix}:objective`, name: "Cobertura", unit: "%", baselineValue: 0.1, targetValue: 99.125 });
      await db.insert(planningActions).values({ id: `${prefix}:action`, programId: `${prefix}:program`, code: "1001", name: "Atender população", type: "Atividade" });
      if (status !== "DRAFT") {
        await db.update(planningMultiYearPlans).set(legal).where(eq(planningMultiYearPlans.id, `${prefix}:ppa`));
        await db.update(planningGuidelines).set(legal).where(eq(planningGuidelines.id, `${prefix}:ldo`));
        await db.update(planningBudgetLaws).set(legal).where(eq(planningBudgetLaws.id, `${prefix}:loa`));
      }
      return { prefix, year, ppa, ldo, loa, programId: `${prefix}:program`, actionId: `${prefix}:action`, ppaId: `${prefix}:ppa`, lawId: `${prefix}:loa`, financialYearId };
    }
    async function line(piece: Awaited<ReturnType<typeof chain>>, options: { id?: string; code?: string; kind?: "EXPENSE" | "REVENUE"; instrumentId?: string; unitId?: string; value?: string; sourceId?: string; appropriation?: boolean } = {}) {
      const id = options.id ?? `${piece.prefix}:${options.code ?? "E1"}`, kind = options.kind ?? "EXPENSE", code = options.code ?? "E1", value = new Decimal(options.value ?? "100.11");
      const instrumentId = options.instrumentId ?? piece.loa, budgetUnitId = options.unitId ?? "co-unit", resourceSourceId = options.sourceId ?? "co-source";
      const appropriationId = options.appropriation ? `${id}:appropriation` : null;
      if (appropriationId) await db.insert(planningAppropriations).values({ id: appropriationId, code: appropriationId, financialYearId: piece.financialYearId, budgetUnitId, resourceSourceId, expenseNatureId: "co-expense", programPPAId: piece.programId, actionPPAId: piece.actionId, initialValue: value.toNumber(), updatedValue: value.toNumber(), committedValue: 0, initialValueDecimal: value, updatedValueDecimal: value, committedValueDecimal: new Decimal(0) });
      await db.insert(planningLines).values({ id, instrumentId, kind, code, description: `Previsão ${code}`, year: piece.year, budgetUnitId, resourceSourceId, revenueNatureId: kind === "REVENUE" ? "co-revenue" : null, expenseNatureId: kind === "EXPENSE" ? "co-expense" : null, programId: kind === "EXPENSE" ? piece.programId : null, actionId: kind === "EXPENSE" ? piece.actionId : null, functionCode: kind === "EXPENSE" ? "04" : null, subfunctionCode: kind === "EXPENSE" ? "122" : null, product: "Atendimento", productUnit: "pessoa", physicalTarget: new Decimal("1.2345"), originalValue: value, reducedCode: kind === "EXPENSE" ? `${id}:reduced` : null, appropriationId });
      if (instrumentId === piece.loa) {
        if (kind === "EXPENSE") await db.insert(planningFixations).values({ id: `${id}:fixation`, annualBudgetLawId: piece.lawId, code, name: `Previsão ${code}`, fixedValue: value });
        else await db.insert(planningForecasts).values({ id: `${id}:forecast`, annualBudgetLawId: piece.lawId, code, name: `Previsão ${code}`, estimatedValue: value });
        const lines = await db.select().from(planningLines).where(eq(planningLines.instrumentId, piece.loa));
        await db.update(planningBudgetLaws).set({ totalExpense: lines.filter(row => row.kind === "EXPENSE").reduce((sum, row) => sum.plus(row.originalValue), new Decimal(0)), totalRevenue: lines.filter(row => row.kind === "REVENUE").reduce((sum, row) => sum.plus(row.originalValue), new Decimal(0)) }).where(eq(planningBudgetLaws.id, piece.lawId));
      }
      return id;
    }
    return { ...fixture, db, context, actor, chain, line, migrationCount: migrations.length };
  } catch (error) { await fixture.close(); throw error; }
}
