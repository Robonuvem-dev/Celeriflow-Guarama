/** Focused real-Chromium companion to scripts/verify-operational-browser.mjs.
 * Same esbuild + actual Tailwind/CSS Modules + installed playwright-core/Chrome harness.
 * Run: node --test tests/operational-filters.browser.test.mjs
 * No Next server, full build, package installation, auth, or database.
 */
import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const req = createRequire(join(root, "package.json"));
const temp = join(process.env.LOCALAPPDATA ?? "C:/Users/thiag/AppData/Local", "Temp/opencode");
const output = process.env.OPERATIONAL_BROWSER_OUTPUT ?? temp;
const playwright = req(process.env.PLAYWRIGHT_MODULE_PATH ?? join(temp, "node_modules/playwright-core"));
let browser, server, origin;
const errors = [];
const evidence = [];
const viewportSelector = "[data-operational-content-viewport]";
const next = page => page.getByRole("button", { name: "Próxima parte", exact: true });
const previous = page => page.getByRole("button", { name: "Parte anterior", exact: true });

async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r))); });
  await page.evaluate(async () => { await Promise.all(document.getAnimations().map(animation => animation.finished.catch(() => {}))); });
  await page.waitForTimeout(50);
}
async function geometry(page) {
  return page.locator("[data-operational-paged-content]").evaluate(root => {
    const view = root.querySelector("[data-operational-content-viewport]");
    const footer = root.querySelector("[data-operational-content-footer]");
    const popup = root.closest('[data-slot="dialog-content"]');
    const rect = node => node.getBoundingClientRect().toJSON();
    return { mode: root.dataset.readingMode, device: popup?.dataset.device, viewport: rect(view), footer: rect(footer), popup: popup && rect(popup),
      offset: view.scrollTop, height: view.clientHeight, totalHeight: view.scrollHeight, overflow: getComputedStyle(view).overflowY,
      documentOverflow: document.documentElement.scrollHeight - innerHeight, documentY: scrollY,
      footerControls: [...footer.querySelectorAll("button")].map(node => ({ label: node.textContent, ...rect(node) })), status: footer.querySelector('[role="status"]')?.textContent };
  });
}
function assertBounded(m, size) {
  assert.ok(m.viewport.height > 0, "Nonempty content window");
  assert.ok(m.footer.y >= m.viewport.bottom - .5, "Body cannot overlap footer");
  assert.ok(m.footer.bottom <= size.height + .5, "Footer is always visible");
  for (const button of m.footerControls) assert.ok(button.y >= 0 && button.bottom <= size.height + .5 && button.x >= 0 && button.right <= size.width + .5, `Footer button clipped: ${JSON.stringify(button)}`);
  if (m.popup) assert.ok(m.popup.y >= 7.5 && m.popup.bottom <= size.height - 7.5 && m.popup.right <= size.width + .5, `Popup within dynamic viewport: ${JSON.stringify({ popup: m.popup, size })}`);
  assert.ok(m.documentOverflow <= 1 && m.documentY === 0, "No document scrolling behind the dialog");
}
async function createPage(options = {}) {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36", ...options });
  const page = await context.newPage();
  page.on("pageerror", error => errors.push(error.message));
  await context.route("**/*", route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
  await page.goto(origin);
  await page.waitForFunction(() => !!window.__filtersTest);
  return page;
}
async function show(page, options = {}) {
  await page.evaluate(options => window.__filtersTest.show(options), options);
  const trigger = page.getByRole("button", { name: "Filtros extensos, 2 ativos", exact: true });
  if (!options.standalone) await trigger.click();
  await page.locator(viewportSelector).waitFor(); await settle(page);
  return trigger;
}
async function assertFocusedVisible(page) {
  const result = await page.locator(viewportSelector).evaluate(view => {
    const target = document.activeElement;
    const rect = target.getBoundingClientRect(), window = view.getBoundingClientRect();
    return { name: target.getAttribute("name"), inside: view.contains(target), top: rect.top, bottom: rect.bottom, windowTop: window.top, windowBottom: window.bottom };
  });
  assert.ok(result.inside && result.top >= result.windowTop - .5 && result.bottom <= result.windowBottom + .5, `Focused field not fully visible: ${JSON.stringify(result)}`);
}
async function touchScroll(page) {
  const box = await page.locator(viewportSelector).boundingBox();
  const cdp = await page.context().newCDPSession(page);
  try {
    const x = box.x + box.width - 12, y = box.y + box.height * .8;
    await cdp.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x, y }] });
    for (let i = 1; i <= 8; i++) {
      await cdp.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x, y: y - i * Math.min(30, box.height / 12) }] });
      await page.waitForTimeout(20);
    }
    await cdp.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await settle(page);
  } finally { await cdp.detach(); }
}

