// Isolated Chromium regression: actual Compras/Bidding UI, controlled draft, no Next server/actions/DB.
// node --test src/app/app-domain/compras/_tests/editable-search.browser.test.mjs
import assert from "node:assert/strict";
import test from "node:test";
import { createServer } from "node:http";
import { createRequire } from "node:module";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../..");
const require = createRequire(join(root, "package.json"));
const temp = join(process.env.LOCALAPPDATA ?? "C:/Users/thiag/AppData/Local", "Temp/opencode");
const { build } = require("esbuild");
const { chromium } = require(process.env.PLAYWRIGHT_MODULE_PATH ?? join(temp, "node_modules/playwright-core"));

const fixture = `
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { BiddingMembersTable } from "@/app/app-domain/compras/licitacoes/BiddingDraftTables";
function Fixture({ count }) {
  const [members, setMembers] = useState(() => Array.from({ length: count }, (_, i) => ({ employeeId: String(i), role: "Membro" })));
  const employees = Array.from({ length: count }, (_, i) => ({ id: String(i), name: "Servidor " + (i + 1), role: null }));
  return <form onSubmit={e => { e.preventDefault(); window.__payload = { members }; }}>
    <BiddingMembersTable members={members} employees={employees} disabled={false}
      onChange={(index, values) => setMembers(current => current.map((member, i) => i === index ? { ...member, ...values } : member))}
      onAdd={() => setMembers(current => [...current, { employeeId: "", role: "Membro" }])}
      onRemove={index => setMembers(current => current.filter((_, i) => i !== index))} />
    <button type="submit">Enviar rascunho</button>
  </form>;
}
const root = createRoot(document.getElementById("root"));
window.__showDraft = count => { window.__payload = null; root.render(<Fixture key={count} count={count} />); };
window.__showDraft(1);
`;

test("busca aplicada não desmonta Membro durante edição; reaplicação e 21 rascunhos preservam payload/paginação", async () => {
  const result = await build({
    absWorkingDir: root, stdin: { contents: fixture, loader: "tsx", resolveDir: root },
    outfile: join(temp, "compras-editable-search.js"), bundle: true, write: false, platform: "browser", format: "iife", jsx: "automatic",
    tsconfig: join(root, "tsconfig.json"), loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' },
    plugins: [{ name: "isolated-browser", setup(builder) {
      builder.onResolve({ filter: /^(server-only|.*(?:drizzle|firebase|database|\/actions)(?:\/.*)?)$/ }, args => { throw new Error(`Forbidden import: ${args.path}`); });
      builder.onResolve({ filter: /^next\/(link|image|navigation)$/ }, args => ({ path: args.path, namespace: "next-stub" }));
      builder.onLoad({ filter: /.*/, namespace: "next-stub" }, args => ({ contents: args.path === "next/navigation"
        ? 'export const usePathname=()=>"/compras/licitacoes/fixture"; export const useSearchParams=()=>new URLSearchParams(); export const useRouter=()=>({push(){throw new Error("Unexpected route navigation")}});'
        : 'import React from "react"; export default function Adapter({priority,prefetch,scroll,...props}){return React.createElement("a",props)}', resolveDir: root }));
    } }],
  });
  const { readFile } = await import("node:fs/promises");
  const globals = await require("postcss")([require("@tailwindcss/postcss")({ base: root })]).process(await readFile(join(root, "src/app/globals.css"), "utf8"), { from: join(root, "src/app/globals.css") });
  const css = globals.css + "\n" + result.outputFiles.find(file => file.path.endsWith(".css")).text;
  const js = result.outputFiles.find(file => file.path.endsWith(".js")).contents;
  const server = createServer((request, response) => {
    response.setHeader("Content-Type", request.url === "/fixture.js" ? "text/javascript" : request.url === "/fixture.css" ? "text/css" : "text/html");
    response.end(request.url === "/fixture.js" ? js : request.url === "/fixture.css" ? css : '<!doctype html><html><head><link rel="stylesheet" href="/fixture.css"></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  let browser;
  try {
    await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
    browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
    const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
    const errors = [];
    page.on("pageerror", error => errors.push(String(error)));
    await page.route("**/*", route => route.request().url().startsWith(`http://127.0.0.1:${server.address().port}/`) ? route.continue() : route.abort());
    await page.goto(`http://127.0.0.1:${server.address().port}/`);
    const panel = page.locator("[data-operational-surface]");
    const rows = panel.locator("[data-operational-row]");
    const open = count => page.getByRole("button", { name: `Abrir membros da designação (${count})`, exact: true }).click();
    const apply = () => panel.getByRole("button", { name: "Aplicar busca", exact: true }).click();
    const search = panel.getByRole("searchbox", { name: "Buscar em Membros da designação", exact: true });

    await open(1);
    await search.fill("Não encontrado");
    assert.equal(await rows.count(), 1, "Digitar a consulta não aplica o filtro durante a edição");
    await search.fill("Membro"); await apply();
    assert.equal(await rows.count(), 1);
    assert.equal(await page.evaluate(() => window.__payload), null, "Aplicar busca não envia o formulário externo");
    const role = panel.getByRole("textbox", { name: "Função do membro 1", exact: true });
    await role.focus();
    await role.evaluate(input => { window.__originalInput = input; });
    await role.fill("");
    for (const character of "Presidente") {
      await role.pressSequentially(character);
      assert.equal(await rows.count(), 1, "A busca aplicada deve conservar a linha durante cada caractere");
      assert.ok(await role.evaluate(input => input === window.__originalInput && input === document.activeElement), "Mesmo nó e foco durante toda a edição");
    }
    assert.equal(await role.inputValue(), "Presidente");
    await apply(); assert.equal(await rows.count(), 0, "Reaplicar Membro pode excluir Presidente");
    await panel.getByRole("button", { name: "Limpar", exact: true }).click();
    assert.equal(await role.inputValue(), "Presidente");
    await panel.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.getByRole("button", { name: "Enviar rascunho", exact: true }).click();
    assert.deepEqual(await page.evaluate(() => window.__payload), { members: [{ employeeId: "0", role: "Presidente" }] });

    await page.evaluate(() => window.__showDraft(21));
    await open(21); await search.fill("Membro"); await apply();
    assert.equal(await rows.count(), 20);
    await panel.getByRole("button", { name: "Próxima página", exact: true }).click();
    assert.equal(await rows.count(), 1);
    const lastRole = panel.getByRole("textbox", { name: "Função do membro 21", exact: true });
    await lastRole.fill("Presidente");
    assert.equal(await rows.count(), 1);
    await panel.getByRole("button", { name: "Página anterior", exact: true }).click(); assert.equal(await rows.count(), 20);
    await panel.getByRole("button", { name: "Próxima página", exact: true }).click(); assert.equal(await lastRole.inputValue(), "Presidente");
    await apply(); assert.equal(await rows.count(), 20, "Reaplicação considera todas as 21 linhas antes de recortar e retorna à página 1");
    await panel.getByRole("button", { name: "Fechar", exact: true }).click();
    await page.getByRole("button", { name: "Enviar rascunho", exact: true }).click();
    const payload = await page.evaluate(() => window.__payload);
    assert.equal(payload.members.length, 21);
    assert.deepEqual(payload.members[20], { employeeId: "20", role: "Presidente" });
    assert.ok(payload.members.slice(0, 20).every(member => member.role === "Membro"));
    assert.deepEqual(errors, []);
  } finally {
    await browser?.close();
    server.closeAllConnections();
    await new Promise(resolve => server.close(resolve));
  }
});
