import assert from "node:assert/strict";
import test from "node:test";
import { Prisma } from "@prisma/client";
import { distributePlanningMonths } from "../src/lib/planejamento/scheduling";
import { contentHash } from "../src/lib/planejamento/operations-core";
import { parsePlanningItems } from "../src/lib/planejamento/amendments";
import { planningPdfDataset } from "../src/lib/planejamento/report-presentation";
import { generateReportPdf } from "../src/lib/financeiro/report-export";
import { createDefaultReportTemplate } from "../src/lib/reports/report-template";
import type { InternalReportDataset } from "../src/lib/financeiro/report-delivery";

test("distribuição mensal conserva centavos em todos os métodos de pesos e rejeita zero/negativos", () => {
  for (const weights of [Array(12).fill("1"), ["1", "2", "3", "4", "5", "6", "7", "8", "9", "10", "11", "12"], ["0", "0", "100", ...Array(9).fill("0")]]) {
    const values = distributePlanningMonths("123456789012.05", weights);
    assert.equal(values.reduce((sum, row) => sum.plus(row), new Prisma.Decimal(0)).toFixed(2), "123456789012.05");
    assert.ok(values.every((value) => value.greaterThanOrEqualTo(0) && value.decimalPlaces() <= 2));
  }
  assert.throws(() => distributePlanningMonths("12", Array(12).fill("0")), /maior que zero/);
  assert.throws(() => distributePlanningMonths("12", ["-1", ...Array(11).fill("1")]), /inválido/);
});

test("hash de documento e replay independem da ordem das chaves JSONB, preservando ordem dos itens", () => {
  assert.equal(contentHash({ a: 1, nested: { z: "2", c: "3" } }), contentHash({ nested: { c: "3", z: "2" }, a: 1 }));
  assert.notEqual(contentHash({ items: ["E1", "E2"] }), contentHash({ items: ["E2", "E1"] }));
  assert.throws(() => parsePlanningItems("E1;+;1.00\nE1;-;1.00"), /distintos/);
  assert.throws(() => parsePlanningItems("E1;+;0.00"), /maior que zero/);
});

test("apresentação PDF conserva texto jurídico extenso e divide tabelas largas sem truncar dataset", async () => {
  const legal = "Artigo municipal com detalhamento da origem dos recursos. ".repeat(80);
  const dataset: InternalReportDataset = { title: "Minuta de decreto", year: 2026, warnings: [], metadata: { status: "INTERNAL_REVIEW", scope: "Prefeitura Municipal de Vila das Araucárias", referencePeriod: "2026", statutoryCompleteness: "NOT_STATUTORY", publicSnapshotEligible: false, publicSnapshotCondition: "Aguardando publicação" }, sections: [{ title: "Itens e fundamento", rows: [{ entidade: "Prefeitura", código: "E1", coluna1: "a", coluna2: "b", coluna3: "c", coluna4: "d", coluna5: "e", texto: legal }] }] };
  const presentation = planningPdfDataset(dataset);
  assert.ok(presentation.sections.every((section) => section.rows.every((row) => Object.keys(row).length <= 6)));
  assert.equal(presentation.sections.flatMap((section) => section.rows).map((row) => row.texto ?? "").join(""), legal);
  assert.equal(dataset.sections[0].rows[0].texto, legal);
  const pdf = await generateReportPdf(presentation, { institution: null, template: { ...createDefaultReportTemplate(), orientation: "LANDSCAPE" }, emission: null });
  assert.equal(Buffer.from(pdf).subarray(0, 4).toString(), "%PDF");
  assert.ok(pdf.length > 1000);
});