before(async () => {
  assert.ok(existsSync(output), "Evidence parent must exist");
  const { build } = req("esbuild");
  const postcss = req("postcss");
  const assets = await build({
    absWorkingDir: root, entryPoints: ["tests/operational-filters-browser-fixture.tsx"], outfile: "filters-fixture.js",
    bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", tsconfig: join(root, "tsconfig.json"),
    loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
    plugins: [{ name: "browser-boundary", setup(builder) {
      builder.onResolve({ filter: /^(server-only|.*(?:drizzle|firebase|database|\/actions)(?:\/.*)?)$/ }, args => { throw new Error(`Forbidden browser import: ${args.path}`); });
      builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: "next-adapter" }));
      builder.onLoad({ filter: /.*/, namespace: "next-adapter" }, args => ({ contents: args.path === "next/navigation"
        ? 'export const usePathname=()=>"/"; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push(){throw new Error("Unexpected route navigation")}});'
        : 'import React from "react"; export default function Adapter({href,scroll,prefetch,priority,...p}){return React.createElement(href?"a":"img",{...p,href})}', resolveDir: root }));
    } }],
  });
  const globals = await postcss([req("@tailwindcss/postcss")({ base: root })]).process(readFileSync(join(root, "src/app/globals.css"), "utf8"), { from: join(root, "src/app/globals.css") });
  let fonts = "", family;
  const chunks = join(root, ".next/static/chunks");
  if (existsSync(chunks)) for (const name of readdirSync(chunks).filter(name => name.endsWith(".css"))) {
    postcss.parse(readFileSync(join(chunks, name), "utf8")).walkAtRules("font-face", rule => {
      const candidate = rule.nodes.find(node => node.prop === "font-family")?.value;
      if (candidate && /inter/i.test(candidate) && rule.nodes.some(node => node.prop === "src" && /\.woff2/.test(node.value))) { family ??= candidate; fonts += rule.toString() + "\n"; }
    });
  }
  assert.ok(fonts && family, "Reuse cached next/font Inter, as in existing browser harness");
  const css = globals.css + "\n" + fonts + `\n:root{--font-inter:${family};}\n` + assets.outputFiles.find(file => file.path.endsWith(".css")).text;
  const js = assets.outputFiles.find(file => file.path.endsWith(".js")).contents;
  server = createServer((request, response) => {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(js); }
    else if (path === "/fixture.css") { response.setHeader("Content-Type", "text/css; charset=utf-8"); response.end(css); }
    else if (/\.woff2$/.test(path)) { response.setHeader("Content-Type", "font/woff2"); response.end(readFileSync(join(root, ".next/static/media", path.split("/").at(-1)))); }
    else if (path === "/") { response.setHeader("Content-Type", "text/html; charset=utf-8"); response.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="font-sans"><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
    else { response.writeHead(path === "/favicon.ico" ? 204 : 404); response.end(); }
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r));
  origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = [process.env.CHROMIUM_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", ...["chromium-1248", "chromium-1243"].map(name => join(process.env.LOCALAPPDATA ?? "", "ms-playwright", name, "chrome-win64/chrome.exe"))].filter(Boolean).find(existsSync);
  browser = process.env.OPERATIONAL_CDP_URL ? await playwright.chromium.connectOverCDP(process.env.OPERATIONAL_CDP_URL) : await playwright.chromium.launch({ executablePath, headless: true });
});
after(async () => {
  await browser?.close(); server?.closeAllConnections(); if (server) await new Promise(r => server.close(r));
  writeFileSync(join(output, "operational-filters-browser-results.json"), JSON.stringify({ browser: browser?.version(), errors, evidence }, null, 2));
});

