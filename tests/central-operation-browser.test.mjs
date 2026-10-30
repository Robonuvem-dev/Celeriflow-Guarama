import assert from "node:assert/strict";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import postcss from "postcss";
import tailwindcss from "@tailwindcss/postcss";
import test from "node:test";
import { build } from "esbuild";

// Instalar Playwright somente em diretório temporário e indicar seu módulo por ENV.
// Não inicia Next, não lê ENV da aplicação e não importa serviços/banco.
const require = createRequire(import.meta.url);
const { chromium } = require(process.env.CENTRAL_UI_PLAYWRIGHT || "playwright");

test("controles reais: retenção de rascunho, multipart sequencial/retry e validação pública", async () => {
  const bundle = await build({ entryPoints: ["tests/central-operation-browser.fixture.tsx"], bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"development"' }, tsconfig: "tsconfig.json" });
  const stylesheet = await postcss([tailwindcss()]).process(await readFile("src/app/globals.css", "utf8"), { from: "src/app/globals.css" });
  const calls = [];
  let active = 0;
  let peak = 0;
  let failSecond = true;
  let validationMode = "valid";
  let validationPayload;
  const downloads = [];
  const record = { id: "record", code: "CFS-test", filename: "original.txt", mimeType: "text/plain", byteLength: 8, hashSha256: "a".repeat(64), documentTypeName: "Contrato", signerName: "Assinador de teste", signerRole: "Servidor", signerDocumentMasked: "***.***.247-**", method: "A1_ECPF", signedAt: "2026-10-29T10:00:00Z", expiresAt: "2027-01-27T10:00:00Z", storageDeletedAt: null, valid: true };
  const server = createServer(async (req, res) => {
    if (req.url === "/bundle.js") { res.setHeader("Content-Type", "application/javascript"); res.end(bundle.outputFiles[0].text); return; }
    if (req.url === "/styles.css") { res.setHeader("Content-Type", "text/css"); res.end(stylesheet.css); return; }
    if (req.url?.startsWith("/api/")) {
      if (req.method === "GET") {
        downloads.push(req.url);
        res.setHeader("Content-Type", req.url.includes("/comprovantes/") ? "application/json" : "text/plain");
        res.end(req.url.includes("/comprovantes/") ? JSON.stringify({ evidence: "stub-only" }) : "ORIGINAL");
        return;
      }
      const chunks = []; for await (const chunk of req) chunks.push(chunk);
      const request = new Request(`http://localhost${req.url}`, { method: req.method, headers: req.headers, body: Buffer.concat(chunks), duplex: "half" });
      const body = await request.formData();
      res.setHeader("Content-Type", "application/json");
      if (req.url.endsWith("/assinar")) {
        active++; peak = Math.max(peak, active);
        const file = body.get("file");
        calls.push({ requestId: body.get("requestId"), name: file.name, bytes: await file.text(), signerId: body.get("signerId"), type: body.get("documentTypeId"), method: body.get("method"), integrationId: body.get("integrationId"), password: body.get("password") });
        await new Promise(resolve => setTimeout(resolve, 80)); active--;
        if (file.name === "two.txt" && failSecond) { res.statusCode = 503; res.end(JSON.stringify({ error: "Falha temporária de teste" })); }
        else res.end(JSON.stringify({ record: { ...record, id: file.name, filename: file.name } }));
      } else {
        validationPayload = { code: body.get("code"), file: body.get("file") ? await body.get("file").text() : null };
        if (validationMode === "unavailable") { res.statusCode = 503; res.end(JSON.stringify({ error: "indisponível" })); }
        else res.end(JSON.stringify({ valid: validationMode === "valid", message: "Resultado de teste", fileCompared: !!body.get("file"), records: [{ ...record, valid: validationMode === "valid" }] }));
      }
      return;
    }
    res.setHeader("Content-Type", "text/html"); res.end('<!doctype html><html><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/styles.css"></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>');
  });
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = `http://127.0.0.1:${server.address().port}`;
  let browser;
  try {
    browser = await chromium.launch({ headless: true, ...(process.env.CENTRAL_UI_BROWSER_CHANNEL ? { channel: process.env.CENTRAL_UI_BROWSER_CHANNEL } : {}) });
    const page = await browser.newPage();
    const errors = []; page.on("pageerror", error => errors.push(error.message));
    await page.goto(base);
    await page.waitForTimeout(300);
    assert.deepEqual(errors, [], "a fixture deve renderizar sem erro de JavaScript");
    assert.equal(await page.getByLabel("Assinador", { exact: true }).inputValue(), "signer");
    const controls = await page.locator("form select").evaluateAll(elements => elements.map(element => element.labels[0].textContent));
    assert.equal(controls[0], "Método");
    for (const width of [768, 1024, 1366, 1920]) {
      await page.setViewportSize({ width, height: 900 });
      assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), `sem rolagem horizontal em ${width}px`);
      const bounds = await page.locator('section[aria-labelledby="assine-title"]').boundingBox();
      assert.ok(bounds.width >= width - 1, `formulário aproveita a largura em ${width}px`);
    }
    assert.ok(await page.getByRole("complementary", { name: "Armazenamento e retenção" }).evaluate(element => parseFloat(getComputedStyle(element).fontSize) < 14));
    await page.getByLabel("Senha do assinador", { exact: true }).fill("senha-pessoal");
    await page.getByLabel("Assinador", { exact: true }).selectOption("inactive");
    assert.match(await page.getByRole("status").innerText(), /inativo/);
    await page.getByLabel("Assinador", { exact: true }).selectOption("expired");
    assert.match(await page.getByRole("status").innerText(), /vencido/);
    await page.getByLabel("Assinador", { exact: true }).selectOption("signer");
    await page.getByLabel("Tipo de documento", { exact: true }).selectOption("type");
    await page.getByLabel("Método", { exact: true }).selectOption("A1_ECPF");
    await page.getByLabel("Integração A1", { exact: true }).selectOption("a1");
    const upload = page.getByLabel("Selecionar arquivos", { exact: true });
    await upload.setInputFiles(Array.from({ length: 21 }, (_, index) => ({ name: `${index}.txt`, mimeType: "text/plain", buffer: Buffer.from("x") })));
    assert.match(await page.getByRole("alert").innerText(), /máximo 20/);
    await upload.setInputFiles(["one.txt", "two.txt"].map(name => ({ name, mimeType: "text/plain", buffer: Buffer.from("ORIGINAL") })));
    assert.equal(await page.getByLabel("Senha do assinador", { exact: true }).count(), 0);
    // Mudanças de controles não desmontam/perdem a lista de arquivos.
    await page.getByLabel("Método", { exact: true }).selectOption("INTERNAL");
    assert.equal(await page.getByLabel("Senha do assinador", { exact: true }).inputValue(), "");
    await page.getByLabel("Método", { exact: true }).selectOption("A1_ECPF");
    await page.getByLabel("Integração A1", { exact: true }).selectOption("a1");
    assert.equal(await page.locator("article").count(), 2);
    await page.getByRole("button", { name: "Assinar lote", exact: true }).click();
    await page.getByText("Falha temporária de teste", { exact: true }).waitFor();
    assert.equal(peak, 1);
    assert.equal(calls.length, 2);
    assert.equal(calls[0].password, null);
    assert.equal(calls[0].signerId, "signer");
    assert.equal(calls[0].type, "type");
    assert.equal(calls[0].method, "A1_ECPF");
    assert.equal(calls[0].integrationId, "a1");
    assert.equal(calls[0].bytes, "ORIGINAL");
    assert.equal(await page.getByLabel("Senha do assinador", { exact: true }).count(), 0);
    assert.equal(await page.locator("article").count(), 2);
    failSecond = false;
    await page.getByRole("button", { name: "Repetir pendentes/falhas", exact: true }).click();
    await page.getByText("2 concluídos · 0 pendentes/falhas · 2 arquivos", { exact: true }).waitFor();
    assert.equal(calls.length, 3);
    assert.equal(calls[1].requestId, calls[2].requestId);
    assert.equal(calls[2].name, "two.txt");
    assert.equal(await page.getByRole("button", { name: "Baixar comprovante JSON destacado", exact: true }).count(), 2);
    const originalDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar original preservado", exact: true }).first().click();
    assert.equal((await originalDownload).suggestedFilename(), "one.txt");
    const evidenceDownload = page.waitForEvent("download");
    await page.getByRole("button", { name: "Baixar comprovante JSON destacado", exact: true }).first().click();
    assert.equal((await evidenceDownload).suggestedFilename(), "comprovante-CFS-test.json");
    assert.deepEqual(downloads, ["/api/assinatura-digital/documentos/one.txt", "/api/assinatura-digital/comprovantes/one.txt"]);

    await page.goto(`${base}/?validation`);
    await page.getByRole("button", { name: "Validar assinatura", exact: true }).click();
    await page.getByRole("heading", { name: "Assinatura válida", exact: true }).waitFor();
    assert.equal(validationPayload.file, null);
    assert.match(await page.getByRole("status").innerText(), /Arquivo não comparado/);
    await page.getByLabel("Código ou URL de validação", { exact: true }).fill("https://outro.example/validar-assinatura?code=CFS-test&next=https://evil.example");
    await page.getByLabel("Arquivo original (máximo 3 MiB)", { exact: true }).setInputFiles({ name: "original.txt", mimeType: "text/plain", buffer: Buffer.from("ORIGINAL") });
    await page.getByRole("button", { name: "Validar assinatura", exact: true }).click();
    await page.getByRole("heading", { name: "Assinatura válida", exact: true }).waitFor();
    assert.deepEqual(validationPayload, { code: "CFS-test", file: "ORIGINAL" });
    assert.match(await page.getByRole("status").innerText(), /Arquivo comparado/);
    assert.match(await page.getByRole("status").innerText(), /\*\*\*\.\*\*\*\.247-\*\*/);
    validationMode = "invalid";
    await page.getByRole("button", { name: "Validar assinatura", exact: true }).click();
    await page.getByRole("heading", { name: "Assinatura inválida", exact: true }).waitFor();
    validationMode = "unavailable";
    await page.getByRole("button", { name: "Validar assinatura", exact: true }).click();
    await page.getByRole("heading", { name: "Validação indisponível", exact: true }).waitFor();
    assert.equal(await page.getByRole("heading", { name: "Assinatura inválida", exact: true }).count(), 0);
    // Retém arquivo e código depois de falha técnica, sem novo upload.
    validationMode = "valid";
    await page.getByRole("button", { name: "Validar assinatura", exact: true }).click();
    await page.getByRole("heading", { name: "Assinatura válida", exact: true }).waitFor();
    assert.equal(validationPayload.file, "ORIGINAL");
    await page.getByLabel("Código ou URL de validação", { exact: true }).fill("");
    await page.getByRole("button", { name: "Validar assinatura", exact: true }).click();
    await page.getByRole("heading", { name: "Assinatura válida", exact: true }).waitFor();
    assert.deepEqual(validationPayload, { code: null, file: "ORIGINAL" });
    assert.deepEqual(errors, []);
  } finally { await browser?.close(); server.close(); }
});
