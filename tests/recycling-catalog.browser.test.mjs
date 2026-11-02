import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright-core";

let browser, server, origin, rejectSave = true;
const requests = [], errors = [];
before(async () => {
  const root = resolve(".");
  const bundle = await build({ entryPoints: ["tests/recycling-catalog-browser.fixture.tsx"], outfile: "catalog-fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", tsconfig: "tsconfig.json", loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent", plugins: [{ name: "catalog-next-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: "next-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "next-fixture" }, args => ({ contents: args.path === "next/navigation" ? 'export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push(href){location.assign(href)},refresh(){}});' : 'import React from "react";export default function Adapter({href,scroll,prefetch,priority,...props}){return React.createElement(href?"a":"img",{...props,href})}', resolveDir: root }));
  } }] });
  const globals = await postcss([tailwind({ base: root })]).process(await readFile("src/app/globals.css", "utf8"), { from: resolve("src/app/globals.css") });
  const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).contents;
  const css = globals.css + "\n" + bundle.outputFiles.find(file => file.path.endsWith(".css")).text;
  server = createServer(async (req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); }
    else if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
    else if (req.url === "/fixture-save") {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      requests.push(JSON.parse(Buffer.concat(chunks).toString()));
      res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify(rejectSave ? { error: "Falha simulada na gravação." } : { success: true }));
    } else {
      res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html lang="pt-BR" style="--font-inter:ui-sans-serif,system-ui,sans-serif"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="min-h-full flex flex-col font-sans"><div id="root"></div><script src="/fixture.js"></script></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" }) });
});
after(async () => { await browser?.close(); server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve)); });
async function open(query = "", mobile = false) {
  const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/145.0.0.0 Mobile Safari/537.36" } : { viewport: { width: 1366, height: 768 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/meio-ambiente/residuos/cadastros${query}`);
  await page.locator("[data-operational-table]").waitFor();
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  return page;
}
async function fill(dialog, name, value) { const input = dialog.getByLabel(name, { exact: true }); await input.focus(); await input.fill(value); }
test("cinco catálogos usam tabela padrão 13px/24px com última página e dados integrais", async () => {
  for (const catalog of ["units", "types", "materials", "depots", "centers"]) {
    const page = await open(`?catalog=${catalog}`);
    try {
      assert.equal(await page.locator("[data-layout-conflict]").count(), 0);
      assert.equal(await page.locator("[data-operational-row]").count(), 20);
      assert.deepEqual(await page.locator("[data-operational-row]").first().evaluate(row => ({ height: row.getBoundingClientRect().height, font: getComputedStyle(row.querySelector("td")).fontSize })), { height: 24, font: "13px" });
      if (catalog === "units") {
        if (process.env.CF10_UI_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.CF10_UI_SCREENSHOT_DIR, "catalog-desktop.png") });
        await page.getByRole("button", { name: "Ver descrição completo de C01 · Cadastro 01", exact: true }).click();
        await page.waitForFunction(() => { const body = document.querySelector("[data-full-value-body]"); return body && body.textContent !== "Preparando leitura…"; });
        const detail = page.getByRole("dialog"); let complete = "";
        for (;;) {
          complete += await detail.locator("[data-full-value-body]").textContent();
          const next = detail.getByRole("button", { name: "Próximo trecho", exact: true });
          if (await next.isDisabled()) break;
          await next.click();
        }
        assert.equal(complete, "Texto completo para leitura. ".repeat(60).trim());
        await detail.getByRole("button", { name: "Fechar", exact: true }).click(); await detail.waitFor({ state: "hidden" });
      }
      assert.equal(await page.getByRole("columnheader", { name: "Endereço", exact: true }).count(), ["centers", "depots"].includes(catalog) ? 1 : 0);
      await page.getByRole("link", { name: "Próxima página", exact: true }).click(); await page.waitForURL(/page=2/);
      await page.locator("[data-operational-row]").first().waitFor(); assert.equal(await page.locator("[data-operational-row]").count(), 1);
      assert.match(page.url(), new RegExp(`catalog=${catalog}`));
    } finally { await page.close(); }
  }
});
test("busca/filtros reiniciam página, mantêm catálogo e situação e permitem resultado vazio", async () => {
  const page = await open("?catalog=depots&page=2&role=consulta");
  try {
    await page.getByRole("button", { name: /Filtros/ }).click();
    const dialog = page.getByRole("dialog"); await dialog.getByLabel("Situação", { exact: true }).selectOption("Inativo");
    await dialog.getByRole("button", { name: "Aplicar filtros", exact: true }).click(); await page.waitForURL(/situacao=Inativo/);
    assert.equal(new URL(page.url()).searchParams.has("page"), false);
    await page.locator("[data-operational-row]").first().waitFor(); assert.equal(await page.locator("[data-operational-row]").count(), 1);
    await page.getByRole("searchbox", { name: "Buscar cadastro" }).fill("inexistente"); await page.getByRole("button", { name: "Pesquisar", exact: true }).click(); await page.waitForURL(/q=inexistente/);
    await page.getByText("Nenhum cadastro encontrado.", { exact: true }).waitFor();
    assert.match(page.url(), /catalog=depots/); assert.match(page.url(), /situacao=Inativo/);
    assert.equal(await page.getByRole("button", { name: /Novo cadastro|Editar cadastro/ }).count(), 0);
  } finally { await page.close(); }
});
test("edição preserva código, endereço, descrição e inatividade após erro e fechamento", async () => {
  const page = await open("?catalog=centers&page=2&role=editar");
  try {
    assert.equal(await page.getByRole("button", { name: "Novo cadastro", exact: true }).count(), 0);
    await page.getByRole("button", { name: "Editar cadastro C21", exact: true }).click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Código", { exact: true }).getAttribute("readonly"), "");
    assert.equal(await dialog.getByLabel("Ativo", { exact: true }).isChecked(), false);
    await fill(dialog, "Nome", "Centro revisado"); await fill(dialog, "Descrição", "Minha descrição integral"); await fill(dialog, "Endereço", "Rua preservada");
    await dialog.getByRole("button", { name: "Salvar cadastro", exact: true }).click(); await dialog.getByRole("alert").waitFor();
    assert.deepEqual(requests.at(-1), { kind: "centers", mode: "update", code: "C21", name: "Centro revisado", description: "Minha descrição integral", address: "Rua preservada" });
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Editar cadastro C21", exact: true }).click(); await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Descrição", { exact: true }).inputValue(), "Minha descrição integral");
    assert.equal(await dialog.getByLabel("Endereço", { exact: true }).inputValue(), "Rua preservada");
    assert.equal(await dialog.getByLabel("Ativo", { exact: true }).isChecked(), false);
    rejectSave = false; await dialog.getByRole("button", { name: "Salvar cadastro", exact: true }).click(); await dialog.getByRole("status").filter({ hasText: "Cadastro salvo." }).waitFor();
    assert.equal(await dialog.getByLabel("Nome", { exact: true }).inputValue(), "Centro revisado");
  } finally { rejectSave = true; await page.close(); }
});
test("criação e falta de instância respeitam permissões; formulário móvel cabe na tela", async () => {
  const page = await open("?catalog=materials&role=criar", true);
  try {
    assert.equal(await page.getByRole("button", { name: /Editar cadastro/ }).count(), 0);
    await page.getByRole("button", { name: "Novo cadastro", exact: true }).click();
    const dialog = page.getByRole("dialog"); await dialog.waitFor();
    await fill(dialog, "Código", "NOVO"); await fill(dialog, "Nome", "Material novo");
    rejectSave = false; await dialog.getByRole("button", { name: "Salvar cadastro", exact: true }).click(); await dialog.getByRole("status").filter({ hasText: "Cadastro salvo." }).waitFor();
    assert.equal(await dialog.getByLabel("Código", { exact: true }).inputValue(), ""); assert.equal(await dialog.getByLabel("Ativo", { exact: true }).isChecked(), true);
    const bounds = await dialog.evaluate(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right }));
    assert(bounds.top >= 0 && bounds.bottom <= 844 && bounds.left >= 0 && bounds.right <= 390, JSON.stringify(bounds));
    if (process.env.CF10_UI_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.CF10_UI_SCREENSHOT_DIR, "catalog-mobile.png") });
  } finally { rejectSave = true; await page.close(); }
  const unavailable = await open("?available=0");
  try { assert.equal(await unavailable.getByRole("button", { name: /Novo cadastro|Editar cadastro/ }).count(), 0); await unavailable.getByText("Configure a instância municipal para habilitar os cadastros.", { exact: true }).waitFor(); assert.deepEqual(errors, []); } finally { await unavailable.close(); }
});