test("80 fields: every control has a complete window, drafts/DOM/FormData survive paging; footer stays visible", async () => {
  const page = await createPage();
  try {
    for (const size of [{ width: 1920, height: 1080 }, { width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 800, height: 600 }, { width: 683, height: 384 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(size); await show(page);
      let m = await geometry(page); assert.equal(m.device, "desktop"); assert.equal(m.mode, "pages"); assert.equal(m.overflow, "hidden"); assertBounded(m, size);
      await page.evaluate(() => { window.__fieldNodes = [...document.querySelectorAll('[data-test-form] input')]; });
      await page.getByLabel("Campo 1", { exact: true }).fill("rascunho-controlado");
      await page.getByLabel("Campo 2", { exact: true }).fill("rascunho-nativo");
      await settle(page);
      const covered = new Set(); const windows = [];
      for (let count = 0; count < 200; count++) {
        m = await geometry(page); assertBounded(m, size); windows.push([m.offset, m.offset + m.height]);
        const names = await page.locator(viewportSelector).evaluate(view => {
          const window = view.getBoundingClientRect();
          return [...view.querySelectorAll("input, button")].filter(node => { const rect = node.getBoundingClientRect(); return rect.top >= window.top - .5 && rect.bottom <= window.bottom + .5; }).map(node => node.getAttribute("name") ?? node.textContent);
        });
        names.forEach(name => covered.add(name));
        if (await next(page).isDisabled()) break;
        const clicks = await page.locator("[data-outer-clicks]").textContent();
        await next(page).click(); await settle(page);
        assert.equal(await page.locator("[data-outer-clicks]").textContent(), clicks, "Navigation event must not bubble through logical parent form");
      }
      for (let i = 1; i <= 80; i++) assert.ok(covered.has(`field${String(i).padStart(2, "0")}`), `No complete page for field ${i}`);
      assert.ok(covered.has("Aplicar todos os campos"));
      for (let i = 1; i < windows.length; i++) assert.ok(windows[i][0] < windows[i - 1][1], "Explicit pages must overlap without content gaps");
      assert.ok(await page.evaluate(() => window.__fieldNodes.every(node => node.isConnected && !node.disabled)), "DOM and enabled controls preserved");
      await page.getByRole("button", { name: "Aplicar todos os campos", exact: true }).click();
      const submitted = JSON.parse(await page.locator("[data-submission]").textContent());
      assert.equal(Object.keys(submitted).length, 80); assert.equal(submitted.field01, "rascunho-controlado"); assert.equal(submitted.field02, "rascunho-nativo"); assert.equal(submitted.field80, "original-80");
      assert.equal(await page.locator("[data-outer-submits]").textContent(), "0");
      while (!await previous(page).isDisabled()) { await previous(page).click(); }
      assert.equal(await page.getByLabel("Campo 1", { exact: true }).inputValue(), "rascunho-controlado");
      assert.equal(await page.getByLabel("Campo 2", { exact: true }).inputValue(), "rascunho-nativo");
      evidence.push({ test: "80-fields", size, pages: windows.length, geometry: m, all80Submitted: true, drafts: true, sameNodes: true });
      await page.keyboard.press("Escape"); await settle(page);
    }
  } finally { await page.context().close(); }
});

test("actual Tab/Shift+Tab reveal all 80 fields fully; offpage focus, focus trap, Escape and return focus", async () => {
  const page = await createPage({ viewport: { width: 1280, height: 720 } });
  try {
    const trigger = await show(page, { provider: "desktop" });
    const toggle = page.getByRole("button", { name: "Alternar contexto dinâmico" }); await toggle.focus();
    for (let i = 1; i <= 80; i++) {
      await page.keyboard.press("Tab"); await settle(page);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("name")), `field${String(i).padStart(2, "0")}`);
      await assertFocusedVisible(page);
    }
    for (let i = 79; i >= 1; i--) {
      await page.keyboard.press("Shift+Tab"); await settle(page); await assertFocusedVisible(page);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("name")), `field${String(i).padStart(2, "0")}`);
    }
    // Native focus scroll on a control whose page is not currently selected.
    await page.getByLabel("Campo 80", { exact: true }).focus(); await settle(page); await assertFocusedVisible(page);
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press("Tab"); await settle(page);
      assert.ok(await page.locator('[data-slot="dialog-content"]').evaluate(node => node.contains(document.activeElement)), "Modal focus trap");
    }
    await page.keyboard.press("Escape"); await page.locator('[data-slot="dialog-content"]').waitFor({ state: "hidden" }); await settle(page);
    assert.ok(await trigger.evaluate(node => node === document.activeElement));
    evidence.push({ test: "keyboard", forward: 80, backward: 79, offpageFocus: true, escapeReturnFocus: true });
  } finally { await page.context().close(); }
});

