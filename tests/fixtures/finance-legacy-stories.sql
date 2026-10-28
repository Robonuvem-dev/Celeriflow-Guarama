-- Frozen prerequisites for the six original financial integration stories.
-- Original fixture values: prisma/bootstrap-test/seed.ts, reviewed per story.
-- INSERT-only seed; the caller owns BEGIN/COMMIT/ROLLBACK on its local fixture.
-- All DDL, constraints and triggers come from the 156 original migration SQLs.

INSERT INTO "ConfiguracaoPerfil" (id, codigo, nome, descricao, permissoes, ativo, "updatedAt") VALUES
  ('finance-legacy-profile', 'FINANCE_LEGACY_STORIES', 'Finance legacy stories', 'Perfil exclusivo da base descartável de histórias financeiras.', '{}', true, CURRENT_TIMESTAMP);
INSERT INTO "Secretariat" (id, name, acronym, "isActive", "updatedAt") VALUES
  ('sec-fin-01', 'Secretaria de Financas', 'SEFIN', true, CURRENT_TIMESTAMP);
-- Five independent users/employees retain the legal workflow's segregation.
INSERT INTO "Employee" (id, name, registration, email, "secretariatId", "isActive", "updatedAt") VALUES
  ('emp-finance-test-01', 'Servidor Financeiro de Teste', 'TEST-FIN-01', 'servidor-financeiro@example.test', 'sec-fin-01', true, CURRENT_TIMESTAMP),
  ('emp-finance-test-02', 'Servidor Financeiro 02', 'TEST-FIN-02', 'servidor-financeiro-02@example.test', 'sec-fin-01', true, CURRENT_TIMESTAMP),
  ('emp-finance-test-03', 'Servidor Financeiro 03', 'TEST-FIN-03', 'servidor-financeiro-03@example.test', 'sec-fin-01', true, CURRENT_TIMESTAMP),
  ('emp-finance-test-04', 'Servidor Financeiro 04', 'TEST-FIN-04', 'servidor-financeiro-04@example.test', 'sec-fin-01', true, CURRENT_TIMESTAMP),
  ('emp-finance-test-05', 'Servidor Financeiro 05', 'TEST-FIN-05', 'servidor-financeiro-05@example.test', 'sec-fin-01', true, CURRENT_TIMESTAMP);
INSERT INTO "Usuario" (id, nome, email, senha, ativo, "perfilId", "employeeId", "updatedAt") VALUES
  ('bootstrap-audit-actor', 'Bootstrap Audit Actor', 'bootstrap-audit-actor@example.test', 'fixture-only-no-login', true, 'finance-legacy-profile', 'emp-finance-test-01', CURRENT_TIMESTAMP),
  ('finance-test-user-02', 'Finance Test User 02', 'finance-test-user-02@example.test', 'fixture-only-no-login', true, 'finance-legacy-profile', 'emp-finance-test-02', CURRENT_TIMESTAMP),
  ('finance-test-user-03', 'Finance Test User 03', 'finance-test-user-03@example.test', 'fixture-only-no-login', true, 'finance-legacy-profile', 'emp-finance-test-03', CURRENT_TIMESTAMP),
  ('finance-test-user-04', 'Finance Test User 04', 'finance-test-user-04@example.test', 'fixture-only-no-login', true, 'finance-legacy-profile', 'emp-finance-test-04', CURRENT_TIMESTAMP),
  ('finance-test-user-05', 'Finance Test User 05', 'finance-test-user-05@example.test', 'fixture-only-no-login', true, 'finance-legacy-profile', 'emp-finance-test-05', CURRENT_TIMESTAMP);

-- These stories explicitly select the NULL-entity legacy exercise.
INSERT INTO "FinancialYear" (id, year, "governmentEntityId", status, "startDate", "endDate", "updatedAt") VALUES
  ('financial-year-2026', 2026, NULL, 'Aberto', TIMESTAMP '2026-01-01 00:00:00.000', TIMESTAMP '2026-12-31 23:59:59.999', CURRENT_TIMESTAMP);
INSERT INTO "BudgetUnit" (id, code, name, "secretariatId", "updatedAt") VALUES
  ('budget-unit-fin-01', '0101', 'Prefeitura Municipal - Teste', 'sec-fin-01', CURRENT_TIMESTAMP);
INSERT INTO "ResourceSource" (id, code, name, "updatedAt") VALUES
  ('resource-source-15000000', '15000000', 'Recursos nao vinculados de impostos', CURRENT_TIMESTAMP),
  ('resource-source-15010000', '15010000', 'Outros recursos nao vinculados', CURRENT_TIMESTAMP);
INSERT INTO "RevenueNature" (id, code, name, "updatedAt") VALUES
  ('revenue-nature-test-01', '1.1.1.0.00.0.0.00.00', 'Receita tributaria de teste', CURRENT_TIMESTAMP);
INSERT INTO "ExpenseNature" (id, code, name, "procurementOriginPolicy", "updatedAt") VALUES
  ('expense-nature-test-01', '3.3.90.30.00', 'Material de consumo', 'NONE', CURRENT_TIMESTAMP);
