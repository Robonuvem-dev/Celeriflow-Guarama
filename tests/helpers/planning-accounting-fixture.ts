import { readFileSync, readdirSync } from "node:fs";
import { Decimal } from "../../src/db/decimal";
import { accountingEvents, accountingPlans, accountingRules as accountingPostingRules } from "../../src/db/schema/finance-accounting";
import type { PlanningContext } from "../../src/lib/planejamento/access";
import { addPlanningAction, addPlanningLine, addPlanningProgram, configurePlanningEntity, createPlanningInstrument } from "../../src/lib/planejamento/service";
import { transitionPlanningPiece } from "../../src/lib/planejamento/versions";
import { planningAccountingEvents } from "../../src/lib/planejamento/accounting-bridge";
import { createPlanningPostgresBackend } from "./planning-postgres-backend";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";
import { connectFinanceDrizzleFixture } from "./finance-drizzle-connection";

/** Original SQL history and the production Drizzle driver, including real
 * accounting constraints. The optional PostgreSQL backend stays schema-isolated. */
export async function createPlanningAccountingFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE", options: { year?: number; expenseLineAmount?: string } = {}) {
  const year = options.year ?? 2026;
  const expenseLineAmount = options.expenseLineAmount ?? "50.00";
  const external = process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL ? await createPlanningPostgresBackend(process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL) : null;
  const local = external ? null : await createLocalDrizzleDatabase();
  const transport = external ? await connectFinanceDrizzleFixture(external) : null;
  const pg = external ?? local!.database;
  const connection = transport?.connection ?? local!.connection;
  const db = connection.db;
  const close = async () => { try { await transport?.close(); } finally { if (external) await external.close(); else await local!.close(); } };
  try {
    const migrations = readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const migration of migrations) await pg.exec(readFileSync(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    await pg.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('planning-profile','PLANNING_TEST','Planejamento','{}',NOW());
      INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('servidora-ana','Ana Paula Martins',NOW());
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('ana','Ana Paula Martins','ana.martins@example.org','planning-profile',NOW()),('beatriz','Beatriz Oliveira Santos','beatriz.santos@example.org','planning-profile',NOW());
      INSERT INTO "GovernmentEntity" (id,code,name,type,status,"updatedAt") VALUES ('ente','VA','Vila das Araucárias','${jurisdiction === "EXECUTIVE" ? "PREFEITURA" : "CAMARA"}','ATIVA',NOW());
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretaria','Administração Municipal',NOW());
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','01.01','Unidade Municipal','secretaria',NOW()),('ug-restrita','02.01','Unidade de Obras','secretaria',NOW());
      INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('ano',${year},'ente','Preparação','${year}-01-01','${year}-12-31',NOW());
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('livre','000','Recursos ordinários',NOW()),('vinculada','303','Recursos vinculados',NOW());
      INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('receita','1.7.1.1.51','Transferências da União',NOW());
      INSERT INTO "ExpenseNature" (id,code,name,"updatedAt") VALUES ('despesa','3.3.90.39','Serviços de terceiros',NOW());
    `);
    const context = { database: db, connection, jurisdiction, user: { id: "ana", firebaseUid: "planning-ana", email: "ana.martins@example.org", role: "ADMIN", departmentId: null, secretariatId: null, name: "Ana Paula Martins", employeeId: "servidora-ana", profileCode: "SYSTEM_ADMINISTRATOR", modulePermissions: [], allowedBudgetUnitIds: ["ug"], permissions: JSON.stringify({ modules: { PLANEJAMENTO: { blocked: false, create: true, update: true, issueReports: true, legalApproval: true }, FINANCEIRO: { blocked: false, create: true, update: true }, CAMARA: { blocked: false } } }) } } satisfies PlanningContext;
    const reviewer = { ...context, user: { ...context.user, id: "beatriz" } };
    await configurePlanningEntity(context, "ente", "ug");
    await configurePlanningEntity(context, "ente", "ug-restrita");
    const common = { governmentEntityId: "ente", revenueDegree: 6, expenseLevel: "ELEMENT_SOURCE" };
    const ppa = await createPlanningInstrument(context, { ...common, kind: "PPA", code: `${year}-${year + 3}`, title: "Plano Plurianual Municipal", startYear: year, endYear: year + 3 });
    const program = await addPlanningProgram(context, { instrumentId: ppa, code: "0001", name: "Gestão Municipal", type: "Gestão", origin: "Plano de governo", objectiveCode: "01", objective: "Manter serviços municipais", guidelines: "Atendimento contínuo", targetAudience: "População municipal", financing: "Recursos ordinários", managerName: "Ana Paula Martins", indicatorName: "Serviços prestados", indicatorUnit: "serviços", baselineValue: 50, targetValue: 100 });
    const action = await addPlanningAction(context, { instrumentId: ppa, programId: program, code: "2001", name: "Manutenção dos serviços", type: "Atividade" });
    const ldo = await createPlanningInstrument(context, { ...common, kind: "LDO", code: String(year), title: "Diretrizes Orçamentárias", startYear: year, endYear: year, parentId: ppa });
    const loa = await createPlanningInstrument(context, { ...common, kind: "LOA", code: String(year), title: "Orçamento Municipal", startYear: year, endYear: year, parentId: ldo });
    const revenue = await addPlanningLine(context, { instrumentId: loa, kind: "REVENUE", code: "R", description: "Receitas ordinárias", year, budgetUnitId: "ug", resourceSourceId: "livre", revenueNatureId: "receita", originalValue: new Decimal(expenseLineAmount).mul(2).toFixed(2) });
    const expenseInput = { instrumentId: loa, kind: "EXPENSE", year, budgetUnitId: "ug", resourceSourceId: "livre", expenseNatureId: "despesa", programId: program, actionId: action, functionCode: "04", subfunctionCode: "122", product: "Serviços prestados", productUnit: "serviços", physicalTarget: "100" };
    const e1 = await addPlanningLine(context, { ...expenseInput, code: "E1", description: "Serviços administrativos", originalValue: expenseLineAmount });
    const e2 = await addPlanningLine(context, { ...expenseInput, code: "E2", description: "Serviços complementares", originalValue: expenseLineAmount });
    const legalYear = Math.min(year, new Date().getUTCFullYear());
    const workflow = { instrumentId: loa, date: `${legalYear}-01-01`, legalActNumber: `Lei 1/${legalYear}`, legalText: "Orçamento aprovado", publicationReference: "Diário Municipal, edição 1" };
    for (const stage of ["SUBMIT", "APPROVE", "SANCTION", "PUBLISH"]) await transitionPlanningPiece(stage === "APPROVE" ? reviewer : context, { ...workflow, stage });
    const rules = async () => {
      await db.insert(accountingPlans).values([{ id: "debito", code: "ISOLATED.D", name: "Conta de débito da fixture isolada", type: "Ativo" }, { id: "credito", code: "ISOLATED.C", name: "Conta de crédito da fixture isolada", type: "Passivo" }]);
      for (const code of planningAccountingEvents) {
        await db.insert(accountingEvents).values({ id: code, code, name: code });
        await db.insert(accountingPostingRules).values({ id: `rule:${code}`, eventId: code, debitAccountId: "debito", creditAccountId: "credito", isReference: true });
      }
    };
    return { pg, db, connection, context, reviewer, ppa, loa, revenue, e1, e2, expenseInput, workflow, rules, close };
  } catch (error) { await close(); throw error; }
}
