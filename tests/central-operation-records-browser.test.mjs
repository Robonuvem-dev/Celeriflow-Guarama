import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { build } from "esbuild";
import postcss from "postcss";
import tailwind from "@tailwindcss/postcss";

const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CENTRAL_UI_PLAYWRIGHT || "playwright");

test("RecordActions 1280×650: paginação desktop, CPF/CNPJ longos, hash integral e recibo expirado", async () => {
  const bundle = await build({ entryPoints: ["tests/central-operation-records-browser.fixture.tsx"], bundle: true, write: false, outdir: "unused-in-memory", platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, tsconfig: "tsconfig.json" });
  // CSS real do módulo + utilitários reais usados pelo popup, sem mock de layout.
  const utilities = await postcss([tailwind()]).process('@import "tailwindcss" source(none); @source "../src/app/app-domain/assinatura-digital/registros/RecordActions.tsx"; @source "../src/components/ui/dialog.tsx";', { from: "tests/central-operation-records.css" });
  const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).text;
  const css = utilities.css + bundle.outputFiles.find(file => file.path.endsWith(".css")).text;
  const calls = [];
  const receipt = { record: { id: "expired-record", code: "01234567-89ab-4def-8123-0123456789ab", expiresAt: "2020-03-31T12:00:00Z", storageDeletedAt: "2020-04-01T12:00:00Z" }, evidence: { kind: "INTERNAL", envelope: { file: { hashSha256: "0123456789abcdef".repeat(4) } } }, verified: true, format: "detached-evidence-v1" };
  const server = createServer((req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "application/javascript"); res.end(js); }
    else if (req.url === "/style.css") { res.setHeader("Content-Type", "text/css"); res.end(css); }
    else if (req.url?.startsWith("/api/")) {
      calls.push({ url: req.url, method: req.method });
      res.setHeader("Content-Type", "application/json"); res.setHeader("Cache-Control", "no-store"); res.end(JSON.stringify(receipt));
    } else { res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html><head><link rel="stylesheet" href="/style.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>'); }
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CENTRAL_UI_BROWSER_CHANNEL ? { channel: process.env.CENTRAL_UI_BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage({ viewport: { width: 1280, height: 650 } });
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    for (const document of ["cpf", "cnpj"]) {
      await page.goto(`http://127.0.0.1:${server.address().port}/?${document}`);
      const trigger = page.getByRole("button", { name: /^Detalhes e downloads/ });
      await trigger.click();
      const dialog = page.getByRole("dialog");
      await dialog.waitFor();
      await page.waitForTimeout(150);
      assert.equal(await dialog.locator("[data-operational-paged-content]").getAttribute("data-reading-mode"), "pages");
      const viewport = dialog.locator("[data-operational-content-viewport]");
      const footer = dialog.locator("[data-operational-content-footer]");
      const expectedDocument = document === "cpf" ? "529.982.247-25" : "12.345.678/0001-95";
      const expectedHash = "0123456789abcdef".repeat(4);
      assert.equal(await dialog.locator("dd").filter({ hasText: expectedHash }).innerText(), expectedHash);
      assert.equal(await dialog.locator("dd").filter({ hasText: expectedDocument }).innerText(), expectedDocument);
      assert.equal(await dialog.getByRole("button", { name: "Baixar original", exact: true }).isDisabled(), true);
      const seen = new Set();
      for (let part = 0; part < 30; part++) {
        const layout = await dialog.evaluate(element => {
          const viewport = element.querySelector("[data-operational-content-viewport]");
          const footer = element.querySelector("[data-operational-content-footer]");
          const bounds = viewport.getBoundingClientRect();
          return { top: element.getBoundingClientRect().top, bottom: element.getBoundingClientRect().bottom, overflow: getComputedStyle(element).overflowY, rootOverflow: document.documentElement.scrollHeight > innerHeight, viewportOverflow: getComputedStyle(viewport).overflowY, footerTop: footer.getBoundingClientRect().top, footerBottom: footer.getBoundingClientRect().bottom, visible: [...viewport.querySelectorAll("dd")].filter(field => field.getBoundingClientRect().top >= bounds.top && field.getBoundingClientRect().bottom <= bounds.bottom).map(field => field.textContent) };
        });
        assert.ok(layout.top >= 0 && layout.bottom <= 650, JSON.stringify(layout));
        assert.equal(layout.overflow, "hidden"); assert.equal(layout.viewportOverflow, "hidden"); assert.equal(layout.rootOverflow, false);
        assert.ok(layout.footerTop > 0 && layout.footerBottom <= 650);
        layout.visible.forEach(value => seen.add(value));
        for (const name of ["Comprovante JSON", "Fechar"]) {
          const box = await footer.getByRole("button", { name, exact: true }).boundingBox();
          assert.ok(box.y >= 0 && box.y + box.height <= 650);
        }
        assert.equal(await footer.getByRole("link", { name: "Validar", exact: true }).count(), 1);
        const next = dialog.getByRole("button", { name: "Próxima parte", exact: true });
        if (await next.isDisabled()) break;
        await next.click();
      }
      assert.ok(seen.has(expectedHash), "hash integral alcançável em uma parte");
      assert.ok(seen.has(expectedDocument), "CPF/CNPJ alcançável em uma parte");
      assert.ok([...seen].some(value => value.includes("Nome completo do assinador")), "nome longo preservado e alcançável");
      const beforeWheel = await viewport.evaluate(element => element.scrollTop);
      await viewport.hover(); await page.mouse.wheel(0, -200);
      assert.equal(await viewport.evaluate(element => element.scrollTop), beforeWheel);
      const downloading = page.waitForEvent("download");
      await footer.getByRole("button", { name: "Comprovante JSON", exact: true }).click();
      const download = await downloading;
      assert.equal(await download.failure(), null);
      assert.equal(download.suggestedFilename(), `comprovante-${receipt.record.code}.json`);
      const downloadedReceipt = JSON.parse(await readFile(await download.path(), "utf8"));
      assert.deepEqual(downloadedReceipt, receipt);
      assert.equal(downloadedReceipt.record.expiresAt, "2020-03-31T12:00:00Z");
      assert.equal(downloadedReceipt.verified, true);
      assert.equal(await dialog.getByRole("alert").count(), 0);
      await footer.getByRole("button", { name: "Fechar", exact: true }).click();
      await dialog.waitFor({ state: "hidden" });
      assert.equal(await trigger.evaluate(element => element === document.activeElement), true);
    }
    assert.deepEqual(calls, Array.from({ length: 2 }, () => ({ url: "/api/assinatura-digital/comprovantes/expired-record", method: "GET" })));
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); server.close(); }
});
