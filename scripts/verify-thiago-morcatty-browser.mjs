import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = "https://guarama.celeriflow.com.br";
const output = "docs/checkup/thiago-morcatty-browser";
const demo = JSON.parse(readFileSync("docs/checkup/thiago-morcatty-demo.json", "utf8"));
const browser = await chromium.connectOverCDP("http://127.0.0.1:9337");
const report = { checkedAt: new Date().toISOString(), base, mode: "Authenticated consultations of the newly created fictional employee", cases: [] };
mkdirSync(output, { recursive: true });
const persist = () => writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
let page;
try {
  const context = browser.contexts().find(context => context.pages().some(page => page.url().startsWith(base)));
  assert.ok(context, "Abra a sessão autenticada no Chrome.");
  page = await context.newPage();
  await page.setViewportSize({ width: 1366, height: 768 });
  const cases = [
    { name: "portal", path: "/portal-servidor", expected: ["Thiago Morcatty", "Coordenador de TI", "Vínculo ativo"] },
    { name: "ficha", path: "/portal-servidor/ficha-funcional", expected: ["01/01/2025", "TI-001/2025"] },
    { name: "ponto-outubro", path: "/portal-servidor/ponto?month=2026-10", expected: ["Presente", "08:00", "17:00"], rows: 20 },
    { name: "ponto-novembro", path: "/portal-servidor/ponto?month=2026-11", expected: ["Presente", "05/11/2026"], rows: 3 },
    { name: "ferias", path: "/portal-servidor/ferias", expected: ["01/12/2026", "30/12/2026", "Programada"], rows: 1 },
    // Existing personnel presentation removes the technical DEMO- prefix in table cells.
    { name: "contracheque", path: "/portal-servidor/demonstrativos?competence=10%2F2026", expected: ["TI-2026-001", "6354.86", "Abrir PDF integral"], rows: 1 },
    { name: "folha", path: "/portal-servidor/folha?competence=10%2F2026", expected: ["10/2026", "Fechada", "8.500,00"] },
    { name: "rh-servidor", path: "/rh/servidores?q=Morcatty", expected: ["Thiago Morcatty", "Coordenador de TI", "TI-2026-001"], rows: 1 },
    { name: "cadastro-pessoa", path: "/cadastros/pessoas-fisicas", search: true, expected: ["Thiago Morcatty", "thiago.morcatty@example.com", "TM-2026-001"], rows: 1 },
    { name: "administracao", path: "/administracao/servidores", search: true, expected: ["Thiago Morcatty", "Coordenador de TI"], rows: 1 },
    { name: "tributacao", path: "/tributacao/pessoas?q=99377290171", wide: true, expected: ["Thiago Morcatty", "TM-2026-001"], rows: 1 },
    { name: "ficha-fiscal", path: `/tributacao/pessoas/${demo.taxpayerId}`, expected: ["Thiago Morcatty"], knownIssue: "Production renders a streamed 404 for existing and new taxpayer details" },
  ];
  for (const entry of cases) {
    const errors = [];
    const onError = error => errors.push(error.message);
    page.on("pageerror", onError);
    try {
      await page.setViewportSize(entry.wide ? { width: 1920, height: 1080 } : { width: 1366, height: 768 });
      const response = await page.goto(base + entry.path, { waitUntil: "load", timeout: 90000 });
      if (entry.search) await page.getByRole("searchbox", { name: "Buscar registros" }).fill("Morcatty");
      await page.waitForFunction(expected => expected.every(text => document.body.innerText.includes(text)), entry.expected, { timeout: 20000 }).catch(() => {});
      const text = await page.locator("body").innerText();
      const missing = entry.expected.filter(expected => !text.includes(expected));
      const rows = await page.locator("tbody tr").count();
      const passed = response.status() === 200 && !missing.length && !errors.length && (entry.rows === undefined || entry.rows === rows);
      const knownIssue = entry.knownIssue && /This page could not be found\./.test(text) ? entry.knownIssue : undefined;
      report.cases.push({ name: entry.name, path: entry.path, status: response.status(), missing, rows, pageErrors: errors, passed, knownIssue });
      await page.screenshot({ path: `${output}/${entry.name}.png`, caret: "initial" });
    } catch (error) {
      report.cases.push({ name: entry.name, path: entry.path, passed: false, error: error.message });
    } finally {
      page.off("pageerror", onError);
      persist();
      console.log(JSON.stringify(report.cases.at(-1)));
    }
  }
  const pdf = await context.request.get(`${base}/api/portal-servidor/demonstrativos/${demo.payroll.statementId}`, { timeout: 60000 });
  const bytes = await pdf.body();
  const pdfResult = { name: "contracheque-pdf", status: pdf.status(), contentType: pdf.headers()["content-type"], bytes: bytes.length, passed: pdf.status() === 200 && bytes.subarray(0, 5).toString() === "%PDF-" };
  report.cases.push(pdfResult);
  if (pdfResult.passed) writeFileSync(`${output}/contracheque-outubro-2026.pdf`, bytes);
  persist();
  console.log(JSON.stringify(pdfResult));
  assert.ok(report.cases.every(entry => entry.passed || entry.knownIssue), "Confira os casos com falha no relatório.");
  report.summary = { passed: report.cases.filter(entry => entry.passed).length, knownIssues: report.cases.filter(entry => entry.knownIssue).length, failed: report.cases.filter(entry => !entry.passed && !entry.knownIssue).length };
  await page.goto(`${base}/portal-servidor`, { waitUntil: "load" });
  await page.bringToFront();
} finally {
  report.finishedAt = new Date().toISOString();
  persist();
  await browser.close();
}
