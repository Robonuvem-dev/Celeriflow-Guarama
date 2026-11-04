import test from "node:test";
import assert from "node:assert/strict";
import { getDocument } from "pdfjs-dist/legacy/build/pdf.mjs";
import { renderHrReport } from "../src/lib/rh/report-service";
import { renderPayrollStatementPdf } from "../src/lib/rh/statement-service";

async function readPages(bytes: Uint8Array) {
  const task = getDocument({ data: new Uint8Array(bytes), useSystemFonts: true });
  try {
    const document = await task.promise;
    const pages = [];
    for (let index = 1; index <= document.numPages; index++) {
      const page = await document.getPage(index);
      const content = await page.getTextContent();
      const text = content.items.map(item => "str" in item ? item.str : "").join(" ");
      pages.push({ text, viewport: page.getViewport({ scale: 1 }) });
    }
    return pages;
  } finally { await task.destroy(); }
}

test("espelho integral repete cabeçalhos e preserva registros/totais em múltiplas páginas", async () => {
  const report = {
    title: "Espelho de ponto pessoal — Servidor fictício · 2026-08-01 a 2026-10-31 · America/Sao_Paulo",
    headers: ["Data", "Entrada", "Saída", "Horas trabalhadas", "Horas extras", "Banco de horas", "Situação", "Registro"],
    rows: Array.from({ length: 65 }, (_, index) => ["2026-08-03", "08:00", "17:00", "8", "0", "0", "Presente — DEMONSTRAÇÃO (sintético)", `REGISTRO-UNICO-${index}`]),
  };
  report.rows.push(["TOTAL", "", "", "520.0000", "0", "0", "", ""]);
  const output = await renderHrReport(report, "PDF");
  const pages = await readPages(output.bytes);
  assert.ok(pages.length > 1);
  for (const page of pages) assert.ok(page.viewport.width > page.viewport.height, "espelho deve usar paisagem");
  const text = pages.map(page => page.text).join(" ");
  for (let index = 0; index < 65; index++) assert.ok(text.includes(`REGISTRO-UNICO-${index}`), `registro ${index} deve estar integral`);
  assert.ok(text.includes("520.0000"));
  assert.ok(text.includes("Conferência do servidor"));
  assert.ok(pages.filter(page => page.text.includes("Entrada")).length > 1);
});

test("contracheque separa proventos/descontos e mantém memória, totais e emitente municipal", async () => {
  const bytes = await renderPayrollStatementPdf({
    id: "statement-test", contract: { registration: "DEMO-26", workLocation: "Administração", salary: "5000.00", employee: { name: "Servidor fictício" } },
    competence: "10/2026", payrollType: "Mensal", scope: "DEMONSTRACAO", mode: "OFICIAL", createdAt: new Date("2026-10-31"), days: 30,
    gross: "5000.00", deductions: "500.00", net: "4500.00", employer: "1000.00", bases: { RGPS: "5000.00" },
    items: [{ code: "VENCIMENTO", name: "Vencimento básico", type: "PROVENTO", value: "5000.00", method: "FORMULA_CONTROLADA", formula: "SALARIO_BASE * DIAS / 30", base: null, rate: null, movement: "0" }, { code: "PREVIDENCIA", name: "Previdência", type: "DESCONTO", value: "500.00", method: "PROGRESSIVA", formula: null, base: "5000.00", rate: null, movement: "0" }],
    consignmentMargin: null, familyWage: null, irrfDependents: null, messages: [], incomeTax: null, specialPayroll: null, proration: null, pensions: [], consignments: [], remunerationLimits: [], automaticServiceAllowances: [],
  });
  const text = (await readPages(bytes)).map(page => page.text).join(" ");
  for (const value of ["Proventos R$", "Descontos R$", "5000.00", "4500.00", "Memória de cálculo", "SALARIO_BASE * DIAS / 30", "Vereda das Auroras"]) assert.ok(text.includes(value), value);
  assert.doesNotMatch(text, /DEMONSTRAÇÃO|\bPOC\b/);
});
