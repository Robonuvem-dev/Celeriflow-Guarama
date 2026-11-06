/** Targeted regression plus every management section for the three real planning drafts. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { openCheckupBrowser } from "./lib/checkup-isolated-browser.mjs";

const base = process.env.CHECKUP_LOCAL_BASE || "http://localhost:3100";
const output = process.env.CHECKUP_LATE_OUTPUT || "docs/checkup/late-details-sixth-build";
const manifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const allowedLookups = new Set(Object.entries(manifest.node).filter(([, entry]) => entry.filename === "src/app/app-domain/planejamento/actions.ts" && entry.exportedName === "searchPlanningOptions").map(([id]) => id));
const cases = [
  { path: "/tributacao/imoveis/aurora-system-v1:property:000/bloqueio", text: /Bloqueio|Restrição|Restringir|edição/i, regression: true },
  { path: "/tributacao/imoveis/aurora-system-v1:property:000/perfil", text: /Perfil imobiliário|Inscrição|Terreno/i, regression: true },
  { path: "/compras/pesquisas-precos/aurora-system-v1:price-research:000/relatorio", text: /Relatório de pesquisa de preços por SD/, regression: true },
];
const sections = ["manutencao", "versoes", "consistencias", "compatibilizacao", "emendas", "programacao", "creditos", "workflow", "documentos", "relatorios", "publicacoes"];
for (const [kind, id] of [["ppa", "aurora-system-v1:ppa-instrument:000"], ["ldo", "cmw599c0s0001gchymhv20hk1"], ["loa", "cmw599c8i0004gchy601v86jw"]]) {
  const path = `/planejamento/${kind}/${id}/gestao`;
  for (const section of sections) cases.push({ path: `${path}/${section}`, regression: kind === "ppa" && section === "manutencao" });
  for (const entity of ["INSTRUMENT", "ACTION", "OBJECTIVE", "INDICATOR", "LINE", "MEMORY", "WAIVER", "PRIORITY", "RISK", "WORK", "ANNUAL_PROGRAM"]) cases.push({ path: `${path}/manutencao?entity=${entity}` });
}
const { browser, sourceCookies } = await openCheckupBrowser();
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, timezoneId: "America/Sao_Paulo" });
await context.addCookies(sourceCookies.map(cookie => ({ name: cookie.name, value: cookie.value, url: base, httpOnly: cookie.httpOnly, secure: base.startsWith("https:"), sameSite: cookie.sameSite })));
mkdirSync(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), base, buildId: readFileSync(".next/BUILD_ID", "utf8").trim(), scope: "Four late failures, all 11 management sections and 12 maintenance entity variants for PPA/LDO/LOA. Native query-area switching and first record disclosure; business actions blocked.", cases: [] };
const persist = () => writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
try {
  for (const scenario of cases) {
    const page = await context.newPage();
    const errors = [], consoleErrors = [], httpErrors = [], blockedActions = [], interactions = [];
    let lookups = 0;
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error" && !message.text().includes("net::ERR_FAILED")) consoleErrors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400 && response.url().startsWith(base)) httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() }); });
    await page.route("**/*", route => {
      const headers = route.request().headers();
      if (headers["next-router-prefetch"] === "1") return route.abort();
      if (headers["next-action"] && !allowedLookups.has(headers["next-action"])) { blockedActions.push(new URL(route.request().url()).pathname); return route.abort(); }
      if (headers["next-action"]) lookups++;
      return route.continue();
    });
    let entry;
    try {
      const response = await page.goto(`${base}${scenario.path}`, { waitUntil: "load", timeout: 120000 });
      assert.equal(response.status(), 200);
      const consent = page.getByRole("button", { name: "Manter somente necessários", exact: true });
      if (await consent.isVisible()) await consent.click();
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      const assertScreen = async () => {
        assert.equal(new URL(page.url()).pathname, new URL(scenario.path, base).pathname);
        const text = await page.locator("body").innerText();
        assert.doesNotMatch(text, /This page could not be found\.|Erro Interno do Servidor|Application error:|Esta área ainda não comporta/);
        if (scenario.text) assert.match(text, scenario.text);
      };
      await assertScreen();
      const area = page.getByRole("combobox", { name: "Área da consulta", exact: true });
      if (await area.count()) {
        const options = await area.locator("option").evaluateAll(nodes => nodes.map(node => node.value));
        for (const option of options) { await area.selectOption(option); await assertScreen(); interactions.push({ type: "query-area", value: option }); }
      }
      const editor = page.locator("details > summary").filter({ hasText: "Editar / revisar registro" }).first();
      if (await editor.isVisible()) { await editor.click(); await assertScreen(); interactions.push({ type: "record-editor", opened: true }); }
      await page.waitForLoadState("networkidle", { timeout: 5000 }).catch(() => {});
      await assertScreen();
      assert.deepEqual(errors, []); assert.deepEqual(consoleErrors, []); assert.deepEqual(httpErrors, []); assert.deepEqual(blockedActions, []);
      entry = { path: scenario.path, passed: true, interactions, readOnlyLookups: lookups, errors, consoleErrors, httpErrors, blockedActions };
    } catch (error) { entry = { path: scenario.path, passed: false, error: error.message, interactions, errors, consoleErrors, httpErrors, blockedActions }; }
    if (scenario.regression || !entry.passed) {
      const screenshot = `${createHash("sha256").update(scenario.path).digest("hex").slice(0, 16)}.png`;
      await page.screenshot({ path: `${output}/${screenshot}` }).then(() => { entry.screenshot = screenshot; }).catch(() => {});
    }
    report.cases.push(entry); await page.close(); persist();
    console.log(JSON.stringify({ inspected: report.cases.length, total: cases.length, path: entry.path, passed: entry.passed, error: entry.error }));
  }
} finally {
  await context.close(); await browser.close(); report.finishedAt = new Date().toISOString();
  report.summary = { total: report.cases.length, passed: report.cases.filter(entry => entry.passed).length, failed: report.cases.filter(entry => !entry.passed).length };
  persist(); console.log(JSON.stringify(report.summary));
  if (report.summary.failed) process.exitCode = 1;
}
