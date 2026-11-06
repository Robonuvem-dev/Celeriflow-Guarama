/** Read-only navigation using an existing, user-authenticated Chrome CDP session.
 * No cookies, storage state, credentials or business-row contents are exported.
 */
import { chromium } from "playwright-core";
import { readFileSync, mkdirSync, writeFileSync } from "node:fs";

const base = new URL(process.env.CHECKUP_BASE_URL ?? "https://guarama.celeriflow.com.br");
const output = process.env.CHECKUP_AUTH_OUTPUT ?? "docs/checkup/authenticated-production";
const scope = process.env.CHECKUP_AUTH_SCOPE ?? "priority";
const inventory = JSON.parse(readFileSync("docs/checkup/routes.json", "utf8")).inventory;
const priority = ["portal-servidor", "transparencia", "portal-cidadao", "compras", "protocolos", "rh", "tributacao", "financeiro", "educacao"];
const browser = await chromium.connectOverCDP(process.env.CHECKUP_CDP_URL ?? "http://127.0.0.1:9337");
const report = { startedAt: new Date().toISOString(), base: base.origin, scope, mode: "Authenticated GET navigation; no form submissions or business mutations", cases: [] };
mkdirSync(output, { recursive: true });
const persist = () => writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
const safeUrl = raw => { try { const url = new URL(raw, base); return url.origin + url.pathname; } catch { return "invalid-url"; } };
const safeMessage = message => message.replace(/https?:\/\/[^\s)"']+/g, safeUrl).slice(0, 1400);
const visited = new Set();
const dynamicCases = new Map();
const linkedVariants = new Map();
const dynamicPatterns = inventory.filter(item => item.pathname.includes("[")).map(item => ({ pathname: item.pathname, regex: new RegExp("^" + item.pathname.split("/").map(part => part.startsWith("[[...") ? ".*" : part.startsWith("[...") ? ".+" : part.startsWith("[") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/") + "/?$") }));
let page;
try {
  const source = browser.contexts().flatMap(context => context.pages()).find(item => new URL(item.url()).origin === base.origin);
  if (!source) throw new Error(`Open and sign into ${base.origin} in this Chrome session first`);
  const context = source.context();
  const sourcePath = new URL(source.url()).pathname;
  if (/\/(?:login|entrar)$/.test(sourcePath)) throw new Error("Chrome is on the login page; sign in before running this check");
  const moduleLinks = await source.locator('a[href^="/"]').evaluateAll(nodes => nodes.map(node => node.getAttribute("href")).filter(href => /^\/[^/?#]+$/.test(href)));
  const roots = [...new Set([...priority.map(name => `/${name}`), ...moduleLinks])].filter(pathname => pathname !== "/notificacoes");
  const rank = pathname => { const index = priority.indexOf(pathname.split("/")[1]); return index < 0 ? priority.length : index; };
  const selected = scope === "modules" ? [] : inventory.filter(item => !item.pathname.includes("[") && (scope === "all" || priority.includes(item.pathname.split("/")[1]) || item.pathname.startsWith("/portal/"))).map(item => item.pathname).sort((left, right) => rank(left) - rank(right) || left.localeCompare(right));
  const queue = [...new Set([...roots, ...selected])].filter(pathname => !/\/(?:logout|sair|login|entrar|recuperar-senha|redefinir-senha)$/.test(pathname));
  const limit = Number(process.env.CHECKUP_AUTH_LIMIT ?? queue.length);
  page = await context.newPage();
  await page.setViewportSize({ width: 1366, height: 768 });
  const visit = async (pathname, routePattern) => {
    if (visited.has(pathname)) return;
    visited.add(pathname);
    const errors = [], consoleErrors = [], configurationDiagnostics = [], httpErrors = [];
    const onError = error => errors.push(safeMessage(error.message));
    const onConsole = message => {
      if (message.type() !== "error") return;
      const text = safeMessage(message.text());
      // Chrome reports this ignored report-only directive as console.error; it does not block the page.
      if (text === "The Content Security Policy directive 'upgrade-insecure-requests' is ignored when delivered in a report-only policy.") configurationDiagnostics.push(text);
      else consoleErrors.push(text);
    };
    const onResponse = response => { if (response.status() >= 400 && new URL(response.url()).origin === base.origin) httpErrors.push({ pathname: new URL(response.url()).pathname, status: response.status(), resourceType: response.request().resourceType() }); };
    page.on("pageerror", onError);
    page.on("console", onConsole);
    page.on("response", onResponse);
    const started = Date.now();
    let item;
    try {
      const response = await page.goto(new URL(pathname, base).href, { waitUntil: "load", timeout: 90000 });
      await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
      const text = await page.locator("body").innerText();
      const finalPath = new URL(page.url()).pathname;
      const login = /\/(?:login|entrar)$/.test(finalPath);
      const accessUnavailable = /Acesso (?:funcional )?(?:indisponível|negado)|Sem permissão|não (?:tem|possui) permissão/i.test(text);
      const documentError = /Application error:|Internal Server Error|Runtime Error|Erro inesperado|Algo deu errado/.test(text);
      const result = response.status() >= 400 || errors.length || documentError ? "ERROR" : login ? "AUTH_REQUIRED" : accessUnavailable ? "ACCESS_UNAVAILABLE" : consoleErrors.length || httpErrors.length ? "RESOURCE_ERROR" : "OPENED";
      item = { pathname, routePattern, finalPath, status: response.status(), result, durationMs: Date.now() - started, headings: await page.locator("h1,h2").allTextContents(), operationalShell: await page.locator("[data-operational-workspace]").count() > 0, tables: await page.locator("table").count(), forms: await page.locator("form").count(), errors, consoleErrors, configurationDiagnostics, httpErrors };
      if (result === "OPENED") {
        const links = await page.locator('a[href]').evaluateAll(nodes => nodes.map(node => node.href));
        for (const href of links) {
          const url = new URL(href, base);
          if (url.origin !== base.origin || url.hash) continue;
          if (url.search) {
            const keys = [...url.searchParams.keys()];
            if (keys.every(key => ["view", "new", "kind", "tab", "edit"].includes(key)) && (url.searchParams.get("view") === "manage" || url.searchParams.has("new"))) linkedVariants.set(url.pathname + url.search, url.pathname + url.search);
            continue;
          }
          const pattern = dynamicPatterns.find(candidate => candidate.regex.test(url.pathname));
          if (pattern && !dynamicCases.has(pattern.pathname) && (scope === "all" || priority.includes(url.pathname.split("/")[1]) || url.pathname.startsWith("/portal/"))) dynamicCases.set(pattern.pathname, url.pathname);
        }
      }
    } catch (error) { item = { pathname, routePattern, result: "NAVIGATION_ERROR", durationMs: Date.now() - started, message: safeMessage(error.message), errors, consoleErrors, configurationDiagnostics, httpErrors }; }
    finally {
      page.off("pageerror", onError);
      page.off("console", onConsole);
      page.off("response", onResponse);
    }
    report.cases.push(item);
    persist();
    console.log(`${item.result} ${item.status ?? "-"} ${pathname}${item.finalPath && item.finalPath !== pathname ? ` -> ${item.finalPath}` : ""} shell=${item.operationalShell ?? "?"}`);
  };
  for (const pathname of queue.slice(0, limit)) await visit(pathname);
  const variantLimit = Number(process.env.CHECKUP_AUTH_VARIANT_LIMIT ?? 40);
  for (const pathname of [...linkedVariants.values()].slice(0, variantLimit)) await visit(pathname, "linked-form-variant");
  // One real destination per discovered dynamic route pattern, obtained from rendered links.
  const detailLimit = Number(process.env.CHECKUP_AUTH_DETAIL_LIMIT ?? 60);
  for (const [pattern, pathname] of [...dynamicCases].slice(0, detailLimit)) await visit(pathname, pattern);
  report.discoveredDynamicPatterns = dynamicCases.size;
  report.queuedStaticPages = queue.length;
} finally {
  if (page) await page.close();
  await browser.close(); // CDP disconnect; the user's Chrome remains open.
  report.finishedAt = new Date().toISOString();
  report.summary = report.cases.reduce((counts, item) => ({ ...counts, [item.result]: (counts[item.result] ?? 0) + 1 }), {});
  persist();
  console.log(JSON.stringify(report.summary));
}
if (report.cases.some(item => ["ERROR", "NAVIGATION_ERROR", "RESOURCE_ERROR"].includes(item.result))) process.exitCode = 1;
