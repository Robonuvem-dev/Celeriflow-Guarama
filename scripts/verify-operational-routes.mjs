/** Full-page, GET-only evidence. Never starts Next, authenticates, imports ORM, or seeds.
 * --plan: inventory without network. --run: use an already running app.localhost server.
 * --public-only --run: only the three reviewed public pages; no full manifest inventory.
 * See docs/tabelas-lotes/rotas-reais-readonly.md for safety boundaries and inputs.
 */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { existsSync, readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { get as httpGet } from "node:http";
import { get as httpsGet } from "node:https";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runInNewContext } from "node:vm";
import { build } from "esbuild";
import ts from "typescript";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(join(root, "package.json"));
const temp = join(process.env.LOCALAPPDATA ?? "C:/Users/thiag/AppData/Local", "Temp/opencode");
const output = resolve(process.env.OPERATIONAL_ROUTES_OUTPUT ?? temp);
assert.ok(existsSync(output) && statSync(output).isDirectory(), "Output directory must already exist");
const run = process.argv.includes("--run");
const hash = value => createHash("sha256").update(value).digest("hex");
const sourceHash = file => hash(readFileSync(join(root, file)));
const readJson = file => JSON.parse(readFileSync(file, "utf8"));
const stamp = new Date().toISOString().replace(/[:.]/g, "-");
const reportPath = join(output, `operational-routes-${stamp}.json`);
const report = { startedAt: new Date().toISOString(), mode: run ? "REAL_PAGES_GET_ONLY" : "OFFLINE_PLAN", sources: {}, inventory: [], cases: [], blockedRequests: [], runtimeErrors: [], blockers: [], limitations: [
  "No mutation, submit, login, password reset, export issuance, or synthetic rows.",
  "HTTP GET is not SQL read-only. Unreviewed server read chains are denied.",
  "Observed geometry is not certification of all states, permissions, variants or datasets.",
] };
const manifestDir = "src/components/app-ui/operational/modules";
const matches = (template, path) => {
  const expected = template.split("/").filter(Boolean), actual = path.split("/").filter(Boolean);
  for (let i = 0; i < expected.length; i++) {
    if (expected[i].startsWith("[[...")) return true;
    if (expected[i].startsWith("[...")) return actual.length > i;
    if (!actual[i] || (!/^\[[^/]+\]$/.test(expected[i]) && expected[i] !== actual[i])) return false;
  }
  return expected.length === actual.length;
};
function walkFiles(directory) {
  return readdirSync(join(root, directory), { withFileTypes: true }).flatMap(entry => entry.isDirectory()
    ? walkFiles(`${directory}/${entry.name}`) : [`${directory}/${entry.name}`]);
}