test("desktop blocks wheel/touch/free keyboard scrolling and restores accidental programmatic scroll", async () => {
  const page = await createPage({ hasTouch: true });
  try {
    await show(page); const before = await geometry(page);
    await page.locator(viewportSelector).hover(); await page.mouse.wheel(0, 1100); await settle(page);
    assert.equal((await geometry(page)).offset, before.offset);
    const prevented = await page.locator(viewportSelector).evaluate(view => {
      const event = new Event("touchmove", { bubbles: true, cancelable: true }); view.dispatchEvent(event); return event.defaultPrevented;
    }); assert.ok(prevented);
    await touchScroll(page); assert.equal((await geometry(page)).offset, before.offset, "Real touch gesture cannot freely move desktop content");
    await page.getByLabel("Campo 1", { exact: true }).focus();
    for (const key of ["PageDown", "End", "ArrowDown"]) await page.keyboard.press(key);
    await settle(page); assert.equal((await geometry(page)).offset, before.offset);
    await page.locator(viewportSelector).evaluate(view => { view.scrollTop += 400; }); await settle(page);
    assert.equal((await geometry(page)).offset, before.offset);
    await next(page).click(); await settle(page); assert.ok((await geometry(page)).offset > before.offset);
    evidence.push({ test: "desktop-no-free-scroll", wheel: true, touchmove: true, keyboard: true, unexpectedScroll: true });
  } finally { await page.context().close(); }
});

test("long context is covered without gaps; mutation/render/font geometry and resize recalculate parts", async () => {
  const page = await createPage();
  try {
    await show(page, { context: true });
    const read = async () => {
      const windows = [];
      for (let count = 0; count < 200; count++) {
        const m = await geometry(page); assertBounded(m, page.viewportSize()); windows.push([m.offset, m.offset + m.height]);
        if (await next(page).isDisabled()) break;
        await next(page).click(); await settle(page);
      }
      const m = await geometry(page);
      assert.ok(windows.length > 1 && windows.length < 200);
      assert.equal(windows[0][0], 0); assert.ok(windows.at(-1)[1] >= m.totalHeight - 1);
      for (let i = 1; i < windows.length; i++) assert.ok(windows[i][0] < windows[i - 1][1], "All context lines covered with overlap");
      return windows.length;
    };
    const initial = await read();
    await page.getByRole("button", { name: "Alterar geometria" }).focus(); await settle(page);
    await page.getByRole("button", { name: "Alterar geometria" }).click(); await settle(page);
    const expanded = await read(); assert.ok(expanded > initial, "Rendered font geometry measured");
    // FontFaceSet events are observed as well as ResizeObserver render changes.
    await page.evaluate(() => document.fonts.dispatchEvent(new Event("loadingdone"))); await settle(page);
    await page.setViewportSize({ width: 800, height: 600 }); await settle(page);
    assertBounded(await geometry(page), page.viewportSize());
    await page.getByRole("link", { name: "Último controle do contexto" }).focus(); await settle(page); await assertFocusedVisible(page);
    await page.keyboard.press("Escape"); await settle(page); await show(page);
    const before = await geometry(page);
    await page.getByRole("button", { name: "Alternar contexto dinâmico" }).click(); await settle(page);
    const after = await geometry(page); assert.ok(after.totalHeight > before.totalHeight + 200);
    while (!await next(page).isDisabled()) { await next(page).click(); }
    await settle(page);
    const last = await geometry(page); assert.ok(Math.abs(last.offset + last.height - last.totalHeight) <= 1, "Mutation updates final page extent");
    await page.getByLabel("Campo 80", { exact: true }).focus(); await settle(page);
    await page.setViewportSize({ width: 1024, height: 500 }); await settle(page); await assertFocusedVisible(page); assertBounded(await geometry(page), page.viewportSize());
    evidence.push({ test: "context-and-observers", initialPages: initial, expandedPages: expanded, mutation: true, resizeFocusedField: true });
  } finally { await page.context().close(); }
});

