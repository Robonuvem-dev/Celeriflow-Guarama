/** Exhaustive menu/static-screen coverage with bounded, real-record detail discovery.
 * Authorized site cookies are reused only in memory in an isolated browser. No business forms are submitted.
 */
import { createHash } from "node:crypto";
import { createRequire } from "node:module";
import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import ts from "typescript";
import { openCheckupBrowser } from "./lib/checkup-isolated-browser.mjs";

const base = new URL(process.env.CHECKUP_BASE_URL || "https://guarama.celeriflow.com.br");
const output = process.env.CHECKUP_ALL_OUTPUT || "docs/checkup/all-menu-production";
const workers = Number(process.env.CHECKUP_WORKERS || 4);
const menuOnly = process.argv.includes("--menu-only");
const resumeFile = process.env.CHECKUP_RESUME_REPORT || `${output}/report.json`;
const previous = process.argv.includes("--resume") && existsSync(resumeFile) ? JSON.parse(readFileSync(resumeFile, "utf8")) : null;
if (previous && previous.base !== base.origin) throw new Error("A retomada precisa usar a mesma origem do relatório anterior.");
const inventory = JSON.parse(readFileSync("docs/checkup/routes.json", "utf8")).inventory;
const downloadRoutes = walk("src/app").filter(file => /\/route\.[jt]sx?$/.test(file)).map(file => new RegExp("^/" + file.replace(/^src\/app\/(?:app-domain\/)?/, "").replace(/\/route\.[jt]sx?$/, "").split("/").filter(part => !/^\(.+\)$/.test(part)).map(part => part.startsWith("[") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/") + "/?$"));
const bundled = await build({ stdin: { contents: 'export { operationalModules } from "./src/components/app-ui/operational/modules";', resolveDir: process.cwd(), loader: "ts" }, bundle: true, write: false, platform: "node", format: "cjs", packages: "external", logLevel: "silent" });
const compiled = { exports: {} };
new Function("module", "exports", "require", bundled.outputFiles[0].text)(compiled, compiled.exports, createRequire(import.meta.url));
const modules = compiled.exports.operationalModules;
const priority = ["rh", "portal-servidor", "tributacao", "compras", "protocolos", "financeiro", "educacao", "transparencia"];
const rank = path => { const n = priority.indexOf(path.split("/")[1]); return n < 0 ? priority.length : n; };
const canonical = raw => {
  try {
    const url = new URL(raw, base);
    if (url.origin !== base.origin || url.hash || url.pathname.startsWith("/api/") || /\.(?:pdf|csv|xlsx?|zip|xml|png|svg|jpe?g)$/i.test(url.pathname)) return null;
    if (/(?:^|\/)(?:logout|sair|excluir|delete|remover|cancelar|confirmar|ativar|desativar)(?:\/|$)/i.test(url.pathname)) return null;
    if (url.pathname.includes("[") || url.pathname.includes("${") || url.pathname.includes("\\")) return null;
    url.pathname = url.pathname.replace(/^\/app-domain(?=\/|$)/, "") || "/";
    if (downloadRoutes.some(pattern => pattern.test(url.pathname))) return null;
    if (/\/(?:login|entrar|recuperar-senha|redefinir-senha)$/.test(url.pathname)) return null;
    // Pagination and user input do not define distinct screen templates. First/next pages are inspected separately.
    for (const key of ["page", "q", "search", "returnTo"]) url.searchParams.delete(key);
    url.searchParams.sort();
    return url.pathname + url.search;
  } catch { return null; }
};
const patternOf = pathname => inventory.some(entry => entry.pathname === pathname) ? undefined : inventory.find(entry => entry.pathname.includes("[") && new RegExp("^" + entry.pathname.split("/").map(part => part.startsWith("[[...") ? ".*" : part.startsWith("[...") ? ".+" : part.startsWith("[") ? "[^/]+" : part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("/") + "/?$").test(pathname))?.pathname;
const queue = [];
const queued = new Map();
const menu = modules.flatMap(module => module.navigation.flatMap(group => group.items.map(item => ({ module: module.key, group: group.title, label: item.title, href: item.href, path: canonical(item.href) }))));
const report = { startedAt: previous?.startedAt || new Date().toISOString(), resumedAt: previous ? new Date().toISOString() : undefined, continuedFrom: previous ? resumeFile : undefined, discoveryReport: process.env.CHECKUP_DISCOVERY_REPORT, base: base.origin, viewport: { width: 1366, height: 768 }, mode: "Every menu item and physical static page; linked query screens; real IDs by dynamic screen pattern; safe tabs/panels. Business mutations require their separate test evidence.", menu, cases: (previous?.cases || []).filter(item => canonical(item.path)), unresolvedDynamicPatterns: [] };
const retryIssues = process.argv.includes("--retry-issues");
const completed = new Set(report.cases.filter(item => item.result !== "NAVIGATION_ERROR" && !(retryIssues && item.result === "INTERACTION_ERROR")).map(item => item.path));
const rediscover = new Set(process.argv.includes("--rediscover") ? report.cases.filter(item => item.geometry?.tables.length || item.path.split("/").length === 2).map(item => item.path) : []);
mkdirSync(`${output}/screenshots`, { recursive: true });
const dynamicSelections = new Map();
const queryTemplates = new Map();
function enqueue(raw, source, kind = "linked") {
  if (menuOnly && kind !== "menu") return;
  const path = canonical(raw);
  if (!path) return;
  const url = new URL(path, base);
  if (url.search) {
    const template = new URL(url);
    for (const key of template.searchParams.keys()) if (/(?:^id$|Id$|^requestKey$)/.test(key)) template.searchParams.set(key, "[record]");
    const key = template.pathname + template.search;
    if (kind !== "menu" && queryTemplates.has(key) && queryTemplates.get(key) !== path) return;
    queryTemplates.set(key, path);
  }
  const dynamic = patternOf(url.pathname);
  if (dynamic) {
    // Cover each screen/query template, rather than every business row in the database.
    const key = dynamic + url.search;
    if (kind !== "menu" && dynamicSelections.has(key) && dynamicSelections.get(key) !== path) return;
    dynamicSelections.set(key, path);
  }
  if (queued.has(path)) {
    const entry = queued.get(path);
    if (!entry.sources.includes(source)) entry.sources.push(source);
    return;
  }
  const entry = { path, module: url.pathname.split("/")[1] || "root", kind, pattern: dynamic, sources: [source] };
  queued.set(path, entry);
  queue.push(entry);
}
for (const item of menu) enqueue(item.href, `menu:${item.module}:${item.label}`, "menu");
for (const item of inventory.filter(item => !item.pathname.includes("[")).sort((a, b) => rank(a.pathname) - rank(b.pathname) || a.pathname.localeCompare(b.pathname))) enqueue(item.pathname, item.file, "static");
for (const item of [...(previous?.targets || []), ...(previous?.cases || [])]) enqueue(item.path, "resumed-target", item.kind);
if (process.env.CHECKUP_DISCOVERY_REPORT) {
  const discovered = JSON.parse(readFileSync(process.env.CHECKUP_DISCOVERY_REPORT, "utf8"));
  for (const item of [...(discovered.targets || []), ...(discovered.cases || [])]) enqueue(item.path, "previously-discovered-target", item.kind || "linked");
}
// Literal query destinations include tabs that are absent from the default rendering.
function walk(directory) { return readdirSync(directory, { withFileTypes: true }).flatMap(entry => entry.isDirectory() ? walk(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]); }
for (const file of walk("src").filter(file => /\.[jt]sx?$/.test(file) && !/\.(?:test|spec)\.|\/__tests__\//.test(file))) {
  const ast = ts.createSourceFile(file, readFileSync(file, "utf8"), ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  function visit(node) {
    let value;
    if (ts.isJsxAttribute(node) && node.name.getText(ast) === "href") {
      const init = node.initializer;
      if (init && ts.isStringLiteral(init)) value = init.text;
      else if (init && ts.isJsxExpression(init) && init.expression && (ts.isStringLiteral(init.expression) || ts.isNoSubstitutionTemplateLiteral(init.expression))) value = init.expression.text;
    } else if (ts.isPropertyAssignment(node) && node.name.getText(ast) === "href" && (ts.isStringLiteral(node.initializer) || ts.isNoSubstitutionTemplateLiteral(node.initializer))) value = node.initializer.text;
    if (value?.startsWith("/") && value.includes("?")) enqueue(value, `${file}:${ast.getLineAndCharacterOfPosition(node.getStart()).line + 1}`, "query");
    ts.forEachChild(node, visit);
  }
  visit(ast);
}
queue.sort((a, b) => Number(completed.has(a.path)) - Number(completed.has(b.path)) || (a.kind === "menu" ? 0 : 1) - (b.kind === "menu" ? 0 : 1) || rank(a.path) - rank(b.path));
const summary = () => {
  const results = new Map(report.cases.map(item => [item.path, item]));
  return { discoveredScreens: new Set([...queued.keys(), ...results.keys()]).size, inspectedScreens: report.cases.length, menuItems: menu.length, internalMenuItems: menu.filter(item => item.path).length, externalMenuItems: menu.filter(item => !item.path).length, uniqueMenuDestinations: new Set(menu.filter(item => item.path).map(item => item.path)).size, inspectedMenuItems: menu.filter(item => results.has(item.path)).length, pendingMenuItems: menu.filter(item => item.path && !results.has(item.path)).length, results: report.cases.reduce((r, item) => ({ ...r, [item.result]: (r[item.result] || 0) + 1 }), {}), modules: [...new Set(menu.map(item => item.module))].map(module => { const entries = menu.filter(item => item.module === module); return { module, total: entries.length, inspected: entries.filter(item => results.has(item.path)).length, external: entries.filter(item => !item.path).length, pending: entries.filter(item => item.path && !results.has(item.path)).length, issues: entries.filter(item => results.has(item.path) && results.get(item.path).result !== "OPENED").map(item => ({ label: item.label, href: item.href, result: results.get(item.path).result })) }; }) };
};
function atomicWrite(path, content) {
  const temporary = `${path}.pending`;
  writeFileSync(temporary, content);
  renameSync(temporary, path);
}
function persist() {
  report.summary = summary();
  report.targets = [...new Map([...report.cases.map(({ path, module, kind, pattern, sources }) => [path, { path, module, kind, pattern, sources }]), ...queued]).values()];
  report.unresolvedDynamicPatterns = inventory.filter(item => item.pathname.includes("[") && ![...dynamicSelections.keys()].some(key => key.split("?")[0] === item.pathname)).map(item => ({ path: item.pathname, reason: "No real destination discovered in the session's rendered links" }));
  try { atomicWrite(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n"); }
  catch (error) { console.error(`Checkpoint retained in report.json.pending: ${error.code}`); }
  const results = new Map(report.cases.map(item => [item.path, item]));
  if (report.cases.length % 10 === 0 || report.finishedAt) try { atomicWrite(`${output}/MENU_COVERAGE.md`, `# Cobertura de todos os itens de menu\n\nAtualizado: ${new Date().toISOString()}. ${report.finishedAt ? "Rodada concluída" : "Em execução"}.\n\n${report.cases.length}/${report.summary.discoveredScreens} destinos observados. ${report.summary.inspectedMenuItems}/${report.summary.internalMenuItems} itens internos observados; ${report.summary.externalMenuItems} saídas externas, verificadas em relatório próprio.\n\n| Módulo | Grupo | Item | Destino | Resultado |\n| --- | --- | --- | --- | --- |\n` + menu.map(item => `| ${item.module} | ${item.group} | ${item.label} | \`${item.href}\` | ${results.get(item.path)?.result || (item.path ? "PENDING" : "EXTERNAL_SEPARATE_REPORT")} |`).join("\n") + "\n"); }
  catch (error) { console.error(`Menu checkpoint retained: ${error.code}`); }
}
persist();
console.log(JSON.stringify({ initialScreens: queue.length, menuItems: menu.length, workers }));
const { browser, sourceCookies: cookies } = await openCheckupBrowser();
const context = await browser.newContext({ viewport: report.viewport, timezoneId: "America/Sao_Paulo" });
await context.addCookies(cookies.map(cookie => ({ name: cookie.name, value: cookie.value, url: base.origin, httpOnly: cookie.httpOnly, secure: base.protocol === "https:", sameSite: cookie.sameSite })));
const safeMessage = message => String(message).replace(/https?:\/\/[^\s)"']+/g, raw => { try { const u = new URL(raw); return u.origin + u.pathname; } catch { return "url"; } }).slice(0, 1000);
let cursor = 0;
async function worker(workerId) {
  let page;
  try {
    while (cursor < queue.length) {
      const entry = queue[cursor++];
      if (completed.has(entry.path) && !rediscover.delete(entry.path)) continue;
      page = await context.newPage();
      await page.setViewportSize(report.viewport);
      // A fresh tab prevents a delayed streamed redirect from interrupting the next case.
      await page.route("**/*", route => route.request().headers()["next-router-prefetch"] === "1" ? route.abort() : route.continue());
      const errors = [], consoleErrors = [], configurationDiagnostics = [], httpErrors = [];
      const onError = error => errors.push(safeMessage(error.message));
      const onConsole = message => {
        if (message.type() !== "error") return;
        const text = safeMessage(message.text());
        if (text.includes("directive 'upgrade-insecure-requests' is ignored")) configurationDiagnostics.push(text);
        else if (!text.includes("net::ERR_FAILED")) consoleErrors.push(text);
      };
      const onResponse = response => { if (response.status() >= 400 && new URL(response.url()).origin === base.origin) httpErrors.push({ path: new URL(response.url()).pathname, status: response.status(), type: response.request().resourceType(), prefetch: response.request().headers()["next-router-prefetch"] === "1" }); };
      page.on("pageerror", onError); page.on("console", onConsole); page.on("response", onResponse);
      const started = Date.now();
      let item;
      try {
        const response = await page.goto(new URL(entry.path, base).href, { waitUntil: "load", timeout: 120000 });
        await page.waitForLoadState("networkidle", { timeout: retryIssues ? 8000 : 2000 }).catch(() => {});
        // Let layout effects and client-side data queries settle without waiting on perpetual connections.
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
        const text = await page.locator("body").innerText();
        const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
        const notFound = /This page could not be found\.|Página não encontrada/.test(text);
        const appError = /Application error:|Internal Server Error|Runtime Error|Erro inesperado|Algo deu errado|Erro Interno do Servidor/.test(text);
        const unavailable = /Acesso (?:funcional )?(?:indisponível|negado)|Sem permissão|não (?:tem|possui) permissão/.test(text);
        const login = /\/(?:login|entrar)(?:\?|$)/.test(finalPath);
        const blockedTable = /Esta área ainda não comporta a tabela no padrão/.test(text);
        const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, sidebars: document.querySelectorAll("[data-operational-sidebar]").length, workspaces: document.querySelectorAll("[data-operational-workspace]").length, tables: [...document.querySelectorAll("table")].map(table => ({ rows: table.querySelectorAll("tbody tr").length, width: Math.round(table.getBoundingClientRect().width), bottom: Math.round(table.getBoundingClientRect().bottom) })) }));
        let result = notFound ? "NOT_FOUND" : response.status() >= 500 || appError ? "SERVER_ERROR" : response.status() >= 400 ? "HTTP_ERROR" : login ? "AUTH_REQUIRED" : unavailable ? "ACCESS_UNAVAILABLE" : errors.length ? "RENDER_ERROR" : httpErrors.some(error => !error.prefetch) || consoleErrors.length ? "RESOURCE_ERROR" : blockedTable ? "LAYOUT_BLOCKED" : "OPENED";
        const links = await page.locator("a[href]").evaluateAll(nodes => nodes.map(node => ({ href: node.href, label: node.textContent?.trim().slice(0, 160) || node.getAttribute("aria-label"), menu: Boolean(node.closest("aside,nav,[role=navigation]")) })));
        for (const link of links) {
          const path = canonical(link.href);
          if (!path) continue;
          const url = new URL(path, base);
          if (patternOf(url.pathname) || url.search || inventory.some(item => item.pathname === url.pathname)) enqueue(path, entry.path, link.menu ? "rendered-menu" : "linked");
        }
        const interactions = [];
        try {
        if (result === "OPENED" || result === "LAYOUT_BLOCKED") {
          const tabs = page.getByRole("tab");
          const count = await tabs.count();
          for (let index = 0; index < count; index++) {
            const tab = tabs.nth(index);
            if (!await tab.isVisible() || !await tab.isEnabled()) continue;
            const label = (await tab.innerText()).slice(0, 160);
            await tab.click({ timeout: 10000 });
            interactions.push({ type: "tab", label, selected: await tab.getAttribute("aria-selected") });
            const tabLinks = await page.locator("a[href]").evaluateAll(nodes => nodes.map(node => node.href));
            for (const href of tabLinks) enqueue(href, `${entry.path}#tab:${label}`);
          }
          const disclosures = page.locator("details > summary");
          for (let index = 0; index < await disclosures.count(); index++) {
            const disclosure = disclosures.nth(index);
            if (!await disclosure.isVisible()) continue;
            await disclosure.click({ timeout: 10000 });
            interactions.push({ type: "disclosure", label: (await disclosure.innerText()).slice(0, 160) });
          }
          const filters = page.getByRole("button", { name: /^(?:Filtros(?: \(\d+\))?|Mais filtros|Resumo funcional)$/i }).first();
          if (await filters.count() && await filters.isVisible()) {
            await filters.click({ timeout: 10000 });
            interactions.push({ type: "filters", opened: true });
            await page.keyboard.press("Escape");
          }
        }
        } catch (error) { interactions.push({ type: "error", message: safeMessage(error.message) }); result = "INTERACTION_ERROR"; }
        if (result === "OPENED" && errors.length) result = "RENDER_ERROR";
        else if (result === "OPENED" && (httpErrors.some(error => !error.prefetch) || consoleErrors.length)) result = "RESOURCE_ERROR";
        item = { ...entry, finalPath, status: response.status(), result, durationMs: Date.now() - started, headings: await page.locator("h1,h2").allTextContents(), geometry, forms: await page.locator("form").count(), interactions, errors, consoleErrors, configurationDiagnostics, httpErrors };
        if (entry.kind === "menu" || result !== "OPENED") {
          const filename = createHash("sha256").update(entry.path).digest("hex").slice(0, 16) + ".png";
          await page.screenshot({ path: `${output}/screenshots/${filename}`, caret: "initial", timeout: 10000 }).then(() => { item.screenshot = `screenshots/${filename}`; }).catch(error => { item.screenshotError = safeMessage(error.message); });
        }
      } catch (error) { item = { ...entry, result: "NAVIGATION_ERROR", durationMs: Date.now() - started, message: safeMessage(error.message), errors, consoleErrors, configurationDiagnostics, httpErrors }; }
      finally { page.off("pageerror", onError); page.off("console", onConsole); page.off("response", onResponse); await page.close(); page = undefined; }
      const existing = report.cases.findIndex(previous => previous.path === item.path);
      if (existing >= 0) {
        item.previousAttempts = [...(report.cases[existing].previousAttempts || []), { result: report.cases[existing].result, message: report.cases[existing].message }];
        report.cases[existing] = item;
      } else report.cases.push(item);
      completed.add(entry.path);
      persist();
      console.log(`[${workerId}] ${report.cases.length}/${queue.length} ${item.result} ${item.path}`);
    }
  } finally { if (page) await page.close(); }
}
try { await Promise.all(Array.from({ length: workers }, (_, index) => worker(index + 1))); report.finishedAt = new Date().toISOString(); }
finally { await context.close(); await browser.close(); persist(); console.log(JSON.stringify(report.summary)); }
