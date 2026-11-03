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
const requests = [], errors = [];
before(async () => {
  const root = resolve(".");
  const bundle = await build({ entryPoints: ["tests/legal-text-browser.fixture.tsx"], outfile: "legal-fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", tsconfig: "tsconfig.json", loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent", plugins: [{ name: "legal-next-fixture", setup(builder) {
    builder.onResolve({ filter: /master-data-actions$/ }, () => ({ path: "actions", namespace: "fixture" }));
    builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: "fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "actions" ? 'export async function mutateMasterDataRecord(catalog,id,values){return (await fetch("/fixture-save",{method:"POST",body:JSON.stringify({catalog,id,values})})).json();}export async function setMasterDataRecordActive(){return {};}' : args.path === "next/navigation" ? 'export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push(href){location.assign(href)},refresh(){}});' : 'import React from "react";export default function Adapter({href,scroll,prefetch,priority,...props}){return React.createElement(href?"a":"img",{...props,href})}', resolveDir: root }));
  } }] });
  const globals = await postcss([tailwind({ base: root })]).process(await readFile("src/app/globals.css", "utf8"), { from: resolve("src/app/globals.css") });
  const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).contents;
  const css = globals.css + "\n" + bundle.outputFiles.find(file => file.path.endsWith(".css")).text;
  server = createServer(async (req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); }
    else if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
    else if (req.url === "/fixture-save") { const chunks = []; for await (const chunk of req) chunks.push(chunk); requests.push(JSON.parse(Buffer.concat(chunks).toString())); res.setHeader("Content-Type", "application/json"); res.end(JSON.stringify({ error: "Este texto foi alterado por outra pessoa. Atualize a lista." })); }
    else { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html lang="pt-BR" style="--font-inter:ui-sans-serif,system-ui,sans-serif"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="min-h-full flex flex-col font-sans"><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" }) });
});
after(async () => { await browser?.close(); server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve)); });
async function open(query = "", mobile = false) {
  const page = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 }, ...(mobile ? { isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/145.0.0.0 Mobile Safari/537.36" } : {}) });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/cadastros/textos-juridicos?${query}`); await page.locator("[data-operational-table]").waitFor();
  return page;
}
test("consulta, criação e edição exibem somente as ações permitidas", async () => {
  for (const role of ["read", "create", "edit"]) {
    const page = await open(`role=${role}`);
    try {
      assert.equal(await page.getByRole("button", { name: "Adicionar registro", exact: true }).count(), role === "create" ? 1 : 0);
      assert.equal(await page.getByRole("button", { name: "Editar registro", exact: true }).count(), role === "edit" ? 1 : 0);
      assert.equal(await page.getByRole("button", { name: "Inativar registro", exact: true }).count(), role === "edit" ? 1 : 0);
    } finally { await page.close(); }
  }
});
test("conflito transmite a versão vista e conserva conteúdo digitado no diálogo", async () => {
  const page = await open("role=edit");
  try {
    await page.getByRole("button", { name: "Editar registro", exact: true }).click(); const dialog = page.getByRole("dialog");
    assert.equal(await dialog.getByLabel(/Esfera/).inputValue(), "Consórcio regional");
    await dialog.getByLabel(/Esfera/).selectOption("FEDERAL");
    await dialog.getByLabel(/Conteúdo consolidado/).fill("Minha revisão preservada");
    await dialog.getByRole("button", { name: "Salvar", exact: true }).click(); await dialog.getByRole("alert").waitFor();
    assert.equal(requests.at(-1).values.expectedVersion, "7"); assert.equal(requests.at(-1).values.content, "Minha revisão preservada");
    assert.equal(requests.at(-1).values.governmentLevel, "FEDERAL");
    assert.equal(await dialog.getByLabel(/Conteúdo consolidado/).inputValue(), "Minha revisão preservada");
    assert.match(await dialog.getByRole("alert").textContent(), /outra pessoa/);
  } finally { await page.close(); }
});
test("defaults dos demais catálogos e geometria compartilhada permanecem", async () => {
  const page = await open("legacy=1&role=read");
  try {
    assert.equal(await page.getByRole("button", { name: "Adicionar registro", exact: true }).count(), 1);
    assert.equal(await page.getByRole("button", { name: "Editar registro", exact: true }).count(), 1);
    assert.deepEqual(await page.locator("[data-operational-row]").first().evaluate(row => ({ height: row.getBoundingClientRect().height, font: getComputedStyle(row.querySelector("td")).fontSize })), { height: 24, font: "13px" });
  } finally { await page.close(); }
});
test("consulta móvel mantém tabela dentro do workspace sem erro de execução", async () => {
  const page = await open("role=read", true);
  try { assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.equal(await page.locator("[data-layout-conflict]").count(), 0); }
  finally { await page.close(); }
  assert.deepEqual(errors, []);
});
