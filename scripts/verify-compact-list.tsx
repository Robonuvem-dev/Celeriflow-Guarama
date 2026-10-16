import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { createRequire } from "node:module";
import { join, resolve } from "node:path";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ErpCompactListFrame } from "../src/components/app-ui/erp/ErpCompactListFrame";
import { build } from "esbuild";

async function main() {
  const modulePath = process.env.PLAYWRIGHT_MODULE_PATH;
  if (!modulePath) throw new Error("Informe PLAYWRIGHT_MODULE_PATH apontando para a instalação local do Playwright.");
  const { chromium } = createRequire(resolve("package.json"))(modulePath);
  const cssPath = resolve(".next/static/chunks");
  const css = readdirSync(cssPath).filter(file => file.endsWith(".css")).map(file => readFileSync(join(cssPath, file), "utf8")).join("\n");
  const markup = renderToStaticMarkup(<main className="p-4">
    <header className="h-16">Celeriflow</header><h1 className="h-12">Cadastros</h1>
    <ErpCompactListFrame toolbar={<input className="h-7" aria-label="Busca" />} pagination={<div className="h-8">1–20 de 42 registros</div>}>
      <table className="w-full table-fixed"><thead><tr>{["Nome", "Contato", "Perfil", "Status", "Ações"].map(label => <th key={label}>{label}</th>)}</tr></thead><tbody>
        {Array.from({ length: 20 }, (_, index) => <tr key={index} className="h-[38px] border-b"><td className="truncate py-4">Pessoa cadastrada {index + 1}</td><td className="truncate">contato@auroradasveredas.example</td><td><span className="inline-flex h-[18px] max-w-full"><span className="truncate">Aprovação administrativa — Executivo</span></span></td><td><button>Ativo</button></td><td><button>Editar</button></td></tr>)}
      </tbody></table>
    </ErpCompactListFrame>
  </main>);
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const results = [];
    for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }, { width: 390, height: 844 }]) {
      await page.setViewportSize(viewport);
      await page.setContent(`<html><head><style>${css}</style></head><body>${markup}</body></html>`);
      const result = await page.evaluate(() => {
        const table = document.querySelector("table")!;
        const wrapper = table.parentElement!;
        const rows = [...document.querySelectorAll("tbody tr")];
        return { rows: rows.length, maximumRowHeight: Math.max(...rows.map(row => row.getBoundingClientRect().height)), internalScroll: wrapper.scrollHeight - wrapper.clientHeight, pageBottom: document.querySelector("section")!.getBoundingClientRect().bottom, lastRowBottom: rows.at(-1)!.getBoundingClientRect().bottom, tableBottom: wrapper.getBoundingClientRect().bottom };
      });
      assert.equal(result.rows, 20); assert.equal(result.internalScroll, 0);
      assert.ok(result.maximumRowHeight <= 24, JSON.stringify(result));
      assert.ok(result.lastRowBottom <= result.tableBottom + 1, "Última linha cortada");
      assert.ok(result.pageBottom <= viewport.height, "Página compacta não cabe no viewport");
      results.push({ viewport, ...result });
    }
    // Inline edits may expand a row; the frame must expand rather than clip it.
    await page.locator("tbody td").first().evaluate((cell: Element) => { cell.innerHTML = '<div style="height:64px">Edição com campos adicionais</div>'; });
    const overflow = await page.locator("table").evaluate((table: Element) => table.parentElement!.scrollHeight - table.parentElement!.clientHeight);
    assert.equal(overflow, 0);
    const bundle = await build({
      stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
        import React from "react";
        import { createRoot } from "react-dom/client";
        import Perfis from "./src/app/app-domain/configuracoes/perfis/PerfisClient";
        import Usuarios from "./src/app/app-domain/configuracoes/usuarios/components/UsuariosClient";
        import PF from "./src/app/app-domain/cadastros/pessoas-fisicas/PessoasFisicasClient";
        import PJ from "./src/app/app-domain/cadastros/pessoas-juridicas/PessoasJuridicasClient";
        const rows = Array.from({ length: 42 }, (_, i) => ({ id: String(i), nome: "Pessoa " + String(i).padStart(2,"0"), fullName: "Pessoa " + String(i).padStart(2,"0"), corporateName: "Empresa " + String(i).padStart(2,"0"), descricao: "Perfil operacional com descrição extensa para validar truncamento", codigo: "OPERACIONAL_"+i, permissoes: null, legacyModuleCodes: [], ativo: true, perfilId: "perfil", perfil: {nome:"Aprovação administrativa — Executivo"}, employeeId: null, cpf: "98000000161", cnpj: "00000000000191", email: "cadastro@auroradasveredas.example", emailPrimary: "cadastro@auroradasveredas.example", phone: "(31) 98000-1000", phonePrimary: "(31) 98000-1000", status: "Ativo", taxpayerInfo: {municipalInsc:"AV.2026.001"} }));
        const root = createRoot(document.getElementById("root"));
        window.showList = kind => root.render(<div className="p-4"><header className="h-16">Celeriflow</header>{kind === "perfis" ? <Perfis perfis={rows} capabilities={{create:true,update:true,delete:true}} /> : kind === "usuarios" ? <Usuarios usuarios={rows} perfis={[{id:"perfil",nome:"Operacional",codigo:"OPERACIONAL"}]} servidores={[]} /> : kind === "pf" ? <PF persons={rows} /> : <PJ companies={rows} />}</div>);
      ` },
      bundle: true, write: false, platform: "browser", format: "iife", define: { "process.env.NODE_ENV": '"production"' },
      plugins: [{ name: "isolated-list-actions", setup(builder) {
        builder.onResolve({ filter: /(^|\/)actions$/ }, () => ({ path: "actions", namespace: "fixture" }));
        builder.onResolve({ filter: /^next\/link$/ }, () => ({ path: "link", namespace: "fixture" }));
        builder.onLoad({ filter: /.*/, namespace: "fixture" }, args => ({ contents: args.path === "link" ? 'export default function Link(){return null;}' : ['deletePerfil','upsertPerfil','togglePerfilStatus','deleteUsuario','upsertUsuario','toggleUsuarioStatus','updatePerson','deactivatePerson','activatePerson','updateCompany','deactivateCompany','activateCompany'].map(name => 'export async function '+name+'(){throw new Error("Fixture: mutations disabled");}').join('\n') }));
      } }],
    });
    const clients = [];
    await page.setContent(`<html><head><style>${css}</style></head><body><div id="root"></div></body></html>`);
    await page.addScriptTag({ content: bundle.outputFiles[0].text });
    for (const kind of ["perfis", "usuarios", "pf", "pj"]) {
      await page.setViewportSize({ width: 1366, height: 768 });
      await page.evaluate((value: string) => (window as unknown as { showList: (kind: string) => void }).showList(value), kind);
      await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 20);
      const firstPage = await page.locator("table").evaluate((table: Element) => ({ rows: table.querySelectorAll("tbody tr").length, scroll: table.parentElement!.scrollHeight - table.parentElement!.clientHeight, maxRow: Math.max(...[...table.querySelectorAll("tbody tr")].map(row => row.getBoundingClientRect().height)) }));
      assert.equal(firstPage.rows, 20); assert.equal(firstPage.scroll, 0); assert.ok(firstPage.maxRow <= 24, `${kind}: ${JSON.stringify(firstPage)}`);
      await page.getByRole("button", { name: "Próxima", exact: true }).click();
      await page.waitForFunction(() => document.querySelector("tbody")?.textContent?.includes("20"));
      assert.equal(await page.locator("tbody tr").count(), 20);
      await page.getByRole("button", { name: "Próxima", exact: true }).click();
      await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 2);
      await page.locator("section input").first().fill(kind === "pj" ? "Empresa 07" : "Pessoa 07");
      await page.waitForFunction(() => document.querySelectorAll("tbody tr").length === 1);
      assert.ok((await page.locator("tbody").textContent())?.includes("07"));
      clients.push({ kind, ...firstPage, pagination: "20 / 20 / 2", search: "page reset verified" });
    }
    console.log(JSON.stringify({ frame: "20 rows, production CSS, inline expansion", results, clients, serverActions: "isolated fixtures; no database mutations" }, null, 2));
  } finally { await browser.close(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