async function inventory() {
  const files = readdirSync(join(root, manifestDir)).filter(name => name.endsWith(".ts") && name !== "index.ts");
  // Bundle only reviewed declarative manifests and pure navigation/configuration.
  // No application page/action/database/auth module is executed by this inventory.
  const entry = files.map((name, i) => `import * as m${i} from "./${manifestDir}/${name}";`).join("\n")
    + `\nmodule.exports = [${files.map((name, i) => `({ file: ${JSON.stringify(`${manifestDir}/${name}`)}, modules: m${i}.operationalModules ?? [], panels: m${i}.operationalPanelRoutes ?? [] })`).join(",")}];`;
  const bundled = await build({ absWorkingDir: root, stdin: { contents: entry, resolveDir: root, loader: "ts" },
    bundle: true, write: false, metafile: true, platform: "node", format: "cjs", external: ["zod"], logLevel: "silent",
    plugins: [{ name: "pure-manifest-dependencies", setup(builder) {
      // Navigation needs only this pure function, not the policy schemas/Decimal module.
      builder.onLoad({ filter: /[\\/]planejamento[\\/]policy\.ts$/ }, args => {
        const text = readFileSync(args.path, "utf8"), ast = ts.createSourceFile(args.path, text, ts.ScriptTarget.Latest, true);
        const functions = ast.statements.filter(node => ts.isFunctionDeclaration(node) && node.name?.text === "planningBasePath");
        assert.equal(functions.length, 1, "Expected exact planningBasePath declaration");
        return { contents: functions[0].getText(ast), loader: "ts" };
      });
    } }] });
  for (const file of Object.keys(bundled.metafile.inputs).filter(file => file !== "<stdin>")) {
    assert.ok(file.startsWith(`${manifestDir}/`) || [
      "src/lib/planejamento/navigation.ts", "src/lib/planejamento/policy.ts", "src/lib/cemeteries/structure-config.ts",
      "src/app/app-domain/frotas/navigation.ts", "src/app/app-domain/saude/navigation.ts",
      "src/app/app-domain/portal-servidor/navigation.ts", "src/app/app-domain/saneamento/navigation.ts",
    ].includes(file), `Unexpected manifest dependency: ${file}`);
    report.sources[file] = sourceHash(file);
  }
  // Load the installed package outside the VM deadline; cold disk/module loading
  // can be slow while the principal runs its build/auditor concurrently.
  const zod = req("zod");
  const sandbox = { module: { exports: {} }, require: name => { assert.equal(name, "zod"); return zod; } };
  runInNewContext(bundled.outputFiles[0].text, sandbox, { timeout: 10000 });
  const entries = sandbox.module.exports;
  const indexed = new Map();
  function add(pathname, category, file, metadata = {}) {
    assert.ok(pathname.startsWith("/") && !pathname.startsWith("//"));
    if (!indexed.has(pathname)) indexed.set(pathname, { pathname, categories: [], manifests: [], metadata: [] });
    const item = indexed.get(pathname);
    if (!item.categories.includes(category)) item.categories.push(category);
    if (!item.manifests.includes(file)) item.manifests.push(file);
    item.metadata.push(metadata);
  }
  for (const entry of entries) {
    for (const mod of entry.modules) for (const route of mod.routes) add(route.pathname, "workspace", entry.file, { module: mod.key, ...route });
    for (const route of entry.panels) add(route.pathname, "panel", entry.file, route);
  }
  if (process.env.OPERATIONAL_COVERAGE_JSON) {
    const coverage = readJson(process.env.OPERATIONAL_COVERAGE_JSON);
    for (const route of coverage.routeChecks) if (route.entryKind === "page") add(route.route, "ast-table-consumer", route.file, { targets: route.targets });
    report.coverageSource = { sha256: hash(readFileSync(process.env.OPERATIONAL_COVERAGE_JSON)), workingSourceSha256: coverage.summary.workingSourceSha256 };
  }
  const pages = walkFiles("src/app").filter(file => /\/page\.[jt]sx?$/.test(file)).map(file => ({ file,
    pathname: "/" + file.replace(/^src\/app\/(?:app-domain\/)?/, "").replace(/\/page\.[jt]sx?$/, "").split("/").filter(part => !/^\(.+\)$/.test(part)).join("/") }));
  for (const item of indexed.values()) {
    const page = pages.find(page => page.pathname === item.pathname);
    item.page = page?.file;
    item.pageSha256 = page && sourceHash(page.file);
    item.dynamic = item.pathname.includes("[");
    item.readReview = item.page ? mutationClues(item.page) : ["PAGE_NOT_FOUND"];
  }
  report.counts = { workspaceRegistrations: entries.reduce((n, entry) => n + entry.modules.reduce((n, mod) => n + mod.routes.length, 0), 0),
    panelRegistrations: entries.reduce((n, entry) => n + entry.panels.length, 0), uniqueRoutes: indexed.size };
  report.inventory = [...indexed.values()].sort((a, b) => a.pathname.localeCompare(b.pathname));
}

function mutationClues(file) {
  // Conservative tripwire, not a transitive proof. False positives stay blocked.
  const text = readFileSync(join(root, file), "utf8");
  const ast = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const found = new Set();
  function visit(node) {
    if (ts.isCallExpression(node)) {
      const name = node.expression.getText(ast);
      if (/\.(?:insert|update|delete|upsert)$/.test(name) || (ts.isIdentifier(node.expression) && /^(?:ensure|seed|sync|writeAudit|insertAudit|record|register|track|mark)[A-Z_]/.test(name))) {
        const { line } = ast.getLineAndCharacterOfPosition(node.getStart()); found.add(`${name}:L${line + 1}`);
      }
    }
    ts.forEachChild(node, visit);
  }
  visit(ast); return [...found];
}

