import { Decimal } from "@/db/decimal";
import { OfxImportError, type OfxStatement } from "./ofx-parser";

// OFC 1.0.6: ACCTSTMT/ACCTFROM, tipos numéricos e CHKNUM.
// Referência: https://mnybank.sourceforge.net/Specs_Ofc.html
const types = ["CREDIT", "DEBIT", "INT", "DIV", "SRVCHG", "DEP", "ATM", "XFER", "CHECK", "PAYMENT", "CASH", "DIRECTDEP", "OTHER"];

function field(block: string, name: string, required = true): string {
  const matches = [...block.matchAll(new RegExp(`<${name}\\s*>\\s*([^<\\r\\n]*)`, "gi"))];
  if (matches.length > 1) throw new OfxImportError(`Campo OFC ${name} duplicado.`);
  const value = matches[0]?.[1].trim() ?? "";
  if (required && !value) throw new OfxImportError(`Campo OFC ${name} obrigatório.`);
  return value.replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&quot;/g, '"').replace(/&apos;/g, "'");
}

function aggregate(block: string, name: string): string {
  const matches = [...block.matchAll(new RegExp(`<${name}\\s*>([\\s\\S]*?)<\\/${name}\\s*>`, "gi"))];
  if (matches.length !== 1 || (block.match(new RegExp(`<${name}\\s*>`, "gi")) ?? []).length !== 1) throw new OfxImportError(`Envie exatamente um bloco OFC ${name} completo.`);
  return matches[0][1];
}

function date(value: string, name: string): Date {
  if (!/^\d{8}(?:\d{6})?$/.test(value)) throw new OfxImportError(`${name}: data OFC inválida.`);
  const iso = `${value.slice(0, 4)}-${value.slice(4, 6)}-${value.slice(6, 8)}`;
  const result = new Date(`${iso}T12:00:00.000Z`);
  if (!Number.isFinite(result.getTime()) || result.toISOString().slice(0, 10) !== iso) throw new OfxImportError(`${name}: dia inválido.`);
  return result;
}

export function parseOfcStatement(bytes: Uint8Array): OfxStatement & { currencyBasis: string } {
  if (!bytes.length || bytes.length > 2 * 1024 * 1024) throw new OfxImportError("O extrato OFC deve ter entre 1 byte e 2 MB.");
  const prefix = Buffer.from(bytes).subarray(0, 1024).toString("ascii");
  const codePage = /<CPAGE\s*>\s*([^<\r\n]*)/i.exec(prefix)?.[1].trim() ?? "65001";
  const encoding = codePage === "1252" ? "windows-1252" : codePage === "65001" ? "utf-8" : null;
  if (!encoding) throw new OfxImportError(`CPAGE OFC não suportado: ${codePage}.`);
  let text: string;
  try { text = new TextDecoder(encoding, { fatal: true }).decode(bytes); }
  catch { throw new OfxImportError("O conteúdo não corresponde ao CPAGE declarado."); }
  if (/<!DOCTYPE|<!ENTITY/i.test(text)) throw new OfxImportError("Declarações de entidades externas não são permitidas no extrato.");
  const root = aggregate(text, "OFC");
  const declaredCodePage = field(root, "CPAGE", false);
  if (declaredCodePage && declaredCodePage !== codePage) throw new OfxImportError("CPAGE ausente do cabeçalho ou divergente.");
  const accountStatement = aggregate(root, "ACCTSTMT");
  const account = aggregate(accountStatement, "ACCTFROM");
  const statement = aggregate(accountStatement, "STMTRS");
  const currency = field(statement, "CURDEF", false).toUpperCase();
  if (currency && currency !== "BRL") throw new OfxImportError("A conciliação municipal exige extrato em BRL.");
  // OFC original não possui CURDEF: valores são da conta municipal em reais.
  // Essa política fica explícita na memória, sem atribuir moeda declarada ao arquivo.
  const start = date(field(statement, "DTSTART"), "DTSTART");
  const end = date(field(statement, "DTEND"), "DTEND");
  if (start > end) throw new OfxImportError("Período do extrato invertido.");
  const blocks = [...statement.matchAll(/<STMTTRN\s*>([\s\S]*?)<\/STMTTRN\s*>/gi)];
  if (!blocks.length || blocks.length !== (statement.match(/<STMTTRN\s*>/gi) ?? []).length) throw new OfxImportError("Lista de transações vazia ou incompleta.");
  const ids = new Set<string>();
  const transactions = blocks.map((match, index) => {
    try {
      const block = match[1];
      const id = field(block, "FITID");
      if (id.length > 255 || ids.has(id)) throw new OfxImportError("FITID duplicado ou maior que 255 caracteres.");
      ids.add(id);
      if (/<CORRECTFITID\s*>/i.test(block)) throw new OfxImportError("Correção de transação exige tratamento explícito.");
      const rawType = field(block, "TRNTYPE");
      if (!/^(?:[0-9]|1[0-2])$/.test(rawType)) throw new OfxImportError(`TRNTYPE OFC não suportado: ${rawType}.`);
      const rawAmount = field(block, "TRNAMT");
      if (!/^[+-]?\d{1,16}[.,]\d{2}$/.test(rawAmount)) throw new OfxImportError("TRNAMT OFC deve ter duas casas decimais, sem separador de milhar.");
      const amount = new Decimal(rawAmount.replace(",", "."));
      if (amount.isZero()) throw new OfxImportError("Transação com valor zero.");
      const posted = date(field(block, "DTPOSTED"), "DTPOSTED");
      if (posted < start || posted > end) throw new OfxImportError("Transação fora do período declarado.");
      return { id, date: posted, amount, type: types[Number(rawType)], description: field(block, "MEMO", false) || field(block, "NAME", false) || id, reference: field(block, "CHKNUM", false) || undefined };
    } catch (error) { throw new OfxImportError(`Transação ${index + 1}: ${error instanceof Error ? error.message : "registro inválido"}`); }
  });
  return { bankId: field(account, "BANKID"), agency: field(account, "BRANCHID", false) || undefined, accountNumber: field(account, "ACCTID"), currency: "BRL", currencyBasis: currency ? "FILE_CURDEF" : "MUNICIPAL_BRL_ACCOUNT_POLICY", start, end, transactions, encoding };
}
