import { readFileSync } from "node:fs";
import { Prisma, PrismaClient } from "@prisma/client";
import * as PrismaClientExports from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import type { PlanningContext } from "../../src/lib/planejamento/access";
import { addPlanningAction, addPlanningLine, addPlanningProgram, configurePlanningEntity, createPlanningInstrument } from "../../src/lib/planejamento/service";
import { transitionPlanningPiece } from "../../src/lib/planejamento/versions";
import { planningAccountingEvents } from "../../src/lib/planejamento/accounting-bridge";
import { createPlanningPostgresBackend } from "./planning-postgres-backend";

/** Same isolated PostgreSQL adapter as the domain suite, with real accounting tables/constraints. */
export async function createPlanningAccountingFixture(jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE", options: { year?: number; expenseLineAmount?: string } = {}) {
  const year = options.year ?? 2026;
  const expenseLineAmount = options.expenseLineAmount ?? "50.00";
  const external = process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL ? await createPlanningPostgresBackend(process.env.CELERIFLOW_PLANNING_TEST_POSTGRES_URL) : null;
  const pg = external ?? new PGlite();
  const server = external ? null : new PGLiteSocketServer({ db: pg as PGlite, port: 0, host: "127.0.0.1" });
  let db: PrismaClient | undefined;
  const close = async () => { await db?.$disconnect(); await server?.stop(); await pg.close(); };
  try {
    const omitted: Record<string, string[]> = { ProgramPPA: ["origin", "guidelines", "targetAudience", "financing", "managerName"], ResourceSource: ["tceCode", "stnGroup", "stnSpecification", "stnDetail", "referenceYear"], RevenueNature: ["degree", "shortCode", "referenceYear"], AnnualBudgetLaw: ["metadata"], AccountingTransaction: ["governmentEntityId", "budgetUnitId"], FinancialYear: ["governmentEntityId"] };
    const models = ["GovernmentEntity", "BudgetUnit", "Secretariat", "MultiYearPlan", "BudgetGuideline", "AnnualBudgetLaw", "AnnualBudgetRevenueForecast", "AnnualBudgetExpenseFixation", "BudgetGuidelinePriority", "BudgetGuidelineRisk", "BudgetAppropriation", "CreditRequest", "CreditRequestItem", "BudgetReservation", "BudgetMovement", "ProgramPPA", "ObjectivePPA", "IndicatorPPA", "ActionPPA", "GoalPPA", "FinancialYear", "ResourceSource", "RevenueNature", "ExpenseNature", "FinancialAuditLog", "Document", "DocumentVersion", "DocumentClass", "ConfiguracaoParametroInstancia", "AuditEvent", "HealthClinicalDocument", "HealthLabReport", "SstCertificateDocument", "Employee", "Usuario", "CamVereador", "Person", "CamGabinete", "AccountingPlan", "AccountingEntry", "AccountingTransaction", "AccountingEventCatalog", "AccountingPostingRule", "MonthlyAccountingClose", "Tax", "CamProposicao", "CamLei"];
    models.push("Revenue", "Payment", "Commitment", "CommitmentMovement", "Settlement", "BankStatementImport", "BankStatementItem", "BankAccount", "BankReconciliation", "TreasuryMovement", "MonthlyAccountingCloseEvent", "AnnualAccountingClose", "PayableCarryForward", "PayableCarryForwardEvent");
    omitted.Revenue = ["budgetUnitId"];
    omitted.AccountingEntry = ["classificationSnapshot"];
    models.push("InternalControlPlan", "InternalControlFinding", "InternalControlEvent", "HrIntegrationEvent");
    models.push("TransparencyPublication");
    models.push("UsuarioUnidadeGestora", "CostCenter", "HrEmploymentContract");
    models.push("MaterialMovement");
    models.push("RevenueResourceRedistribution");
    models.push("Company", "Taxpayer", "Supplier", "Creditor");
    models.push("TaxAssessment", "TaxGuide", "TaxPayment", "TaxRevenueIntegrationEvent", "TaxRegistryEntry", "TaxIntegrationEvent");
    omitted.MaterialMovement = ["quantityDecimal", "unitValueDecimal", "totalValueDecimal"];
    omitted.InternalControlPlan = ["budgetUnitId"];
    const enums = new Set<string>();
    for (const name of models) {
      const model = Prisma.dmmf.datamodel.models.find((item) => item.name === name)!;
      for (const field of model.fields.filter((item) => item.kind === "enum")) {
        if (enums.has(field.type)) continue;
        const definition = (PrismaClientExports as Record<string, unknown>)[field.type];
        if (definition && typeof definition === "object") await pg.exec(`CREATE TYPE "${field.type}" AS ENUM (${Object.values(definition as Record<string, string>).map((value) => `'${value}'`).join(",")})`);
        enums.add(field.type);
      }
      const columns = model.fields.filter((item) => item.kind !== "object" && !omitted[name]?.includes(item.name)).map((item) => {
        const types: Record<string, string> = { Int: "INTEGER", Float: "DOUBLE PRECISION", Decimal: "NUMERIC(18,6)", DateTime: "TIMESTAMP(3)", Boolean: "BOOLEAN", Json: "JSONB", Bytes: "BYTEA" };
        let fallback = "";
        if (typeof item.default === "string") fallback = ` DEFAULT '${item.default.replaceAll("'", "''")}'`;
        else if (typeof item.default === "boolean" || typeof item.default === "number") fallback = ` DEFAULT ${item.default}`;
        if (item.type === "DateTime" && item.isRequired) fallback = " DEFAULT CURRENT_TIMESTAMP";
        const sqlType = item.kind === "enum" ? `"${item.type}"` : types[item.type] ?? "TEXT";
        return `"${item.name}" ${sqlType}${item.isList ? "[]" : ""}${item.name === "id" ? " PRIMARY KEY" : ""}${fallback}`;
      });
      await pg.exec(`CREATE TABLE "${name}" (${columns.join(",")})`);
    }
    for (const migration of ["20261011150000_add_planning_scoped_instruments", "20261011160000_add_planning_import_batches", "20261011170000_planning_immutable_movements", "20261011180000_planning_legal_operations", "20261011190000_planning_internal_connections", "20261011200000_planning_accounting_command_integrity", "20261011210000_planning_catalog_maintenance", "20261011220000_planning_publication", "20261012100000_accounting_entity_unit_scope", "20261012110000_entity_scoped_financial_years", "20261012120000_accounting_year_entity_guard", "20261012130000_scoped_year_requires_accounting_scope"]) await pg.exec(readFileSync(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261012140000_revenue_budget_unit_scope/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261012150000_accounting_year_scope_update_guard/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261012160000_internal_control_budget_scope/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261012170000_shared_official_catalog_accounts/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261013200000_municipal_cost_ledger/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261013210000_fiscal_index_definitions/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261013220000_control_audit_event_integrity/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261013230000_material_consumption_costs/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261014100000_control_final_reports/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261014150000_personnel_fiscal_definitions/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261014170000_account_classification_snapshot/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261014220000_msc_versioned_references/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261015010000_composite_accounting_postings/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261015020000_native_processed_carry_forward_payments/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261015030000_bank_resource_source_permissions/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261015040000_native_unprocessed_carry_forward_settlements/migration.sql", "utf8"));
    await pg.exec(readFileSync("prisma/migrations-ibema/20261015050000_carry_forward_settlement_transport/migration.sql", "utf8"));
    await pg.exec(`
      CREATE UNIQUE INDEX ON "AccountingEventCatalog" (code);
      CREATE UNIQUE INDEX ON "AccountingPlan" (code);
      CREATE UNIQUE INDEX ON "ResourceSource" (code);
      CREATE UNIQUE INDEX ON "RevenueNature" (code);
      CREATE UNIQUE INDEX ON "ExpenseNature" (code);
      CREATE UNIQUE INDEX ON "CamProposicao" (numero);
      CREATE UNIQUE INDEX ON "CamLei" (numero);
      CREATE UNIQUE INDEX ON "CamLei" ("proposicaoId");
      CREATE UNIQUE INDEX ON "AccountingTransaction" ("idempotencyKey");
      CREATE UNIQUE INDEX ON "AccountingTransaction" ("reversalOfId");
      CREATE UNIQUE INDEX ON "AccountingPostingRule" ("eventId", "debitAccountId", "creditAccountId");
      CREATE UNIQUE INDEX ON "MonthlyAccountingClose" ("financialYearId", competence);
      CREATE UNIQUE INDEX ON "MaterialMovement" ("idempotencyKey");
      CREATE UNIQUE INDEX ON "MaterialMovement" ("reversedMovementId");
      CREATE UNIQUE INDEX ON "AnnualAccountingClose" ("financialYearId");
      ALTER TABLE "AccountingEntry" ADD FOREIGN KEY ("transactionId") REFERENCES "AccountingTransaction"(id);
      ALTER TABLE "AccountingEntry" ADD FOREIGN KEY ("accountId") REFERENCES "AccountingPlan"(id);
      ALTER TABLE "AccountingEntry" ADD FOREIGN KEY ("authorId") REFERENCES "Employee"(id);
      ALTER TABLE "AccountingEntry" ADD CHECK ("valueDecimal" > 0 AND type IN ('Débito','Crédito'));
      ALTER TABLE "AccountingTransaction" ADD FOREIGN KEY ("financialYearId") REFERENCES "FinancialYear"(id);
      ALTER TABLE "AccountingTransaction" ADD FOREIGN KEY ("authorUsuarioId") REFERENCES "Usuario"(id);
      ALTER TABLE "AccountingTransaction" ADD FOREIGN KEY ("authorEmployeeId") REFERENCES "Employee"(id);
      INSERT INTO "Employee" (id) VALUES ('servidora-ana');
      INSERT INTO "Usuario" (id,nome,email) VALUES ('ana','Ana Paula Martins','ana.martins@example.org'),('beatriz','Beatriz Oliveira Santos','beatriz.santos@example.org');
      INSERT INTO "GovernmentEntity" (id,code,name,type,status) VALUES ('ente','VA','Vila das Araucárias','${jurisdiction === "EXECUTIVE" ? "PREFEITURA" : "CAMARA"}','ATIVA');
      INSERT INTO "Secretariat" (id,name) VALUES ('secretaria','Administração Municipal');
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId") VALUES ('ug','01.01','Unidade Municipal','secretaria'),('ug-restrita','02.01','Unidade de Obras','secretaria');
      INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate") VALUES ('ano',${year},'ente','Preparação','${year}-01-01','${year}-12-31');
      INSERT INTO "ResourceSource" (id,code,name) VALUES ('livre','000','Recursos ordinários'),('vinculada','303','Recursos vinculados');
      INSERT INTO "RevenueNature" (id,code,name) VALUES ('receita','1.7.1.1.51','Transferências da União');
      INSERT INTO "ExpenseNature" (id,code,name) VALUES ('despesa','3.3.90.39','Serviços de terceiros');
    `);
    await server?.start();
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: external?.connectionString ?? `postgresql://postgres:postgres@${server!.getServerConn()}/postgres`, max: external ? 6 : 1 }, external ? { schema: external.schema } : undefined), transactionOptions: { timeout: 60000, maxWait: 60000 } });
    const context = { prisma: db, jurisdiction, user: { id: "ana", name: "Ana Paula Martins", employeeId: "servidora-ana", profileCode: "SYSTEM_ADMINISTRATOR", modulePermissions: [], allowedBudgetUnitIds: ["ug"], permissions: JSON.stringify({ modules: { PLANEJAMENTO: { blocked: false, create: true, update: true, issueReports: true, legalApproval: true }, FINANCEIRO: { blocked: false, create: true, update: true }, CAMARA: { blocked: false } } }) } } as unknown as PlanningContext;
    const reviewer = { ...context, user: { ...context.user, id: "beatriz" } };
    await configurePlanningEntity(context, "ente", "ug");
    await configurePlanningEntity(context, "ente", "ug-restrita");
    const common = { governmentEntityId: "ente", revenueDegree: 6, expenseLevel: "ELEMENT_SOURCE" };
    const ppa = await createPlanningInstrument(context, { ...common, kind: "PPA", code: `${year}-${year + 3}`, title: "Plano Plurianual Municipal", startYear: year, endYear: year + 3 });
    const program = await addPlanningProgram(context, { instrumentId: ppa, code: "0001", name: "Gestão Municipal", type: "Gestão", origin: "Plano de governo", objectiveCode: "01", objective: "Manter serviços municipais", guidelines: "Atendimento contínuo", targetAudience: "População municipal", financing: "Recursos ordinários", managerName: "Ana Paula Martins", indicatorName: "Serviços prestados", indicatorUnit: "serviços", baselineValue: 50, targetValue: 100 });
    const action = await addPlanningAction(context, { instrumentId: ppa, programId: program, code: "2001", name: "Manutenção dos serviços", type: "Atividade" });
    const ldo = await createPlanningInstrument(context, { ...common, kind: "LDO", code: String(year), title: "Diretrizes Orçamentárias", startYear: year, endYear: year, parentId: ppa });
    const loa = await createPlanningInstrument(context, { ...common, kind: "LOA", code: String(year), title: "Orçamento Municipal", startYear: year, endYear: year, parentId: ldo });
    const revenue = await addPlanningLine(context, { instrumentId: loa, kind: "REVENUE", code: "R", description: "Receitas ordinárias", year, budgetUnitId: "ug", resourceSourceId: "livre", revenueNatureId: "receita", originalValue: new Prisma.Decimal(expenseLineAmount).mul(2).toFixed(2) });
    const expenseInput = { instrumentId: loa, kind: "EXPENSE", year, budgetUnitId: "ug", resourceSourceId: "livre", expenseNatureId: "despesa", programId: program, actionId: action, functionCode: "04", subfunctionCode: "122", product: "Serviços prestados", productUnit: "serviços", physicalTarget: "100" };
    const e1 = await addPlanningLine(context, { ...expenseInput, code: "E1", description: "Serviços administrativos", originalValue: expenseLineAmount });
    const e2 = await addPlanningLine(context, { ...expenseInput, code: "E2", description: "Serviços complementares", originalValue: expenseLineAmount });
    const legalYear = Math.min(year, new Date().getUTCFullYear());
    const workflow = { instrumentId: loa, date: `${legalYear}-01-01`, legalActNumber: `Lei 1/${legalYear}`, legalText: "Orçamento aprovado", publicationReference: "Diário Municipal, edição 1" };
    for (const stage of ["SUBMIT", "APPROVE", "SANCTION", "PUBLISH"]) await transitionPlanningPiece(stage === "APPROVE" ? reviewer : context, { ...workflow, stage });
    const rules = async () => {
      await db!.accountingPlan.createMany({ data: [{ id: "debito", code: "ISOLATED.D", name: "Conta de débito da fixture isolada", type: "Ativo" }, { id: "credito", code: "ISOLATED.C", name: "Conta de crédito da fixture isolada", type: "Passivo" }] });
      for (const code of planningAccountingEvents) await db!.accountingEventCatalog.create({ data: { id: code, code, name: code, rules: { create: { id: `rule:${code}`, debitAccountId: "debito", creditAccountId: "credito", isReference: true } } } });
    };
    return { pg, db, context, reviewer, ppa, loa, revenue, e1, e2, expenseInput, workflow, rules, close };
  } catch (error) { await close(); throw error; }
}
