import assert from "node:assert/strict";
import { once } from "node:events";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

// Browser dependency is supplied outside this workspace. No Next server/build/ENV/DB.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CENTRAL_UI_PLAYWRIGHT || "C:/Users/thiag/AppData/Local/Temp/opencode/node_modules/playwright");

test("Integrações standalone 1366x650: tabela 13px/24px, paginação, Dialog real de 3 etapas, erros e 90 dias", async () => {
  const bundle = await build({
    entryPoints: ["tests/central-a1-browser.fixture.tsx"], outdir: "central-a1-browser-memory", bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, tsconfig: "tsconfig.json",
    plugins: [{ name: "standalone-next-shell-and-real-tailwind", setup(builder) {
      builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: "next-shell-fixture" }));
      builder.onLoad({ filter: /.*/, namespace: "next-shell-fixture" }, ({ path }) => ({ contents: path.endsWith("navigation") ? 'export const usePathname=()=>"/assinatura-digital/integracoes";export const useSearchParams=()=>new URLSearchParams();' : `import React from "react";export default function Component({children,...props}){return React.createElement("${path.endsWith("link") ? "a" : "img"}",props,children)}`, loader: "js", resolveDir: process.cwd() }));
      builder.onLoad({ filter: /[\\/]src[\\/]app[\\/]globals\.css$/ }, async ({ path }) => ({ contents: (await postcss([tailwind()]).process(await readFile(path, "utf8"), { from: path })).css, loader: "css", resolveDir: process.cwd() }));
    } }],
  });
  const js = bundle.outputFiles.find(f => f.path.endsWith(".js")).text;
  const css = bundle.outputFiles.find(f => f.path.endsWith(".css")).text;
  const calls = [];
  let inventory = Array.from({ length: 21 }, (_, i) => ({ id: `integration-${i}`, kind: "A1_ECPF", alias: `Integração ${i + 1}`, ownerName: "Titular de teste", documentId: "52998224725", certificateId: `certificate-${i}`, active: true, validFrom: "2020-01-01T00:00:00Z", validTo: "2099-01-01T00:00:00Z", credentialReference: "TEST_ONLY" }));
  let rejectSave = true;
  const server = createServer(async (req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); return; }
    if (req.url === "/bundle.css") { res.setHeader("Content-Type", "text/css"); res.end(css); return; }
    if (req.url?.startsWith("/assinatura-digital/integracoes/api")) {
      res.setHeader("Content-Type", "application/json");
      if (req.method === "GET") {
        const id = new URL(req.url, "http://fixture").searchParams.get("id");
        res.end(JSON.stringify(id ? { configuration: { id, kind: "A1_ECPF", alias: "Configuração legada pública", ownerName: "Titular de teste", documentId: "52998224725", active: false, credentialReference: "TEST_ONLY", certificatePem: "PUBLIC-LEAF-ONLY", intermediatePems: ["PUBLIC-INTERMEDIATE-ONLY"], trustedRootPem: "PUBLIC-ROOT-ONLY" } } : { integrations: inventory })); return;
      }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const body = JSON.parse(Buffer.concat(chunks).toString()); calls.push({ method: req.method, body });
      if (req.method === "PATCH") { inventory = inventory.map(r => r.id === body.id ? { ...r, active: false } : r); res.end(JSON.stringify({ success: true })); }
      else if (rejectSave === "invalid-json") { res.statusCode = 502; res.end("NOT-JSON-NEVER-DISPLAY-PRIVATE-SECRET"); }
      else if (rejectSave) { res.statusCode = 400; res.end(JSON.stringify({ error: "Certificado de teste rejeitado: configuração incompleta." })); }
      else res.end(JSON.stringify({ integration: inventory[0] }));
      return;
    }
    res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html><head><link rel="stylesheet" href="/bundle.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  let browser;
  try {
    browser = await chromium.launch({ headless: true, channel: process.env.CENTRAL_UI_BROWSER_CHANNEL || "msedge" });
    const page = await browser.newPage({ viewport: { width: 1366, height: 650 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    const base = `http://127.0.0.1:${server.address().port}`;
    await page.goto(base);
    await page.locator("[data-operational-row]").first().waitFor();
    assert.equal(await page.locator("[data-layout-conflict]").count(), 0);
    assert.equal(await page.locator("[data-operational-row]").count(), 20);
    const metrics = await page.locator("[data-operational-row]").first().evaluate(row => ({ height: row.getBoundingClientRect().height, font: getComputedStyle(row.querySelector("td")).fontSize, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight }));
    assert.equal(metrics.font, "13px"); assert.equal(metrics.height, 24); assert(metrics.documentWidth <= 1366 && metrics.documentHeight <= 650, JSON.stringify(metrics));
    await page.getByRole("button", { name: "Próxima página", exact: true }).click();
    assert.equal(await page.locator("[data-operational-row]").count(), 1);
    await page.getByRole("button", { name: "Primeira página", exact: true }).click();
    await page.getByRole("button", { name: "Cadastrar A1", exact: true }).click();
    const dialog = page.getByRole("dialog");
    async function assertDialogFits(step) {
      await dialog.getByText(new RegExp(`Etapa ${step} de 3`)).waitFor();
      const geometry = await dialog.evaluate(el => {
        const r = el.getBoundingClientRect();
        const controls = [...el.querySelectorAll("input,select,textarea,button")].filter(c => !c.disabled).map(c => { const b = c.getBoundingClientRect(); return { tag: c.tagName, top: b.top, bottom: b.bottom, left: b.left, right: b.right }; });
        return { top: r.top, bottom: r.bottom, left: r.left, right: r.right, overflowY: el.scrollHeight - el.clientHeight, overflowX: el.scrollWidth - el.clientWidth, controls };
      });
      assert(geometry.top >= 0 && geometry.bottom <= 650 && geometry.left >= 0 && geometry.right <= 1366, JSON.stringify(geometry));
      assert(geometry.overflowY <= 1 && geometry.overflowX <= 1, JSON.stringify(geometry));
      assert(geometry.controls.every(c => c.top >= geometry.top && c.bottom <= geometry.bottom && c.left >= geometry.left && c.right <= geometry.right), JSON.stringify(geometry));
      assert(await dialog.evaluate(el => el.contains(document.activeElement)), "foco permanece no Dialog");
    }
    await assertDialogFits(1);
    await dialog.getByLabel("Nome da integração", { exact: true }).fill("Nova integração");
    await dialog.getByLabel("Nome do titular (rótulo)", { exact: true }).fill("Titular fixture");
    await dialog.getByLabel("CPF/CNPJ do titular", { exact: true }).fill("52998224725");
    await dialog.getByLabel("Prefixo ENV (ex.: MUNICIPIO_A1)", { exact: true }).fill("TEST_ONLY");
    await dialog.getByRole("button", { name: "Próxima etapa", exact: true }).click(); await assertDialogFits(2);
    await dialog.locator("textarea").fill("PUBLIC-LEAF-ONLY\n".repeat(80));
    await dialog.getByRole("button", { name: "Voltar", exact: true }).click();
    assert.equal(await dialog.getByLabel("Nome da integração", { exact: true }).inputValue(), "Nova integração");
    await dialog.getByRole("button", { name: "Próxima etapa", exact: true }).click();
    assert.equal(await dialog.locator("textarea").inputValue(), "PUBLIC-LEAF-ONLY\n".repeat(80));
    await dialog.getByRole("button", { name: "Próxima etapa", exact: true }).click(); await assertDialogFits(3);
    await dialog.locator("textarea").first().fill("PUBLIC-INTERMEDIATE-ONLY");
    await dialog.locator("textarea").last().fill("PUBLIC-ROOT-ONLY");
    await dialog.getByLabel("Integração ativa").check();
    await dialog.getByRole("button", { name: "Validar e salvar", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "Certificado de teste rejeitado" }).waitFor(); await assertDialogFits(3);
    assert.equal(calls[0].body.credentialReference, "TEST_ONLY");
    assert.deepEqual(Object.keys(calls[0].body).sort(), ["kind", "alias", "ownerName", "documentId", "credentialReference", "certificatePem", "intermediatePems", "trustedRootPem", "active"].sort());
    rejectSave = "invalid-json";
    await dialog.getByRole("button", { name: "Validar e salvar", exact: true }).click();
    await dialog.getByRole("alert").filter({ hasText: "Não foi possível ler a resposta do servidor" }).waitFor();
    assert(!(await page.locator("body").innerText()).includes("NEVER-DISPLAY-PRIVATE-SECRET"));
    await assertDialogFits(3);
    rejectSave = false;
    await dialog.getByRole("button", { name: "Validar e salvar", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Suspender", exact: true }).first().click();
    await page.getByRole("status").filter({ hasText: "Integração suspensa." }).waitFor();
    assert.deepEqual(calls.at(-1), { method: "PATCH", body: { id: "integration-0", active: false } });
    await page.getByRole("button", { name: "Editar / ativar", exact: true }).first().click(); await assertDialogFits(1);
    assert.equal(await dialog.getByLabel("Nome da integração", { exact: true }).inputValue(), "Configuração legada pública");
    await dialog.getByRole("button", { name: "Próxima etapa", exact: true }).click();
    assert.equal(await dialog.locator("textarea").inputValue(), "PUBLIC-LEAF-ONLY");
    await page.keyboard.press("Escape"); await dialog.waitFor({ state: "hidden" });
    await page.getByRole("button", { name: "Configuração e retenção", exact: true }).click();
    await dialog.getByText(/Arquivos são retidos por 90 dias/).waitFor();
    assert.match(await dialog.innerText(), /não produz PAdES/);
    await page.keyboard.press("Escape");
    await page.goto(`${base}/?readonly`); await page.locator("[data-operational-row]").first().waitFor();
    assert.equal(await page.getByRole("button", { name: "Cadastrar A1", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Suspender", exact: true }).count(), 0);
    assert.equal(await page.getByRole("button", { name: "Editar", exact: true }).count(), 0);
    assert.deepEqual(errors, []);
    console.log("1366x650: 20 rows/page, 13px font, 24px rows; all three Dialog steps and error fit without clipping/scroll; read-only and public DTO controls OK.");
  } finally { await browser?.close(); server.close(); }
});
