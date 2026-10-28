import { Decimal } from "@/db/decimal";

export class OfxImportError extends Error {}
export type OfxTransaction = { id: string; date: Date; amount: Decimal; description: string; reference?: string; type: string };
export type OfxStatement = { bankId: string; agency?: string; accountNumber: string; currency: string; start: Date; end: Date; transactions: OfxTransaction[]; encoding: string };

function field(block: string, name: string, required = true) {
  const matches = [...block.matchAll(new RegExp(`<${name}\\s*>\\s*([^<\\r\\n]*)`, "gi"))];
  if (matches.length > 1) throw new OfxImportError(`Campo ${name} duplicado.`);
  const value = matches[0]?.[1].trim() ?? "";
  if (required && !value) throw new OfxImportError(`Campo ${name} obrigatório.`);
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function date(value: string, label: string) {
  // A conciliação utiliza o dia bancário declarado, sem deslocamento por fuso.
  if (!/^\d{8}(?:\d{6}(?:\.\d+)?)?(?:\[[+-]?\d+(?:\.\d+)?(?::[^\]]+)?\])?$/.test(value)) throw new OfxImportError(`${label}: data OFX inválida.`);
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const result = new Date(`${iso}T12:00:00.000Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== iso) throw new OfxImportError(`${label}: dia inválido.`);
  return result;
}

export function parseOfxStatement(bytes: Uint8Array): OfxStatement {
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new OfxImportError("O extrato OFX deve ter entre 1 byte e 2 MB.");
  const prefix = Buffer.from(bytes).subarray(0, 1024).toString("ascii");
  const charset = /^CHARSET:\s*(.+)$/im.exec(prefix)?.[1]?.trim();
  const declared = /encoding=["']([^"']+)["']/i.exec(prefix)?.[1] ?? (charset && charset.toUpperCase() !== "NONE" ? charset : undefined) ?? /^ENCODING:\s*(.+)$/im.exec(prefix)?.[1]?.trim() ?? "UTF-8";
  const encoding = /^(1252|windows-1252|iso-8859-1)$/i.test(declared) ? "windows-1252" : /^(utf-8|utf8|unicode|usascii|ascii)$/i.test(declared) ? "utf-8" : null;
  if (!encoding) throw new OfxImportError(`Encoding OFX não suportado: ${declared}.`);
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new OfxImportError("O conteúdo não corresponde ao encoding declarado."); }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new OfxImportError("Declarações de entidades externas não são permitidas no extrato.");
  if (!/<OFX\s*>/i.test(text) || !/<\/OFX\s*>/i.test(text)) throw new OfxImportError("Documento OFX incompleto.");
  const statements = [...text.matchAll(/<STMTRS\s*>([\s\S]*?)<\/STMTRS\s*>/gi)];
  if (statements.length !== 1) throw new OfxImportError("Envie um extrato com exatamente uma conta bancária.");
  const statement = statements[0][1];
  const codes = [...text.matchAll(/<CODE\s*>\s*([^<\r\n]*)/gi)].map(match => match[1].trim());
  if (codes.some(code => code !== "0")) throw new OfxImportError("O banco informou erro no documento OFX.");
  const account = /<BANKACCTFROM\s*>([\s\S]*?)<\/BANKACCTFROM\s*>/i.exec(statement)?.[1];
  const list = /<BANKTRANLIST\s*>([\s\S]*?)<\/BANKTRANLIST\s*>/i.exec(statement)?.[1];
  if (!account || !list) throw new OfxImportError("Identificação da conta ou lista de transações ausente.");
  const currency = field(statement, "CURDEF").toUpperCase();
  if (currency !== "BRL") throw new OfxImportError("A conciliação municipal exige extrato em BRL.");
  const start = date(field(list, "DTSTART"), "DTSTART");
  const end = date(field(list, "DTEND"), "DTEND");
  if (start > end) throw new OfxImportError("Período do extrato invertido.");
  const blocks = [...list.matchAll(/<STMTTRN\s*>([\s\S]*?)<\/STMTTRN\s*>/gi)];
  if (!blocks.length || blocks.length !== (list.match(/<STMTTRN\s*>/gi) ?? []).length) throw new OfxImportError("Lista de transações vazia ou incompleta.");
  const ids = new Set<string>();
  const transactions = blocks.map((match, index) => {
    try {
      const block = match[1];
      const id = field(block, "FITID");
      if (id.length > 255 || ids.has(id)) throw new OfxImportError("FITID duplicado ou maior que 255 caracteres.");
      ids.add(id);
      if (/<CORRECTFITID\s*>/i.test(block)) throw new OfxImportError("Correção de transação bancária exige tratamento explícito; o lote não foi importado.");
      const rawAmount = field(block, "TRNAMT");
      if (!/^[+-]?\d{1,16}(?:\.\d{1,2})?$/.test(rawAmount)) throw new OfxImportError("TRNAMT deve ter até duas casas decimais, sem separador de milhar.");
      const amount = new Decimal(rawAmount);
      if (amount.isZero()) throw new OfxImportError("Transação com valor zero.");
      const type = field(block, "TRNTYPE").toUpperCase();
      if (!["CREDIT", "DEBIT", "INT", "DIV", "FEE", "SRVCHG", "DEP", "ATM", "POS", "XFER", "CHECK", "PAYMENT", "CASH", "DIRECTDEP", "DIRECTDEBIT", "REPEATPMT", "OTHER"].includes(type)) throw new OfxImportError(`TRNTYPE não suportado: ${type}.`);
      const posted = date(field(block, "DTPOSTED"), "DTPOSTED");
      if (posted < start || posted > end) throw new OfxImportError("Transação fora do período declarado.");
      return { id, date: posted, amount, type, description: field(block, "MEMO", false) || field(block, "NAME", false) || id, reference: field(block, "CHECKNUM", false) || undefined };
    } catch (error) { throw new OfxImportError(`Transação ${index + 1}: ${error instanceof Error ? error.message : "registro inválido"}`); }
  });
  return { bankId: field(account, "BANKID"), agency: field(account, "BRANCHID", false) || undefined, accountNumber: field(account, "ACCTID"), currency, start, end, transactions, encoding };
}
