import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FinanceActor } from "./index";
import { OfxImportError, parseOfxStatement, type OfxStatement } from "./ofx-parser";
import { parseOfcStatement } from "./ofc-parser";
import { writeAuditEvent, auditEventTypes } from "@/lib/platform/audit-evidence";

const normalize = (value: string) => value.replace(/[\s.\-/]/g, "").toUpperCase();

export async function importBankStatementOfx(db: PrismaClient, actor: FinanceActor, input: { bankAccountId: string; bytes: Uint8Array; fileName: string }) {
  return importParsedStatement(db, actor, input, parseOfxStatement(input.bytes), "OFX");
}

export async function importBankStatementOfc(db: PrismaClient, actor: FinanceActor, input: { bankAccountId: string; bytes: Uint8Array; fileName: string }) {
  return importParsedStatement(db, actor, input, parseOfcStatement(input.bytes), "OFC");
}

async function importParsedStatement(db: PrismaClient, actor: FinanceActor, input: { bankAccountId: string; bytes: Uint8Array; fileName: string }, statement: OfxStatement & { currencyBasis?: string }, format: "OFX" | "OFC") {
  const checksum = createHash("sha256").update(input.bytes).digest("hex");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "BankAccount" WHERE id = ${input.bankAccountId} FOR UPDATE`;
    const account = await tx.bankAccount.findUnique({ where: { id: input.bankAccountId }, include: { bank: { select: { compe: true } } } });
    if (!account?.isActive) throw new OfxImportError("Selecione uma conta bancária ativa.");
    if (actor.allowedBudgetUnitIds && (!account.budgetUnitId || !actor.allowedBudgetUnitIds.includes(account.budgetUnitId))) throw new OfxImportError("Conta fora das unidades gestoras autorizadas.");
    if (normalize(statement.accountNumber) !== normalize(account.accountNumber) || (statement.agency && normalize(statement.agency) !== normalize(account.agency))) throw new OfxImportError("A conta/agência do arquivo difere da conta selecionada.");
    if (!account.bank || statement.bankId.padStart(3, "0") !== account.bank.compe.padStart(3, "0")) throw new OfxImportError("Vincule a conta ao banco COMPE correspondente ao BANKID do arquivo.");
    const replay = await tx.bankStatementImport.findUnique({ where: { bankAccountId_checksum: { bankAccountId: account.id, checksum } } });
    if (replay) return replay;
    const previous = await tx.bankStatementItem.findMany({ where: { bankAccountId: account.id, bankTransactionId: { in: statement.transactions.map(item => item.id) } } });
    const known = new Map(previous.map(item => [item.bankTransactionId, item]));
    if (known.size !== previous.length) throw new OfxImportError("Há identificadores bancários duplicados no histórico; regularize antes de importar.");
    const fresh = statement.transactions.filter(item => {
      const old = known.get(item.id);
      if (!old) return true;
      const direction = item.amount.isNegative() ? "Saída" : "Entrada";
      if (old.date.toISOString().slice(0, 10) !== item.date.toISOString().slice(0, 10) || !old.valueDecimal.abs().equals(item.amount.abs()) || old.direction !== direction || old.description !== item.description || (old.reference ?? undefined) !== item.reference || old.transactionType !== item.type) throw new OfxImportError(`FITID ${item.id}: conteúdo divergente do histórico. Nenhum registro foi sobrescrito.`);
      return false;
    });
    const record = await tx.bankStatementImport.create({ data: {
      bankAccountId: account.id, format, fileName: input.fileName.replace(/[\\/:]/g, "_"), checksum,
      originalBytes: Buffer.from(input.bytes), originalEncoding: statement.encoding,
      processingSnapshot: { bankId: statement.bankId, agency: statement.agency ?? null, accountNumber: statement.accountNumber, currency: statement.currency, currencyBasis: statement.currencyBasis ?? "FILE_CURDEF", start: statement.start.toISOString(), end: statement.end.toISOString(), read: statement.transactions.length, imported: fresh.length, repeated: statement.transactions.length - fresh.length, repeatedItemIds: previous.map(item => item.id), totalCredits: statement.transactions.filter(item => item.amount.isPositive()).reduce((total, item) => total.plus(item.amount), new Prisma.Decimal(0)).toFixed(2), totalDebits: statement.transactions.filter(item => item.amount.isNegative()).reduce((total, item) => total.plus(item.amount.abs()), new Prisma.Decimal(0)).toFixed(2) },
    } });
    if (fresh.length) await tx.bankStatementItem.createMany({ data: fresh.map(item => ({ bankAccountId: account.id, statementImportId: record.id, date: item.date, description: item.description, reference: item.reference, direction: item.amount.isNegative() ? "Saída" : "Entrada", sinal: item.amount.isNegative() ? "DEBITO" : "CREDITO", valueDecimal: item.amount.abs(), bankTransactionId: item.id, transactionType: item.type })) });
    await writeAuditEvent(tx, { actorUsuarioId: actor.usuarioId, eventType: auditEventTypes.administrativeMutation, targetType: "BANK_STATEMENT_IMPORT", targetId: record.id });
    return record;
  });
}
