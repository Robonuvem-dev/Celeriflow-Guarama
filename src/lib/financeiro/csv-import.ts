import { createHash } from "node:crypto";
import type { DatabaseConnection } from "@/db/connection";
import { Decimal } from "@/db/decimal";
import { withDatabaseTransaction } from "@/db/transaction";
import { findImportedStatement, lockStatementImportAccount } from "@/db/repositories/finance/bank-statements";
import { bankStatementImports, bankStatementItems } from "@/db/schema/finance-banking";
import { financialAuditLogs } from "@/db/schema/finance-identity";
import type { ImportedBankStatement } from "@/lib/contracts/finance-banking";
import type { FinanceActor } from "./index";
import { FinanceError } from "./errors";

function parseCsvLine(line: string, separator: string) {
  const values: string[] = [];
  let value = "";
  let quoted = false;
  for (let index = 0; index < line.length; index += 1) {
    const character = line[index];
    if (character === '"') {
      if (quoted && line[index + 1] === '"') { value += '"'; index += 1; }
      else quoted = !quoted;
    } else if (character === separator && !quoted) { values.push(value.trim()); value = ""; }
    else value += character;
  }
  values.push(value.trim());
  return values;
}

function parseCsvAmount(raw: string) {
  const value = raw.trim();
  // Brazilian values use dots as thousands separators only when a comma is present.
  return new Decimal(value.includes(",") ? value.replace(/\./g, "").replace(",", ".") : value);
}

function parseCsvDate(raw: string) {
  const value = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new FinanceError("CSV contém data inválida. Use o formato YYYY-MM-DD.");
  const date = new Date(`${value}T12:00:00.000Z`);
  if (Number.isNaN(date.valueOf()) || date.toISOString().slice(0, 10) !== value) throw new FinanceError("CSV contém data inválida.");
  return date;
}

export async function importBankStatementCsv(
  connection: DatabaseConnection,
  actor: FinanceActor,
  input: { bankAccountId: string; content: string; fileName?: string; separator?: "," | ";"; originalBytes?: Uint8Array },
): Promise<ImportedBankStatement> {
  if (input.originalBytes) {
    let decoded: string;
    try { decoded = new TextDecoder("utf-8", { fatal: true }).decode(input.originalBytes); }
    catch { throw new FinanceError("O CSV deve estar codificado em UTF-8."); }
    if (decoded !== input.content) throw new FinanceError("O conteúdo CSV não corresponde aos bytes originais.");
  }
  const separator = input.separator ?? (input.content.split("\n")[0]?.includes(";") ? ";" : ",");
  const rows = input.content.split(/\r?\n/).filter(row => row.trim());
  if (rows.length < 2) throw new FinanceError("O CSV deve ter cabeçalho e ao menos um lançamento.");
  const headers = parseCsvLine(rows[0], separator).map(header => header.toLowerCase().trim());
  if (!["date", "description", "amount"].every(header => headers.includes(header))) throw new FinanceError("O CSV deve conter as colunas date, description e amount.");
  const bytes = input.originalBytes ?? Buffer.from(input.content, "utf8");
  const checksum = createHash("sha256").update(bytes).digest("hex");
  return withDatabaseTransaction(connection, async tx => {
    // The same account lock serializes CSV and OFX/OFC replays across workers.
    const account = await lockStatementImportAccount(tx, input.bankAccountId);
    if (!account) throw new FinanceError("Conta bancária não encontrada.");
    if (!account.isActive) throw new FinanceError("A importação exige uma conta bancária ativa.");
    if (actor.allowedBudgetUnitIds && (!account.budgetUnitId || !actor.allowedBudgetUnitIds.includes(account.budgetUnitId))) throw new FinanceError("Acesso negado à Unidade Gestora da conta bancária.");
    const existing = await findImportedStatement(tx, account.id, checksum);
    if (existing) return existing;
    const [record] = await tx.insert(bankStatementImports).values({ bankAccountId: account.id, format: "CSV", fileName: input.fileName?.trim() || null, checksum, originalBytes: bytes, originalEncoding: "utf-8" }).returning();
    for (const row of rows.slice(1)) {
      const values = parseCsvLine(row, separator);
      const item = Object.fromEntries(headers.map((header, index) => [header, values[index] ?? ""]));
      const amount = parseCsvAmount(item.amount);
      if (!amount.isFinite() || amount.isZero()) throw new FinanceError("CSV contém valor inválido ou zero.");
      await tx.insert(bankStatementItems).values({ statementImportId: record.id, date: parseCsvDate(item.date), description: item.description || null, reference: item.reference || null, direction: amount.isNegative() ? "Saída" : "Entrada", valueDecimal: amount.abs() });
    }
    await tx.insert(financialAuditLogs).values({ action: "IMPORT", entityType: "BankStatementImport", entityId: record.id, budgetUnitId: actor.budgetUnitId || null, payload: { format: "CSV", fileName: record.fileName }, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
    return record;
  });
}