test("navigation works inside a native form without submitting, disabling or dropping any field", async () => {
  const page = await createPage();
  try {
    await show(page, { standalone: true, provider: "desktop" });
    await next(page).click(); await settle(page);
    assert.equal(await page.locator("[data-submission]").textContent(), "{}");
    await page.getByRole("button", { name: "Enviar pelo rodapé" }).click();
    assert.equal(Object.keys(JSON.parse(await page.locator("[data-submission]").textContent())).length, 80);
    evidence.push({ test: "native-form", all80: true, navigationDoesNotSubmit: true });
  } finally { await page.context().close(); }
});

test("native required-field validation reveals and focuses an offpage control", async () => {
  const page = await createPage();
  try {
    await show(page, { standalone: true, provider: "desktop" });
    await page.getByLabel("Campo 40", { exact: true }).focus(); await settle(page);
    await page.getByLabel("Campo 40", { exact: true }).fill("");
    while (!await previous(page).isDisabled()) await previous(page).click();
    await page.getByRole("button", { name: "Enviar pelo rodapé" }).click(); await settle(page);
    assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("name")), "field40");
    await assertFocusedVisible(page);
    assert.equal(await page.locator("[data-submission]").textContent(), "{}");
    evidence.push({ test: "offpage-native-validation", focused: "field40", fullyVisible: true });
  } finally { await page.context().close(); }
});

for (const [name, descriptor, size, expected] of [
  ["tablet", "iPad Pro 11", { width: 768, height: 1024 }, "tablet"],
  ["phone", "iPhone 13", { width: 390, height: 844 }, "phone"],
  ["phone-landscape", "iPhone 13", { width: 844, height: 390 }, "phone"],
]) test(`${name}: fallback outside provider uses one naturally scrolling dialog body; footer remains visible`, async () => {
  const page = await createPage({ ...playwright.devices[descriptor], viewport: size });
  try {
    const trigger = await show(page);
    const m = await geometry(page); assert.equal(m.device, expected); assert.equal(m.mode, "scroll"); assert.equal(m.overflow, "auto"); assertBounded(m, size);
    assert.equal(await next(page).count(), 0);
    const scrollers = await page.locator('[data-slot="dialog-content"]').evaluate(dialog => [dialog, ...dialog.querySelectorAll("*")].filter(node => /auto|scroll/.test(getComputedStyle(node).overflowY) && node.scrollHeight > node.clientHeight + 1).length);
    assert.equal(scrollers, 1, "Exactly one vertical scroll area in dialog");
    await touchScroll(page);
    assert.ok((await geometry(page)).offset > 0, `Natural touch scroll is permitted: ${JSON.stringify(await geometry(page))}`);
    await page.getByLabel("Campo 80", { exact: true }).scrollIntoViewIfNeeded();
    await page.getByLabel("Campo 80", { exact: true }).fill("rascunho-móvel");
    await page.getByRole("button", { name: "Aplicar todos os campos", exact: true }).click();
    const data = JSON.parse(await page.locator("[data-submission]").textContent()); assert.equal(Object.keys(data).length, 80); assert.equal(data.field80, "rascunho-móvel");
    assertBounded(await geometry(page), size);
    await page.keyboard.press("Escape"); await page.locator('[data-slot="dialog-content"]').waitFor({ state: "hidden" }); await settle(page);
    await page.waitForFunction(() => document.activeElement?.getAttribute("aria-label") === "Filtros extensos, 2 ativos");
    assert.ok(await trigger.evaluate(node => node === document.activeElement));
    evidence.push({ test: name, geometry: m, naturalTouchScroll: true, scrollAreas: scrollers, all80: true });
  } finally { await page.context().close(); }
});

test("optional workspace is authoritative; unclassified stays paged; short content has one part", async () => {
  const page = await createPage({ userAgent: "Unknown test agent" });
  try {
    await show(page, { short: true }); const unknown = await geometry(page);
    assert.equal(unknown.device, "unclassified"); assert.equal(unknown.mode, "pages"); assert.equal(unknown.status, "Parte 1 de 1"); assert.ok(await next(page).isDisabled());
    await page.keyboard.press("Escape"); await settle(page);
    await show(page, { provider: "tablet" }); assert.equal((await geometry(page)).mode, "scroll");
    evidence.push({ test: "fallback-and-provider", unclassified: unknown, providerOverride: true });
  } finally { await page.context().close(); }
});

test("no browser runtime errors", () => assert.deepEqual(errors, []));