INSERT INTO "BudgetAppropriation" (id, code, "financialYearId", "budgetUnitId", "expenseNatureId", "resourceSourceId", "initialValue", "initialValueDecimal", "updatedValue", "updatedValueDecimal", "committedValue", "committedValueDecimal", "updatedAt") VALUES
  ('appropriation-finance-test-01', '0101.04.122.0001.2002.3.3.90.30.00', 'financial-year-2026', 'budget-unit-fin-01', 'expense-nature-test-01', 'resource-source-15000000', 1000000, 1000000.00, 1000000, 1000000.00, 100, 100.00, CURRENT_TIMESTAMP);

INSERT INTO "Company" (id, "corporateName", "tradeName", cnpj, status, "updatedAt") VALUES
  ('company-lagoaseca-01', 'Fornecedor Lagoa Seca Ltda', 'Lagoa Seca Teste', '11222333000181', 'Ativo', CURRENT_TIMESTAMP),
  ('company-finance-alternate-01', 'Fornecedor Alternativo de Teste Ltda', NULL, '44555666000102', 'Ativo', CURRENT_TIMESTAMP);
INSERT INTO "Supplier" (id, "companyId", category, status, "updatedAt") VALUES
  ('supp-lagoaseca-01', 'company-lagoaseca-01', 'Materiais', 'Ativo', CURRENT_TIMESTAMP),
  ('supp-finance-alternate-01', 'company-finance-alternate-01', 'Materiais', 'Ativo', CURRENT_TIMESTAMP);
INSERT INTO "Creditor" (id, "supplierId", "companyId", name, document, status, "updatedAt") VALUES
  ('creditor-lagoaseca-01', 'supp-lagoaseca-01', 'company-lagoaseca-01', 'Fornecedor Lagoa Seca Ltda', '11222333000181', 'Ativo', CURRENT_TIMESTAMP);
INSERT INTO "Document" (id, title, "documentType", "fileUrl", status, "companyId", "updatedAt") VALUES
  ('doc-nf-lagoaseca-01', 'Nota fiscal de teste', 'Nota Fiscal', 'https://example.test/doc-nf-lagoaseca-01.pdf', 'Válido', 'company-lagoaseca-01', CURRENT_TIMESTAMP);

-- Exactly two analytic accounts and one active reference rule per original event.
INSERT INTO "AccountingPlan" (id, code, name, type, "updatedAt") VALUES
  ('accounting-plan-debit-test', '1.1.1.1.1.00.01', 'Conta de debito de teste', 'Ativo', CURRENT_TIMESTAMP),
  ('accounting-plan-credit-test', '2.1.1.1.1.00.01', 'Conta de credito de teste', 'Passivo', CURRENT_TIMESTAMP);
INSERT INTO "AccountingEventCatalog" (id, code, name, description, "isActive", "updatedAt") VALUES
  ('accounting-event-empenho_emitido', 'EMPENHO_EMITIDO', 'Empenho emitido', 'Regra exclusiva da fixture de integracao', true, CURRENT_TIMESTAMP),
  ('accounting-event-liquidacao_registrada', 'LIQUIDACAO_REGISTRADA', 'Liquidacao registrada', 'Regra exclusiva da fixture de integracao', true, CURRENT_TIMESTAMP),
  ('accounting-event-pagamento_efetivado', 'PAGAMENTO_EFETIVADO', 'Pagamento efetivado', 'Regra exclusiva da fixture de integracao', true, CURRENT_TIMESTAMP),
  ('accounting-event-retencao_recolhida', 'RETENCAO_RECOLHIDA', 'Retencao recolhida', 'Regra exclusiva da fixture de integracao', true, CURRENT_TIMESTAMP),
  ('accounting-event-pagamento_estornado', 'PAGAMENTO_ESTORNADO', 'Pagamento estornado', 'Regra exclusiva da fixture de integracao', true, CURRENT_TIMESTAMP);
INSERT INTO "AccountingPostingRule" (id, "eventId", "debitAccountId", "creditAccountId", description, "isActive", "isReference", "updatedAt") VALUES
  ('posting-rule-empenho_emitido', 'accounting-event-empenho_emitido', 'accounting-plan-debit-test', 'accounting-plan-credit-test', 'Regra de teste', true, true, CURRENT_TIMESTAMP),
  ('posting-rule-liquidacao_registrada', 'accounting-event-liquidacao_registrada', 'accounting-plan-debit-test', 'accounting-plan-credit-test', 'Regra de teste', true, true, CURRENT_TIMESTAMP),
  ('posting-rule-pagamento_efetivado', 'accounting-event-pagamento_efetivado', 'accounting-plan-debit-test', 'accounting-plan-credit-test', 'Regra de teste', true, true, CURRENT_TIMESTAMP),
  ('posting-rule-retencao_recolhida', 'accounting-event-retencao_recolhida', 'accounting-plan-debit-test', 'accounting-plan-credit-test', 'Regra de teste', true, true, CURRENT_TIMESTAMP),
  ('posting-rule-pagamento_estornado', 'accounting-event-pagamento_estornado', 'accounting-plan-debit-test', 'accounting-plan-credit-test', 'Regra de teste', true, true, CURRENT_TIMESTAMP);
