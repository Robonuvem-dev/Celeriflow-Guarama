import assert from "node:assert/strict";
import { after, before, test } from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { existsSync, readFileSync } from "node:fs";
import { join, resolve } from "node:path";

// Chromium real + componentes/estilos reais. Apenas a fronteira HTTP/actions é substituída.
// Sem Next server, credenciais, banco, build Next ou alterações de dependências.
const require = createRequire(import.meta.url);
const root = resolve(".");
const temp = "C:/Users/thiag/AppData/Local/Temp/opencode";
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? join(temp, "node_modules/playwright-core"));
const requests = [];
const passwords = new Map(Array.from({ length: 80 }, (_, index) => [`signer-${index + 1}`, "senha-fixture"]));
let server, browser, origin, failSave = false;
const errors = [];

before(async () => {
  const { build } = require("esbuild");
  const assets = await build({
    entryPoints: ["tests/signature-central-cadastros-browser.fixture.tsx"], outfile: "cadastros-fixture.js", bundle: true, write: false,
    platform: "browser", format: "iife", jsx: "automatic", tsconfig: "tsconfig.json", loader: { ".module.css": "local-css" },
    define: { "process.env.NODE_ENV": '"production"' }, logLevel: "silent",
    plugins: [{ name: "isolated-cadastros", setup(builder) {
      builder.onResolve({ filter: /^\.\/actions$/ }, args => {
        assert.match(args.importer.replaceAll("\\", "/"), /assinatura-digital\/usuarios\/UsuariosClient.tsx$/);
        return { path: "actions", namespace: "fixture-actions" };
      });
      builder.onLoad({ filter: /.*/, namespace: "fixture-actions" }, () => ({ contents: 'export async function saveSignerAction(input){ const r=await fetch("/test/save",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify(input)}); return r.json(); }' }));
      builder.onResolve({ filter: /^(server-only|.*(?:drizzle|firebase|database)(?:\/.*)?)$/ }, args => { throw new Error(`Importação proibida: ${args.path}`); });
      builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: "next-adapter" }));
      builder.onLoad({ filter: /.*/, namespace: "next-adapter" }, args => ({ contents: args.path === "next/navigation"
        ? 'export const usePathname=()=>"/assinatura-digital/usuarios"; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push(){throw Error("Unexpected navigation")}});'
        : 'import React from "react"; export default function Adapter({href,scroll,prefetch,priority,...p}){return React.createElement(href?"a":"img",{...p,href})}', resolveDir: root }));
    } }],
  });
  const globals = await require("postcss")([require("@tailwindcss/postcss")({ base: root })]).process(readFileSync("src/app/globals.css", "utf8"), { from: join(root, "src/app/globals.css") });
  const js = assets.outputFiles.find(file => file.path.endsWith(".js")).contents;
  const css = globals.css + "\n" + assets.outputFiles.find(file => file.path.endsWith(".css")).text;
  server = createServer(async (request, response) => {
    response.setHeader("Cache-Control", "no-store");
    if (request.url === "/fixture.js") { response.setHeader("Content-Type", "application/javascript"); response.end(js); }
    else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css); }
    else if (request.url === "/test/save") {
      const chunks = []; for await (const chunk of request) chunks.push(chunk);
      const input = JSON.parse(Buffer.concat(chunks).toString()); requests.push(input);
      response.setHeader("Content-Type", "application/json");
      if (failSave) { response.end(JSON.stringify({ error: "Erro de gravação simulado" })); return; }
      const id = input.id ?? `manual-${requests.length}`;
      if (input.password) passwords.set(id, input.password);
      const { password: _password, ...safe } = input; void _password;
      response.end(JSON.stringify({ error: null, signer: { ...safe, id, hasPassword: passwords.has(id) } }));
    } else if (request.url?.startsWith("/api/assinatura-digital/origens")) {
      const kind = new URL(request.url, "http://fixture").searchParams.get("kind");
      response.setHeader("Content-Type", "application/json");
      response.end(JSON.stringify({ origins: Array.from({ length: 20 }, (_, index) => ({ id: `origin-${index + 1}`, kind, name: `Candidato ${index + 1}`, role: "Cargo RH", documentId: "52998224725", phone: "1133334444", mobile: "11999998888", email: "origem@example.org", employeeId: kind === "SERVIDOR" ? `rh-${index + 1}` : null, personId: `person-${index + 1}` })) }));
    } else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width, initial-scale=1"><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
  });
  await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${server.address().port}`;
  const executablePath = [process.env.CHROMIUM_PATH, "C:/Program Files/Google/Chrome/Application/chrome.exe", ...["chromium-1248", "chromium-1243"].map(name => join(process.env.LOCALAPPDATA ?? "", "ms-playwright", name, "chrome-win64/chrome.exe"))].filter(Boolean).find(existsSync);
  browser = await chromium.launch({ headless: true, executablePath });
});
after(async () => { await browser?.close(); server?.closeAllConnections(); if (server) await new Promise(resolve => server.close(resolve)); });

async function settle(page) {
  await page.evaluate(async () => { await document.fonts.ready; await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))); });
  await page.waitForTimeout(60);
}
async function createPage() {
  const page = await browser.newPage({ viewport: { width: 1280, height: 650 }, userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/145.0.0.0 Safari/537.36" });
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(origin); await page.getByRole("button", { name: "Cadastrar usuário", exact: true }).waitFor(); await settle(page);
  return page;
}
async function fill(page, name, value) {
  const input = page.getByRole("dialog").getByLabel(name, { exact: true });
  await input.focus(); await settle(page); await input.fill(value);
}
async function bounded(page) {
  const geometry = await page.getByRole("dialog").evaluate(popup => {
    const rect = node => node.getBoundingClientRect().toJSON();
    const view = popup.querySelector("[data-operational-content-viewport]");
    const footer = popup.querySelector("[data-operational-content-footer]");
    return { popup: rect(popup), view: rect(view), footer: rect(footer), overflow: getComputedStyle(view).overflowY, mode: view.parentElement.dataset.readingMode,
      buttons: [...footer.querySelectorAll("button")].map(rect), documentOverflow: document.documentElement.scrollHeight - innerHeight };
  });
  assert.ok(geometry.popup.y >= 7.5 && geometry.popup.bottom <= 642.5);
  assert.ok(geometry.view.height > 0 && geometry.view.bottom <= geometry.footer.y + .5);
  assert.ok(geometry.footer.bottom <= 642.5);
  for (const button of geometry.buttons) assert.ok(button.y >= 8 && button.bottom <= 642.5 && button.x >= 0 && button.right <= 1280);
  assert.equal(geometry.overflow, "hidden"); assert.equal(geometry.mode, "pages"); assert.ok(geometry.documentOverflow <= 1);
}

test("1280×650: 12 colunas independentes, 13px/24px, estado de senha, tabela medida sem conflito", async () => {
  const page = await createPage();
  try {
    assert.equal(await page.locator("[data-operational-table]").getAttribute("data-fit"), "ready");
    for (const name of ["Nome", "Cargo", "CPF/CNPJ", "Telefone", "Celular", "E-mail", "Origem", "Validade", "Vigência", "Senha", "Situação", "Ações"]) assert.equal(await page.getByRole("columnheader", { name, exact: true }).isVisible(), true);
    const cells = await page.locator("tbody tr").first().locator("td").allTextContents();
    assert.equal(cells[3], "(11) 2222-3333"); assert.equal(cells[4], "(11) 99999-8888"); assert.equal(cells[5], "contato@example.org");
    assert.equal(cells[8], "Vigente"); assert.equal(cells[9], "Definida"); assert.doesNotMatch(cells[7], /Vigente/);
    const measure = await page.locator("tbody tr").first().evaluate(row => ({ height: row.getBoundingClientRect().height, font: getComputedStyle(row.querySelector("td")).fontSize }));
    assert.equal(measure.height, 24); assert.equal(measure.font, "13px");
    await page.getByRole("button", { name: "Última página", exact: true }).click();
    assert.equal(await page.locator("tbody tr").last().locator("td").nth(9).innerText(), "Pendente");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("cidadão manual CPF/CNPJ: formulário único paginado, validação nativa fora da página, envio e limites do popup", async () => {
  const page = await createPage();
  try {
    for (const documentId of ["529.982.247-25", "04.252.011/0001-10"]) {
      await page.getByRole("button", { name: "Cadastrar usuário", exact: true }).click(); await settle(page); await bounded(page);
      const dialog = page.getByRole("dialog");
      assert.equal(await dialog.getByLabel("Origem", { exact: true }).inputValue(), "CIDADAO");
      assert.equal(await dialog.getByLabel("Modo de cadastro", { exact: true }).inputValue(), "MANUAL");
      await page.evaluate(() => { window.__cadastroNodes = [...document.querySelectorAll('[role="dialog"] input')]; });
      const before = requests.length;
      // Submit while the first required control is outside the current reading window.
      while (!await dialog.getByRole("button", { name: "Próxima parte", exact: true }).isDisabled()) await dialog.getByRole("button", { name: "Próxima parte", exact: true }).click();
      await dialog.getByRole("button", { name: "Salvar usuário", exact: true }).click(); await settle(page);
      assert.equal(requests.length, before);
      assert.equal(await page.evaluate(() => document.activeElement?.getAttribute("name")), "name");
      await fill(page, "Nome", "Cidadão manual"); await fill(page, "Cargo", "Representante"); await fill(page, "CPF/CNPJ", documentId);
      await fill(page, "Telefone", "1133334444"); await fill(page, "Celular", "11999998888"); await fill(page, "E-mail", "manual@example.org");
      await fill(page, "Validade", "2099-10-29T12:34:56.123"); await fill(page, "Senha inicial", "senha-manual-123");
      await bounded(page);
      assert.ok(await page.evaluate(() => window.__cadastroNodes.every(node => node.isConnected && !node.disabled)));
      await dialog.getByRole("button", { name: "Salvar usuário", exact: true }).click(); await dialog.waitFor({ state: "hidden" });
      const saved = requests.at(-1);
      assert.equal(saved.documentId, documentId); assert.equal(saved.kind, "CIDADAO"); assert.equal(saved.personId, null); assert.equal(saved.employeeId, null);
      assert.equal(saved.name, "Cidadão manual"); assert.equal(saved.phone, "1133334444"); assert.equal(saved.email, "manual@example.org"); assert.equal(saved.password, "senha-manual-123");
    }
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});

test("edição: erro mantém binding/rascunho entre registros e páginas; senha vazia preserva a anterior", async () => {
  const page = await createPage();
  try {
    await page.getByRole("button", { name: "Editar Pessoa 01", exact: true }).click();
    await fill(page, "Nome", "Rascunho pessoa 01"); await fill(page, "Telefone", "(11) 3333-4444");
    failSave = true;
    await page.getByRole("button", { name: "Salvar usuário", exact: true }).click();
    await page.getByRole("alert").filter({ hasText: "Erro de gravação simulado" }).waitFor(); await bounded(page);
    await page.getByRole("button", { name: "Fechar e manter rascunho", exact: true }).click();
    await page.getByRole("button", { name: "Última página", exact: true }).click();
    await page.getByRole("button", { name: "Editar Pessoa 80", exact: true }).click(); await fill(page, "Nome", "Rascunho pessoa 80");
    await page.getByRole("button", { name: "Fechar e manter rascunho", exact: true }).click();
    await page.getByRole("button", { name: "Primeira página", exact: true }).click();
    await page.getByRole("button", { name: "Editar Pessoa 01", exact: true }).click();
    assert.equal(await page.getByRole("dialog").getByLabel("Nome", { exact: true }).inputValue(), "Rascunho pessoa 01");
    assert.equal(await page.getByRole("dialog").getByLabel("Telefone", { exact: true }).inputValue(), "(11) 3333-4444");
    assert.equal(await page.getByLabel("Nova senha (opcional)", { exact: true }).inputValue(), "");
    failSave = false;
    await page.getByRole("button", { name: "Salvar usuário", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(requests.at(-1).id, "signer-1"); assert.equal(requests.at(-1).password, ""); assert.equal(passwords.get("signer-1"), "senha-fixture");
    await page.getByRole("button", { name: "Última página", exact: true }).click();
    await page.getByRole("button", { name: "Editar Pessoa 80", exact: true }).click();
    assert.equal(await page.getByRole("dialog").getByLabel("Nome", { exact: true }).inputValue(), "Rascunho pessoa 80");
    assert.deepEqual(errors, []);
  } finally { failSave = false; await page.close(); }
});

test("importação opcional e RH obrigatório: 20 candidatos acessíveis no select; troca para manual limpa vínculos", async () => {
  const page = await createPage();
  try {
    await page.getByRole("button", { name: "Cadastrar usuário", exact: true }).click();
    await page.getByRole("dialog").getByLabel("Origem", { exact: true }).selectOption("SERVIDOR");
    await fill(page, "Buscar servidor no RH", "Ca");
    const select = page.getByLabel("Candidatos da origem", { exact: true });
    await select.waitFor(); assert.equal(await select.locator("option").count(), 21);
    await select.focus(); await settle(page); await select.selectOption("origin-20");
    assert.equal(await page.getByRole("dialog").getByLabel("Nome", { exact: true }).inputValue(), "Candidato 20");
    await page.getByRole("dialog").getByLabel("Origem", { exact: true }).focus(); await settle(page); await page.getByRole("dialog").getByLabel("Origem", { exact: true }).selectOption("CIDADAO");
    assert.equal(await page.getByLabel("Modo de cadastro", { exact: true }).inputValue(), "MANUAL");
    assert.equal(await page.getByText("Origem selecionada:", { exact: false }).count(), 0);
    await page.getByLabel("Modo de cadastro", { exact: true }).selectOption("IMPORT");
    await fill(page, "Buscar pessoa cadastrada", "Ca"); await select.waitFor(); await select.focus(); await settle(page); await select.selectOption("origin-20");
    await page.getByLabel("Modo de cadastro", { exact: true }).focus(); await settle(page); await page.getByLabel("Modo de cadastro", { exact: true }).selectOption("MANUAL");
    await fill(page, "Validade", "2099-10-29T12:34"); await fill(page, "Senha inicial", "senha-manual-123");
    await page.getByRole("button", { name: "Salvar usuário", exact: true }).click(); await page.getByRole("dialog").waitFor({ state: "hidden" });
    assert.equal(requests.at(-1).employeeId, null); assert.equal(requests.at(-1).personId, null); assert.equal(requests.at(-1).name, "Candidato 20");
    assert.deepEqual(errors, []);
  } finally { await page.close(); }
});