// Manually inspected server SELECT chains. Public rendering still uses the real DB.
// No admin cookie, principal override, or privileged DB connection is manufactured.
const publicReviewed = new Set(["/portal/planejamento", "/portal/licitacoes-e-contratos", "/portal/portaldatransparencia/estatisticas"]);
const publicReadChain = {
  "src/app/portal/planejamento/page.tsx": "d32c963c95f2607751a5c01be8753f313e49cbf717b5456fb0ca0667ba971930",
  "src/app/portal/licitacoes-e-contratos/page.tsx": "ad007ab042d3500bacd74b9ae80ccf38c8cd0f73d6d24f577be75c3563ec0f90",
  "src/app/portal/portaldatransparencia/estatisticas/page.tsx": "9e570822ac8fa74219aa934704b8263ec15133542d0b5182b62920f64d48f2ae",
  "src/app/portal/layout.tsx": "bc4dc958dc026e1cd9a7c9d3a55bbeef4c73aeaeb1c4877d4632c2d09af9b385",
  "src/app/layout.tsx": "9bf34b5c292fa52cd472794995ab5fb01f8f4aefb88c2a2c51c525f535a56bb4",
  "src/lib/transparencia/planning-publications.ts": "0d950d890acda0bad450403c631e8535322c5ac04b5a322c589e45dd79ca10a1",
  "src/db/repositories/transparency/planning-publications.ts": "9bfd33e0107e719e4a8553b71cf07ca4780bd99bffa576b42fb4d57192bcbe16",
  "src/lib/transparencia/portal-public.ts": "9797bf06e647c34bc58829a44b7bfc57861e0dc6175736cec90aff054e6974df",
  "src/lib/portal-institucional/public-content.ts": "6350b89753f507ba267ab224576989ed66da141d6be072edc274052f45252b05",
  "src/db/repositories/portal-content/public.ts": "cc0eb5a965c283d7bb71f7f2e9e5bb91f2a11f14188a3255052e3806ecc5a045",
  "src/components/transparencia/PageFeedbackSummary.tsx": "b6676dfc7dd94d56fafc7acbc89bd7fbaf7cf96797481862ed0e4153b5b10f3d",
  "src/db/repositories/platform/transparency-statistics.ts": "31fd62aeabe09bb2bd0486310476a75102f880a80cb508c317a99b361cc1b620",
  "src/lib/transparencia/page-feedback.ts": "729c378aaa3fcac75381c14c1cb2833a6078283d40b656c64441c847abe2c0fd",
  "src/components/portal-institucional/PortalShell.tsx": "a41e894ce86f1849358e8af6f52a930482cc2ced9c995eb9fb437f78c6e9994c",
  "src/components/lgpd/CookieConsent.tsx": "a4a8c8086f7efb5be4d8b52ccd12d954351f59891f485fa3ceb65811b2d23157",
  "src/app/portal/PublicTableViews.tsx": "d8ac63d643063463c5455e2b4ce24702e77b7c110dca5237827e05eec025c75b",
  "src/app/portal/PublicOperationalList.tsx": "f68e9f1357ee4252254223fddac9d243affd9544706a4fc45ed127173af31f9e",
};
const publicReviewStillCurrent = () => Object.entries(publicReadChain).every(([file, expected]) => sourceHash(file) === expected);
function publicInventory() {
  // Final-build regression scope: do not enumerate administrative pages/manifests.
  report.inventory = [...publicReviewed].sort().map(pathname => {
    const page = `src/app${pathname}/page.tsx`;
    return { pathname, page, pageSha256: sourceHash(page), dynamic: false, categories: ["reviewed-public-panel"], readReview: mutationClues(page) };
  });
  report.counts = { selectedPublicRoutes: report.inventory.length, uniqueRoutes: report.inventory.length };
  for (const file of Object.keys(publicReadChain)) report.sources[file] = sourceHash(file);
}
const additionalReviews = process.env.OPERATIONAL_ROUTE_REVIEWS ? readJson(process.env.OPERATIONAL_ROUTE_REVIEWS) : [];
function reviewed(item) {
  if (!item.page || item.readReview.length) return false;
  if (publicReviewed.has(item.pathname)) return publicReviewStillCurrent();
  const review = additionalReviews.find(review => review.pathname === item.pathname);
  return Boolean(review?.note && review?.files?.[item.page] === item.pageSha256 && Object.keys(review.files).length > 1
    && Object.entries(review.files).every(([file, expected]) => file.startsWith("src/") && existsSync(join(root, file)) && sourceHash(file) === expected));
}
function safeUrl(raw, base) {
  try {
    const url = new URL(raw, base);
    if (url.origin !== base.origin || url.username || url.password || /(?:logout|signout|reset|delete|remove|emitir|imprimir|download|export|comprovante)/i.test(url.pathname)) return null;
    if ([...url.searchParams.keys()].some(key => !["page", "pagina", "year", "entity", "view", "tab", "tipo", "_rsc"].includes(key))) return null;
    if ([...url.searchParams.values()].some(value => /^(?:print|imprimir|emitir|delete|download|export)$/i.test(value))) return null;
    url.hash = ""; return url;
  } catch { return null; }
}
const routeFor = url => report.inventory.find(item => !item.dynamic && item.pathname === url.pathname)
  ?? report.inventory.find(item => item.dynamic && matches(item.pathname, url.pathname));
