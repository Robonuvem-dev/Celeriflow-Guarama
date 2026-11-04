import assert from "node:assert/strict";
import test from "node:test";
import { renderBbEdo001, renderBbSalaryCnab240, type BankFileInput, type BankFileRecipient } from "../src/lib/rh/bank-file-layouts";

const input: BankFileInput = { runId: "run", conventionId: "conv", layout: "BB_EDO001", payerName: "Prefeitura Municipal de Vereda das Auroras", payerCnpj: "00000000000191", payerAgency: "1234", payerAgencyDv: "X", payerAccount: "12345", payerAccountDv: "6", contract: "123456789", sequence: 17, extra: 2, paymentDate: "2026-11-05", generationDate: "2026-11-04" };
const holder: BankFileRecipient = { statementId: "statement", registration: "0012", name: "José da Silva", cpf: "52998224725", bank: "001", agency: "4321", agencyDv: "0", account: "9988", accountDv: "X", net: "900.01", gross: "1000.01", deductions: "100.00", items: [{ code: "VENCIMENTO", name: "Vencimento mensal", type: "PROVENTO", value: "1000.01" }, { code: "PREVIDENCIA", name: "Previdência pessoal", type: "DESCONTO", value: "100.00" }], accountSource: "Documento da conta" };
const lines = (bytes: Buffer, width: number) => { const text = bytes.toString("ascii"); assert.ok(text.endsWith("\r\n")); assert.ok(!text.includes("\uFEFF")); const rows = text.slice(0, -2).split("\r\n"); assert.ok(rows.every(row => Buffer.byteLength(row, "ascii") === width)); return rows; };
const field = (row: string, from: number, until: number) => row.slice(from - 1, until);

test("EDO001: vetor das quatro visões, ASCII, ordem, produto/modalidade e texto integral em 48 colunas", () => {
  const rows = lines(renderBbEdo001(input, "10/2026", [holder]), 100);
  assert.equal(field(rows[0], 1, 23), "00000000000000000000000");
  assert.equal(field(rows[0], 24, 44), "123400000012345EDO001");
  assert.equal(field(rows[0], 45, 88), "00012345678900001700315000012026100205112026");
  assert.equal(field(rows[1], 1, 38), "00000000000000000012001432100000009988");
  assert.equal(field(rows[1], 41, 80).trim(), "JOSE DA SILVA");
  assert.equal(field(rows[1], 81, 91), "52998224725");
  const body = rows.slice(2, -1);
  assert.equal(Number(field(rows[1], 39, 40)), body.length);
  assert.ok(body.every((row, index) => field(row, 21, 23) === String(index + 1).padStart(2, "0") + "2" && field(row, 72, 72) === "0"));
  assert.ok(body.map(row => field(row, 24, 71).trimEnd()).join("").includes("PREVIDENCIA PREVIDENCIA PESSOAL DESCONTO: 100.00"));
  assert.equal(field(rows.at(-1)!, 1, 38), "9".repeat(38));
  assert.equal(field(rows.at(-1)!, 39, 49), "00000000001");
  assert.deepEqual(rows.map(row => row.slice(0, 23)), rows.map(row => row.slice(0, 23)).sort());
});

test("EDO001 não aceita documentos duplicados, matrícula alfanumérica, banco externo ou excesso de linhas", () => {
  assert.throws(() => renderBbEdo001(input, "10/2026", [holder, { ...holder, statementId: "other", registration: "12" }]), /única/);
  assert.throws(() => renderBbEdo001(input, "10/2026", [{ ...holder, registration: "A12" }]), /numérico/);
  assert.throws(() => renderBbEdo001(input, "10/2026", [{ ...holder, bank: "104" }]), /conta BB/);
  assert.throws(() => renderBbEdo001(input, "10/2026", [{ ...holder, items: [{ ...holder.items[0], name: 'A'.repeat(4800) }, holder.items[1]] }]), /99 linhas/);
});

test("CNAB240: 21 créditos em dois lotes, A/B, TED, datas, centavos, trailers e sequência segundo manual BB", () => {
  const recipients = Array.from({ length: 21 }, (_, index) => ({ ...holder, statementId: `statement-${index}`, registration: String(index + 1), bank: index < 20 ? '001' : '104' }));
  const rows = lines(renderBbSalaryCnab240({ ...input, layout: 'BB_CNAB240_2026_06' }, recipients), 240);
  assert.equal(rows.length, 48);
  assert.equal(field(rows[0], 33, 52), "1234567890126       ");
  assert.equal(field(rows[0], 143, 166), "104112026000000000017087");
  const batchHeaders = rows.filter(row => row[7] === '1');
  assert.equal(field(batchHeaders[0], 9, 16), "C3001046"); assert.equal(field(batchHeaders[1], 9, 16), "C3041046");
  const details = rows.filter(row => row[7] === '3');
  assert.equal(details.length, 42);
  assert.equal(field(details[0], 14, 23), "A000000001");
  assert.equal(field(details[0], 24, 43), "043210000000009988X ");
  assert.equal(field(details[0], 94, 134), "05112026BRL000000000000000000000000090001");
  assert.equal(field(details[1], 14, 32), "B   100052998224725");
  assert.equal(field(details.at(-2)!, 18, 23), "018104");
  const trailers = rows.filter(row => row[7] === '5');
  assert.equal(field(trailers[0], 18, 41), "000042000000000001800020");
  assert.equal(field(trailers[1], 18, 41), "000004000000000000090001");
  assert.equal(field(rows.at(-1)!, 18, 35), "000002000048000000");
});

test("arquivo bancário rejeita centavos incompatíveis e divergência entre rubricas e totais", () => {
  assert.throws(() => renderBbSalaryCnab240(input, [{ ...holder, net: '-1' }]), /Totais|Valor/);
  assert.throws(() => renderBbEdo001(input, '10/2026', [{ ...holder, deductions: '0' }]), /Rubricas/);
});
