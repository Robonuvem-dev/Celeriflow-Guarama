import { z } from "zod";
import { Decimal } from "@/db/decimal";
import { requireValidCnpj, requireValidCpf } from "@/lib/identifiers/brazilian-identifiers";

const digits = (width: number) => z.string().regex(new RegExp(`^\\d{1,${width}}$`));
export const bankFileInputSchema = z.object({
  runId: z.string().min(1), conventionId: z.string().min(1),
  layout: z.enum(["BB_EDO001", "BB_CNAB240_2026_06"]),
  payerName: z.string().trim().min(1).max(100), payerCnpj: z.string().regex(/^\d{14}$/),
  payerAgency: digits(4), payerAgencyDv: z.string().regex(/^[0-9X]$/), payerAccount: digits(11), payerAccountDv: z.string().regex(/^[0-9X]$/),
  contract: digits(12), sequence: z.coerce.number().int().min(1).max(999999),
  extra: z.coerce.number().int().min(0).max(99).default(0), paymentDate: z.iso.date(), generationDate: z.iso.date(),
}).strict();
export type BankFileInput = z.infer<typeof bankFileInputSchema>;
export type BankFileRecipient = { statementId: string; registration: string; name: string; cpf: string; bank: string; agency: string; agencyDv: string; account: string; accountDv: string; accountSecondDv?: string; net: string; gross: string; deductions: string; items: { code: string; name: string; type: string; value: string }[]; accountSource: string };
const ascii = (value: string) => {
  const text = value.normalize("NFKD").replace(/[\u0300-\u036f]/g, "").toUpperCase();
  if (/[^\x20-\x7e]/.test(text)) throw new Error("Conteúdo não representável em ASCII no arquivo bancário.");
  return text;
};
const numeric = (value: string | number, width: number) => { const text = String(value); if (!/^\d+$/.test(text) || text.length > width) throw new Error(`Campo numérico excede ${width} posições ou contém caracteres inválidos.`); return text.padStart(width, "0"); };
const alpha = (value: string, width: number) => { const text = ascii(value); if (text.length > width) throw new Error(`Campo de texto excede ${width} posições.`); return text.padEnd(width, " "); };
const date = (value: string) => { z.iso.date().parse(value); return value.slice(8) + value.slice(5, 7) + value.slice(0, 4); };
const cents = (value: string, width: number) => { const amount = new Decimal(value); if (!amount.isFinite() || amount.lt(0) || !amount.eq(amount.toDecimalPlaces(2))) throw new Error("Valor bancário inválido; informe centavos não negativos."); return numeric(amount.mul(100).toFixed(0), width); };
function record(length: number) {
  const cells = Array<string>(length).fill(" ");
  return { put(start: number, value: string) { if (start < 1 || start + value.length - 1 > length) throw new Error("Campo fora do registro bancário."); cells.splice(start - 1, value.length, ...value); return this; }, text() { return cells.join(""); } };
}
function validateRecipients(input: BankFileInput, recipients: BankFileRecipient[]) {
  requireValidCnpj(input.payerCnpj);
  if (!recipients.length) throw new Error("Nenhum destinatário para o arquivo.");
  if (new Set(recipients.map(row => row.statementId)).size !== recipients.length) throw new Error("Demonstrativo repetido no arquivo.");
  for (const row of recipients) {
    requireValidCpf(row.cpf);
    if (!/^\d{3}$/.test(row.bank) || row.bank === "000") throw new Error("Código COMPE do destinatário inválido.");
    const sum = (type: string) => row.items.filter(item => item.type === type).reduce((total, item) => total.plus(item.value), new Decimal(0));
    if (!sum("PROVENTO").eq(row.gross) || !sum("DESCONTO").eq(row.deductions)) throw new Error("Rubricas não conciliam com os totais do demonstrativo.");
    if (!new Decimal(row.gross).minus(row.deductions).eq(row.net)) throw new Error("Totais do demonstrativo não conciliam.");
    cents(row.net, 15);
  }
}

