import crypto from "crypto";
import dotenv from "dotenv";
import { and, asc, count, eq, ilike, inArray, isNotNull, isNull, or } from "drizzle-orm";
import { Decimal } from "../src/db/decimal";
import { withDatabaseTransaction } from "../src/db/transaction";
import { users } from "../src/db/schema/identity";
import { reconciliationBankAccounts, reconciliationTreasuryMovements } from "../src/db/schema/finance-reconciliation";
import { bankStatementImports, bankStatementItems } from "../src/db/schema/finance-banking";
import { bankClassificationRules } from "../src/db/schema/finance-automation";
import { treasuryTransfers } from "../src/db/schema/finance-revenues";
import { accountingTransactions } from "../src/db/schema/finance-accounting";
import { insertAnnualAudit } from "../src/db/repositories/finance/annual-stages";
import { findConstitutionalRevenueCodes } from "../src/db/repositories/finance/bank-automation";
import { findImportedStatement } from "../src/db/repositories/finance/bank-statements";
import type { BankStatementItemDTO } from "../src/lib/financeiro/bank-integration-client";

dotenv.config();
dotenv.config({ path: ".env.local", override: true });

const BANK = "001 - Banco Virtual Robonuvem";
const AGENCY = "0001";
const PERIOD = { periodoInicio: "2025-01-01", periodoFim: "2026-12-31" };
const ACCOUNTS = [
  { number: "10001-0", type: "CORRENTE" },
  { number: "20001-1", type: "CORRENTE" },
  { number: "90001-4", type: "APLICACAO" },
] as const;

function externalId(item: BankStatementItemDTO, checksum: string, index: number) {
  return item.codigoTransacao || crypto
    .createHash("sha256")
    .update(`${checksum}:${index}:${item.date.toISOString()}:${item.value}:${item.description}`)
    .digest("hex");
}

function revenueRuleForDescription(
  description: string,
  rules: { textoProcurado: string; naturezaReceita: string | null; fonteRecurso: string | null; eventoContabil: string | null }[],
) {
  const normalized = description.toUpperCase();
  return rules.find((rule) => normalized.includes(rule.textoProcurado.toUpperCase()))
    ?? (normalized.includes("ADO_LC_176_2020") ? rules.find((rule) => rule.textoProcurado === "ADO25") : undefined);
}

