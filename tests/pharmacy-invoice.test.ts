import assert from "node:assert/strict";
import test from "node:test";
import { parsePharmacyInvoice } from "../src/lib/saude/pharmacy-invoice";
import { pharmacyInvoiceFixture } from "./helpers/pharmacy-invoice-fixture";

test("NF-e farmacêutica preserva emitente, itens, lotes, custos Float e emissão com zona", () => {
  const invoice = parsePharmacyInvoice(pharmacyInvoiceFixture());
  assert.equal(invoice.supplierCnpj, "11222333000181");
  assert.equal(invoice.supplierName, "Fornecedor de teste & Cia");
  assert.equal(invoice.invoiceNumber, "123");
  assert.equal(invoice.invoiceKey.length, 44);
  assert.equal(invoice.invoiceXmlHash.length, 64);
  assert.equal(invoice.items.length, 1);
  assert.equal(invoice.items[0].quantity, 2);
  assert.equal(invoice.items[0].unitCost, 12.5);
  assert.equal(invoice.items[0].batchNumber, "NF-LOTE");
  assert.equal(invoice.items[0].expirationDate, "2030-12-31");
  const absent = parsePharmacyInvoice(pharmacyInvoiceFixture(false)).items[0];
  assert.equal(absent.batchNumber, ""); assert.equal(absent.expirationDate, null);
  assert.equal(parsePharmacyInvoice(pharmacyInvoiceFixture().replace("10:00:00-03:00", "23:30:00-03:00")).invoiceIssuedAt, "2026-10-01T23:30:00-03:00");
});

test("NF-e farmacêutica rejeita estrutura, soma de lotes, data impossível e entidades externas", () => {
  assert.throws(() => parsePharmacyInvoice("<catalogo><produto>Medicamento</produto></catalogo>"), /modelo 55/);
  assert.throws(() => parsePharmacyInvoice(pharmacyInvoiceFixture().replace("<qLote>2</qLote>", "<qLote>3</qLote>")), /não totalizam/);
  assert.throws(() => parsePharmacyInvoice(pharmacyInvoiceFixture().replace("2030-12-31", "2030-02-31")), /validade/);
  assert.throws(() => parsePharmacyInvoice('<!DOCTYPE NFe [<!ENTITY foo SYSTEM "file:///x">]><NFe>&foo;</NFe>'), /declarações externas/);
});
