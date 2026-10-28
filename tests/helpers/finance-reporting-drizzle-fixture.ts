import { PGlite } from "@electric-sql/pglite";
import { connectFinanceDrizzleFixture } from "./finance-drizzle-connection";

/** Small, local SQL fixture for the shared financial read contracts and legacy Social insert. */
export async function createFinanceReportingDrizzleFixture() {
  const pg = new PGlite();
  let transport: Awaited<ReturnType<typeof connectFinanceDrizzleFixture>> | undefined;
  try {
    await pg.exec(`
      CREATE TABLE "GovernmentEntity" (id text PRIMARY KEY, name text NOT NULL, type text NOT NULL);
      CREATE TABLE "BudgetUnit" (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL);
      CREATE TABLE "PlanningEntityUnit" ("budgetUnitId" text PRIMARY KEY REFERENCES "BudgetUnit", "governmentEntityId" text NOT NULL REFERENCES "GovernmentEntity");
      CREATE TABLE "FinancialYear" (id text PRIMARY KEY, year integer NOT NULL, "governmentEntityId" text REFERENCES "GovernmentEntity", status text NOT NULL, "startDate" timestamp(3) NOT NULL, "endDate" timestamp(3) NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "MunicipalFiscalIndexDefinition" (id text PRIMARY KEY, "financialYearId" text NOT NULL REFERENCES "FinancialYear", code text NOT NULL, revision integer NOT NULL, "legalReference" text NOT NULL, "minimumPercentage" numeric(9,4) NOT NULL, "effectiveFrom" date NOT NULL, definition jsonb NOT NULL, reason text NOT NULL, "actorId" text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now(), UNIQUE ("financialYearId", code, revision));
      CREATE TABLE "AccountingPlan" (id text PRIMARY KEY, code text NOT NULL, name text NOT NULL);
      CREATE TABLE "AccountingTransaction" (id text PRIMARY KEY, "financialYearId" text NOT NULL REFERENCES "FinancialYear", "governmentEntityId" text, "budgetUnitId" text, date timestamp(3) NOT NULL, status text NOT NULL, "sourceType" text NOT NULL, "sourceId" text, "reversalOfId" text);
      CREATE TABLE "AccountingEntry" (id text PRIMARY KEY, "accountId" text NOT NULL, "transactionId" text REFERENCES "AccountingTransaction", type text NOT NULL, "valueDecimal" numeric(18,2));
      CREATE TABLE "MonthlyAccountingClose" (id text PRIMARY KEY, "financialYearId" text NOT NULL, competence timestamp(3) NOT NULL, status text NOT NULL);
      CREATE TABLE "Secretariat" (id text PRIMARY KEY);
      CREATE TABLE "BudgetAppropriation" (id text PRIMARY KEY, "financialYearId" text NOT NULL, "budgetUnitId" text NOT NULL);
      CREATE TABLE "Commitment" (id text PRIMARY KEY, "appropriationId" text NOT NULL REFERENCES "BudgetAppropriation");
      CREATE TABLE "PlanningBudgetLine" (id text PRIMARY KEY, "appropriationId" text UNIQUE REFERENCES "BudgetAppropriation", "functionCode" text);
      CREATE TABLE "Settlement" (id text PRIMARY KEY, "commitmentId" text NOT NULL REFERENCES "Commitment");
      CREATE TABLE "Payment" (id text PRIMARY KEY, "commitmentId" text NOT NULL REFERENCES "Commitment");
      CREATE TABLE "CommitmentMovement" (id text PRIMARY KEY, "commitmentId" text NOT NULL REFERENCES "Commitment");
      CREATE TABLE "Usuario" (id text PRIMARY KEY);
      CREATE TABLE "AuditEvent" (id text PRIMARY KEY, "actorUsuarioId" text NOT NULL REFERENCES "Usuario", "eventType" text NOT NULL, "targetType" text NOT NULL, "targetId" text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "MunicipalCostPolicy" (id text PRIMARY KEY, "governmentEntityId" text NOT NULL, "effectiveFrom" date NOT NULL, enabled boolean NOT NULL, "sourceTypes" jsonb NOT NULL, reason text NOT NULL, "actorId" text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "MunicipalCostObject" (id text PRIMARY KEY, "financialYearId" text NOT NULL, "budgetUnitId" text, code text NOT NULL, description text NOT NULL, "detailedDescription" text NOT NULL, "parentId" text, "sourceKey" text NOT NULL, "sourceSnapshot" jsonb NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "MunicipalCostItem" (id text PRIMARY KEY, "financialYearId" text NOT NULL, identifier text NOT NULL, description text NOT NULL, "detailedDescription" text NOT NULL, "identificationClass" text NOT NULL, behavior text NOT NULL, "isActive" boolean NOT NULL DEFAULT true, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "MunicipalCostObjectItem" (id text PRIMARY KEY, "objectId" text NOT NULL, "itemId" text NOT NULL, "copiedFromId" text, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "MunicipalCostRule" (id text PRIMARY KEY, "financialYearId" text NOT NULL, "budgetUnitId" text NOT NULL, title text NOT NULL, "sourceType" text NOT NULL, selector jsonb NOT NULL, shares jsonb NOT NULL, priority integer NOT NULL DEFAULT 0, "effectiveFrom" date NOT NULL, "effectiveUntil" date, "isActive" boolean NOT NULL DEFAULT true, "retiredAt" timestamp(3), "retirementReason" text, "actorId" text NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "MunicipalCostSource" (id text PRIMARY KEY, "financialYearId" text NOT NULL REFERENCES "FinancialYear", "budgetUnitId" text NOT NULL, "sourceType" text NOT NULL, "sourceId" text NOT NULL, "expenseDate" timestamp(3) NOT NULL, amount numeric(18,2) NOT NULL, status text NOT NULL DEFAULT 'ACTIVE', snapshot jsonb NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "MunicipalCostSourceReduction" (id text PRIMARY KEY, "sourceId" text NOT NULL REFERENCES "MunicipalCostSource", date timestamp(3) NOT NULL, amount numeric(18,2) NOT NULL, reason text NOT NULL, "actorId" text NOT NULL, "idempotencyKey" text NOT NULL UNIQUE, snapshot jsonb NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "MunicipalCostMovement" (id text PRIMARY KEY, "sourceId" text NOT NULL REFERENCES "MunicipalCostSource", kind text NOT NULL, date timestamp(3) NOT NULL, reason text NOT NULL, "actorId" text NOT NULL, "idempotencyKey" text NOT NULL UNIQUE, "referenceMovementId" text UNIQUE, snapshot jsonb NOT NULL, "createdAt" timestamp(3) NOT NULL DEFAULT now());
      CREATE TABLE "MunicipalCostAllocation" (id text PRIMARY KEY, "movementId" text NOT NULL REFERENCES "MunicipalCostMovement", "objectId" text NOT NULL, "itemId" text NOT NULL, amount numeric(18,2) NOT NULL);
      CREATE TABLE "SocialBenefit" (id text PRIMARY KEY);
      CREATE TABLE "SocialProgram" (id text PRIMARY KEY);
      CREATE TABLE "Expense" (id text PRIMARY KEY, date timestamp(3) NOT NULL DEFAULT now(), description text NOT NULL, value double precision NOT NULL, "valueDecimal" numeric(18,2), "appropriationId" text NOT NULL REFERENCES "BudgetAppropriation", "secretariatId" text NOT NULL REFERENCES "Secretariat", "supplierId" text, "requestedById" text, "approvedById" text, "approvedAt" timestamp(3), status text NOT NULL DEFAULT 'Solicitada', "sourceModule" text NOT NULL DEFAULT 'MANUAL', "sourceType" text NOT NULL DEFAULT 'EXPENSE_REQUEST', "sourceId" text, "eventType" text NOT NULL DEFAULT 'EXPENSE_REQUEST', "idempotencyKey" text UNIQUE, "purchaseReceiptId" text UNIQUE, "socialProgramId" text REFERENCES "SocialProgram", "socialBenefitId" text REFERENCES "SocialBenefit", "createdAt" timestamp(3) NOT NULL DEFAULT now(), "updatedAt" timestamp(3) NOT NULL);
      INSERT INTO "GovernmentEntity" VALUES ('ente','Prefeitura','PREFEITURA'), ('camara','Câmara','CAMARA');
      INSERT INTO "BudgetUnit" VALUES ('ug','01','Saúde'), ('ug-2','02','Educação'), ('leg','03','Câmara');
      INSERT INTO "PlanningEntityUnit" VALUES ('ug','ente'), ('ug-2','ente'), ('leg','camara');
      INSERT INTO "FinancialYear" (id, year, "governmentEntityId", status, "startDate", "endDate") VALUES ('ano',2026,'ente','Aberto','2026-01-01','2026-12-31 23:59:59.999'), ('anterior',2025,'ente','Encerrado','2025-01-01','2025-12-31 23:59:59.999'), ('legislativo',2026,'camara','Aberto','2026-01-01','2026-12-31 23:59:59.999'), ('legado',2026,NULL,'Aberto','2026-01-01','2026-12-31 23:59:59.999');
      INSERT INTO "AccountingPlan" VALUES ('debito','3.1','Aplicação'), ('credito','4.1','Base');
      INSERT INTO "Usuario" VALUES ('ana');
      INSERT INTO "Secretariat" VALUES ('secretaria');
      INSERT INTO "BudgetAppropriation" VALUES ('dotacao','ano','ug');
      INSERT INTO "Commitment" VALUES ('empenho','dotacao');
      INSERT INTO "PlanningBudgetLine" VALUES ('linha','dotacao','10');
      INSERT INTO "AccountingTransaction" VALUES ('original','ano','ente','ug','2026-01-10','POSTADO','COMMITMENT','empenho',NULL), ('estorno','ano','ente','ug','2026-01-11','POSTADO','REVERSAL',NULL,'original');
      INSERT INTO "AccountingEntry" VALUES ('e1','debito','original','Débito',90071992547409.96), ('e2','credito','original','Crédito',900719925474099.60), ('e3','debito','estorno','Crédito',0.03), ('e4','credito','estorno','Débito',0.30);
      INSERT INTO "MonthlyAccountingClose" VALUES ('janeiro','ano','2026-01-01','FECHADO');
      INSERT INTO "MunicipalCostObject" (id,"financialYearId","budgetUnitId",code,description,"detailedDescription","sourceKey","sourceSnapshot") VALUES ('objeto','ano','ug','001','Energia municipal','Energia municipal','MANUAL:1','{}');
      INSERT INTO "MunicipalCostItem" (id,"financialYearId",identifier,description,"detailedDescription","identificationClass",behavior) VALUES ('item','ano','ENERGIA','Energia','Energia elétrica','TEXTO','VARIABLE');
      INSERT INTO "MunicipalCostObjectItem" (id,"objectId","itemId") VALUES ('relacao','objeto','item');
      INSERT INTO "MunicipalCostSource" (id,"financialYearId","budgetUnitId","sourceType","sourceId","expenseDate",amount,snapshot) VALUES ('origem','ano','ug','SETTLEMENT','liq','2026-01-10',100.01,'{"evidence":{"settlementId":"liq"}}'), ('historica','anterior','ug','SETTLEMENT','liq-2025','2025-12-01',10.01,'{}'), ('restrita','ano','ug-2','SETTLEMENT','liq-2','2026-01-10',999,'{}');
      INSERT INTO "MunicipalCostSourceReduction" (id,"sourceId",date,amount,reason,"actorId","idempotencyKey",snapshot) VALUES ('devolucao','origem','2026-02-10',0.01,'Retorno','ana','retorno','{}'), ('devolucao-anterior','historica','2026-01-15',3.34,'Retorno do exercício anterior','ana','retorno-anterior','{}');
      INSERT INTO "MunicipalCostMovement" (id,"sourceId",kind,date,reason,"actorId","idempotencyKey","referenceMovementId",snapshot) VALUES ('m1','origem','ALLOCATION','2026-01-20','Janeiro','ana','m1',NULL,'{}'), ('m2','origem','ALLOCATION','2026-02-15','Fevereiro','ana','m2',NULL,'{}'), ('m3','origem','REVERSAL','2026-02-16','Estorno','ana','m3','m2','{}'), ('m4','origem','RESTORATION','2026-02-17','Restauração','ana','m4','m3','{}');
      INSERT INTO "MunicipalCostAllocation" VALUES ('a1','m1','objeto','item',30.01), ('a2','m2','objeto','item',10), ('a3','m3','objeto','item',-10), ('a4','m4','objeto','item',10);
    `);
    transport = await connectFinanceDrizzleFixture(pg);
    const connected = transport;
    return { pg, connection: connected.connection, async close() { try { await connected.close(); } finally { await pg.close(); } } };
  } catch (error) { try { await transport?.close(); } finally { await pg.close(); } throw error; }
}
