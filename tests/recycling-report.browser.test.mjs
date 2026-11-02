import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright-core";

let browser, server, origin;
const errors = [];
before(async () => {
  const root = resolve(".");
  const bundle = await build({ entryPoints: ["tests/recycling-report-browser.fixture.tsx"], outfile: "report-fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", tsconfig: "tsconfig.json", loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent", plugins: [{ name: "report-next-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: "next-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "next-fixture" }, args => ({ contents: args.path === "next/navigation" ? 'export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push(href){location.assign(href)},refresh(){}});' : 'import React from "react";export default function Adapter({href,scroll,prefetch,priority,...props}){return React.createElement(href?"a":"img",{...props,href})}', resolveDir: root }));
  } }] });
  const globals = await postcss([tailwind({ base: root })]).process(await readFile("src/app/globals.css", "utf8"), { from: resolve("src/app/globals.css") });
  const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).contents;
  const css = globals.css + "\n" + bundle.outputFiles.find(file => file.path.endsWith(".css")).text;
  server = createServer((req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); }
    else if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html lang="pt-BR" style="--font-inter:ui-sans-serif,system-ui,sans-serif"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="min-h-full flex flex-col font-sans"><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" }) });
});
after(async () => { await browser?.close(); server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve)); });
async function open(query = "", mobile = false) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 }, ...(mobile ? { isMobile: true, hasTouch: true } : {}) });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/meio-ambiente/residuos/relatorios?${query}`);
  await page.locator("[data-operational-table]").waitFor();
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  return page;
}
test("four report views preserve shared table geometry, filters and complete export URLs", async () => {
  for (const view of ["general", "depots", "sales", "monthly"]) {
    const page = await open(`view=${view}&typeCode=T1&depotCode=D1`);
    try {
      assert.equal(await page.locator("[data-layout-conflict]").count(), 0);
      assert.equal(await page.locator("[data-operational-row]").count(), 20);
      assert.deepEqual(await page.locator("[data-operational-row]").first().evaluate(row => ({ height: row.getBoundingClientRect().height, font: getComputedStyle(row.querySelector("td")).fontSize })), { height: 24, font: "13px" });
      await page.getByRole("link", { name: "Próxima página", exact: true }).click(); await page.waitForURL(/page=2/);
      assert.equal(await page.locator("[data-operational-row]").count(), 1);
      for (const name of ["Exportar CSV completo", "Exportar Excel completo", "Imprimir relatório completo"]) {
        const url = new URL(await page.getByRole("link", { name, exact: true }).getAttribute("href"), origin);
        assert.equal(url.searchParams.get("view"), view); assert.equal(url.searchParams.get("typeCode"), "T1"); assert.equal(url.searchParams.get("depotCode"), "D1"); assert.equal(url.searchParams.has("page"), false);
      }
    } finally { await page.close(); }
  }
});
test("filter submission preserves the report, combines filters and resets pagination", async () => {
  const page = await open("view=depots&page=2");
  try {
    await page.getByRole("button", { name: /Filtros/ }).click();
    const dialog = page.getByRole("dialog");
    await dialog.getByLabel("Tipo de material", { exact: true }).selectOption("T1");
    await dialog.getByLabel("Material", { exact: true }).selectOption("M1");
    await dialog.getByLabel("Depósito", { exact: true }).selectOption("D1");
    await dialog.getByLabel("Ordenação", { exact: true }).selectOption("description");
    await dialog.getByRole("button", { name: "Aplicar filtros", exact: true }).click();
    await page.waitForURL(/order=description/);
    const query = new URL(page.url()).searchParams;
    assert.equal(query.get("view"), "depots"); assert.equal(query.has("page"), false);
    assert.equal(query.get("typeCode"), "T1"); assert.equal(query.get("materialCode"), "M1"); assert.equal(query.get("depotCode"), "D1");
    assert.equal(query.get("from"), "2026-01-01"); assert.equal(query.get("to"), "2026-03-31");
  } finally { await page.close(); }
});
test("sales and monthly charts display exact values and finite zero bars", async () => {
  for (const view of ["sales", "monthly"]) {
    const page = await open(`view=${view}`);
    try {
      await page.getByRole("button", { name: view === "monthly" ? "Gráfico mensal de vendas" : "Gráfico de vendas por tipo", exact: true }).click();
      const figure = page.getByRole("figure");
      assert.match(await figure.textContent(), /9007199254740993,01/);
      const widths = await figure.locator('[aria-hidden="true"] > div').evaluateAll(nodes => nodes.map(node => node.style.width));
      assert(widths.includes("100%")); assert(widths.includes("0%")); assert(widths.every(width => !/NaN|Infinity/.test(width)));
    } finally { await page.close(); }
  }
});
test("mobile report and dialogs remain inside the viewport without changing table style", async () => {
  const page = await open("view=monthly", true);
  try {
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true);
    await page.getByRole("button", { name: "Totais do filtro", exact: true }).click();
    const dialog = page.getByRole("dialog"); assert.match(await dialog.textContent(), /180143985094819860,20/);
    assert.equal(await dialog.evaluate(node => { const r = node.getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.top >= 0 && r.bottom <= innerHeight; }), true);
  } finally { await page.close(); }
  assert.deepEqual(errors, []);
});
