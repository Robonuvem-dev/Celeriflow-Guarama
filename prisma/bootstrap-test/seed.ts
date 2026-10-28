import { sql, type SQL } from "drizzle-orm";
import { config } from "dotenv";
import { createDatabaseConnection } from "../../src/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "../../src/db/transaction";
import { queryRows } from "../../scripts/lib/cross-domain-database";
import { resolveBootstrapTestTarget } from "../../scripts/lib/cross-domain-bootstrap-test-target";

const profileId = "bootstrap-test-profile";
const employeeId = "emp-finance-test-01";
const secretariatId = "sec-fin-01";
const budgetUnitId = "budget-unit-fin-01";
const financialYearId = "financial-year-2026";
const primarySupplierId = "supp-lagoaseca-01";
const appropriationId = "appropriation-finance-test-01";

async function returningId(db: DatabaseExecutor, statement: SQL): Promise<{ id: string }> {
  const [row] = await queryRows<{ id: string }>(db, statement);
  if (!row) throw new Error("A gravação da fixture não retornou seu identificador.");
  return row;
}

/** Only the dedicated bootstrap CLI and isolated database tests call this seed.
 * Every conflict target and update projection is explicit; database constraints
 * and historical triggers remain enabled throughout the fixture load. */
export async function seedBootstrapTestFixture(db: DatabaseTransaction): Promise<void> {
  await db.execute(sql`SELECT set_config('search_path',${"public, pg_catalog"},true)`);
  await db.execute(sql`INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,descricao,permissoes,ativo,"updatedAt")
    VALUES (${profileId},${"BOOTSTRAP_TEST"},${"Bootstrap Test Profile"},${"Perfil tecnico exclusivo para testes de integracao."},${"{}"},${true},CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET codigo=EXCLUDED.codigo,nome=EXCLUDED.nome,descricao=EXCLUDED.descricao,permissoes=EXCLUDED.permissoes,ativo=EXCLUDED.ativo,"updatedAt"=CURRENT_TIMESTAMP`);
  await db.execute(sql`INSERT INTO "Secretariat" (id,name,acronym,"isActive","updatedAt")
    VALUES (${secretariatId},${"Secretaria de Financas"},${"SEFIN"},${true},CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,acronym=EXCLUDED.acronym,"isActive"=EXCLUDED."isActive","updatedAt"=CURRENT_TIMESTAMP`);
  await db.execute(sql`INSERT INTO "Employee" (id,name,registration,email,"secretariatId","isActive","updatedAt")
    VALUES (${employeeId},${"Servidor Financeiro de Teste"},${"TEST-FIN-01"},${"servidor-financeiro@example.test"},${secretariatId},${true},CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name,registration=EXCLUDED.registration,email=EXCLUDED.email,"secretariatId"=EXCLUDED."secretariatId","isActive"=EXCLUDED."isActive","updatedAt"=CURRENT_TIMESTAMP`);

  const users = [
    { id: "bootstrap-audit-actor", name: "Bootstrap Audit Actor", email: "bootstrap-audit-actor@example.test", employeeId },
    { id: "finance-test-user-02", name: "Finance Test User 02", email: "finance-test-user-02@example.test", employeeId: null },
    { id: "finance-test-user-03", name: "Finance Test User 03", email: "finance-test-user-03@example.test", employeeId: null },
    { id: "finance-test-user-04", name: "Finance Test User 04", email: "finance-test-user-04@example.test", employeeId: null },
    { id: "finance-test-user-05", name: "Finance Test User 05", email: "finance-test-user-05@example.test", employeeId: null },
  ] as const;
  for (const user of users) {
    await db.execute(sql`INSERT INTO "Usuario" (id,nome,email,senha,ativo,"perfilId","employeeId","updatedAt")
      VALUES (${user.id},${user.name},${user.email},${"bootstrap-only-no-login"},${true},${profileId},${user.employeeId},CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET nome=EXCLUDED.nome,email=EXCLUDED.email,ativo=EXCLUDED.ativo,"perfilId"=EXCLUDED."perfilId","employeeId"=EXCLUDED."employeeId","updatedAt"=CURRENT_TIMESTAMP`);
  }

  // The historical physical schema now scopes years by entity. This fixture
  // creates the original NULL-entity legacy year, whose partial unique index is
  // FinancialYear_legacy_year_key; an entity-specific 2026 must remain untouched.
  const year = await returningId(db, sql`INSERT INTO "FinancialYear" (id,year,status,"startDate","endDate","updatedAt")
    VALUES (${financialYearId},${2026},${"Aberto"},${"2026-01-01T00:00:00.000Z"},${"2026-12-31T23:59:59.999Z"},CURRENT_TIMESTAMP)
    ON CONFLICT (year) WHERE "governmentEntityId" IS NULL DO UPDATE SET status=EXCLUDED.status,"startDate"=EXCLUDED."startDate","endDate"=EXCLUDED."endDate","updatedAt"=CURRENT_TIMESTAMP RETURNING id`);
  const budgetUnit = await returningId(db, sql`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt")
    VALUES (${budgetUnitId},${"0101"},${"Prefeitura Municipal - Teste"},${secretariatId},CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,"secretariatId"=EXCLUDED."secretariatId","updatedAt"=CURRENT_TIMESTAMP RETURNING id`);
  const source15000000 = await returningId(db, sql`INSERT INTO "ResourceSource" (id,code,name,"updatedAt")
    VALUES (${"resource-source-15000000"},${"15000000"},${"Recursos nao vinculados de impostos"},CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,"updatedAt"=CURRENT_TIMESTAMP RETURNING id`);
  await db.execute(sql`INSERT INTO "ResourceSource" (id,code,name,"updatedAt")
    VALUES (${"resource-source-15010000"},${"15010000"},${"Outros recursos nao vinculados"},CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,"updatedAt"=CURRENT_TIMESTAMP`);
  await db.execute(sql`INSERT INTO "RevenueNature" (id,code,name,"updatedAt")
    VALUES (${"revenue-nature-test-01"},${"1.1.1.0.00.0.0.00.00"},${"Receita tributaria de teste"},CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,"updatedAt"=CURRENT_TIMESTAMP`);
  const expenseNature = await returningId(db, sql`INSERT INTO "ExpenseNature" (id,code,name,"procurementOriginPolicy","updatedAt")
    VALUES (${"expense-nature-test-01"},${"3.3.90.30.00"},${"Material de consumo"},${"NONE"},CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,"procurementOriginPolicy"=EXCLUDED."procurementOriginPolicy","updatedAt"=CURRENT_TIMESTAMP RETURNING id`);
  const appropriation = await returningId(db, sql`INSERT INTO "BudgetAppropriation"
    (id,code,"financialYearId","budgetUnitId","expenseNatureId","resourceSourceId","initialValue","initialValueDecimal","updatedValue","updatedValueDecimal","committedValue","committedValueDecimal","updatedAt")
    VALUES (${appropriationId},${"0101.04.122.0001.2002.3.3.90.30.00"},${year.id},${budgetUnit.id},${expenseNature.id},${source15000000.id},${1_000_000},${"1000000.00"},${1_000_000},${"1000000.00"},${100},${"100.00"},CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE SET "financialYearId"=EXCLUDED."financialYearId","budgetUnitId"=EXCLUDED."budgetUnitId","expenseNatureId"=EXCLUDED."expenseNatureId","resourceSourceId"=EXCLUDED."resourceSourceId",
    "initialValue"=EXCLUDED."initialValue","initialValueDecimal"=EXCLUDED."initialValueDecimal","updatedValue"=EXCLUDED."updatedValue","updatedValueDecimal"=EXCLUDED."updatedValueDecimal","committedValue"=EXCLUDED."committedValue","committedValueDecimal"=EXCLUDED."committedValueDecimal","updatedAt"=CURRENT_TIMESTAMP RETURNING id`);

  const [primaryCompany] = await queryRows<{ id: string; corporateName: string; cnpj: string | null }>(db, sql`INSERT INTO "Company" (id,"corporateName","tradeName",cnpj,status,"updatedAt")
    VALUES (${"company-lagoaseca-01"},${"Fornecedor Lagoa Seca Ltda"},${"Lagoa Seca Teste"},${"11222333000181"},${"Ativo"},CURRENT_TIMESTAMP)
    ON CONFLICT (cnpj) DO UPDATE SET "corporateName"=EXCLUDED."corporateName","tradeName"=EXCLUDED."tradeName",status=EXCLUDED.status,"updatedAt"=CURRENT_TIMESTAMP RETURNING id,"corporateName",cnpj`);
  if (!primaryCompany) throw new Error("Fornecedor principal da fixture não retornado.");
  await db.execute(sql`INSERT INTO "Supplier" (id,"companyId",category,status,"updatedAt")
    VALUES (${primarySupplierId},${primaryCompany.id},${"Materiais"},${"Ativo"},CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET "companyId"=EXCLUDED."companyId",category=EXCLUDED.category,status=EXCLUDED.status,"updatedAt"=CURRENT_TIMESTAMP`);
  await db.execute(sql`INSERT INTO "Creditor" (id,"supplierId","companyId",name,document,status,"updatedAt")
    VALUES (${"creditor-lagoaseca-01"},${primarySupplierId},${primaryCompany.id},${primaryCompany.corporateName},${primaryCompany.cnpj},${"Ativo"},CURRENT_TIMESTAMP)
    ON CONFLICT ("supplierId") DO UPDATE SET "companyId"=EXCLUDED."companyId",name=EXCLUDED.name,document=EXCLUDED.document,status=EXCLUDED.status,"updatedAt"=CURRENT_TIMESTAMP`);
  const alternateCompany = await returningId(db, sql`INSERT INTO "Company" (id,"corporateName",cnpj,status,"updatedAt")
    VALUES (${"company-finance-alternate-01"},${"Fornecedor Alternativo de Teste Ltda"},${"44555666000102"},${"Ativo"},CURRENT_TIMESTAMP)
    ON CONFLICT (cnpj) DO UPDATE SET "corporateName"=EXCLUDED."corporateName",status=EXCLUDED.status,"updatedAt"=CURRENT_TIMESTAMP RETURNING id`);
  await db.execute(sql`INSERT INTO "Supplier" (id,"companyId",category,status,"updatedAt")
    VALUES (${"supp-finance-alternate-01"},${alternateCompany.id},${"Materiais"},${"Ativo"},CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET "companyId"=EXCLUDED."companyId",category=EXCLUDED.category,status=EXCLUDED.status,"updatedAt"=CURRENT_TIMESTAMP`);
  await db.execute(sql`INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"companyId","updatedAt")
    VALUES (${"doc-nf-lagoaseca-01"},${"Nota fiscal de teste"},${"Nota Fiscal"},${"https://example.test/doc-nf-lagoaseca-01.pdf"},${"Válido"},${primaryCompany.id},CURRENT_TIMESTAMP)
    ON CONFLICT (id) DO UPDATE SET title=EXCLUDED.title,"documentType"=EXCLUDED."documentType","fileUrl"=EXCLUDED."fileUrl",status=EXCLUDED.status,"companyId"=EXCLUDED."companyId","updatedAt"=CURRENT_TIMESTAMP`);

  const debitPlan = await returningId(db, sql`INSERT INTO "AccountingPlan" (id,code,name,type,"updatedAt")
    VALUES (${"accounting-plan-debit-test"},${"1.1.1.1.1.00.01"},${"Conta de debito de teste"},${"Ativo"},CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,type=EXCLUDED.type,"updatedAt"=CURRENT_TIMESTAMP RETURNING id`);
  const creditPlan = await returningId(db, sql`INSERT INTO "AccountingPlan" (id,code,name,type,"updatedAt")
    VALUES (${"accounting-plan-credit-test"},${"2.1.1.1.1.00.01"},${"Conta de credito de teste"},${"Passivo"},CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,type=EXCLUDED.type,"updatedAt"=CURRENT_TIMESTAMP RETURNING id`);
  const accountingEvents = [
    ["EMPENHO_EMITIDO", "Empenho emitido"],
    ["LIQUIDACAO_REGISTRADA", "Liquidacao registrada"],
    ["PAGAMENTO_EFETIVADO", "Pagamento efetivado"],
    ["RETENCAO_RECOLHIDA", "Retencao recolhida"],
    ["PAGAMENTO_ESTORNADO", "Pagamento estornado"],
  ] as const;
  for (const [code, name] of accountingEvents) {
    const event = await returningId(db, sql`INSERT INTO "AccountingEventCatalog" (id,code,name,description,"isActive","updatedAt")
      VALUES (${`accounting-event-${code.toLowerCase()}`},${code},${name},${"Regra exclusiva da fixture de integracao"},${true},CURRENT_TIMESTAMP)
      ON CONFLICT (code) DO UPDATE SET name=EXCLUDED.name,description=EXCLUDED.description,"isActive"=EXCLUDED."isActive","updatedAt"=CURRENT_TIMESTAMP RETURNING id`);
    await db.execute(sql`UPDATE "AccountingPostingRule" SET "isActive"=${false},"updatedAt"=CURRENT_TIMESTAMP WHERE "eventId"=${event.id}`);
    await db.execute(sql`INSERT INTO "AccountingPostingRule" (id,"eventId","debitAccountId","creditAccountId",description,"isActive","isReference","updatedAt")
      VALUES (${`posting-rule-${code.toLowerCase()}`},${event.id},${debitPlan.id},${creditPlan.id},${"Regra de teste"},${true},${true},CURRENT_TIMESTAMP)
      ON CONFLICT ("eventId","debitAccountId","creditAccountId") DO UPDATE SET description=EXCLUDED.description,"isActive"=EXCLUDED."isActive","isReference"=EXCLUDED."isReference","updatedAt"=CURRENT_TIMESTAMP`);
  }

  await db.execute(sql`INSERT INTO "RetentionRule" (id,code,type,description,"calculationBasePercentage","ratePercentage","beneficiaryName","beneficiaryDocument","financialYearId","effectiveFrom","effectiveTo","dueDays","isActive","updatedAt")
    VALUES (${"retention-rule-inss-11"},${"INSS_11"},${"INSS"},${"Retencao INSS 11%"},${"100.0000"},${"11.0000"},${"Instituto Nacional do Seguro Social"},${"29979036000140"},${year.id},${"2026-01-01T00:00:00.000Z"},${"2026-12-31T23:59:59.999Z"},${20},${true},CURRENT_TIMESTAMP)
    ON CONFLICT (code) DO UPDATE SET type=EXCLUDED.type,description=EXCLUDED.description,"calculationBasePercentage"=EXCLUDED."calculationBasePercentage","ratePercentage"=EXCLUDED."ratePercentage","beneficiaryName"=EXCLUDED."beneficiaryName","beneficiaryDocument"=EXCLUDED."beneficiaryDocument","financialYearId"=EXCLUDED."financialYearId","effectiveFrom"=EXCLUDED."effectiveFrom","effectiveTo"=EXCLUDED."effectiveTo","dueDays"=EXCLUDED."dueDays","isActive"=EXCLUDED."isActive","updatedAt"=CURRENT_TIMESTAMP`);

  const bankAccounts = [
    { id: "poc-robonuvem-checking-10001", externalId: "TEST-BA-001", accountNumber: "10001-0", accountType: "Movimento", balance: "300000.00", purpose: "Pagamentos de teste" },
    { id: "poc-robonuvem-revenue-20001", externalId: "TEST-BA-002", accountNumber: "20001-1", accountType: "Arrecadacao", balance: "150000.00", purpose: "Receitas de teste" },
    { id: "poc-robonuvem-investment-90001", externalId: "TEST-BA-003", accountNumber: "90001-4", accountType: "Aplicacao", balance: "200000.00", purpose: "Aplicacoes de teste" },
  ] as const;
  for (const account of bankAccounts) {
    await db.execute(sql`INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","accountType","currentBalance","currentBalanceDecimal","resourceSourceId","budgetUnitId","externalId",purpose,"isActive","updatedAt")
      VALUES (${account.id},${"001 - Banco Virtual Robonuvem"},${"0001"},${account.accountNumber},${account.accountType},${Number(account.balance)},${account.balance},${source15000000.id},${budgetUnit.id},${account.externalId},${account.purpose},${true},CURRENT_TIMESTAMP)
      ON CONFLICT (id) DO UPDATE SET "bankName"=EXCLUDED."bankName",agency=EXCLUDED.agency,"accountNumber"=EXCLUDED."accountNumber","accountType"=EXCLUDED."accountType","currentBalance"=EXCLUDED."currentBalance","currentBalanceDecimal"=EXCLUDED."currentBalanceDecimal","resourceSourceId"=EXCLUDED."resourceSourceId","budgetUnitId"=EXCLUDED."budgetUnitId","externalId"=EXCLUDED."externalId",purpose=EXCLUDED.purpose,"isActive"=EXCLUDED."isActive","updatedAt"=CURRENT_TIMESTAMP`);
    await db.execute(sql`INSERT INTO "TreasuryMovement" (id,date,type,direction,"valueDecimal",history,"bankAccountId","financialYearId","sourceModule","sourceType","sourceId","eventType","idempotencyKey")
      VALUES (${`treasury-opening-${account.accountNumber}`},${"2026-01-01T12:00:00.000Z"},${"SaldoInicial"},${"Entrada"},${account.balance},${`Saldo inicial da conta ${account.accountNumber}`},${account.id},${year.id},${"TEST_FIXTURE"},${"OPENING_BALANCE"},${account.id},${"TEST_OPENING_BALANCE"},${`test-opening-${account.accountNumber}-2026`})
      ON CONFLICT ("idempotencyKey") DO UPDATE SET date=EXCLUDED.date,direction=EXCLUDED.direction,"valueDecimal"=EXCLUDED."valueDecimal","bankAccountId"=EXCLUDED."bankAccountId","financialYearId"=EXCLUDED."financialYearId",status=${"Confirmado"}`);
  }
  await db.execute(sql`INSERT INTO "PurchaseProcess" (id,number,object,type,modality,status,"secretariatId","updatedAt")
    VALUES (${"proc-licita-01"},${"PROC-LICITA-01"},${"Processo de contratacao da fixture"},${"Comum"},${"Pregao"},${"Concluido"},${secretariatId},CURRENT_TIMESTAMP)
    ON CONFLICT (number) DO UPDATE SET object=EXCLUDED.object,type=EXCLUDED.type,modality=EXCLUDED.modality,status=EXCLUDED.status,"secretariatId"=EXCLUDED."secretariatId","updatedAt"=CURRENT_TIMESTAMP`);
  await db.execute(sql`INSERT INTO "Commitment" (id,number,date,value,"valueDecimal",type,history,"appropriationId","supplierId","creditorId",status,"updatedAt")
    VALUES (${"commitment-rap-fixture-01"},${"EMP-RAP-FIXTURE-01"},${"2026-02-01T12:00:00.000Z"},${100},${"100.00"},${"Ordinario"},${"Empenho duravel para testes de restos a pagar"},${appropriation.id},${primarySupplierId},${"creditor-lagoaseca-01"},${"Emitido"},CURRENT_TIMESTAMP)
    ON CONFLICT (number) DO UPDATE SET date=EXCLUDED.date,value=EXCLUDED.value,"valueDecimal"=EXCLUDED."valueDecimal",type=EXCLUDED.type,history=EXCLUDED.history,"appropriationId"=EXCLUDED."appropriationId","supplierId"=EXCLUDED."supplierId","creditorId"=EXCLUDED."creditorId",status=EXCLUDED.status,"updatedAt"=CURRENT_TIMESTAMP`);
}

async function main(): Promise<void> {
  config({ path: ".env.local", quiet: true });
  const target = resolveBootstrapTestTarget(process.env);
  const connection = createDatabaseConnection(target.connectionString);
  try {
    await withDatabaseTransaction(connection, seedBootstrapTestFixture, { timeoutMs: 120_000, lockTimeoutMs: 120_000 });
    console.log("Minimal finance/audit integration fixture seeded.");
  } finally { await connection.pool.end(); }
}

if (process.argv[1]?.replaceAll("\\", "/").endsWith("/bootstrap-test/seed.ts")) {
  main().catch(() => { console.error("Dedicated test fixture seed failed."); process.exitCode = 1; });
}