function permittedDocument(url) {
  if (url.pathname === "/login" || url.pathname === "/portal-servidor/entrar" || url.pathname === "/portal/entrar") return true;
  const item = routeFor(url); return item && reviewed(item);
}
function permitRequest({ method, url, actionHeader, staticFiles, base }) {
  if (!["GET", "HEAD"].includes(method) || actionHeader || url.origin !== base.origin || url.pathname.startsWith("/api/")) return false;
  const localImage = url.pathname === "/_next/image" && staticFiles.has(url.searchParams.get("url"));
  return Boolean(url.pathname.startsWith("/_next/static/") || staticFiles.has(url.pathname) || localImage
    || (safeUrl(url.href, base) && permittedDocument(url)));
}
async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.waitForTimeout(250);
}
async function geometry(page) {
  return page.evaluate(() => {
    const rect = element => { if (!element) return null; const r = element.getBoundingClientRect(); return { x: r.x, y: r.y, width: r.width, height: r.height, right: r.right, bottom: r.bottom }; };
    const visible = element => !!element.getClientRects().length && getComputedStyle(element).visibility !== "hidden";
    const padding = element => { const s = getComputedStyle(element); return { top: s.paddingTop, right: s.paddingRight, bottom: s.paddingBottom, left: s.paddingLeft }; };
    const overflowStyles = element => { const s = getComputedStyle(element); return { x: s.overflowX, y: s.overflowY, position: s.position }; };
    const surfaces = [...document.querySelectorAll("[data-operational-workspace]")].filter(visible);
    const htmlOverflow = overflowStyles(document.documentElement), bodyOverflow = overflowStyles(document.body);
    const overflowing = [...document.body.querySelectorAll("*")].filter(element => {
      if (!visible(element)) return false; const r = element.getBoundingClientRect(); return r.width > 0 && r.x < innerWidth && r.right > innerWidth + 1;
    });
    return { viewport: { width: innerWidth, height: innerHeight, dpr: devicePixelRatio }, scroll: { x: scrollX, y: scrollY },
      document: { rect: rect(document.documentElement), overflowX: document.documentElement.scrollWidth - innerWidth, overflowY: document.documentElement.scrollHeight - innerHeight, overflowStyles: htmlOverflow },
      body: { rect: rect(document.body), padding: padding(document.body), overflowStyles: bodyOverflow },
      modalBackgroundScrollLock: [htmlOverflow.y, bodyOverflow.y].some(value => value === "hidden" || value === "clip") || bodyOverflow.position === "fixed",
      horizontalOverflowWitnesses: overflowing.slice(0, 15).map(element => ({ tag: element.tagName, classes: String(element.className).slice(0, 300), rect: rect(element),
        parent: { tag: element.parentElement?.tagName, classes: String(element.parentElement?.className).slice(0, 300), rect: rect(element.parentElement) } })),
      mains: [...document.querySelectorAll("main")].filter(visible).map(e => ({ rect: rect(e), padding: padding(e) })),
      nativeVisibleTables: [...document.querySelectorAll("table")].filter(e => visible(e) && !e.closest("[data-operational-table]")).length,
      surfaces: surfaces.map(surface => {
        const view = surface.querySelector("[data-operational-table]"), table = view?.querySelector("table");
        const rows = [...(view?.querySelectorAll("[data-operational-row]") ?? [])], footer = surface.querySelector("[data-operational-pagination]");
        const headers = [...(table?.querySelectorAll("th") ?? [])];
        return { device: surface.dataset.device, surface: surface.hasAttribute("data-operational-surface"), rect: rect(surface), padding: padding(surface),
          view: rect(view), fit: view?.dataset.fit, requiredWidth: Number(view?.dataset.requiredWidth), requiredHeight: Number(view?.dataset.requiredHeight),
          table: rect(table), footer: rect(footer), footerDocumentY: footer ? footer.getBoundingClientRect().y + scrollY : null,
          overflow: view && { x: view.scrollWidth - view.clientWidth, y: view.scrollHeight - view.clientHeight },
          rows: rows.length, lastRow: rect(rows.at(-1)), row20: rect(rows[19]), columns: headers.length,
          hiddenColumns: headers.filter(e => !visible(e) || getComputedStyle(e).display === "none").length,
          rowHeights: [...new Set(rows.map(e => e.getBoundingClientRect().height))],
          fonts: [...new Set(rows.flatMap(e => [...e.cells].map(cell => getComputedStyle(cell).fontSize)))],
          clippedHeadersWithoutDetails: headers.filter(e => { const span = e.querySelector("span"); return span && span.scrollWidth > span.clientWidth + 1 && !e.querySelector('button[aria-label^="Ver "]'); }).length,
        };
      }) };
  });
}
function findings(measurement) {
  const failures = [];
  if (!measurement.surfaces.length && measurement.document.overflowX > 1) failures.push({ message: "Page document horizontal overflow", pixels: measurement.document.overflowX });
  for (const [index, surface] of measurement.surfaces.entries()) {
    const fail = message => failures.push({ surface: index, message });
    if (!surface.view || !surface.footer) { fail("Missing table viewport/footer"); continue; }
    if (surface.fit !== "ready") fail(`Table fit is ${surface.fit}`);
    if (surface.rows > 20) fail("More than 20 rendered rows");
    if (surface.hiddenColumns) fail("Hidden columns");
    if (surface.clippedHeadersWithoutDetails) fail("Clipped header without integral access");
    if (surface.lastRow && surface.lastRow.bottom > surface.view.bottom + 1) fail("Last row below table viewport");
    if (surface.lastRow && surface.lastRow.bottom > surface.footer.y + 1) fail("Last row intersects footer");
    if (surface.overflow.y > 1) fail("Table body vertical overflow");
    if (surface.device === "desktop") {
      if ((!surface.surface || !measurement.modalBackgroundScrollLock) && (measurement.document.overflowX > 1 || measurement.document.overflowY > 1)) fail("Desktop document overflow without modal scroll lock");
      if (surface.overflow.x > 1) fail("Desktop table horizontal overflow");
      if (Math.abs(surface.footer.bottom - measurement.viewport.height) > 1) fail("Desktop footer not at viewport bottom");
      if (surface.rect.x < -1 || surface.rect.y < -1 || surface.rect.right > measurement.viewport.width + 1 || surface.rect.bottom > measurement.viewport.height + 1) fail("Active surface outside viewport");
    }
  }
  return failures;
}