async function main() {
  const [{ db, databaseConnection }, { BankIntegrationClient }, { recordConfirmedRevenue }, { transmitYieldToMunicipalSystem }, { sendMovementToMunicipalSystem }] = await Promise.all([
    import("../src/db/client"),
    import("../src/lib/financeiro/bank-integration-client"),
    import("../src/lib/financeiro"),
    import("../src/lib/financeiro/yield-engine"),
    import("../src/lib/financeiro/classification-engine"),
  ]);
  const client = new BankIntegrationClient();
  const [actor] = await db.select({ id: users.id, employeeId: users.employeeId }).from(users).where(and(eq(users.ativo, true), isNotNull(users.employeeId))).orderBy(asc(users.createdAt)).limit(1);
  if (!actor?.employeeId) throw new Error("A sincronização exige um usuário ativo vinculado a servidor.");

  const accountRows = await db.select({ id: reconciliationBankAccounts.id, accountNumber: reconciliationBankAccounts.accountNumber }).from(reconciliationBankAccounts).where(and(eq(reconciliationBankAccounts.bankName, BANK), eq(reconciliationBankAccounts.agency, AGENCY), inArray(reconciliationBankAccounts.accountNumber, ACCOUNTS.map(account => account.number)), eq(reconciliationBankAccounts.isActive, true)));
  if (accountRows.length !== ACCOUNTS.length) throw new Error("As três contas do Banco Virtual precisam estar ativas antes da sincronização.");
  const accountByNumber = new Map(accountRows.map((account) => [account.accountNumber, account]));

  let imported = 0;
  for (const definition of ACCOUNTS) {
    const account = accountByNumber.get(definition.number)!;
    const statement = await client.fetchBankStatement({ banco: BANK, agencia: AGENCY, contaNumero: definition.number }, PERIOD);
    const [createdImport] = await db.insert(bankStatementImports).values({ bankAccountId: account.id, checksum: statement.hashSHA256, format: statement.formato, fileName: `BANCO_VIRTUAL_${definition.number}_2025_2026.${statement.formato.toLowerCase()}` }).onConflictDoNothing({ target: [bankStatementImports.bankAccountId, bankStatementImports.checksum] }).returning({ id: bankStatementImports.id });
    const statementImport = createdImport ?? await findImportedStatement(db, account.id, statement.hashSHA256);
    if (!statementImport) throw new Error("Importação bancária não foi persistida.");
    const result = statement.items.length ? await db.insert(bankStatementItems).values(statement.items.map((item, index) => ({
        statementImportId: statementImport.id,
        bankAccountId: account.id,
        banco: BANK,
        agencia: AGENCY,
        contaNumero: definition.number,
        tipoConta: definition.type,
        date: item.date,
        description: item.description,
        reference: item.reference ?? item.documento ?? null,
        codigoTransacao: externalId(item, statement.hashSHA256, index),
        sinal: item.sinal,
        direction: item.sinal === "CREDITO" ? "CREDIT" : "DEBIT",
        valueDecimal: new Decimal(item.value),
        status: "Pendente",
        reciboMunicipal: item.documento ?? null,
        bankTransactionId: item.bankTransactionId ?? null,
        integrationEventId: item.integrationEventId ?? null,
        transactionType: item.transactionType ?? null,
        clientReference: item.clientReference ?? null,
        collectionReference: item.collectionReference ?? null,
        reversalOfBankTransactionId: item.reversalOfBankTransactionId ?? null,
      }))).onConflictDoNothing().returning({ id: bankStatementItems.id }) : [];
    imported += result.length;
  }

  // Earlier test data linked statement rows to treasury movements without Revenue or accounting entries.
  const malformed = await db.select({ id: bankStatementItems.id, treasuryMovementId: bankStatementItems.treasuryMovementId }).from(bankStatementItems).innerJoin(reconciliationTreasuryMovements, eq(reconciliationTreasuryMovements.id, bankStatementItems.treasuryMovementId)).where(and(eq(bankStatementItems.banco, BANK), eq(bankStatementItems.agencia, AGENCY), eq(bankStatementItems.contaNumero, "20001-1"), isNull(reconciliationTreasuryMovements.revenueId), eq(reconciliationTreasuryMovements.sourceModule, "FINANCEIRO"), eq(reconciliationTreasuryMovements.type, "Revenue")));
  const malformedMovementIds = malformed.flatMap((item) => item.treasuryMovementId ? [item.treasuryMovementId] : []);
  if (malformedMovementIds.length > 0) {
    const [{ total: linkedTransfers }] = await db.select({ total: count() }).from(treasuryTransfers).where(or(inArray(treasuryTransfers.sourceMovementId, malformedMovementIds), inArray(treasuryTransfers.destinationMovementId, malformedMovementIds)));
    if (linkedTransfers > 0) throw new Error("Foram encontrados lançamentos bancários inconsistentes vinculados a transferências; revisão manual obrigatória.");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.update(bankStatementItems).set({ treasuryMovementId: null, lancamentoContabilId: null, reciboMunicipal: null, categoriaClassificada: null, status: "Pendente" }).where(inArray(bankStatementItems.id, malformed.map(item => item.id)));
      await tx.delete(reconciliationTreasuryMovements).where(and(inArray(reconciliationTreasuryMovements.id, malformedMovementIds), isNull(reconciliationTreasuryMovements.revenueId)));
      await insertAnnualAudit(tx, {
          action: "CORRECAO_VINCULO_EXTRATO_BANCARIO",
          entityType: "BankStatementItem",
          entityId: "BANCO_VIRTUAL_20001-1",
          authorUsuarioId: actor.id,
          authorEmployeeId: actor.employeeId,
          payload: { statementItemIds: malformed.map((item) => item.id), removedTreasuryMovementIds: malformedMovementIds },
      });
    }, { timeoutMs: 5000 });
  }

  const revenueRules = await db.select({ textoProcurado: bankClassificationRules.textoProcurado, naturezaReceita: bankClassificationRules.naturezaReceita, fonteRecurso: bankClassificationRules.fonteRecurso, eventoContabil: bankClassificationRules.eventoContabil }).from(bankClassificationRules).where(and(eq(bankClassificationRules.ativo, true), eq(bankClassificationRules.tipoMovimento, "RECEITA_CONSTITUCIONAL"), eq(bankClassificationRules.bankAccountId, accountByNumber.get("20001-1")!.id)));
  const revenueItems = await db.select().from(bankStatementItems).where(and(eq(bankStatementItems.banco, BANK), eq(bankStatementItems.agencia, AGENCY), eq(bankStatementItems.contaNumero, "20001-1"), eq(bankStatementItems.sinal, "CREDITO"), isNull(bankStatementItems.treasuryMovementId))).orderBy(asc(bankStatementItems.date));
  let constitutionalRevenues = 0;
  for (const item of revenueItems) {
    const rule = revenueRuleForDescription(item.description ?? "", revenueRules);
    if (!rule?.naturezaReceita || !rule.fonteRecurso) continue;
    const natureCode = rule.naturezaReceita.match(/^\d[\d.]+/)?.[0]?.replace(/(?:\.00)+$/, "");
    const sourceCode = rule.fonteRecurso.match(/^\d+/)?.[0];
    if (!natureCode || !sourceCode) throw new Error(`Regra constitucional inválida para ${rule.textoProcurado}.`);
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const { nature, source } = await findConstitutionalRevenueCodes(tx, natureCode, sourceCode);
      if (!nature || !source) throw new Error(`Natureza ou fonte ausente para ${item.description}.`);
      const revenue = await recordConfirmedRevenue(tx, { usuarioId: actor.id, employeeId: actor.employeeId }, {
        date: item.date,
        value: item.valueDecimal,
        revenueNatureId: nature.id,
        resourceSourceId: source.id,
        bankAccountId: accountByNumber.get("20001-1")!.id,
        history: item.description ?? rule.textoProcurado,
        sourceModule: "BANCO_VIRTUAL",
        sourceType: "CONSTITUTIONAL_REVENUE",
        sourceId: item.id,
        eventType: rule.eventoContabil ?? "RECEITA_CONSTITUCIONAL",
        idempotencyKey: `BANK:CONSTITUTIONAL:${accountByNumber.get("20001-1")!.id}:${item.codigoTransacao ?? item.id}`,
      });
      const [accounting] = await tx.select({ id: accountingTransactions.id }).from(accountingTransactions).where(eq(accountingTransactions.idempotencyKey, `BANK:CONSTITUTIONAL:${accountByNumber.get("20001-1")!.id}:${item.codigoTransacao ?? item.id}:RECEITA_ARRECADADA`));
      if (!revenue.treasuryMovement) throw new Error(`Movimento de tesouraria não gerado para ${item.codigoTransacao ?? item.id}.`);
      await tx.update(bankStatementItems).set({ treasuryMovementId: revenue.treasuryMovement.id, lancamentoContabilId: accounting?.id ?? null, reciboMunicipal: `REC-REC-${revenue.id}`, categoriaClassificada: "RECEITA_CONSTITUCIONAL", status: "Processado" }).where(eq(bankStatementItems.id, item.id));
    }, { timeoutMs: 5000 });
    constitutionalRevenues += 1;
  }

  const yieldItems = await db.select().from(bankStatementItems).where(and(eq(bankStatementItems.banco, BANK), eq(bankStatementItems.agencia, AGENCY), eq(bankStatementItems.contaNumero, "90001-4"), eq(bankStatementItems.sinal, "CREDITO"), isNull(bankStatementItems.treasuryMovementId), ilike(bankStatementItems.description, "%RENDIMENTO POSITIVO%"))).orderBy(asc(bankStatementItems.date));
  let accumulatedYield = new Decimal(0);
  for (const item of yieldItems) {
    accumulatedYield = accumulatedYield.plus(item.valueDecimal);
    await transmitYieldToMunicipalSystem(databaseConnection, {
      statementItemId: item.id,
      contaNumero: "90001-4",
      data: item.date,
      valorBruto: Number(item.valueDecimal),
      irrf: 0,
      iof: 0,
      correcaoMonetaria: 0,
      valorLiquido: Number(item.valueDecimal),
      saldoAcumulado: Number(accumulatedYield),
      tipo: "BRUTO",
      usuarioId: actor.id,
      employeeId: actor.employeeId,
    });
  }

  const investmentItems = await db.select().from(bankStatementItems).where(and(eq(bankStatementItems.banco, BANK), eq(bankStatementItems.agencia, AGENCY), eq(bankStatementItems.contaNumero, "10001-0"), isNull(bankStatementItems.treasuryMovementId), or(and(ilike(bankStatementItems.description, "%APLICACAO FINANCEIRA%"), eq(bankStatementItems.sinal, "DEBITO")), and(ilike(bankStatementItems.description, "%CREDITO PROVENIENTE DE RESGATE%"), eq(bankStatementItems.sinal, "CREDITO"))))).orderBy(asc(bankStatementItems.date));
  for (const item of investmentItems) {
    await sendMovementToMunicipalSystem(databaseConnection, { statementItemId: item.id, usuarioId: actor.id, employeeId: actor.employeeId });
  }

  console.log({ imported, correctedMalformedLinks: malformed.length, constitutionalRevenues, yields: yieldItems.length, investmentTransfers: investmentItems.length });
}

main().finally(async () => {
  const { databaseConnection } = await import("../src/db/client");
  await databaseConnection.pool.end();
}).catch((error: unknown) => {
  console.error(error);
  process.exitCode = 1;
});
