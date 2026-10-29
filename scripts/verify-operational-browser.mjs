/** Real Chromium checks of the shared base with controlled rows. Never starts Next/DB/auth.
 * node scripts/verify-operational-browser.mjs
 * Optional: PLAYWRIGHT_MODULE_PATH, CHROMIUM_PATH, OPERATIONAL_CDP_URL,
 * OPERATIONAL_BROWSER_OUTPUT (existing directory), OPERATIONAL_BROWSER_FILTER (regex).
 * Exit 1 means an assertion failed. JSON and screenshots are retained even on failures.
 * --summary prints a compact digest of the last JSON report without starting a browser.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(join(root, "package.json"));
const temp = join(process.env.LOCALAPPDATA ?? "C:/Users/thiag/AppData/Local", "Temp/opencode");
const output = process.env.OPERATIONAL_BROWSER_OUTPUT ?? temp;
assert.ok(existsSync(output), `Output directory must already exist: ${output}`);
const { build } = req("esbuild");
const ts = req("typescript");
const postcss = req("postcss");
const playwright = req(process.env.PLAYWRIGHT_MODULE_PATH ?? join(temp, "node_modules/playwright-core"));
const desktopSizes = [[1920, 1080], [1440, 900], [1366, 768], [1280, 720], [1366, 650], [800, 600]];
const filter = process.env.OPERATIONAL_BROWSER_FILTER ? new RegExp(process.env.OPERATIONAL_BROWSER_FILTER) : null;
const report = { startedAt: new Date().toISOString(), scope: "Shared React base + actual module navigation + controlled data; not route validation", environment: {}, sources: {}, cases: [], pageErrors: [], httpErrors: [], blockedRequests: [] };
const hash = text => createHash("sha256").update(text).digest("hex");
function source(path) {
  const text = readFileSync(join(root, path), "utf8");
  report.sources[path] = hash(text);
  return text;
}
// Named declarations only, fail closed if the configuration changes. No generic replace.
function declarations(path, names, { nested = false, exports = true } = {}) {
  const text = source(path);
  const ast = ts.createSourceFile(path, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  return names.map(name => {
    let statement;
    const visit = s => {
      if (ts.isVariableStatement(s) && s.declarationList.declarations.some(d => d.name.getText(ast) === name)) {
        assert.ok(!statement, `Ambiguous ${name} in ${path}`); statement = s;
      }
      if (nested) ts.forEachChild(s, visit);
    };
    for (const s of ast.statements) visit(s);
    assert.ok(statement, `Missing ${name} in ${path}`);
    return statement.getText(ast);
  }).join("\n") + (exports ? `\nexport { ${names.at(-1)} };` : "");
}

async function bundle() {
  const virtual = {
    "fixture:material-columns": declarations("src/app/app-domain/patrimonio/materiais/MaterialCatalogTable.tsx", ["fields", "columns"]),
    "fixture:summary-columns": declarations("src/app/app-domain/tributacao/resumo-anual/AnnualSummaryClient.tsx", ["columns"]),
    "fixture:tax-configuration": `export function configure(columns) { ${declarations("src/app/app-domain/tributacao/TaxOperationalTable.tsx", ["configuration"], { nested: true, exports: false })} return configuration; }`,
  };
  source("src/app/app-domain/tributacao/TaxOperationalTable.tsx");
  const result = await build({
    absWorkingDir: root, entryPoints: ["tests/operational-browser-fixture.tsx"], outfile: "operational-fixture.js",
    bundle: true, write: false, metafile: true, platform: "browser", format: "iife", jsx: "automatic",
    tsconfig: join(root, "tsconfig.json"), loader: { ".module.css": "local-css" },
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
    plugins: [{ name: "browser-only-boundary", setup(builder) {
      builder.onResolve({ filter: /^(server-only|.*(?:drizzle|firebase|database|\/actions)(?:\/.*)?)$/ }, args => { throw new Error(`Forbidden browser import: ${args.path}`); });
      builder.onResolve({ filter: /^fixture:/ }, args => ({ path: args.path, namespace: "configuration" }));
      builder.onLoad({ filter: /.*/, namespace: "configuration" }, args => ({ contents: virtual[args.path], loader: "ts" }));
      builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: "next-adapter" }));
      builder.onLoad({ filter: /.*/, namespace: "next-adapter" }, args => ({ contents: args.path === "next/navigation"
        ? 'export const usePathname=()=>window.__fixturePath; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push(){throw new Error("Routing outside fixture")}});'
        : args.path === "next/link" ? 'import React from "react"; export default function Link({href,scroll,prefetch,replace,...p}){return React.createElement("a",{...p,href,onClick:e=>{p.onClick?.(e);e.preventDefault();}},p.children)}'
        : 'import React from "react"; export default function Image({priority,...p}){return React.createElement("img",p)}', resolveDir: root }));
    } }],
  });
  for (const path of Object.keys(result.metafile.inputs)) if (!path.includes("node_modules") && !path.includes(":")) source(path);
  const globals = await postcss([req("@tailwindcss/postcss")({ base: root })]).process(source("src/app/globals.css"), { from: join(root, "src/app/globals.css") });
  // Reuse only next/font's cached Inter faces; compile all application CSS from current source.
  let fontCss = "";
  let interFamily;
  const chunks = join(root, ".next/static/chunks");
  if (existsSync(chunks)) for (const name of readdirSync(chunks).filter(n => n.endsWith(".css"))) {
    postcss.parse(readFileSync(join(chunks, name), "utf8")).walkAtRules("font-face", rule => {
      const family = rule.nodes.find(n => n.prop === "font-family")?.value;
      if (family && /inter/i.test(family) && rule.nodes.some(n => n.prop === "src" && /\.woff2/.test(n.value))) {
        interFamily ??= family; fontCss += rule.toString() + "\n";
      }
    });
  }
  assert.ok(fontCss && interFamily, "Cached next/font Inter faces required for representative font geometry (no network download).");
  report.environment.css = { tailwind: req("tailwindcss/package.json").version, globalsHash: hash(globals.css), moduleHash: hash(result.outputFiles.find(f => f.path.endsWith(".css")).text), interFamily, fontFacesHash: hash(fontCss) };
  return {
    js: result.outputFiles.find(f => f.path.endsWith(".js")).contents,
    css: globals.css + "\n" + fontCss + `\n:root{--font-inter:${interFamily};}\n` + result.outputFiles.find(f => f.path.endsWith(".css")).text,
  };
}