INSERT INTO "RetentionRule" (id, code, type, description, "calculationBasePercentage", "ratePercentage", "beneficiaryName", "beneficiaryDocument", "financialYearId", "effectiveFrom", "effectiveTo", "dueDays", "isActive", "updatedAt") VALUES
  ('retention-rule-inss-11', 'INSS_11', 'INSS', 'Retencao INSS 11%', 100.0000, 11.0000, 'Instituto Nacional do Seguro Social', '29979036000140', 'financial-year-2026', TIMESTAMP '2026-01-01 00:00:00.000', TIMESTAMP '2026-12-31 23:59:59.999', 20, true, CURRENT_TIMESTAMP);

INSERT INTO "BankAccount" (id, "bankName", agency, "accountNumber", "accountType", "currentBalance", "currentBalanceDecimal", "resourceSourceId", "budgetUnitId", "externalId", purpose, "isActive", "updatedAt") VALUES
  ('poc-robonuvem-checking-10001', '001 - Banco Virtual Robonuvem', '0001', '10001-0', 'Movimento', 300000, 300000.00, 'resource-source-15000000', 'budget-unit-fin-01', 'TEST-BA-001', 'Pagamentos de teste', true, CURRENT_TIMESTAMP),
  ('poc-robonuvem-revenue-20001', '001 - Banco Virtual Robonuvem', '0001', '20001-1', 'Arrecadacao', 150000, 150000.00, 'resource-source-15000000', 'budget-unit-fin-01', 'TEST-BA-002', 'Receitas de teste', true, CURRENT_TIMESTAMP),
  ('poc-robonuvem-investment-90001', '001 - Banco Virtual Robonuvem', '0001', '90001-4', 'Aplicacao', 200000, 200000.00, 'resource-source-15000000', 'budget-unit-fin-01', 'TEST-BA-003', 'Aplicacoes de teste', true, CURRENT_TIMESTAMP);
-- Freeze the documentary resource source on every opening movement. Merely
-- copying BankAccount.currentBalance does not fund the source-specific ledger.
INSERT INTO "TreasuryMovement" (id, date, type, direction, "valueDecimal", history, "bankAccountId", "financialYearId", "resourceSourceId", "sourceModule", "sourceType", "sourceId", "eventType", "idempotencyKey") VALUES
  ('treasury-opening-10001-0', TIMESTAMP '2026-01-01 12:00:00.000', 'SaldoInicial', 'Entrada', 300000.00, 'Saldo inicial da conta 10001-0', 'poc-robonuvem-checking-10001', 'financial-year-2026', 'resource-source-15000000', 'TEST_FIXTURE', 'OPENING_BALANCE', 'poc-robonuvem-checking-10001', 'TEST_OPENING_BALANCE', 'test-opening-10001-0-2026'),
  ('treasury-opening-20001-1', TIMESTAMP '2026-01-01 12:00:00.000', 'SaldoInicial', 'Entrada', 150000.00, 'Saldo inicial da conta 20001-1', 'poc-robonuvem-revenue-20001', 'financial-year-2026', 'resource-source-15000000', 'TEST_FIXTURE', 'OPENING_BALANCE', 'poc-robonuvem-revenue-20001', 'TEST_OPENING_BALANCE', 'test-opening-20001-1-2026'),
  ('treasury-opening-90001-4', TIMESTAMP '2026-01-01 12:00:00.000', 'SaldoInicial', 'Entrada', 200000.00, 'Saldo inicial da conta 90001-4', 'poc-robonuvem-investment-90001', 'financial-year-2026', 'resource-source-15000000', 'TEST_FIXTURE', 'OPENING_BALANCE', 'poc-robonuvem-investment-90001', 'TEST_OPENING_BALANCE', 'test-opening-90001-4-2026');

INSERT INTO "PurchaseProcess" (id, number, object, type, modality, status, "secretariatId", "updatedAt") VALUES
  ('proc-licita-01', 'PROC-LICITA-01', 'Processo de contratacao da fixture', 'Comum', 'Pregao', 'Concluido', 'sec-fin-01', CURRENT_TIMESTAMP);
INSERT INTO "Commitment" (id, number, date, value, "valueDecimal", type, history, "appropriationId", "supplierId", "creditorId", status, "updatedAt") VALUES
  ('commitment-rap-fixture-01', 'EMP-RAP-FIXTURE-01', TIMESTAMP '2026-02-01 12:00:00.000', 100, 100.00, 'Ordinario', 'Empenho duravel para testes de restos a pagar', 'appropriation-finance-test-01', 'supp-lagoaseca-01', 'creditor-lagoaseca-01', 'Emitido', CURRENT_TIMESTAMP);