/** EDO001, anexo I: 100 bytes/record; text is wrapped, never discarded. */
export function renderBbEdo001(raw: BankFileInput, competence: string, recipients: BankFileRecipient[]) {
  const input = bankFileInputSchema.parse(raw); validateRecipients(input, recipients);
  if (!/^(0[1-9]|1[0-2])\/\d{4}$/.test(competence)) throw new Error("Competência inválida.");
  const identities = recipients.map(row => numeric(row.registration, 20));
  if (new Set(identities).size !== identities.length || identities.some(id => /^0+$|^9+$/.test(id))) throw new Error("Matrícula EDO deve ser numérica, única e distinta dos identificadores de header/trailer.");
  const records = [record(100).put(1, "0".repeat(23)).put(24, numeric(input.payerAgency, 4)).put(28, numeric(input.payerAccount, 11)).put(39, "EDO001").put(45, numeric(input.contract, 12)).put(57, numeric(input.sequence, 6)).put(63, "0031500001").put(73, competence.slice(3) + competence.slice(0, 2)).put(79, numeric(input.extra, 2)).put(81, date(input.paymentDate)).text()];
  for (const row of [...recipients].sort((a, b) => numeric(a.registration, 20).localeCompare(numeric(b.registration, 20)))) {
    if (row.bank !== "001") throw new Error("EDO001 exige conta BB do destinatário.");
    const lines = [input.payerName, `COMPETENCIA ${competence}`, `MATRICULA ${row.registration}`, `SERVIDOR ${row.name}`, ...row.items.map(item => `${item.code} ${item.name} ${item.type}: ${item.value}`), `BRUTO: ${row.gross} DESCONTOS: ${row.deductions}`, `LIQUIDO BRL: ${row.net}`].flatMap(text => { const normalized = ascii(text); return normalized.match(/.{1,48}/g) ?? [""]; });
    if (lines.length > 99) throw new Error(`Contracheque ${row.registration} supera 99 linhas de 48 posições.`);
    const id = numeric(row.registration, 20);
    records.push(record(100).put(1, id + "001").put(24, numeric(row.agency, 4)).put(28, numeric(row.account, 11)).put(39, numeric(lines.length, 2)).put(41, alpha(ascii(row.name).slice(0, 40), 40)).put(81, numeric(row.cpf, 11)).text());
    lines.forEach((text, index) => records.push(record(100).put(1, id + numeric(index + 1, 2) + "2").put(24, alpha(text, 48)).put(72, "0").text()));
  }
  records.push(record(100).put(1, "9".repeat(38)).put(39, numeric(recipients.length, 11)).text());
  return Buffer.from(records.join("\r\n") + "\r\n", "ascii");
}

/** BB CNAB240 junho/2026: salary credit 01/41, segments A+B, one batch per mode. */
export function renderBbSalaryCnab240(raw: BankFileInput, recipients: BankFileRecipient[]) {
  const input = bankFileInputSchema.parse(raw); validateRecipients(input, recipients);
  if (input.contract.length > 9) throw new Error("Convênio CNAB240 BB exige até nove algarismos.");
  const convenio = numeric(input.contract, 9) + "0126" + " ".repeat(7);
  const company = (row: ReturnType<typeof record>) => row.put(18, "2" + input.payerCnpj).put(33, convenio).put(53, numeric(input.payerAgency, 5) + input.payerAgencyDv + numeric(input.payerAccount, 12) + input.payerAccountDv + "0").put(73, alpha(ascii(input.payerName).slice(0, 30), 30));
  const records = [company(record(240).put(1, "00100000")).put(103, alpha("BANCO DO BRASIL SA", 30)).put(143, "1" + date(input.generationDate) + "000000" + numeric(input.sequence, 6) + "08700000").put(226, "00000" + "0000000000").text()];
  let batches = 0;
  for (const mode of ["01", "41"]) {
    const rows = recipients.filter(row => (row.bank === "001" ? "01" : "41") === mode);
    if (!rows.length) continue;
    batches++; const lot = numeric(batches, 4);
    const header = company(record(240).put(1, "001" + lot + "1C30" + mode + "046"));
    header.put(173, "00000").put(213, "00000").put(231, "0000000000"); records.push(header.text());
    let sequence = 0; const total = rows.reduce((sum, row) => sum.plus(row.net), new Decimal(0));
    for (const row of rows) {
      if (!new Decimal(row.net).gt(0)) throw new Error("Crédito exige líquido positivo.");
      const number = numeric(++sequence, 5), document = numeric((sequence + 1) / 2, 6) + numeric(input.sequence, 6) + "00000000";
      const a = record(240).put(1, "001" + lot + "3" + number + "A000" + (mode === "41" ? "018" : "000"));
      a.put(21, numeric(row.bank, 3) + numeric(row.agency, 5) + alpha(row.agencyDv, 1) + numeric(row.account, 12) + alpha(row.accountDv, 1) + alpha(row.accountSecondDv ?? "", 1));
      a.put(44, alpha(ascii(row.name).slice(0, 30), 30)).put(74, document).put(94, date(input.paymentDate) + "BRL" + "0".repeat(15) + cents(row.net, 15));
      a.put(155, "0".repeat(23)).put(220, mode === "41" ? "00010" : "     ").put(230, "0".repeat(11)); records.push(a.text());
      const b = record(240).put(1, "001" + lot + "3" + numeric(++sequence, 5) + "B").put(18, "1" + numeric(row.cpf, 14));
      b.put(63, "00000").put(118, "00000").put(128, "0".repeat(83)).put(226, "0".repeat(7)); records.push(b.text());
    }
    records.push(record(240).put(1, "001" + lot + "5").put(18, numeric(sequence + 2, 6) + cents(total.toFixed(2), 18) + "0".repeat(24)).put(231, "0000000000").text());
  }
  records.push(record(240).put(1, "00199999").put(18, numeric(batches, 6) + numeric(records.length + 1, 6) + "000000").text());
  return Buffer.from(records.join("\r\n") + "\r\n", "ascii");
}