async function measure(page, scope = "[data-operational-workspace]:not([data-operational-surface])") {
  return page.locator(scope).evaluate(workspace => {
    const rect = e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const view = workspace.querySelector("[data-operational-table]");
    const table = view.querySelector("table");
    const rows = [...view.querySelectorAll("[data-operational-row]")];
    const footer = workspace.querySelector("[data-operational-pagination]");
    const headers = table ? [...table.querySelectorAll("th")] : [];
    return {
      device: workspace.dataset.device, fit: view.dataset.fit, minimum: Number(view.dataset.requiredWidth), requiredHeight: Number(view.dataset.requiredHeight),
      viewport: rect(view), table: table && rect(table), footer: rect(footer), workspace: rect(workspace),
      footerDocument: { ...rect(footer), y: rect(footer).y + scrollY, bottom: rect(footer).bottom + scrollY }, scrollY,
      documentOverflow: { x: document.documentElement.scrollWidth - innerWidth, y: document.documentElement.scrollHeight - innerHeight },
      tableOverflow: { x: view.scrollWidth - view.clientWidth, y: view.scrollHeight - view.clientHeight },
      rows: rows.length, lastRow: rows.length ? rect(rows.at(-1)) : null,
      rowHeights: [...new Set(rows.map(r => r.getBoundingClientRect().height))],
      fonts: [...new Set(rows.flatMap(r => [...r.cells].map(c => getComputedStyle(c).fontSize)))],
      computedFont: table && getComputedStyle(table).fontFamily,
      columns: headers.length, hiddenColumns: headers.filter(e => getComputedStyle(e).display === "none").length,
      clippedHeaders: headers.flatMap((th, index) => {
        const preview = th.querySelector("span");
        return preview && preview.scrollWidth > preview.clientWidth + .5 ? [{ index, label: th.getAttribute("aria-label"), preview: rect(preview), details: !!th.querySelector('button[aria-label^="Ver "]') }] : [];
      }),
      resizers: headers.flatMap((th, index) => {
        const button = th.querySelector('button[aria-label^="Ajustar largura"]');
        return button ? [{ index, label: button.getAttribute("aria-label"), rect: rect(button), header: rect(th), right: getComputedStyle(button).right }] : [];
      }),
      actions: rows.length ? [...rows[0].querySelectorAll('td:last-child button')].map(b => ({ label: b.getAttribute("aria-label"), rect: rect(b), cell: rect(b.closest("td")) })) : [],
      footerText: footer.textContent,
    };
  });
}

function checkGeometry(m, size, { device = "desktop", columns = 8, rows = 20, minimum = 702, surface = false } = {}) {
  assert.equal(m.device, device, "UA classification"); assert.equal(m.fit, "ready", "data-fit");
  assert.equal(m.minimum, minimum); assert.equal(m.rows, rows); assert.equal(m.columns, columns); assert.equal(m.hiddenColumns, 0);
  assert.deepEqual(m.fonts, ["13px"], "Cell font size"); assert.deepEqual(m.rowHeights, [device === "phone" ? 32 : 24], "Row height");
  assert.ok(m.computedFont.toLowerCase().includes("inter"), "Application Inter font");
  assert.ok(m.documentOverflow.x <= 1, "Document horizontal overflow"); assert.ok(m.tableOverflow.y <= 1, "Clipped/overflowing table body");
  if (device === "desktop") {
    assert.ok(m.documentOverflow.y <= 1 && m.tableOverflow.x <= 1, "Desktop overflow");
    assert.ok(m.lastRow.bottom <= m.viewport.bottom + .5, "Last row below viewport");
    assert.equal(m.table.width, size[0] - (surface ? 0 : 56), "Table width");
    assert.equal(m.footer.bottom, size[1], "Footer anchored at viewport bottom");
  }
  assert.ok(m.lastRow.bottom <= m.footer.y + 1, "Last row intersects footer");
  assert.ok(m.clippedHeaders.every(h => h.label && h.details), `Clipped headers without integral access: ${JSON.stringify(m.clippedHeaders)}`);
  for (const h of m.resizers) assert.ok(h.rect.right <= m.table.right + .5 && h.rect.x >= m.table.x - .5, `Resizer outside table: ${JSON.stringify(h)}`);
  for (const a of m.actions) assert.ok(a.rect.x >= a.cell.x && a.rect.right <= a.cell.right + .5 && a.rect.height === 24, `Utility action clipped: ${JSON.stringify(a)}`);
}