async function execute() {
  const base = new URL(process.env.OPERATIONAL_ROUTES_BASE_URL ?? "http://app.localhost:3100");
  assert.equal(base.hostname, "app.localhost", "Use the normal proxy hostname app.localhost");
  assert.ok(!base.username && !base.password && base.pathname === "/" && !base.search && !base.hash);
  report.origin = base.origin;
  const filter = process.env.OPERATIONAL_ROUTES_FILTER ? new RegExp(process.env.OPERATIONAL_ROUTES_FILTER) : null;
  const selected = report.inventory.filter(item => !filter || filter.test(item.pathname));
  // Test TCP/HTTP before opening a browser. Never starts/restarts someone else's server.
  try {
    report.preflight = await new Promise((resolve, reject) => {
      // app.localhost is a normal proxy hostname. Resolve this request to loopback
      // without editing DNS/hosts/environment or using an authentication bypass.
      const get = base.protocol === "https:" ? httpsGet : httpGet;
      const request = get(new URL("/login", base), { lookup: (_hostname, options, done) => options.all
        ? done(null, [{ address: "127.0.0.1", family: 4 }]) : done(null, "127.0.0.1", 4) }, response => {
        response.resume(); resolve({ status: response.statusCode });
      });
      request.setTimeout(5000, () => request.destroy(Object.assign(new Error("Preflight timeout"), { code: "TIMEOUT" })));
      request.once("error", reject);
    });
  } catch (error) { report.blockers.push({ code: "APP_NOT_REACHABLE_AT_CONFIGURED_ORIGIN", networkCode: error.code ?? "UNKNOWN" }); return; }
  const playwright = req(process.env.PLAYWRIGHT_MODULE_PATH ?? join(temp, "node_modules/playwright-core"));
  let browser, context;
  const cdp = process.env.OPERATIONAL_CDP_URL;
  try {
    if (cdp) {
      const endpoint = new URL(cdp); assert.ok(["localhost", "127.0.0.1", "[::1]"].includes(endpoint.hostname), "Only local CDP");
      browser = await playwright.chromium.connectOverCDP(cdp);
      const existing = browser.contexts().find(c => c.pages().some(p => { try { return new URL(p.url()).origin === base.origin; } catch { return false; } }));
      assert.ok(existing, "No browser context for the exact app origin");
      // Copy state in memory. Never route, navigate or close the owner's context/pages.
      context = await browser.newContext({ storageState: await existing.storageState(), serviceWorkers: "block" });
    } else {
      browser = await playwright.chromium.launch({ headless: true,
        executablePath: process.env.CHROMIUM_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe" });
      context = await browser.newContext({ serviceWorkers: "block",
        ...(process.env.OPERATIONAL_STORAGE_STATE ? { storageState: process.env.OPERATIONAL_STORAGE_STATE } : {}) });
    }
    report.browser = { version: browser.version(), sessionSource: cdp ? "existing-exact-origin-context-in-memory" : process.env.OPERATIONAL_STORAGE_STATE ? "owner-supplied-storage-state" : "anonymous" };
    const cookiePresent = (await context.cookies(base.origin)).some(cookie => cookie.name === "celeriflow_session");
    report.browser.sessionCookiePresent = cookiePresent; // Never log value, headers or state.
    if (!cookiePresent) {
      report.authentication = "NO_EXISTING_LOCAL_SESSION; ADMIN_NOT_EXECUTED; LOGIN_WOULD_INSERT_SESSION_AUDIT";
      if (selected.some(item => !item.pathname.startsWith("/portal/"))) report.blockers.push("NO_EXISTING_LOCAL_SESSION; LOGIN_WOULD_INSERT_SESSION_AUDIT");
    }
    const staticPublicFiles = new Set(walkFiles("public").map(file => `/${file.slice("public/".length)}`));
    // Next metadata image routes are backed by real static files in src/app.
    // These are not business API endpoints and do not run a page read chain.
    for (const file of ["favicon.ico", "icon.png", "icon.svg", "apple-icon.png"]) if (existsSync(join(root, "src/app", file))) staticPublicFiles.add(`/${file}`);
    await context.route("**/*", async route => {
      const request = route.request(), url = new URL(request.url());
      const allowed = permitRequest({ method: request.method(), url, actionHeader: request.headers()["next-action"], staticFiles: staticPublicFiles, base });
      if (!allowed) {
        const headers = request.headers(), prefetch = Object.keys(headers).some(name => name.includes("prefetch")) || /prefetch/i.test(headers.purpose ?? headers["sec-purpose"] ?? "");
        report.blockedRequests.push({ method: request.method(), resourceType: request.resourceType(), prefetch, sameOrigin: url.origin === base.origin,
          routeTemplate: routeFor(url)?.pathname, pathSha256: hash(url.pathname), reason: "GET_ONLY_REVIEWED_PAGE_OR_LOCAL_STATIC_ONLY" });
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    await context.routeWebSocket(/.*/, socket => socket.close());
    const page = await context.newPage(); page.setDefaultTimeout(5000);
    page.on("pageerror", error => report.runtimeErrors.push({ name: error.name, messageSha256: hash(error.message) }));
    page.on("response", response => { if (response.status() >= 400) report.runtimeErrors.push({ status: response.status(), pathSha256: hash(new URL(response.url()).pathname) }); });
    const links = new Map();
    const sizes = (process.env.OPERATIONAL_ROUTES_SIZES ?? "1280x720,1366x768,800x600").split(",").map(size => {
      const [width, height] = size.split("x").map(Number); assert.ok(width >= 320 && height >= 320); return { width, height };
    });
    async function collectLinks() {
      for (const href of await page.locator("a[href]").evaluateAll(elements => elements.map(e => e.href))) {
        const url = safeUrl(href, base); if (!url) continue;
        const item = routeFor(url); if (item && reviewed(item) && !links.has(item.pathname)) links.set(item.pathname, url.href);
      }
    }
    for (const item of selected.filter(item => !item.dynamic).concat(selected.filter(item => item.dynamic))) {
      if (!reviewed(item)) { report.cases.push({ route: item.pathname, status: item.readReview.length ? "BLOCKED_GET_SIDE_EFFECT_CLUE" : "BLOCKED_READ_CHAIN_NOT_REVIEWED", clues: item.readReview }); continue; }
      if (!item.pathname.startsWith("/portal/") && !cookiePresent) { report.cases.push({ route: item.pathname, status: "BLOCKED_NO_SESSION" }); continue; }
      const target = item.dynamic ? links.get(item.pathname) : new URL(item.pathname, base).href;
      if (!target) { report.cases.push({ route: item.pathname, status: "BLOCKED_NO_AUTHORIZED_SAME_APP_LINK_ID" }); continue; }
      for (const size of sizes) {
        const result = { route: item.pathname, targetSha256: hash(target), viewport: size, status: "NOT_EXECUTED", measurements: [], screenshots: [], failures: [] };
        report.cases.push(result);
        const errorStart = report.runtimeErrors.length, blockedStart = report.blockedRequests.length;
        try {
          await page.setViewportSize(size);
          const response = await page.goto(target, { waitUntil: "networkidle", timeout: 30000 });
          result.httpStatus = response?.status(); await settle(page);
          if (/\/(?:login|entrar)(?:\?|$)/.test(page.url())) { result.status = "BLOCKED_AUTH_REDIRECT"; continue; }
          if (result.httpStatus !== 200) { result.status = "HTTP_FAILURE"; continue; }
          await collectLinks();
          async function capture(label) {
            const measurement = await geometry(page); result.measurements.push({ label, ...measurement });
            result.failures.push(...findings(measurement).map(failure => ({ label, ...failure })));
            const file = `operational-route-${stamp}-${report.cases.length}-${result.measurements.length}.png`;
            await page.screenshot({ path: join(output, file) }); result.screenshots.push(file);
            const full = file.replace(/\.png$/, "-full-document.png");
            await page.screenshot({ path: join(output, full), fullPage: true }); result.screenshots.push(full);
          }
          async function exercisePagination(surface, reopen) {
            const footer = surface.locator("[data-operational-pagination]");
            const before = await geometry(page);
            const last = footer.getByRole("button", { name: "Última página", exact: true });
            const lastLink = footer.getByRole("link", { name: "Última página", exact: true });
            let navigated = false;
            if (await last.count() && await last.isEnabled()) {
              await last.click(); await settle(page); navigated = true;
            } else if (await lastLink.count()) {
              const href = await lastLink.getAttribute("href"), url = safeUrl(href, base);
              if (url && permittedDocument(url)) {
                await lastLink.click(); await settle(page);
                if (reopen && !await page.locator("[data-operational-surface]").count()) await reopen();
                await settle(page); navigated = true;
              }
            }
            if (navigated) {
              await capture("existing-data-last-page");
              const after = await geometry(page);
              if (before.surfaces.at(-1)?.footerDocumentY !== after.surfaces.at(-1)?.footerDocumentY) result.failures.push({ label: "pagination", message: "Footer moved between first and last page" });
            }
          }
          await capture("actual-page");
          const consent = page.getByRole("button", { name: "Manter somente necessários", exact: true });
          if (await consent.isVisible()) { await consent.click(); await settle(page); result.localCookiePreferenceChosen = "necessary"; }
          const workspace = page.locator("[data-operational-workspace]:not([data-operational-surface])");
          if (await workspace.count() === 1) await exercisePagination(workspace);
          // Only explicit table panel triggers. No row action or generic button guessing.
          const hashTabs = await page.locator('nav[aria-label="Listagens publicadas"] a[href^="#"]').count();
          for (let tab = 0; tab < Math.max(1, hashTabs); tab++) {
            if (hashTabs) { await page.locator('nav[aria-label="Listagens publicadas"] a[href^="#"]').nth(tab).click(); await settle(page); }
            const review = additionalReviews.find(review => review.pathname === item.pathname);
            const labels = await page.getByRole("button", { name: /^Abrir tabela — / }).allTextContents();
            for (const label of [...labels, ...(review?.panelLabels ?? [])]) {
              const trigger = page.getByRole("button", { name: label.trim(), exact: true });
              if (await trigger.count() !== 1) { result.failures.push({ label: "panel", message: "Reviewed trigger missing or ambiguous" }); continue; }
              if (await trigger.getAttribute("data-slot") !== "dialog-trigger" || await trigger.getAttribute("type") !== "button") {
                result.failures.push({ label: "panel", message: "Trigger is not an explicit non-submit dialog button" }); continue;
              }
              await trigger.click(); await settle(page); await capture(`table-panel-tab-${tab + 1}`);
              const surface = page.locator("[data-operational-surface]").last();
              if (await surface.count()) {
                const beforeWheel = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
                await page.mouse.move(size.width / 2, size.height / 2); await page.mouse.wheel(0, 300); await settle(page);
                const afterWheel = await page.evaluate(() => ({ x: scrollX, y: scrollY }));
                (result.modalWheelProbes ??= []).push({ before: beforeWheel, after: afterWheel });
                if (beforeWheel.x !== afterWheel.x || beforeWheel.y !== afterWheel.y) result.failures.push({ label: "modal", message: "Background document scrolls while panel is open" });
                await exercisePagination(surface, () => page.getByRole("button", { name: label.trim(), exact: true }).click());
                const close = page.locator("[data-operational-surface]").last().getByRole("button", { name: "Fechar", exact: true });
                await close.click(); await settle(page);
                const restored = await trigger.evaluate(element => element === document.activeElement);
                (result.panelFocusResults ??= []).push(restored);
                if (!restored) result.failures.push({ label: "panel", message: "Panel trigger focus was not restored" });
              }
            }
          }
          const surfaces = result.measurements.flatMap(m => m.surfaces);
          result.runtimeErrorCount = report.runtimeErrors.length - errorStart;
          result.blockedRequestCount = report.blockedRequests.length - blockedStart;
          result.blockedNonPrefetchRequestCount = report.blockedRequests.slice(blockedStart).filter(request => !request.prefetch).length;
          result.status = result.failures.length || result.runtimeErrorCount ? "OBSERVED_FAILURE" : result.blockedNonPrefetchRequestCount ? "INCOMPLETE_BLOCKED_REQUESTS" : surfaces.length ? "OBSERVED_GEOMETRY_ONLY" : "NO_TABLE_EXERCISED";
          result.row20Observed = surfaces.some(s => s.rows === 20);
          result.emptyObserved = surfaces.some(s => s.table && s.rows === 0);
        } catch (error) { result.status = "EXECUTION_BLOCKED"; result.errorName = error.name; result.errorSha256 = hash(error.message); }
        writeFileSync(reportPath, JSON.stringify(report, null, 2));
      }
    }
  } finally { await context?.close(); await browser?.close(); }
}

function summarize(file) {
  const data = readJson(file);
  const digest = { report: file, startedAt: data.startedAt, finishedAt: data.finishedAt, summary: data.summary,
    localBuildArtifact: data.localBuildArtifact, authentication: data.authentication, browser: data.browser,
    cases: data.cases.map(item => ({ route: item.route, viewport: item.viewport, status: item.status, httpStatus: item.httpStatus,
      failures: item.failures, runtimeErrors: item.runtimeErrorCount, blockedRequests: item.blockedRequestCount,
      blockedNonPrefetchRequests: item.blockedNonPrefetchRequestCount, screenshots: item.screenshots,
      modalWheelProbes: item.modalWheelProbes, panelFocusResults: item.panelFocusResults,
      measurements: (item.measurements ?? []).map(m => ({ label: m.label, viewport: m.viewport, scroll: m.scroll,
        document: m.document, body: m.body, modalBackgroundScrollLock: m.modalBackgroundScrollLock, horizontalOverflowWitnesses: m.horizontalOverflowWitnesses, mains: m.mains,
        surfaces: m.surfaces })) })),
    blockedRequestKinds: Object.fromEntries([...new Set(data.blockedRequests.map(r => `${r.method}/${r.resourceType ?? "unknown"}/prefetch=${r.prefetch ?? "unknown"}`))]
      .map(key => [key, data.blockedRequests.filter(r => `${r.method}/${r.resourceType ?? "unknown"}/prefetch=${r.prefetch ?? "unknown"}` === key).length])),
  };
  const path = file.replace(/\.json$/, "-digest.json");
  assert.notEqual(path, file, "Input report must end in .json");
  writeFileSync(path, JSON.stringify(digest, null, 2));
  console.log(JSON.stringify({ summary: digest.summary, localBuildArtifact: digest.localBuildArtifact, authentication: digest.authentication,
    cases: digest.cases.map(item => ({ route: item.route, viewport: item.viewport, status: item.status, httpStatus: item.httpStatus,
      failures: item.failures, screenshots: item.screenshots.length, pageOverflow: item.measurements[0]?.document && { x: item.measurements[0].document.overflowX, y: item.measurements[0].document.overflowY },
      panels: item.measurements.flatMap(m => m.surfaces.map(s => ({ label: m.label, fit: s.fit, minimum: s.requiredWidth, available: s.view,
        rows: s.rows, columns: s.columns, rowHeights: s.rowHeights, fonts: s.fonts, footer: s.footer, overflow: s.overflow, scrollLocked: m.modalBackgroundScrollLock }))) })),
    blockedRequestKinds: digest.blockedRequestKinds, digest: path }, null, 2));
}

if (process.argv.includes("--summary")) summarize(process.argv[process.argv.indexOf("--summary") + 1]);
else try {
  if (process.argv.includes("--public-only")) publicInventory();
  else await inventory();
  if (existsSync(join(root, ".next/BUILD_ID"))) report.localBuildArtifact = {
    buildIdSha256: sourceHash(".next/BUILD_ID"), modifiedAt: statSync(join(root, ".next/BUILD_ID")).mtime.toISOString(),
    provesServerMatchesSources: false,
  };
  report.publicReadChain = publicReadChain;
  report.publicReadChainCurrent = publicReviewStillCurrent();
  for (const item of report.inventory) item.readChainReviewed = reviewed(item);
  report.counts.reviewedReadChains = report.inventory.filter(item => item.readChainReviewed).length;
  report.counts.routesWithMutationClues = report.inventory.filter(item => item.readReview.length).length;
  if (process.argv.includes("--self-test")) {
    const base = new URL("http://app.localhost:3100");
    for (const path of ["https://example.com/portal/planejamento", "//other.localhost/x", "/portal/planejamento?token=secret", "/portal/planejamento?view=print", "/api/auth/session", "/tributacao/domicilio-tributario"]) {
      const url = safeUrl(path, base); assert.ok(!url || !permittedDocument(url), "Unsafe navigation must fail closed");
    }
    assert.ok(permittedDocument(new URL("/portal/planejamento?page=2", base)));
    assert.ok(report.inventory.find(item => item.pathname === "/tributacao/domicilio-tributario").readReview.length);
    assert.ok(report.inventory.find(item => item.pathname === "/sst/aso").readReview.length);
    assert.ok(matches("/a/[id]", "/a/existing") && !matches("/a/[id]", "/a/x/y"));
    const staticFiles = new Set(["/logo1.png"]), url = new URL("/portal/planejamento", base);
    for (const method of ["POST", "PUT", "PATCH", "DELETE", "OPTIONS"]) assert.equal(permitRequest({ method, url, staticFiles, base }), false);
    assert.equal(permitRequest({ method: "GET", url, actionHeader: "action", staticFiles, base }), false);
    assert.equal(permitRequest({ method: "GET", url: new URL("/api/write.png", base), staticFiles, base }), false);
    assert.equal(permitRequest({ method: "GET", url: new URL("https://example.com/logo1.png"), staticFiles, base }), false);
    assert.ok(permitRequest({ method: "GET", url: new URL("/logo1.png", base), staticFiles, base }));
    report.selfTest = { passed: true, checks: ["cross-origin and secret query denial", "known GET mutations denied", "reviewed page pagination allowed", "dynamic segment matching", "mutation methods and Server Actions denied", "API cannot masquerade as static image"] };
  }
  if (run) await execute();
}
catch (error) { report.blockers.push({ code: "RUNNER_FAILURE", name: error.name, errorCode: error.code, messageSha256: hash(error.message), ...(error.message.startsWith("Unexpected manifest dependency:") ? { dependency: error.message.split(": ").at(-1) } : {}), ...(error.errors ? { buildLocations: error.errors.map(item => ({ file: item.location?.file, line: item.location?.line })) } : {}) }); process.exitCode = 1; }
finally {
  report.finishedAt = new Date().toISOString();
  report.summary = { inventory: report.counts, cases: report.cases.length, statuses: Object.fromEntries([...new Set(report.cases.map(c => c.status))].map(status => [status, report.cases.filter(c => c.status === status).length])), blockedRequests: report.blockedRequests.length, blockers: report.blockers };
  if (report.selfTest) report.summary.selfTest = report.selfTest;
  writeFileSync(reportPath, JSON.stringify(report, null, 2));
  console.log(JSON.stringify({ ...report.summary, report: reportPath }, null, 2));
  if (!process.exitCode && run && (report.blockers.length || report.cases.some(c => !["OBSERVED_GEOMETRY_ONLY"].includes(c.status)))) process.exitCode = 2;
}
