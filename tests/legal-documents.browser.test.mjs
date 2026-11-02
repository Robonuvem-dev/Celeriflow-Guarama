import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { createServer } from "node:http";
import { after, before, test } from "node:test";
import { resolve } from "node:path";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";
import { chromium } from "playwright-core";
let browser, server, origin, reject = false;
const requests = [], errors = [];
before(async () => {
  const root = resolve(".");
  const bundle = await build({ entryPoints: ["tests/legal-documents-browser.fixture.tsx"], outfile: "fixture.js", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", tsconfig: "tsconfig.json", loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent", plugins: [{ name: "next-fixture", setup(b) {
    b.onResolve({ filter: /^next\/(link|image|navigation)$/ }, a => ({ path: a.path, namespace: "fixture" }));
    b.onLoad({ filter: /.*/, namespace: "fixture" }, a => ({ contents: a.path === "next/navigation" ? 'export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);export const useRouter=()=>({push(href){location.assign(href)},refresh(){}});' : 'import React from "react";export default function Adapter({href,scroll,prefetch,priority,...p}){return React.createElement(href?"a":"img",{...p,href})}', resolveDir: root }));
  } }] });
  const globals = await postcss([tailwind({ base: root })]).process(await readFile("src/app/globals.css", "utf8"), { from: resolve("src/app/globals.css") });
  const js = bundle.outputFiles.find(f => f.path.endsWith(".js")).contents, css = globals.css + bundle.outputFiles.find(f => f.path.endsWith(".css")).text;
  server = createServer(async (req, res) => {
    if (req.url === "/fixture.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); }
    else if (req.url === "/fixture.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
    else if (req.url.startsWith("/api/cadastros/")) {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "POST") { const chunks = []; for await (const c of req) chunks.push(c); requests.push(JSON.parse(Buffer.concat(chunks).toString())); res.statusCode = reject ? 409 : 200; res.end(JSON.stringify(reject ? { error: "A norma foi alterada. Atualize a lista." } : { id: "link" })); return; }
      const q = new URL(req.url, "http://fixture").searchParams, page = q.get("page") === "2" ? 2 : 1;
      const rows = Array.from({ length: 21 }, (_, i) => ({ id: `link-${i}`, filename: `arquivo-${i}.pdf`, role: i ? "ATTACHMENT" : "ORIGINAL", versionNumber: 1, hash: "a".repeat(64) }));
      const documents = rows.map((r, i) => ({ ...r, id: `doc-${i}`, versionId: `v-${i}`, versionStatus: i === 1 ? "DRAFT" : "FINAL", hashSha256: r.hash, checkoutOwnerId: null }));
      res.end(JSON.stringify({ legal: { id: "legal", type: "Lei", number: "1", summary: "Fixture" }, version: { id: "lv", number: Number(q.get("version")) || 3 }, currentVersion: 3, linked: { rows: rows.slice((page - 1) * 20, page * 20), total: 21, page }, available: { documents: documents.slice((page - 1) * 20, page * 20), total: 21, page } }));
    } else { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html lang="pt-BR" style="--font-inter:ui-sans-serif,system-ui,sans-serif"><head><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body class="min-h-full flex flex-col font-sans"><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(r => server.listen(0, "127.0.0.1", r)); origin = `http://127.0.0.1:${server.address().port}`;
  browser = await chromium.launch({ headless: true, ...(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : { channel: "chrome" }) });
});
after(async () => { await browser?.close(); server?.closeAllConnections(); if (server) await new Promise(r => server.close(r)); });
async function open(query = "", mobile = false) { const p = await browser.newPage({ viewport: mobile ? { width: 390, height: 844 } : { width: 1366, height: 768 }, ...(mobile ? { isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 13) AppleWebKit/537.36 Chrome/145.0.0.0 Mobile Safari/537.36" } : {}) }); p.on("pageerror", e => errors.push(e.message)); await p.goto(`${origin}/cadastros/textos-juridicos/documentos?legalTextId=legal&${query}`); await p.locator("[data-operational-row]").first().waitFor(); return p; }
test("vínculos usam tabela padrão, paginação 20/1 e download associado à versão jurídica", async () => {
  const p = await open(); try {
    assert.equal(await p.locator("[data-operational-row]").count(), 20);
    assert.deepEqual(await p.locator("[data-operational-row]").first().evaluate(r => ({ height: r.getBoundingClientRect().height, font: getComputedStyle(r.querySelector("td")).fontSize })), { height: 24, font: "13px" });
    const url = new URL(await p.getByRole("link", { name: "Baixar arquivo-0.pdf", exact: true }).getAttribute("href"), origin); assert.equal(url.searchParams.get("version"), "3"); assert.equal(url.searchParams.get("download"), "link-0");
    await p.getByRole("link", { name: "Próxima página", exact: true }).click(); await p.waitForURL(/page=2/); await p.locator("[data-operational-row]").first().waitFor(); assert.equal(await p.locator("[data-operational-row]").count(), 1);
  } finally { await p.close(); }
});
test("seleção envia IDs/versões exatos e erro de conflito permanece visível", async () => {
  const p = await open("view=available"); try {
    assert.equal(await p.getByRole("button", { name: "Vincular original arquivo-1.pdf", exact: true }).isDisabled(), true);
    reject = true; await p.getByRole("button", { name: "Vincular anexo arquivo-0.pdf", exact: true }).click(); await p.getByRole("alert").waitFor();
    assert.deepEqual(requests.at(-1), { legalTextId: "legal", legalTextVersionId: "lv", expectedVersion: 3, documentId: "doc-0", documentVersionId: "v-0", role: "ATTACHMENT" }); assert.match(await p.getByRole("alert").textContent(), /alterada/);
  } finally { reject = false; await p.close(); }
});
test("consulta e versão jurídica histórica não oferecem alteração de vínculos", async () => {
  for (const query of ["view=available&role=read", "view=available&version=2"]) { const p = await open(query); try { assert.equal(await p.getByRole("button", { name: /^Vincular / }).count(), 0); } finally { await p.close(); } }
});
test("consulta móvel preserva o workspace sem erro de execução", async () => {
  const p = await open("role=read", true); try { assert.equal(await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true); assert.equal(await p.locator("[data-layout-conflict]").count(), 0); } finally { await p.close(); } assert.deepEqual(errors, []);
});