async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
  await page.waitForTimeout(70); // ResizeObserver -> React commit -> overflow affordances.
}
async function show(page, options) {
  await page.evaluate(options => { localStorage.clear(); window.scrollTo(0, 0); window.__operationalTest.show(options); }, options);
  await page.locator("[data-operational-workspace]").first().waitFor();
  await settle(page);
}
const baseScope = '[data-operational-workspace]:not([data-operational-surface])';
const panelScope = '[data-operational-surface]';
async function checkCase(name, page, fn) {
  if (filter && !filter.test(name)) return;
  const item = { name, passed: false };
  try { item.evidence = await fn(); item.passed = true; }
  catch (error) {
    item.error = error.stack ?? String(error);
    try { item.geometry = await measure(page); } catch {}
    try { item.focus = await page.evaluate(() => ({ active: document.activeElement?.outerHTML, dialogs: [...document.querySelectorAll('[data-slot="dialog-content"]')].map(e => ({ html: e.outerHTML.slice(0, 800), rect: e.getBoundingClientRect().toJSON() })) })); } catch {}
    item.screenshot = join(output, `operational-browser-failure-${report.cases.length}.png`);
    await page.screenshot({ path: item.screenshot, fullPage: true }).catch(() => {});
    console.error(`FAIL ${name}: ${error.message}`);
  }
  report.cases.push(item);
  return item;
}

async function popup(page, scope = baseScope) {
  const cell = page.locator(`${scope} [data-operational-row]`).first().locator("td").nth(1);
  const trigger = cell.getByRole("button", { name: /Ver rua e número completo/ });
  await trigger.click(); await settle(page);
  const dialog = page.locator('[data-slot="dialog-content"]').filter({ has: page.locator("[data-full-value-body]") });
  await dialog.waitFor();
  assert.ok(await dialog.getByRole("button", { name: "Fechar", exact: true }).evaluate(e => e === document.activeElement), "Popup initial focus");
  const pieces = [];
  do {
    pieces.push(await page.locator("[data-full-value-body]").textContent());
    assert.ok(await page.locator("[data-full-value-body]").evaluate(e => e.scrollWidth <= e.clientWidth + 1 && e.scrollHeight <= e.clientHeight + 1), "Popup text overflow");
    const next = dialog.getByRole("button", { name: "Próximo trecho", exact: true });
    if (await next.isDisabled()) break;
    await next.click();
  } while (pieces.length < 100);
  const value = await page.evaluate(() => window.__operationalTest.fullValue);
  assert.ok(pieces.length > 1 && pieces.length < 100); assert.equal(pieces.join(""), value, "Full Unicode text reconstructed");
  const graphemes = s => [...new Intl.Segmenter("pt-BR", { granularity: "grapheme" }).segment(s)].map(g => g.segment);
  assert.deepEqual(pieces.flatMap(graphemes), graphemes(value), "Grapheme boundaries between pages");
  await dialog.getByRole("button", { name: "Copiar tudo", exact: true }).click();
  assert.equal((await page.evaluate(() => navigator.clipboard.readText())).replaceAll("\r\n", "\n"), value, "Clipboard full value");
  for (let i = 0; i < 12; i++) {
    await page.keyboard.press("Tab");
    // Base UI focus guards redirect focus in a microtask; inspect the settled state.
    await page.waitForFunction(() => [...document.querySelectorAll('[data-slot="dialog-content"]')].some(e => e.querySelector('[data-full-value-body]') && e.contains(document.activeElement)), null, { timeout: 1500 });
  }
  const geometry = await dialog.evaluate(e => { const r = e.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, overflowX: e.scrollWidth - e.clientWidth, overflowY: e.scrollHeight - e.clientHeight, bottom: r.bottom, right: r.right }; });
  const size = page.viewportSize();
  assert.ok(geometry.x >= 0 && geometry.y >= 0 && geometry.right <= size.width + 1 && geometry.bottom <= size.height + 1, `Popup outside screen: ${JSON.stringify(geometry)}`);
  await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
  await dialog.waitFor({ state: "hidden" }); await settle(page);
  assert.ok(await trigger.evaluate(e => e === document.activeElement), "Popup final focus");
  return { pages: pieces.length, characters: value.length, sha256: hash(value), geometry, copy: true, focus: true, unicodeGraphemes: true };
}

