import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright-core";

// Componentes/CSS reais; apenas navegação Next e gravação substituídas pela fixture.
// Não usa sessão, credenciais, dados de usuário ou banco da aplicação.
let server, browser, origin;
const requests = [], errors = [];
let rejectSave = true;
before(async () => {
  const root = resolve(".");
  const assets = await build({
    entryPoints: ["tests/recycling-stock-browser.fixture.tsx"], outfile: "recycling-fixture.js", bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", tsconfig: "tsconfig.json", loader: { ".module.css": "local-css" },
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
    plugins: [{ name: "isolated-recycling", setup(builder) {
      builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: "next-fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "next-fixture" }, args => ({ contents: args.path === "next/navigation"
        ? 'export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push(href){location.assign(href)},refresh(){}});'
        : 'import React from "react";export default function Adapter({href,scroll,prefetch,priority,...props}){return React.createElement(href?"a":"img",{...props,href})}', resolveDir: root }));
    } }],
  });
  const globals = await postcss([tailwind({ base: root })]).process(await readFile("src/app/globals.css", "utf8"), { from: resolve("src/app/globals.css") });
  const js = assets.outputFiles.find(file => file.path.endsWith(".js")).contents;
  const css = globals.css + "\n" + assets.outputFiles.find(file => file.path.endsWith(".css")).text;
  server = createServer(async (req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); }
    else if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
    else if (req.url === "/fixture-record") {
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      requests.push(JSON.parse(Buffer.concat(chunks).toString()));
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(rejectSave ? { error: "Saldo insuficiente na fixture." } : { success: true }));
    } else {
      res.setHeader("Content-Type", "text/html");
      // A fonte Inter é carregada pelo layout Next em produção; a fixture usa o fallback do mesmo token.
      res.end('<!doctype html><html lang="pt-BR" style="--font-inter:ui-sans-serif,system-ui,sans-serif"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="min-h-full flex flex-col font-sans"><div id="root"></div><script src="/fixture.js"></script></body></html>');
    }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" }) });
});
after(async () => { await browser?.close(); server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve)); });
async function open(query = "", mobile = false) {
  const page = await browser.newPage(mobile ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/145.0.0.0 Mobile Safari/537.36" } : { viewport: { width: 1366, height: 768 } });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/meio-ambiente/residuos/estoque${query}`);
  await page.locator("[data-operational-row]").first().waitFor();
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  return page;
}
async function fill(dialog, name, value) { const control = dialog.getByLabel(name, { exact: true }); await control.focus(); await control.fill(value); }
test("desktop: tabela padrão, 20/1 registros e troca de visão preservando páginas", async () => {
  const page = await open("?consulta=1");
  try {
    assert.equal(await page.locator("[data-layout-conflict]").count(), 0);
    assert.equal(await page.locator("[data-operational-row]").count(), 20);
    const metrics = await page.locator("[data-operational-row]").first().evaluate(row => ({ height: row.getBoundingClientRect().height, font: getComputedStyle(row.querySelector("td")).fontSize }));
    assert.deepEqual(metrics, { height: 24, font: "13px" });
    assert.doesNotMatch(await page.locator("[data-operational-row] td").first().evaluate(cell => getComputedStyle(cell).fontFamily), /Times New Roman/);
    if (process.env.CF10_UI_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.CF10_UI_SCREENSHOT_DIR, "stock-desktop.png") });
    assert.equal(await page.getByRole("button", { name: /Registrar entrada|Registrar saída/ }).count(), 0);
    // A query de consulta pertence apenas à fixture; a página produtiva resolve permissão no servidor.
    await page.getByRole("link", { name: "Próxima página", exact: true }).click();
    await page.waitForURL(/estoquePagina=2/);
    assert.equal(await page.locator("[data-operational-row]").count(), 1);
    await page.getByRole("link", { name: "Histórico", exact: true }).click();
    await page.waitForURL(/visao=historico/);
    assert.match(page.url(), /estoquePagina=2/);
    await page.locator("[data-operational-row]").first().waitFor();
    assert.equal(await page.locator("[data-operational-row]").count(), 20);
    assert.equal(await page.locator("[data-layout-conflict]").count(), 0);
    assert.equal(await page.locator("[data-operational-row]").first().evaluate(row => row.getBoundingClientRect().height), 24);
  } finally { await page.close(); }
});
test("saída: destino ativo, precisão, erro preserva dados/chave e sucesso inicia nova requisição", async () => {
  const page = await open();
  try {
    assert.equal(await page.locator("[data-operational-row]").first().evaluate(row => row.getBoundingClientRect().height), 24);
    await page.getByRole("button", { name: "Registrar saída", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.equal(await dialog.locator('option[value="OLD"]').count(), 0);
    await dialog.getByLabel("Centro de reciclagem ou destinação", { exact: true }).selectOption("DEST");
    await fill(dialog, "Quantidade (kg)", "1,025");
    await fill(dialog, "Valor total obtido (R$)", "9999999999999,90");
    await fill(dialog, "Observações", "Conservar meu rascunho");
    const key = await dialog.locator('[name="idempotencyKey"]').inputValue();
    await dialog.getByRole("button", { name: "Registrar saída", exact: true }).click();
    await dialog.getByRole("alert").waitFor();
    assert.equal(requests.at(-1).idempotencyKey, key);
    assert.equal(requests.at(-1).quantity, "1,025");
    assert.equal(requests.at(-1).amount, "9999999999999,90");
    await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
    await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Registrar saída", exact: true }).first().click();
    await dialog.waitFor();
    assert.equal(await dialog.getByLabel("Observações", { exact: true }).inputValue(), "Conservar meu rascunho");
    assert.equal(await dialog.locator('[name="idempotencyKey"]').inputValue(), key);
    rejectSave = false;
    await dialog.getByRole("button", { name: "Registrar saída", exact: true }).click();
    await dialog.getByRole("status").filter({ hasText: "Movimentação registrada." }).waitFor();
    assert.notEqual(await dialog.locator('[name="idempotencyKey"]').inputValue(), key);
    assert.equal(await dialog.getByLabel("Quantidade (kg)", { exact: true }).inputValue(), "");
  } finally { rejectSave = true; await page.close(); }
});
test("histórico: detalhes preservam nomes/receita e exibem observações como texto", async () => {
  const page = await open("?visao=historico&consulta=1");
  try {
    await page.getByRole("button", { name: "Detalhes da movimentação de Papel em 01/11/2026", exact: true }).first().click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    assert.match(await dialog.innerText(), /Centro ativo · Local/);
    assert.match(await dialog.innerText(), /R\$ 9999999999999,90/);
    assert.match(await dialog.innerText(), /<script>não executar<\/script>/);
    assert.equal(await dialog.locator("script").count(), 0);
  } finally { await page.close(); }
});
test("celular: tabela com rolagem e formulário de entrada limitado à tela", async () => {
  const page = await open("", true);
  try {
    assert.equal(await page.locator("[data-layout-conflict]").count(), 0);
    await page.getByRole("button", { name: "Registrar entrada", exact: true }).click();
    const dialog = page.getByRole("dialog");
    await dialog.waitFor();
    const geometry = await dialog.evaluate(el => ({ top: el.getBoundingClientRect().top, bottom: el.getBoundingClientRect().bottom, left: el.getBoundingClientRect().left, right: el.getBoundingClientRect().right, mode: el.querySelector("[data-reading-mode]").getAttribute("data-reading-mode") }));
    assert(geometry.top >= 0 && geometry.bottom <= 844 && geometry.left >= 0 && geometry.right <= 390, JSON.stringify(geometry));
    assert.equal(geometry.mode, "scroll");
    if (process.env.CF10_UI_SCREENSHOT_DIR) await page.screenshot({ path: resolve(process.env.CF10_UI_SCREENSHOT_DIR, "stock-mobile-entry.png") });
    assert.equal(await dialog.getByLabel("Material", { exact: true }).count(), 1);
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
