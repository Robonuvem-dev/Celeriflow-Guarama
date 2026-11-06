import { openCheckupBrowser } from "./lib/checkup-isolated-browser.mjs";
import { mkdirSync, writeFileSync } from "node:fs";
import { createHash } from "node:crypto";

const base = new URL(process.env.CHECKUP_LOCAL_BASE || "http://localhost:3100");
const output = process.env.CHECKUP_LOCAL_AUTH_OUTPUT || "docs/checkup/local-authenticated";
const paths = process.env.CHECKUP_LOCAL_PATHS ? JSON.parse(process.env.CHECKUP_LOCAL_PATHS) : ["/compras/pesquisas-precos", "/rh/parametrizacoes", "/rh/operacoes", "/protocolos/consultas-construcao-civil", "/tributacao/nfse", "/tributacao/comparativo-anual", "/financeiro/contabilidade/disponibilidade", "/tributacao/pessoas/THIAGO_MORCATTY_DEMO_2026_V1:taxpayer", "/rh/servidores", "/rh/servidores/novo", "/rh/registros-funcionais", "/rh/registros-funcionais?view=manage"];
const { browser, sourceCookies } = await openCheckupBrowser();
const cookie = sourceCookies.find(cookie => cookie.name === "celeriflow_session");
if (!cookie) throw new Error("Cookie de sessão não encontrado.");
const viewport = { width: Number(process.env.CHECKUP_LOCAL_WIDTH || 1366), height: Number(process.env.CHECKUP_LOCAL_HEIGHT || 768) };
const context = await browser.newContext({ viewport, timezoneId: "America/Sao_Paulo" });
await context.addCookies([{ name: cookie.name, value: cookie.value, url: base.origin, httpOnly: true, secure: base.protocol === "https:", sameSite: "Lax" }]);
const report = { startedAt: new Date().toISOString(), base: base.origin, viewport, scope: "Existing session reused only in memory in an isolated local browser context", cases: [], shellChecks: [] };
mkdirSync(output, { recursive: true });
const persist = () => writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
try {
  for (const path of paths) {
    const page = await context.newPage();
    const errors = [], consoleErrors = [], httpErrors = [];
    const onError = error => errors.push(error.message);
    const onConsole = message => { if (message.type() === "error") consoleErrors.push(message.text().slice(0, 3000)); };
    const onResponse = response => { if (response.status() >= 400 && response.url().startsWith(base.origin)) httpErrors.push({ path: new URL(response.url()).pathname, status: response.status(), type: response.request().resourceType() }); };
    page.on("pageerror", onError); page.on("console", onConsole); page.on("response", onResponse);
    try {
      const response = await page.goto(new URL(path, base).href, { waitUntil: "load", timeout: 120000 });
      await page.waitForLoadState("networkidle", { timeout: 3000 }).catch(() => {});
      const text = await page.locator("body").innerText();
      const shell = await page.locator("[data-operational-sidebar] a[href]").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
      const layout = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, workspaces: document.querySelectorAll("[data-operational-workspace]").length, sidebars: document.querySelectorAll("[data-operational-sidebar]").length, tables: [...document.querySelectorAll("[data-operational-list] table")].map(table => ({ width: Math.round(table.getBoundingClientRect().width), rows: table.querySelectorAll("tbody tr").length })) }));
      const result = response.status() === 404 || /This page could not be found\./.test(text) ? "NOT_FOUND" : /Internal Server Error|Erro Interno do Servidor|Application error:/.test(text) || response.status() >= 500 ? "SERVER_ERROR" : new URL(page.url()).pathname === "/login" ? "AUTH_REQUIRED" : /Acesso (?:funcional )?(?:indisponível|negado)|Sem permissão|não (?:tem|possui) permissão/.test(text) ? "ACCESS_UNAVAILABLE" : errors.length ? "RENDER_ERROR" : httpErrors.length || consoleErrors.length ? "RESOURCE_ERROR" : /Esta área ainda não comporta/.test(text) ? "LAYOUT_BLOCKED" : "OPENED";
      const entry = { path, status: response.status(), result, headings: await page.locator("h1,h2").allTextContents(), errors, consoleErrors, httpErrors, layout, shell, alerts: await page.locator('[role="alert"]').allTextContents(), links: await page.locator('a[href*="/api/rh/relatorios"],a[href*="/exportar"],a[href*="/api/financeiro/disponibilidade"]').evaluateAll(nodes => nodes.map(node => ({ href: node.getAttribute("href"), label: node.textContent }))) };
      report.cases.push(entry);
      await page.screenshot({ path: `${output}/${createHash("sha256").update(path).digest("hex").slice(0, 16)}.png`, caret: "initial" });
    } catch (error) { report.cases.push({ path, result: "NAVIGATION_ERROR", message: error.message }); }
    finally { page.off("pageerror", onError); page.off("console", onConsole); page.off("response", onResponse); await page.close(); persist(); console.log(JSON.stringify(report.cases.at(-1))); }
  }
  for (const [list, form] of [["/rh/servidores", "/rh/servidores/novo"], ["/rh/registros-funcionais", "/rh/registros-funcionais?view=manage"]]) {
    const left = report.cases.find(entry => entry.path === list), right = report.cases.find(entry => entry.path === form);
    if (left && right) report.shellChecks.push({ list, form, sameMenu: Boolean(left.shell?.length) && JSON.stringify(left.shell) === JSON.stringify(right.shell), listLayout: left.layout, formLayout: right.layout });
  }
} finally {
  await context.close(); await browser.close(); report.finishedAt = new Date().toISOString();
  report.summary = report.cases.reduce((counts, entry) => { counts[entry.result] = (counts[entry.result] || 0) + 1; return counts; }, {});
  if (report.cases.some(entry => !["OPENED", "ACCESS_UNAVAILABLE", "AUTH_REQUIRED"].includes(entry.result))) process.exitCode = 1;
  persist();
}
