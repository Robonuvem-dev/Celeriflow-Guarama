import assert from "node:assert/strict";
import { test } from "node:test";
import { createHash } from "node:crypto";
import { count, eq } from "drizzle-orm";
import { bankStatementImports, bankStatementItems } from "../src/db/schema/finance-banking";
import { reconciliationBankAccounts } from "../src/db/schema/finance-reconciliation";
import { banks } from "../src/db/schema/master-data";
import { parseOfxStatement } from "../src/lib/financeiro/ofx-parser";
import { importBankStatementOfc, importBankStatementOfx } from "../src/lib/financeiro/ofx-import";
import { parseOfcStatement } from "../src/lib/financeiro/ofc-parser";
import { importBankStatementCsv } from "../src/lib/financeiro/csv-import";
import { createPlanningExecutionFixture } from "./helpers/planning-execution-fixture";
import { renderBankStatementPdf } from "../src/lib/financeiro/statement-print";

const transaction = (id = "FIT-001", amount = "150.25", memo = "Receita &amp; taxas") => `<STMTTRN><TRNTYPE>${amount.startsWith("-") ? "DEBIT" : "CREDIT"}\n<DTPOSTED>20261002120000[-3:BRT]\n<TRNAMT>${amount}\n<FITID>${id}\n<MEMO>${memo}\n</STMTTRN>`;
const file = (items = transaction(), account = "1000-1") => Buffer.from(`OFXHEADER:100\nDATA:OFXSGML\nVERSION:102\nENCODING:USASCII\nCHARSET:1252\n\n<OFX><BANKMSGSRSV1><STMTTRNRS><STATUS><CODE>0\n</STATUS><STMTRS><CURDEF>BRL\n<BANKACCTFROM><BANKID>001\n<BRANCHID>0001\n<ACCTID>${account}\n</BANKACCTFROM><BANKTRANLIST><DTSTART>20261001\n<DTEND>20261031\n${items}</BANKTRANLIST></STMTRS></STMTTRNRS></BANKMSGSRSV1></OFX>`, "latin1");
const ofcTransaction = (id = "FIT-001", amount = "150,25", memo = "Receita &amp; taxas") => `<STMTTRN><TRNTYPE>${amount.startsWith("-") ? "1" : "0"}\n<DTPOSTED>20261002120000\n<TRNAMT>${amount}\n<FITID>${id}\n<MEMO>${memo}\n</STMTTRN>`;
const ofcFile = (items = ofcTransaction(), account = "1000-1") => Buffer.from(`<OFC><DTD>1\n<CPAGE>1252\n<ACCTSTMT><ACCTFROM><BANKID>001\n<BRANCHID>0001\n<ACCTID>${account}\n<ACCTTYPE>0\n</ACCTFROM><STMTRS><DTSTART>20261001\n<DTEND>20261031\n<LEDGER>150.25\n${items}</STMTRS></ACCTSTMT></OFC>`, "latin1");

