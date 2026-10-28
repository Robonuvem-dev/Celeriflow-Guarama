import { createHash } from "node:crypto";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { findHistoricalStatementItems, findImportedStatement, insertImportedStatement, insertImportedStatementItems, lockStatementImportAccount } from "@/db/repositories/finance/bank-statements";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import type { FinanceActor } from "./index";
import { OfxImportError, parseOfxStatement, type OfxStatement } from "./ofx-parser";
import { parseOfcStatement } from "./ofc-parser";
import { auditEventTypes } from "@/lib/contracts/audit";

const normalize = (value: string) => value.replace(/[\s.\-/]/g, "").toUpperCase();

export async function importBankStatementOfx(db: DatabaseConnection, actor: FinanceActor, input: { bankAccountId: string; bytes: Uint8Array; fileName: string }) {
  return importParsedStatement(db, actor, input, parseOfxStatement(input.bytes), "OFX");
}

export async function importBankStatementOfc(db: DatabaseConnection, actor: FinanceActor, input: { bankAccountId: string; bytes: Uint8Array; fileName: string }) {
  return importParsedStatement(db, actor, input, parseOfcStatement(input.bytes), "OFC");
}

async function importParsedStatement(db: DatabaseConnection, actor: FinanceActor, input: { bankAccountId: string; bytes: Uint8Array; fileName: string }, statement: OfxStatement & { currencyBasis?: string }, format: "OFX" | "OFC") {
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  return withDatabaseTransaction(db, async tx => {
    const account = await lockStatementImportAccount(tx, input.bankAccountId);
    if (!account?.isActive) throw new OfxImportError("Selecione uma conta bancária ativa.");
    if (actor.allowedBudgetUnitIds && (!account.budgetUnitId || !actor.allowedBudgetUnitIds.includes(account.budgetUnitId))) throw new OfxImportError("Conta fora das unidades gestoras autorizadas.");
    if (normalize(statement.accountNumber) !== normalize(account.accountNumber) || (statement.agency && normalize(statement.agency) !== normalize(account.agency))) throw new OfxImportError("A conta/agência do arquivo difere da conta selecionada.");
    if (!account.compe || statement.bankId.padStart(3, "0") !== account.compe.padStart(3, "0")) throw new OfxImportError("Vincule a conta ao banco COMPE correspondente ao BANKID do arquivo.");
    const replay = await findImportedStatement(tx, account.id, checksum);
    if (replay) return replay;
    const previous = await findHistoricalStatementItems(tx, account.id, statement.transactions.map(item => item.id));
    const known = new Map(previous.map(item => [item.bankTransactionId, item]));
    if (known.size !== previous.length) throw new OfxImportError("Há identificadores bancários duplicados no histórico; regularize antes de importar.");
    const fresh = statement.transactions.filter(item => {
      const old = known.get(item.id);
      if (!old) return true;
      const direction = item.amount.isNegative() ? "Saída" : "Entrada";
      if (old.date.toISOString().slice(0, 10) !== item.date.toISOString().slice(0, 10) || !old.valueDecimal.abs().equals(item.amount.abs()) || old.direction !== direction || old.description !== item.description || (old.reference ?? undefined) !== item.reference || old.transactionType !== item.type) throw new OfxImportError(`FITID ${item.id}: conteúdo divergente do histórico. Nenhum registro foi sobrescrito.`);
      return false;
    });
    const record = await insertImportedStatement(tx, {
      bankAccountId: account.id, format, fileName: input.fileName.replace(/[\\/:]/g, "_"), checksum,
      originalBytes: Buffer.from(input.bytes), originalEncoding: statement.encoding,
      processingSnapshot: { bankId: statement.bankId, agency: statement.agency ?? null, accountNumber: statement.accountNumber, currency: statement.currency, currencyBasis: statement.currencyBasis ?? "FILE_CURDEF", start: statement.start.toISOString(), end: statement.end.toISOString(), read: statement.transactions.length, imported: fresh.length, repeated: statement.transactions.length - fresh.length, repeatedItemIds: previous.map(item => item.id), totalCredits: statement.transactions.filter(item => item.amount.isPositive()).reduce((total, item) => total.plus(item.amount), new Decimal(0)).toFixed(2), totalDebits: statement.transactions.filter(item => item.amount.isNegative()).reduce((total, item) => total.plus(item.amount.abs()), new Decimal(0)).toFixed(2) },
    });
    await insertImportedStatementItems(tx, account.id, record.id, fresh);
    await insertAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "BANK_STATEMENT_IMPORT", targetId: record.id });
    return record;
  });
}
