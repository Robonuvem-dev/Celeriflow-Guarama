import { PrismaClient } from "@prisma/client";
import { PrismaNeon } from "@prisma/adapter-neon";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const testDatabaseUrl = process.env.TEST_DATABASE_URL;
if (!testDatabaseUrl) {
  throw new Error("TEST_DATABASE_URL is required; refusing to seed any other database.");
}

const prisma = new PrismaClient({
  adapter: new PrismaNeon({ connectionString: testDatabaseUrl }),
});

const profileId = "bootstrap-test-profile";
const employeeId = "emp-finance-test-01";
const secretariatId = "sec-fin-01";
const budgetUnitId = "budget-unit-fin-01";
const financialYearId = "financial-year-2026";
const primarySupplierId = "supp-lagoaseca-01";
const appropriationId = "appropriation-finance-test-01";

async function main() {
  await prisma.configuracaoPerfil.upsert({
    where: { id: profileId },
    create: {
      id: profileId,
      codigo: "BOOTSTRAP_TEST",
      nome: "Bootstrap Test Profile",
      descricao: "Perfil tecnico exclusivo para testes de integracao.",
      permissoes: "{}",
      ativo: true,
    },
    update: {
      codigo: "BOOTSTRAP_TEST",
      nome: "Bootstrap Test Profile",
      descricao: "Perfil tecnico exclusivo para testes de integracao.",
      permissoes: "{}",
      ativo: true,
    },
  });

  await prisma.secretariat.upsert({
    where: { id: secretariatId },
    create: { id: secretariatId, name: "Secretaria de Financas", acronym: "SEFIN", isActive: true },
    update: { name: "Secretaria de Financas", acronym: "SEFIN", isActive: true },
  });

  await prisma.employee.upsert({
    where: { id: employeeId },
    create: {
      id: employeeId,
      name: "Servidor Financeiro de Teste",
      registration: "TEST-FIN-01",
      email: "servidor-financeiro@example.test",
      secretariatId,
      isActive: true,
    },
    update: {
      name: "Servidor Financeiro de Teste",
      registration: "TEST-FIN-01",
      email: "servidor-financeiro@example.test",
      secretariatId,
      isActive: true,
    },
  });

  const users = [
    { id: "bootstrap-audit-actor", name: "Bootstrap Audit Actor", email: "bootstrap-audit-actor@example.test", employeeId },
    { id: "finance-test-user-02", name: "Finance Test User 02", email: "finance-test-user-02@example.test", employeeId: null },
    { id: "finance-test-user-03", name: "Finance Test User 03", email: "finance-test-user-03@example.test", employeeId: null },
    { id: "finance-test-user-04", name: "Finance Test User 04", email: "finance-test-user-04@example.test", employeeId: null },
    { id: "finance-test-user-05", name: "Finance Test User 05", email: "finance-test-user-05@example.test", employeeId: null },
  ] as const;
  for (const user of users) {
    await prisma.usuario.upsert({
      where: { id: user.id },
      create: {
        id: user.id,
        nome: user.name,
        email: user.email,
        senha: "bootstrap-only-no-login",
        ativo: true,
        perfilId: profileId,
        employeeId: user.employeeId,
      },
      update: {
        nome: user.name,
        email: user.email,
        ativo: true,
        perfilId: profileId,
        employeeId: user.employeeId,
      },
    });
  }

  const year = await prisma.financialYear.upsert({
    where: { year: 2026 },
    create: {
      id: financialYearId,
      year: 2026,
      status: "Aberto",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    },
    update: {
      status: "Aberto",
      startDate: new Date("2026-01-01T00:00:00.000Z"),
      endDate: new Date("2026-12-31T23:59:59.999Z"),
    },
  });
  const budgetUnit = await prisma.budgetUnit.upsert({
    where: { code: "0101" },
    create: { id: budgetUnitId, code: "0101", name: "Prefeitura Municipal - Teste", secretariatId },
    update: { name: "Prefeitura Municipal - Teste", secretariatId },
  });
  const source15000000 = await prisma.resourceSource.upsert({
    where: { code: "15000000" },
    create: { id: "resource-source-15000000", code: "15000000", name: "Recursos nao vinculados de impostos" },
    update: { name: "Recursos nao vinculados de impostos" },
  });
  await prisma.resourceSource.upsert({
    where: { code: "15010000" },
    create: { id: "resource-source-15010000", code: "15010000", name: "Outros recursos nao vinculados" },
    update: { name: "Outros recursos nao vinculados" },
  });
  await prisma.revenueNature.upsert({
    where: { code: "1.1.1.0.00.0.0.00.00" },
    create: { id: "revenue-nature-test-01", code: "1.1.1.0.00.0.0.00.00", name: "Receita tributaria de teste" },
    update: { name: "Receita tributaria de teste" },
  });
  const expenseNature = await prisma.expenseNature.upsert({
    where: { code: "3.3.90.30.00" },
    create: { id: "expense-nature-test-01", code: "3.3.90.30.00", name: "Material de consumo", procurementOriginPolicy: "NONE" },
    update: { name: "Material de consumo", procurementOriginPolicy: "NONE" },
  });
  const appropriation = await prisma.budgetAppropriation.upsert({
    where: { code: "0101.04.122.0001.2002.3.3.90.30.00" },
    create: {
      id: appropriationId,
      code: "0101.04.122.0001.2002.3.3.90.30.00",
      financialYearId: year.id,
      budgetUnitId: budgetUnit.id,
      expenseNatureId: expenseNature.id,
      resourceSourceId: source15000000.id,
      initialValue: 1_000_000,
      initialValueDecimal: "1000000.00",
      updatedValue: 1_000_000,
      updatedValueDecimal: "1000000.00",
      committedValue: 100,
      committedValueDecimal: "100.00",
    },
    update: {
      financialYearId: year.id,
      budgetUnitId: budgetUnit.id,
      expenseNatureId: expenseNature.id,
      resourceSourceId: source15000000.id,
      initialValue: 1_000_000,
      initialValueDecimal: "1000000.00",
      updatedValue: 1_000_000,
      updatedValueDecimal: "1000000.00",
      committedValue: 100,
      committedValueDecimal: "100.00",
    },
  });

  const primaryCompany = await prisma.company.upsert({
    where: { cnpj: "11222333000181" },
    create: { id: "company-lagoaseca-01", corporateName: "Fornecedor Lagoa Seca Ltda", tradeName: "Lagoa Seca Teste", cnpj: "11222333000181", status: "Ativo" },
    update: { corporateName: "Fornecedor Lagoa Seca Ltda", tradeName: "Lagoa Seca Teste", status: "Ativo" },
  });
  await prisma.supplier.upsert({
    where: { id: primarySupplierId },
    create: { id: primarySupplierId, companyId: primaryCompany.id, category: "Materiais", status: "Ativo" },
    update: { companyId: primaryCompany.id, category: "Materiais", status: "Ativo" },
  });
  await prisma.creditor.upsert({
    where: { supplierId: primarySupplierId },
    create: { id: "creditor-lagoaseca-01", supplierId: primarySupplierId, companyId: primaryCompany.id, name: primaryCompany.corporateName, document: primaryCompany.cnpj, status: "Ativo" },
    update: { companyId: primaryCompany.id, name: primaryCompany.corporateName, document: primaryCompany.cnpj, status: "Ativo" },
  });
  const alternateCompany = await prisma.company.upsert({
    where: { cnpj: "44555666000102" },
    create: { id: "company-finance-alternate-01", corporateName: "Fornecedor Alternativo de Teste Ltda", cnpj: "44555666000102", status: "Ativo" },
    update: { corporateName: "Fornecedor Alternativo de Teste Ltda", status: "Ativo" },
  });
  await prisma.supplier.upsert({
    where: { id: "supp-finance-alternate-01" },
    create: { id: "supp-finance-alternate-01", companyId: alternateCompany.id, category: "Materiais", status: "Ativo" },
    update: { companyId: alternateCompany.id, category: "Materiais", status: "Ativo" },
  });

  await prisma.document.upsert({
    where: { id: "doc-nf-lagoaseca-01" },
    create: { id: "doc-nf-lagoaseca-01", title: "Nota fiscal de teste", documentType: "Nota Fiscal", fileUrl: "https://example.test/doc-nf-lagoaseca-01.pdf", status: "Válido", companyId: primaryCompany.id },
    update: { title: "Nota fiscal de teste", documentType: "Nota Fiscal", fileUrl: "https://example.test/doc-nf-lagoaseca-01.pdf", status: "Válido", companyId: primaryCompany.id },
  });

  const debitPlan = await prisma.accountingPlan.upsert({
    where: { code: "1.1.1.1.1.00.01" },
    create: { id: "accounting-plan-debit-test", code: "1.1.1.1.1.00.01", name: "Conta de debito de teste", type: "Ativo" },
    update: { name: "Conta de debito de teste", type: "Ativo" },
  });
  const creditPlan = await prisma.accountingPlan.upsert({
    where: { code: "2.1.1.1.1.00.01" },
    create: { id: "accounting-plan-credit-test", code: "2.1.1.1.1.00.01", name: "Conta de credito de teste", type: "Passivo" },
    update: { name: "Conta de credito de teste", type: "Passivo" },
  });
  const accountingEvents = [
    ["EMPENHO_EMITIDO", "Empenho emitido"],
    ["LIQUIDACAO_REGISTRADA", "Liquidacao registrada"],
    ["PAGAMENTO_EFETIVADO", "Pagamento efetivado"],
    ["RETENCAO_RECOLHIDA", "Retencao recolhida"],
    ["PAGAMENTO_ESTORNADO", "Pagamento estornado"],
  ] as const;
  for (const [code, name] of accountingEvents) {
    const event = await prisma.accountingEventCatalog.upsert({
      where: { code },
      create: { id: `accounting-event-${code.toLowerCase()}`, code, name, description: "Regra exclusiva da fixture de integracao", isActive: true },
      update: { name, description: "Regra exclusiva da fixture de integracao", isActive: true },
    });
    await prisma.accountingPostingRule.updateMany({ where: { eventId: event.id }, data: { isActive: false } });
    await prisma.accountingPostingRule.upsert({
      where: { eventId_debitAccountId_creditAccountId: { eventId: event.id, debitAccountId: debitPlan.id, creditAccountId: creditPlan.id } },
      create: { id: `posting-rule-${code.toLowerCase()}`, eventId: event.id, debitAccountId: debitPlan.id, creditAccountId: creditPlan.id, description: "Regra de teste", isActive: true, isReference: true },
      update: { description: "Regra de teste", isActive: true, isReference: true },
    });
  }

  await prisma.retentionRule.upsert({
    where: { code: "INSS_11" },
    create: {
      id: "retention-rule-inss-11",
      code: "INSS_11",
      type: "INSS",
      description: "Retencao INSS 11%",
      calculationBasePercentage: "100.0000",
      ratePercentage: "11.0000",
      beneficiaryName: "Instituto Nacional do Seguro Social",
      beneficiaryDocument: "29979036000140",
      financialYearId: year.id,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-12-31T23:59:59.999Z"),
      dueDays: 20,
      isActive: true,
    },
    update: {
      type: "INSS",
      description: "Retencao INSS 11%",
      calculationBasePercentage: "100.0000",
      ratePercentage: "11.0000",
      beneficiaryName: "Instituto Nacional do Seguro Social",
      beneficiaryDocument: "29979036000140",
      financialYearId: year.id,
      effectiveFrom: new Date("2026-01-01T00:00:00.000Z"),
      effectiveTo: new Date("2026-12-31T23:59:59.999Z"),
      dueDays: 20,
      isActive: true,
    },
  });

  const bankAccounts = [
    { id: "poc-robonuvem-checking-10001", externalId: "TEST-BA-001", accountNumber: "10001-0", accountType: "Movimento", balance: "300000.00", purpose: "Pagamentos de teste" },
    { id: "poc-robonuvem-revenue-20001", externalId: "TEST-BA-002", accountNumber: "20001-1", accountType: "Arrecadacao", balance: "150000.00", purpose: "Receitas de teste" },
    { id: "poc-robonuvem-investment-90001", externalId: "TEST-BA-003", accountNumber: "90001-4", accountType: "Aplicacao", balance: "200000.00", purpose: "Aplicacoes de teste" },
  ] as const;
  for (const account of bankAccounts) {
    await prisma.bankAccount.upsert({
      where: { id: account.id },
      create: {
        id: account.id,
        bankName: "001 - Banco Virtual Robonuvem",
        agency: "0001",
        accountNumber: account.accountNumber,
        accountType: account.accountType,
        currentBalance: Number(account.balance),
        currentBalanceDecimal: account.balance,
        resourceSourceId: source15000000.id,
        budgetUnitId: budgetUnit.id,
        externalId: account.externalId,
        purpose: account.purpose,
        isActive: true,
      },
      update: {
        bankName: "001 - Banco Virtual Robonuvem",
        agency: "0001",
        accountNumber: account.accountNumber,
        accountType: account.accountType,
        currentBalance: Number(account.balance),
        currentBalanceDecimal: account.balance,
        resourceSourceId: source15000000.id,
        budgetUnitId: budgetUnit.id,
        externalId: account.externalId,
        purpose: account.purpose,
        isActive: true,
      },
    });
    await prisma.treasuryMovement.upsert({
      where: { idempotencyKey: `test-opening-${account.accountNumber}-2026` },
      create: {
        id: `treasury-opening-${account.accountNumber}`,
        date: new Date("2026-01-01T12:00:00.000Z"),
        type: "SaldoInicial",
        direction: "Entrada",
        valueDecimal: account.balance,
        history: `Saldo inicial da conta ${account.accountNumber}`,
        bankAccountId: account.id,
        financialYearId: year.id,
        sourceModule: "TEST_FIXTURE",
        sourceType: "OPENING_BALANCE",
        sourceId: account.id,
        eventType: "TEST_OPENING_BALANCE",
        idempotencyKey: `test-opening-${account.accountNumber}-2026`,
      },
      update: {
        date: new Date("2026-01-01T12:00:00.000Z"),
        direction: "Entrada",
        valueDecimal: account.balance,
        bankAccountId: account.id,
        financialYearId: year.id,
        status: "Confirmado",
      },
    });
  }

  await prisma.purchaseProcess.upsert({
    where: { number: "PROC-LICITA-01" },
    create: { id: "proc-licita-01", number: "PROC-LICITA-01", object: "Processo de contratacao da fixture", type: "Comum", modality: "Pregao", status: "Concluido", secretariatId },
    update: { object: "Processo de contratacao da fixture", type: "Comum", modality: "Pregao", status: "Concluido", secretariatId },
  });
  await prisma.commitment.upsert({
    where: { number: "EMP-RAP-FIXTURE-01" },
    create: {
      id: "commitment-rap-fixture-01",
      number: "EMP-RAP-FIXTURE-01",
      date: new Date("2026-02-01T12:00:00.000Z"),
      value: 100,
      valueDecimal: "100.00",
      type: "Ordinario",
      history: "Empenho duravel para testes de restos a pagar",
      appropriationId: appropriation.id,
      supplierId: primarySupplierId,
      creditorId: "creditor-lagoaseca-01",
      status: "Emitido",
    },
    update: {
      date: new Date("2026-02-01T12:00:00.000Z"),
      value: 100,
      valueDecimal: "100.00",
      type: "Ordinario",
      history: "Empenho duravel para testes de restos a pagar",
      appropriationId: appropriation.id,
      supplierId: primarySupplierId,
      creditorId: "creditor-lagoaseca-01",
      status: "Emitido",
    },
  });

  console.log("Minimal finance/audit integration fixture seeded.");
}

main()
  .catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