test("OFC nativo lê ACCTFROM, tipos numéricos, vírgula, CPAGE e CHKNUM sem fabricar FITID", () => {
  const parsed = parseOfcStatement(ofcFile(ofcTransaction("OFC-1", "-0,01", "Manutenção").replace("<MEMO>", "<CHKNUM>1234\n<MEMO>")));
  assert.equal(parsed.transactions[0].amount.toFixed(2), "-0.01");
  assert.equal(parsed.transactions[0].type, "DEBIT");
  assert.equal(parsed.transactions[0].description, "Manutenção");
  assert.equal(parsed.transactions[0].reference, "1234");
  assert.equal(parsed.currencyBasis, "MUNICIPAL_BRL_ACCOUNT_POLICY");
  assert.throws(() => parseOfcStatement(ofcFile(ofcTransaction() + ofcTransaction())), /FITID duplicado/);
  assert.throws(() => parseOfcStatement(ofcFile(ofcTransaction().replace("<FITID>FIT-001", "<CLTID>1"))), /FITID obrigatório/);
  assert.throws(() => parseOfcStatement(ofcFile(ofcTransaction("F1", "1,001"))), /duas casas/);
  assert.throws(() => parseOfcStatement(ofcFile(ofcTransaction().replace("20261002120000", "20260230"))), /dia inválido/);
  assert.throws(() => parseOfcStatement(ofcFile(ofcTransaction().replace("<TRNTYPE>0", "<TRNTYPE>13"))), /TRNTYPE/);
  assert.throws(() => parseOfcStatement(Buffer.from(ofcFile().toString("latin1").replace("<CPAGE>1252", "<CPAGE>850"), "latin1")), /CPAGE/);
  assert.throws(() => parseOfcStatement(Buffer.from(ofcFile().toString("latin1").replace("<LEDGER>", "<CURDEF>USD\n<LEDGER>"), "latin1")), /BRL/);
  assert.throws(() => parseOfcStatement(Buffer.from(ofcFile().toString("latin1").replace("</OFC>", ""), "latin1")), /completo/);
  assert.throws(() => parseOfcStatement(Buffer.from(`<!DOCTYPE OFC [<!ENTITY ext SYSTEM "file:///private">]>${ofcFile().toString("latin1")}`, "latin1")), /entidades externas/);
});

test("OFC conserva bytes e hash, replay concorrente e sobreposição OFX sem duplicar; conflito e falha revertem o lote", async () => {
  const f = await createPlanningExecutionFixture();
  const { connection } = f;
  try {
    const db = connection.db;
    const [bank] = await db.select().from(banks).where(eq(banks.compe, "001"));
    assert.ok(bank, "Banco COMPE 001 preservado pela migração de dados mestres");
    await db.update(reconciliationBankAccounts).set({ bankId: bank.id }).where(eq(reconciliationBankAccounts.id, "banco"));
    const input = { bankAccountId: "banco", bytes: ofcFile(), fileName: "extrato.ofc" };
    await assert.rejects(importBankStatementOfc(connection, { ...f.actor, allowedBudgetUnitIds: ["ug-restrita"] }, input), /autorizadas/);
    await assert.rejects(importBankStatementOfc(connection, f.actor, { ...input, bytes: ofcFile(ofcTransaction(), "OUTRA") }), /conta\/agência/);
    const [first, replay] = await Promise.all([importBankStatementOfc(connection, f.actor, input), importBankStatementOfc(connection, f.actor, input)]);
    assert.equal(first.id, replay.id);
    assert.equal(first.format, "OFC");
    assert.equal(first.checksum, createHash("sha256").update(input.bytes).digest("hex"));
    assert.deepEqual(Buffer.from(first.originalBytes!), input.bytes);
    const overlapping = await importBankStatementOfx(connection, f.actor, { ...input, bytes: file(transaction() + transaction("FIT-002", "-10.10", "Tarifa")), fileName: "extrato.ofx" });
    assert.equal((overlapping.processingSnapshot as { imported: number }).imported, 1);
    const repeated = await importBankStatementOfc(connection, f.actor, { ...input, bytes: ofcFile(ofcTransaction() + ofcTransaction("FIT-002", "-10.10", "Tarifa")) });
    assert.equal((repeated.processingSnapshot as { imported: number }).imported, 0);
    assert.equal((await db.select({ total: count() }).from(bankStatementItems).where(eq(bankStatementItems.bankAccountId, "banco")))[0].total, 2);
    const pdf = await renderBankStatementPdf(repeated, { bankName: "Banco do Brasil", agency: "0001", accountNumber: "1000-1" }, []);
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    const importCount = (await db.select({ total: count() }).from(bankStatementImports))[0].total;
    await assert.rejects(importBankStatementOfc(connection, f.actor, { ...input, bytes: ofcFile(ofcTransaction("FIT-001", "151,25")) }), /divergente/);
    assert.equal((await db.select({ total: count() }).from(bankStatementImports))[0].total, importCount);
    await f.pg.exec(`CREATE FUNCTION reject_ofc_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'ofc rollback'; END $$; CREATE TRIGGER reject_ofc_item BEFORE INSERT ON "BankStatementItem" FOR EACH ROW EXECUTE FUNCTION reject_ofc_item();`);
    await assert.rejects(importBankStatementOfc(connection, f.actor, { ...input, bytes: ofcFile(ofcTransaction("FIT-003")) }), error => error instanceof Error && error.cause instanceof Error && /ofc rollback/.test(error.cause.message));
    assert.equal((await db.select({ total: count() }).from(bankStatementImports))[0].total, importCount);
    assert.equal((await db.select({ total: count() }).from(bankStatementItems).where(eq(bankStatementItems.bankAccountId, "banco")))[0].total, 2);
  } finally { await f.close(); }
});

