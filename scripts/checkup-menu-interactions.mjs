/** Real, read-only UI interactions against the local production build. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.CHECKUP_LOCAL_BASE || "http://localhost:3100";
const output = process.env.CHECKUP_INTERACTIONS_OUTPUT || "docs/checkup/menu-interactions-local";
mkdirSync(output, { recursive: true });
const browser = await chromium.connectOverCDP("http://127.0.0.1:9337");
const source = browser.contexts().find(context => context.pages().some(page => page.url().startsWith("https://guarama.celeriflow.com.br/")));
const session = (await source.cookies("https://guarama.celeriflow.com.br")).find(cookie => cookie.name === "celeriflow_session");
assert.ok(session, "Sessão existente do usuário necessária.");
const report = { startedAt: new Date().toISOString(), base, cases: [] };
const persist = () => writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
const devices = [
  { name: "notebook-1366", viewport: { width: 1366, height: 768 } },
  { name: "notebook-1280", viewport: { width: 1280, height: 720 } },
  { name: "tablet", viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPad; CPU OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1" },
  { name: "phone", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 15; Pixel 9) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Mobile Safari/537.36" },
];
try {
  for (const device of devices) {
    const { name, ...settings } = device;
    const context = await browser.newContext({ ...settings, timezoneId: "America/Sao_Paulo" });
    await context.addCookies([{ name: session.name, value: session.value, url: base, httpOnly: true, sameSite: "Lax" }]);
    context.setDefaultNavigationTimeout(120000);
    context.setDefaultTimeout(30000);
    let page;
    let pageErrors = [], httpErrors = [];
    const settle = () => page.waitForLoadState("networkidle", { timeout: 4000 }).catch(() => {});
    const menu = () => page.locator("[data-operational-sidebar] a[href]").evaluateAll(nodes => nodes.map(node => node.getAttribute("href")));
    const geometry = () => page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, device: document.querySelector("[data-operational-workspace]")?.getAttribute("data-device"), sidebars: document.querySelectorAll("[data-operational-sidebar]").length, workspaces: document.querySelectorAll("[data-operational-workspace]").length }));
    async function check(label, action) {
      page = await context.newPage();
      pageErrors = []; httpErrors = [];
      page.on("pageerror", error => pageErrors.push(error.message));
      page.on("response", response => { if (response.status() >= 400 && response.url().startsWith(base)) httpErrors.push({ path: new URL(response.url()).pathname, status: response.status() }); });
      const entry = { device: name, label };
      try {
        entry.observations = await action();
        await settle();
        assert.deepEqual(pageErrors, [], "Erros JavaScript");
        assert.deepEqual(httpErrors, [], "Recursos HTTP com erro");
        entry.passed = true;
      } catch (error) { entry.passed = false; entry.message = error.message; entry.errors = pageErrors; entry.httpErrors = httpErrors; }
      report.cases.push(entry);
      await page.screenshot({ path: `${output}/${name}-${report.cases.length}.png`, caret: "initial" }).catch(() => {});
      await page.close();
      persist(); console.log(JSON.stringify(entry));
    }
    try {
      await check("Listagem → novo servidor por link real mantém menu e shell único", async () => {
        await page.goto(`${base}/rh/servidores`, { waitUntil: "load" }); await settle();
        const before = await menu(); assert.ok(before.length);
        await page.locator('a[href="/rh/servidores/novo"]').click();
        await page.waitForURL("**/rh/servidores/novo"); await settle();
        assert.deepEqual(await menu(), before);
        assert.equal(await page.locator("form form").count(), 0);
        const layout = await geometry();
        assert.equal(layout.sidebars, 1); assert.equal(layout.workspaces, 1);
        assert.ok(layout.documentWidth <= layout.width + 1);
        if (name.startsWith("notebook")) assert.ok(layout.documentHeight <= layout.height + 1);
        return layout;
      });
      await check("Registros funcionais → gestão por link real mantém menu", async () => {
        await page.goto(`${base}/rh/registros-funcionais`, { waitUntil: "load" }); await settle();
        const before = await menu();
        await page.locator('a[href*="view=manage"]').first().click();
        await page.waitForURL(url => url.searchParams.get("view") === "manage"); await settle();
        assert.deepEqual(await menu(), before);
        assert.equal(await page.locator("form form").count(), 0);
        return await geometry();
      });
      await check("Busca fiscal nominal por formulário GET e ficha por link real", async () => {
        await page.goto(`${base}/tributacao/pessoas`, { waitUntil: "load" }); await settle();
        await page.getByRole("textbox", { name: "Buscar pessoas fiscais" }).fill("Morcatty");
        await page.getByRole("button", { name: "Buscar", exact: true }).click();
        await page.waitForURL(url => url.searchParams.get("q") === "Morcatty"); await settle();
        const rows = page.locator("[data-operational-list] tbody tr");
        await rows.first().waitFor({ state: "visible" });
        assert.equal(await rows.count(), 1);
        assert.match(await rows.first().innerText(), /Thiago Morcatty/);
        const before = await menu();
        await page.getByRole("link", { name: "Abrir ficha", exact: true }).click();
        await page.getByRole("heading", { name: "Thiago Morcatty", exact: true }).waitFor({ state: "visible", timeout: 120000 }); await settle();
        assert.deepEqual(await menu(), before);
        return { found: 1, detailOpened: true, layout: await geometry() };
      });
      if (name.startsWith("notebook")) {
        await check("Tabela fiscal com 20 registros, próxima página e menu expandido/recolhido", async () => {
          await page.goto(`${base}/tributacao/pessoas`, { waitUntil: "load" }); await settle();
          const rows = page.locator("[data-operational-list] tbody tr");
          assert.equal(await rows.count(), 20);
          const first = await rows.first().innerText();
          await page.getByRole("link", { name: "Próxima página", exact: true }).click();
          await page.waitForURL(url => url.searchParams.get("page") === "2"); await settle();
          assert.equal(await rows.count(), 20); assert.notEqual(await rows.first().innerText(), first);
          await page.getByRole("button", { name: /^Expandir menu de/ }).click();
          assert.ok(await page.getByRole("link", { name: "Cadastro Econômico", exact: true }).isVisible());
          const expanded = await geometry();
          assert.ok(expanded.documentWidth <= expanded.width + 1); assert.ok(expanded.documentHeight <= expanded.height + 1);
          await page.getByRole("button", { name: /^Recolher menu de/ }).click();
          const collapsed = await geometry();
          assert.equal(await page.locator("[data-operational-sidebar]").getAttribute("data-collapsed"), "true");
          return { rows: 20, page: 2, expanded, collapsed };
        });
        await check("Confirmação tributária abre painel e conserva acesso à configuração", async () => {
          await page.goto(`${base}/tributacao/pessoas`, { waitUntil: "load" }); await settle();
          await page.getByRole("button", { name: "Confirmação de senha", exact: true }).click();
          assert.ok(await page.getByLabel("Senha para confirmar manutenção tributária").isVisible());
          assert.ok(await page.getByRole("link", { name: "Configurar confirmação de senha", exact: true }).isVisible());
          assert.equal(await page.locator("form form").count(), 0);
          await page.keyboard.press("Escape");
          return { confirmationPanelOpened: true, configurationLinkPreserved: true };
        });
      }
    } finally { await context.close(); }
  }
} finally { await browser.close(); report.finishedAt = new Date().toISOString(); report.summary = { passed: report.cases.filter(entry => entry.passed).length, failed: report.cases.filter(entry => !entry.passed).length }; persist(); }
if (report.summary.failed) process.exitCode = 1;