async function main() {
  const assets = await bundle();
  let server, browser;
  const contexts = [];
  try {
    server = createServer((request, response) => {
      const path = new URL(request.url, "http://localhost").pathname;
      if (path === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(assets.js); }
      else if (path === "/fixture.css") { response.setHeader("Content-Type", "text/css; charset=utf-8"); response.end(assets.css); }
      else if (path === "/favicon.png") { response.setHeader("Content-Type", "image/png"); response.end(readFileSync(join(root, "public/favicon.png"))); }
      else if (/^\/(?:_next\/static\/|\.\.\/)?media\/[\w.-]+\.woff2$/.test(path) || /^\/_next\/static\/media\/[\w.-]+\.woff2$/.test(path)) {
        const name = path.split("/").at(-1); const file = join(root, ".next/static/media", name);
        if (existsSync(file)) { response.setHeader("Content-Type", "font/woff2"); response.end(readFileSync(file)); } else { response.writeHead(404); response.end(); }
      } else if (path === "/") {
        response.setHeader("Content-Type", "text/html; charset=utf-8");
        response.end('<!doctype html><html lang="pt-BR" class="h-full antialiased"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="min-h-full flex flex-col font-sans"><div id="root"></div><script src="/fixture.js"></script></body></html>');
      } else { response.writeHead(404); response.end(); }
    });
    await new Promise(r => server.listen(0, "127.0.0.1", r));
    const origin = `http://127.0.0.1:${server.address().port}`;
    const candidates = [process.env.CHROMIUM_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", ...["chromium-1248", "chromium-1243"].map(p => join(process.env.LOCALAPPDATA ?? "", "ms-playwright", p, "chrome-win64/chrome.exe"))].filter(Boolean);
    const executablePath = candidates.find(existsSync);
    browser = process.env.OPERATIONAL_CDP_URL ? await playwright.chromium.connectOverCDP(process.env.OPERATIONAL_CDP_URL) : await playwright.chromium.launch({ executablePath, headless: true });
    report.environment = { ...report.environment, browser: browser.version(), executablePath, connection: process.env.OPERATIONAL_CDP_URL ?? "isolated launch", next: req("next/package.json").version, react: req("react/package.json").version, origin };
    async function newPage(options = {}) {
      const context = await browser.newContext({ userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36", ...options });
      contexts.push(context);
      await context.grantPermissions(["clipboard-read", "clipboard-write"], { origin });
      await context.route("**/*", route => {
        if (new URL(route.request().url()).origin === origin) return route.continue();
        report.blockedRequests.push(route.request().url()); return route.abort();
      });
      const page = await context.newPage(); page.setDefaultTimeout(7000);
      page.on("pageerror", error => report.pageErrors.push(error.message));
      page.on("response", response => { if (response.status() >= 400) report.httpErrors.push({ url: response.url(), status: response.status() }); });
      await page.goto(origin); await page.waitForFunction(() => !!window.__operationalTest);
      return page;
    }
    const page = await newPage();
    const modules = await page.evaluate(() => window.__operationalTest.modules);
    report.environment.modules = modules;
    const schemas = await page.evaluate(() => Object.fromEntries(Object.entries(window.__operationalTest.schemas).map(([k, v]) => [k, { columns: v.length, minimum: v.reduce((n, c) => n + c.minWidth, 0) }])));
    report.environment.schemas = schemas;
    console.log(`Browser ${browser.version()}; ${modules.length} module configurations; actual Tailwind + CSS Module + cached Inter.`);

    // Every registered module uses the actual sidebar/header and the same base contract.
    for (const mod of modules) for (const size of desktopSizes) {
      await checkCase(`desktop/${mod.key}/${size.join("x")}/20+1`, page, async () => {
        await page.setViewportSize({ width: size[0], height: size[1] }); await show(page, { module: mod.key });
        const first = await measure(page); checkGeometry(first, size);
        assert.equal(await page.getByRole("navigation", { name: `Navegação de ${mod.title}`, exact: true }).getByRole("link").count(), mod.links);
        assert.equal(await page.locator("[data-operational-sidebar]").getAttribute("data-collapsed"), "true");
        await page.getByRole("button", { name: "Próxima página", exact: true }).click(); await settle(page);
        const last = await measure(page); checkGeometry(last, size, { rows: 1 });
        assert.deepEqual(last.footer, first.footer, "Footer moves with one record"); assert.match(last.footerText, /21–21 de 21 registros/);
        return { first, last };
      });
      if (!filter && size === desktopSizes.at(-1)) console.log(`Geometry complete: ${mod.key}`);
    }

    for (const schema of ["material", "summary"]) await checkCase(`wide/${schema}/1280x720/20+1`, page, async () => {
      const size = [1280, 720]; await page.setViewportSize({ width: 1280, height: 720 }); await show(page, { module: "saneamento", schema });
      const config = schemas[schema]; const first = await measure(page); checkGeometry(first, size, config);
      assert.equal(config.columns, schema === "material" ? 13 : 23);
      if (schema === "summary") {
        const handle = page.locator('th:last-child button[aria-label^="Ajustar largura"]');
        assert.equal(first.resizers.at(-1).right, "0px"); assert.equal(first.resizers.at(-1).rect.width, 12);
        const widths = await page.locator("th").evaluateAll(es => es.map(e => e.getBoundingClientRect().width));
        await handle.focus(); await page.keyboard.press("ArrowRight"); await settle(page);
        const changed = await page.locator("th").evaluateAll(es => es.map(e => e.getBoundingClientRect().width));
        assert.ok(changed.at(-1) > widths.at(-1), "Last header resizer is keyboard-operable");
        await page.keyboard.press("Home"); await settle(page);
        const box = await handle.boundingBox();
        const hit = await handle.evaluate(e => { const r = e.getBoundingClientRect(); return document.elementFromPoint(r.x + r.width / 2, r.y + r.height / 2) === e; });
        assert.ok(hit, "Last resizer hit target lies inside the viewport");
        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await page.mouse.down();
        await page.mouse.move(box.x + box.width / 2 - 12, box.y + box.height / 2, { steps: 3 }); await page.mouse.up(); await settle(page);
        const pointerWidths = await page.locator("th").evaluateAll(es => es.map(e => e.getBoundingClientRect().width));
        assert.ok(pointerWidths.at(-1) < widths.at(-1), "Last resizer pointer drag");
        await handle.focus(); await page.keyboard.press("Home"); await settle(page);
      }
      await page.getByRole("button", { name: "Próxima página", exact: true }).click(); await settle(page);
      const last = await measure(page); checkGeometry(last, size, { ...config, rows: 1 }); assert.deepEqual(last.footer, first.footer);
      await page.screenshot({ path: join(output, `operational-browser-${schema}-1280.png`) });
      return { first, last };
    });

    await checkCase("desktop/UA-not-inferred-from-width", page, async () => {
      const evidence = [];
      for (const size of [[390, 844], [683, 384], [758, 600], [757, 600]]) {
        await page.setViewportSize({ width: size[0], height: size[1] }); await show(page, { module: "saneamento" });
        const m = await measure(page); assert.equal(m.device, "desktop"); assert.equal(m.fit, size[0] >= 758 && size[1] >= 600 ? "ready" : "conflict");
        evidence.push({ size, ...m });
      }
      return evidence;
    });

    for (const [label, agent, touch, device] of [
      ["windows-touch", "Mozilla/5.0 (Windows NT 10.0; Win64; x64)", 5, "desktop"],
      ["ipad-desktop-agent", "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15) AppleWebKit/605.1.15 Version/17.0 Safari/605.1.15", 5, "tablet"],
      ["android-tablet", "Mozilla/5.0 (Linux; Android 14; SM-X700) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36", 5, "tablet"],
      ["android-phone", "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 Chrome/145.0.0.0 Mobile Safari/537.36", 5, "phone"],
    ]) await checkCase(`classification/${label}`, page, async () => {
      const classified = await newPage({ userAgent: agent, hasTouch: true });
      const cdp = await classified.context().newCDPSession(classified);
      await cdp.send("Emulation.setTouchEmulationEnabled", { enabled: true, maxTouchPoints: touch });
      await classified.setViewportSize({ width: 800, height: 600 }); await show(classified, { module: "saneamento" });
      const m = await measure(classified); assert.equal(m.device, device); assert.equal(m.fit, "ready");
      const evidence = { agent, touch: await classified.evaluate(() => navigator.maxTouchPoints), geometry: m };
      await cdp.detach(); return evidence;
    });

    await checkCase("desktop/resize-detail-toggle-persistence-reset-utility", page, async () => {
      await page.setViewportSize({ width: 1366, height: 768 }); await show(page, { module: "saneamento" });
      const row = page.locator("[data-operational-row]").first(); const cell = row.locator("td").nth(1);
      const handle = page.getByRole("button", { name: "Ajustar largura de Rua e número", exact: true });
      const widths = () => page.locator("th").evaluateAll(es => es.map(e => e.getBoundingClientRect().width));
      const before = await widths(); assert.equal(await cell.getByRole("button").count(), 0);
      await handle.focus(); for (let i = 0; i < 40; i++) await page.keyboard.press("ArrowLeft"); await settle(page);
      assert.equal(await cell.getByRole("button", { name: /Ver rua e número completo/ }).count(), 1);
      const shrunk = await widths(); assert.ok(shrunk[1] < before[1]); assert.equal(shrunk.at(-1), 64);
      await page.reload(); await page.waitForFunction(() => !!window.__operationalTest);
      await page.evaluate(() => window.__operationalTest.show({ module: "saneamento" })); await settle(page);
      assert.deepEqual(await widths(), shrunk, "Saved widths after reload");
      await page.getByRole("button", { name: "Restaurar larguras de Base de teste", exact: true }).click(); await settle(page);
      assert.deepEqual(await widths(), before); assert.equal(await cell.getByRole("button").count(), 0);
      const box = await handle.boundingBox(); await page.mouse.move(box.x + box.width / 2, box.y + 12); await page.mouse.down(); await page.mouse.move(box.x + box.width / 2 + 70, box.y + 12, { steps: 6 }); await page.mouse.up(); await settle(page);
      const dragged = await widths(); assert.ok(dragged[1] > before[1]); assert.equal(dragged.reduce((n, v) => n + v, 0), 1310); assert.equal(dragged.at(-1), 64);
      await handle.focus(); await page.keyboard.press("Home"); await settle(page); assert.deepEqual(await widths(), before);
      const actions = await measure(page); checkGeometry(actions, [1366, 768]);
      await row.getByRole("button", { name: "Editar registro 1", exact: true }).click(); await row.getByRole("button", { name: "Histórico do registro 1", exact: true }).click();
      assert.equal(await row.locator("[data-action-count]").getAttribute("data-action-count"), "2");
      await page.getByRole("button", { name: "Ação de cabeçalho", exact: true }).click(); assert.equal(await row.locator("[data-action-count]").getAttribute("data-action-count"), "3");
      return { before, shrunk, dragged, actions: actions.actions, reset: true, persistence: true, pointerAndKeyboard: true, detailIconToggles: true };
    });

    await checkCase("desktop/full-Unicode-popup-focus-copy", page, async () => {
      await page.setViewportSize({ width: 1366, height: 768 }); await show(page, { module: "saneamento", long: true }); return popup(page);
    });

    await checkCase("desktop/clipped-header-integral-access", page, async () => {
      await page.setViewportSize({ width: 1280, height: 720 }); await show(page, { module: "tributacao", schema: "summary" });
      const m = await measure(page); assert.ok(m.clippedHeaders.length > 0);
      const evidence = [];
      for (const h of m.clippedHeaders) {
        const trigger = page.locator("th").nth(h.index).getByRole("button", { name: /^Ver / }); await trigger.click(); await settle(page);
        assert.equal(await page.locator("[data-full-value-body]").textContent(), h.label);
        await page.getByRole("button", { name: "Fechar", exact: true }).click(); await settle(page); assert.ok(await trigger.evaluate(e => e === document.activeElement));
        evidence.push(h.label);
      }
      return { headersOpened: evidence, resizerAtRightEdge: m.resizers.at(-1) };
    });

    await checkCase("desktop/panel-nested-popup-focus-20+1", page, async () => {
      await page.setViewportSize({ width: 1280, height: 720 }); await show(page, { module: "saneamento", long: true }); const trigger = page.getByRole("button", { name: "Painel", exact: true }); await trigger.click(); await settle(page);
      const surface = page.locator(panelScope); const dialog = surface.locator("..");
      const first = await measure(page, panelScope); checkGeometry(first, [1280, 720], { surface: true });
      assert.ok(await dialog.evaluate(e => e.contains(document.activeElement)), "Panel initial focus");
      const nested = await popup(page, panelScope);
      await surface.getByRole("button", { name: "Próxima página", exact: true }).click(); await settle(page);
      const last = await measure(page, panelScope); checkGeometry(last, [1280, 720], { surface: true, rows: 1 }); assert.deepEqual(first.footer, last.footer);
      for (let i = 0; i < 20; i++) { await page.keyboard.press("Tab"); await settle(page); assert.ok(await dialog.evaluate(e => e.contains(document.activeElement)), "Panel focus trap"); }
      await surface.getByRole("button", { name: "Fechar", exact: true }).click(); await surface.waitFor({ state: "hidden" }); await settle(page);
      assert.ok(await trigger.evaluate(e => e === document.activeElement), "Panel final focus");
      return { first, last, nested, focus: true };
    });

    await checkCase("desktop/loading-error-empty-footer", page, async () => {
      await page.setViewportSize({ width: 1280, height: 720 });
      await show(page, { module: "saneamento" }); const footer = (await measure(page)).footer;
      const filters = () => page.getByRole("button", { name: "Filtros de teste", exact: true });
      for (const state of ["loading", "error", "ready"]) {
        await filters().click(); await page.getByLabel("Estado controlado").selectOption(state); await page.getByRole("button", { name: "Fechar", exact: true }).click(); await settle(page);
        assert.deepEqual((await measure(page)).footer, footer);
        if (state !== "ready") assert.equal(await page.locator("[data-operational-row]").count(), 0);
        if (state === "error") { await page.getByRole("button", { name: "Tentar novamente", exact: true }).click(); await settle(page); assert.equal(await page.locator("[data-operational-row]").count(), 20); }
      }
      await filters().click(); await page.getByRole("button", { name: "Alternar vazio", exact: true }).click(); await page.getByRole("button", { name: "Fechar", exact: true }).click(); await settle(page);
      assert.equal(await page.locator("[data-operational-row]").count(), 0); assert.match((await measure(page)).footerText, /0–0 de 0/); assert.deepEqual((await measure(page)).footer, footer);
      return { footer, loading: true, retry: true, empty: true };
    });

    for (const [device, descriptor, sizes] of [
      ["tablet", "iPad Pro 11", [[768, 1024], [1024, 768]]],
      ["phone", "iPhone 13", [[390, 844], [844, 390]]],
    ]) {
      const mobile = await newPage({ ...playwright.devices[descriptor] });
      for (const mod of modules) for (const size of sizes) await checkCase(`${device}/${mod.key}/${size.join("x")}/20+1`, mobile, async () => {
        await mobile.setViewportSize({ width: size[0], height: size[1] }); await show(mobile, { module: mod.key });
        const first = await measure(mobile); checkGeometry(first, size, { device });
        assert.equal(await mobile.getByRole("navigation", { name: `Navegação de ${mod.title}`, exact: true }).getByRole("link").count(), mod.links);
        const footer = mobile.locator(`${baseScope} [data-operational-pagination]`); await footer.scrollIntoViewIfNeeded();
        assert.ok(await footer.evaluate(e => e.getBoundingClientRect().bottom <= innerHeight + 1), "Footer reachable");
        await mobile.getByRole("button", { name: "Próxima página", exact: true }).click(); await settle(mobile);
        const last = await measure(mobile); checkGeometry(last, size, { device, rows: 1 });
        assert.deepEqual(last.footerDocument, first.footerDocument, "Footer moves in document coordinates");
        return { first, last };
      });
      for (const size of sizes) await checkCase(`${device}/${size.join("x")}/geometry-scroll-20+1-popup-panel`, mobile, async () => {
        await mobile.setViewportSize({ width: size[0], height: size[1] }); await show(mobile, { module: "saneamento", long: true });
        const first = await measure(mobile); checkGeometry(first, size, { device });
        const footer = mobile.locator(`${baseScope} [data-operational-pagination]`); await footer.scrollIntoViewIfNeeded();
        assert.ok(await footer.evaluate(e => e.getBoundingClientRect().bottom <= innerHeight + 1), "Mobile footer reachable vertically");
        const view = mobile.locator(`${baseScope} [data-operational-table]`);
        const scroll = await view.evaluate(e => { e.scrollLeft = e.scrollWidth; return { left: e.scrollLeft, maximum: e.scrollWidth - e.clientWidth }; });
        assert.ok(Math.abs(scroll.left - scroll.maximum) <= 1, "Horizontal scroll reaches last column");
        await view.evaluate(e => { e.scrollLeft = 0; });
        await mobile.getByRole("button", { name: "Próxima página", exact: true }).click(); await settle(mobile);
        const last = await measure(mobile); checkGeometry(last, size, { device, rows: 1 }); assert.deepEqual(last.footerDocument, first.footerDocument);
        await mobile.getByRole("button", { name: "Página anterior", exact: true }).click(); await settle(mobile);
        const reading = await popup(mobile);
        // An expanded mobile sidebar is an overlay, and must restore focus on Escape.
        const menu = mobile.getByRole("button", { name: "Expandir menu de Saneamento", exact: true }); await menu.click(); await settle(mobile);
        const overlay = size[0] < 960;
        assert.equal(await mobile.locator("[data-operational-main]").evaluate(e => e.inert), overlay);
        await mobile.keyboard.press("Escape"); await settle(mobile); assert.ok(await menu.evaluate(e => e === document.activeElement));
        await mobile.getByRole("button", { name: "Painel", exact: true }).click(); await settle(mobile);
        const panel = await measure(mobile, panelScope); checkGeometry(panel, size, { device, surface: true });
        const panelFooter = mobile.locator(`${panelScope} [data-operational-pagination]`); await panelFooter.scrollIntoViewIfNeeded();
        assert.ok(await panelFooter.evaluate(e => e.getBoundingClientRect().bottom <= innerHeight + 1), "Panel footer reachable vertically");
        await mobile.locator(panelScope).getByRole("button", { name: "Fechar", exact: true }).click(); await mobile.locator(panelScope).waitFor({ state: "hidden" }); await settle(mobile);
        assert.ok(await mobile.getByRole("button", { name: "Painel", exact: true }).evaluate(e => e === document.activeElement));
        await mobile.screenshot({ path: join(output, `operational-browser-${device}-${size.join("x")}.png`), fullPage: true });
        return { ua: await mobile.evaluate(() => ({ agent: navigator.userAgent, touch: navigator.maxTouchPoints })), first, last, scroll, reading, panel };
      });
      if (device === "tablet") await checkCase("tablet/allowed-horizontal-and-vertical-scroll", mobile, async () => {
        const size = [768, 500]; await mobile.setViewportSize({ width: 768, height: 500 }); await show(mobile, { module: "tributacao", schema: "summary" });
        const m = await measure(mobile); checkGeometry(m, size, { device, ...schemas.summary });
        assert.ok(m.tableOverflow.x > 0 && m.documentOverflow.y > 0, "Both tablet scroll axes must remain usable");
        const scrolled = await mobile.locator(`${baseScope} [data-operational-table]`).evaluate(e => { e.scrollLeft = e.scrollWidth; return e.scrollLeft; });
        assert.ok(scrolled > 0);
        const footer = mobile.locator(`${baseScope} [data-operational-pagination]`); await footer.scrollIntoViewIfNeeded();
        assert.ok(await footer.evaluate(e => e.getBoundingClientRect().bottom <= innerHeight + 1));
        return { geometry: m, horizontalScrollLeft: scrolled, verticalScrollTop: await mobile.evaluate(() => scrollY) };
      });
    }
    await checkCase("runtime/no-browser-errors-or-external-requests", page, async () => {
      report.environment.fontFaces = await page.evaluate(async () => { await document.fonts.ready; return [...document.fonts].map(f => ({ family: f.family, status: f.status, weight: f.weight })); });
      assert.deepEqual(report.pageErrors, []); assert.deepEqual(report.blockedRequests, []); assert.deepEqual(report.httpErrors, []);
      assert.ok(report.environment.fontFaces.some(f => /inter/i.test(f.family) && f.status === "loaded"), "Inter face actually loaded");
      return { pageErrors: [], httpErrors: [], blockedRequests: [] };
    });
  } finally {
    for (const context of contexts) await context.close();
    // Disconnecting CDP does not terminate the user's pre-existing browser.
    await browser?.close();
    server?.closeAllConnections(); if (server) await new Promise(r => server.close(r));
    report.finishedAt = new Date().toISOString();
    report.summary = { total: report.cases.length, passed: report.cases.filter(c => c.passed).length, failed: report.cases.filter(c => !c.passed).length };
    writeFileSync(join(output, "operational-browser-results.json"), JSON.stringify(report, null, 2));
    console.log(JSON.stringify({ ...report.summary, report: join(output, "operational-browser-results.json") }));
    if (report.summary.failed) process.exitCode = 1;
  }
}
function summarize() {
  const data = JSON.parse(readFileSync(join(output, "operational-browser-results.json"), "utf8"));
  const geometry = m => ({ device: m.device, fit: m.fit, table: m.table, viewport: m.viewport, lastRow: m.lastRow,
    footer: m.footer, footerDocument: m.footerDocument, overflow: { document: m.documentOverflow, table: m.tableOverflow }, fonts: m.fonts, rowHeights: m.rowHeights,
    clippedHeaders: m.clippedHeaders.length, columns: m.columns, resizer: m.resizers.at(-1), actions: m.actions });
  const selected = data.cases.filter(c => /^desktop\/saneamento\/|^wide\/|^tablet\/[0-9]|^phone\/[0-9]|^tablet\/allowed/.test(c.name)).map(c => ({ name: c.name, passed: c.passed,
    first: c.evidence?.first ? geometry(c.evidence.first) : c.evidence?.geometry && geometry(c.evidence.geometry),
    lastRowOnPage2: c.evidence?.last?.lastRow, footerOnPage2: c.evidence?.last?.footer,
    reading: c.evidence?.reading, panel: c.evidence?.panel && geometry(c.evidence.panel),
    scroll: c.evidence?.scroll, horizontalScrollLeft: c.evidence?.horizontalScrollLeft, verticalScrollTop: c.evidence?.verticalScrollTop }));
  const digest = { startedAt: data.startedAt, finishedAt: data.finishedAt, summary: data.summary, environment: data.environment,
    sources: data.sources, selected, interactions: data.cases.filter(c => /^desktop\/(resize|full|clipped|panel|loading)|^classification\//.test(c.name)).map(c => ({ name: c.name, passed: c.passed, evidence: c.evidence })),
    failures: data.cases.filter(c => !c.passed), pageErrors: data.pageErrors, httpErrors: data.httpErrors, blockedRequests: data.blockedRequests };
  writeFileSync(join(output, "operational-browser-evidence.json"), JSON.stringify(digest, null, 2));
  console.log(JSON.stringify({ startedAt: data.startedAt, finishedAt: data.finishedAt, summary: data.summary,
    selected: selected.map(c => ({ name: c.name, table: c.first?.table, viewport: c.first?.viewport, lastRowBottom: c.first?.lastRow?.bottom, footer: c.first?.footer,
      overflow: c.first?.overflow, lastRowOnPage2: c.lastRowOnPage2, reading: c.reading, scroll: c.scroll,
      horizontalScrollLeft: c.horizontalScrollLeft, verticalScrollTop: c.verticalScrollTop })),
    interactions: digest.interactions.map(c => ({ name: c.name, passed: c.passed, headers: c.evidence?.headersOpened, resize: c.evidence?.before && c.evidence, pages: c.evidence?.pages })),
    failures: digest.failures, digest: join(output, "operational-browser-evidence.json") }, null, 2));
}
if (process.argv.includes("--summary")) summarize();
else main().catch(error => { console.error(error.stack); process.exitCode = 1; });