test("OFX SGML conserva centavos e dia bancário; rejeita registro inválido, correção e FITID duplicado", () => {
  const parsed = parseOfxStatement(file());
  assert.equal(parsed.transactions[0].amount.toFixed(2), "150.25");
  assert.equal(parsed.transactions[0].date.toISOString(), "2026-10-02T12:00:00.000Z");
  assert.equal(parsed.transactions[0].description, "Receita & taxas");
  assert.throws(() => parseOfxStatement(file(transaction() + transaction())), /FITID duplicado/);
  assert.throws(() => parseOfxStatement(file(transaction("FIT-001", "1.001"))), /duas casas/);
  assert.throws(() => parseOfxStatement(Buffer.from(file().toString("latin1").replace("20261002120000[-3:BRT]", "20260230"), "latin1")), /dia inválido/);
  assert.throws(() => parseOfxStatement(file(transaction().replace("<MEMO>", "<CORRECTFITID>ANTIGO\n<MEMO>"))), /Correção/);
});

test("OFX XML e encoding declarado são aceitos; moedas e documentos incompletos são recusados", () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?><OFX><STMTRS><CURDEF>BRL</CURDEF><BANKACCTFROM><BANKID>001</BANKID><ACCTID>1000-1</ACCTID></BANKACCTFROM><BANKTRANLIST><DTSTART>20261001</DTSTART><DTEND>20261031</DTEND><STMTTRN><TRNTYPE>DEBIT</TRNTYPE><DTPOSTED>20261003</DTPOSTED><TRNAMT>-0.01</TRNAMT><FITID>D1</FITID><MEMO>Tarifa — manutenção</MEMO></STMTTRN></BANKTRANLIST></STMTRS></OFX>`;
  const parsed = parseOfxStatement(Buffer.from(xml));
  assert.equal(parsed.transactions[0].amount.toFixed(2), "-0.01");
  assert.equal(parsed.transactions[0].description, "Tarifa — manutenção");
  assert.throws(() => parseOfxStatement(Buffer.from(xml.replace("BRL", "USD"))), /BRL/);
  assert.throws(() => parseOfxStatement(Buffer.from(xml.replace("</OFX>", ""))), /incompleto/);
  assert.throws(() => parseOfxStatement(Buffer.from(`<!DOCTYPE OFX [<!ENTITY ext SYSTEM "file:///private">]>${xml}`)), /entidades externas/);
});

test("OFX persiste original, serializa replays, deduplica extratos sobrepostos e recusa conflito sem gravação parcial", async () => {
  const f = await createPlanningExecutionFixture();
  const { connection } = f;
  try {
    const db = connection.db;
    const [bank] = await db.select().from(banks).where(eq(banks.compe, "001"));
    assert.ok(bank, "Banco COMPE 001 preservado pela migração de dados mestres");
    await db.update(reconciliationBankAccounts).set({ bankId: bank.id }).where(eq(reconciliationBankAccounts.id, "banco"));
    const input = { bankAccountId: "banco", bytes: file(), fileName: "extrato.ofx" };
    await assert.rejects(importBankStatementOfx(connection, { ...f.actor, allowedBudgetUnitIds: ["ug-restrita"] }, input), /autorizadas/);
    await assert.rejects(importBankStatementOfx(connection, f.actor, { ...input, bytes: file(transaction(), "OUTRA") }), /conta\/agência/);
    const [first, replay] = await Promise.all([importBankStatementOfx(connection, f.actor, input), importBankStatementOfx(connection, f.actor, input)]);
    assert.equal(first.id, replay.id);
    assert.equal(first.checksum, createHash("sha256").update(input.bytes).digest("hex"));
    assert.deepEqual(Buffer.from(first.originalBytes!), input.bytes);
    const overlapping = await importBankStatementOfx(connection, f.actor, { ...input, bytes: file(transaction() + transaction("FIT-002", "-10.10", "Tarifa")) });
    assert.equal((overlapping.processingSnapshot as { imported: number }).imported, 1);
    assert.equal((await db.select({ total: count() }).from(bankStatementItems).where(eq(bankStatementItems.bankAccountId, "banco")))[0].total, 2);
    const pdf = await renderBankStatementPdf(overlapping, { bankName: "Banco do Brasil", agency: "0001", accountNumber: "1000-1" }, await db.select().from(bankStatementItems).where(eq(bankStatementItems.statementImportId, overlapping.id)));
    assert.equal(pdf.subarray(0, 4).toString(), "%PDF");
    const importCount = (await db.select({ total: count() }).from(bankStatementImports))[0].total;
    await assert.rejects(importBankStatementOfx(connection, f.actor, { ...input, bytes: file(transaction("FIT-001", "151.25")) }), /divergente/);
    assert.equal((await db.select({ total: count() }).from(bankStatementImports))[0].total, importCount);
    assert.equal((await db.select({ total: count() }).from(bankStatementItems).where(eq(bankStatementItems.bankAccountId, "banco")))[0].total, 2);
  } finally { await f.close(); }
});

test("falha de persistência OFX reverte lote, itens e original; CSV conserva BOM e CRLF originais", async () => {
  const f = await createPlanningExecutionFixture();
  const { connection } = f;
  try {
    const db = connection.db;
    const [bank] = await db.select().from(banks).where(eq(banks.compe, "001"));
    assert.ok(bank, "Banco COMPE 001 preservado pela migração de dados mestres");
    await db.update(reconciliationBankAccounts).set({ bankId: bank.id }).where(eq(reconciliationBankAccounts.id, "banco"));
    await f.pg.exec(`CREATE FUNCTION reject_statement_item() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'statement rollback'; END $$; CREATE TRIGGER reject_statement_item BEFORE INSERT ON "BankStatementItem" FOR EACH ROW EXECUTE FUNCTION reject_statement_item();`);
    await assert.rejects(importBankStatementOfx(connection, f.actor, { bankAccountId: "banco", bytes: file(), fileName: "extrato.ofx" }), error => error instanceof Error && error.cause instanceof Error && /statement rollback/.test(error.cause.message));
    assert.equal((await db.select({ total: count() }).from(bankStatementImports))[0].total, 0);
    await f.pg.exec('DROP TRIGGER reject_statement_item ON "BankStatementItem"; DROP FUNCTION reject_statement_item();');
    const bytes = Buffer.from("\uFEFFdate;description;amount\r\n2026-10-02;Receita;150,25\r\n", "utf8");
    const csv = await importBankStatementCsv(connection, f.actor, { bankAccountId: "banco", originalBytes: bytes, content: new TextDecoder().decode(bytes), fileName: "extrato.csv" });
    assert.deepEqual(Buffer.from(csv.originalBytes!), bytes);
    assert.equal(csv.checksum, createHash("sha256").update(bytes).digest("hex"));
  } finally { await f.close(); }
});
