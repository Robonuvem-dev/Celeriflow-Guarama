import assert from "node:assert/strict";
import { createServer } from "node:http";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright-core";

// Explicit browser check; run separately from the cross-platform unit suite.
// Actual shared shell and paging components, with controlled form data.
// This is a UI regression check, not an authenticated application-route test.
const bundle = await build({
  stdin: { resolveDir: process.cwd(), loader: "tsx", contents: `
    import React from "react";
    import {createRoot} from "react-dom/client";
    import {OperationalWorkspace} from "./src/components/app-ui/operational/OperationalWorkspace";
    import {findOperationalShell} from "./src/components/app-ui/operational/routes";
    import {operationalModules} from "./src/components/app-ui/operational/modules";
    const owner = findOperationalShell(operationalModules, window.location.pathname);
    createRoot(document.getElementById("root")).render(<OperationalWorkspace
      title={owner.route.title} {...owner.module} institutionName="Município" userId="fixture" userName="Operador" userRole="Gestor"
      onLogout={async()=>{}} contentMode="page">
      <form id="draft" onSubmit={event=>{event.preventDefault(); window.payload=Object.fromEntries(new FormData(event.currentTarget));}}>
        {Array.from({length:24},(_,index)=><label key={index} style={{display:"block",padding:12}}>Campo {index+1}<input name={"field"+index} defaultValue={"original-"+index}/></label>)}
        <button type="submit">Verificar payload</button>
      </form>
    </OperationalWorkspace>);
  ` },
  bundle: true, write: false, outdir: "fixture", platform: "browser", format: "iife", jsx: "automatic",
  loader: { ".module.css": "local-css" }, define: { "process.env.NODE_ENV": '"production"' },
  plugins: [{ name: "next-fixture", setup(builder) {
    builder.onResolve({ filter: /^next\/(navigation|link|image)$/ }, args => ({ path: args.path, namespace: "next-fixture" }));
    builder.onLoad({ filter: /.*/, namespace: "next-fixture" }, args => ({ loader: "js", resolveDir: process.cwd(), contents:
      args.path === "next/navigation" ? "export const usePathname=()=>location.pathname;export const useSearchParams=()=>new URLSearchParams(location.search);"
        : args.path === "next/link" ? 'import React from "react";export default function Link(p){return React.createElement("a",p,p.children)}'
          : 'import React from "react";export default function Image({priority,...p}){return React.createElement("img",p)}' }));
  } }], logLevel: "silent",
});
const js = bundle.outputFiles.find(file => file.path.endsWith(".js")).contents;
const css = bundle.outputFiles.find(file => file.path.endsWith(".css")).contents;
const server = createServer((request, response) => {
  if (request.url === "/fixture.js") { response.setHeader("Content-Type", "text/javascript"); response.end(js); }
  else if (request.url === "/fixture.css") { response.setHeader("Content-Type", "text/css"); response.end(css); }
  else if (request.url === "/favicon.png") { response.setHeader("Content-Type", "image/png"); response.end(readFileSync("public/favicon.png")); }
  else { response.setHeader("Content-Type", "text/html"); response.end('<!doctype html><html><head><link rel="stylesheet" href="/fixture.css"><style>*{box-sizing:border-box}body{margin:0;font-family:Arial}input{height:32px;margin-left:12px}</style></head><body><div id="root"></div><script src="/fixture.js"></script></body></html>'); }
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const results = [];
const errors = [];
try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
    const page = await browser.newPage({ viewport });
    page.on("pageerror", error => errors.push(error.message));
    await page.goto(`http://127.0.0.1:${server.address().port}/rh/publicacao-funcional?view=manage`);
    await page.locator('[data-operational-sidebar][data-collapsed="true"]').waitFor();
    await page.locator('[name="field0"]').fill("rascunho preservado");
    await page.getByRole("button", { name: "Expandir menu de RH e Folha", exact: true }).click();
    await page.locator('[data-operational-sidebar][data-collapsed="false"]').waitFor();
    assert.equal(await page.getByRole("navigation", { name: "Navegação de RH e Folha", exact: true }).getByRole("link").count(), 23);
    await page.getByRole("button", { name: "Recolher menu de RH e Folha", exact: true }).click();
    // Focus navigation reveals a control on another part without unmounting the form.
    await page.locator('[name="field23"]').focus();
    await page.locator('[name="field23"]').fill("último campo preservado");
    await page.getByRole("button", { name: "Verificar payload", exact: true }).focus();
    await page.getByRole("button", { name: "Verificar payload", exact: true }).press("Enter");
    const payload = await page.evaluate(() => window.payload);
    assert.equal(Object.keys(payload).length, 24);
    assert.equal(payload.field0, "rascunho preservado");
    assert.equal(payload.field23, "último campo preservado");
    const geometry = await page.evaluate(() => ({ documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, width: innerWidth, height: innerHeight, footerBottom: document.querySelector('[data-operational-content-footer]').getBoundingClientRect().bottom }));
    assert.ok(geometry.documentWidth <= geometry.width + 1);
    assert.ok(geometry.documentHeight <= geometry.height + 1);
    assert.ok(geometry.footerBottom <= geometry.height + 1);
    mkdirSync("docs/checkup/screenshots", { recursive: true });
    await page.screenshot({ path: `docs/checkup/screenshots/rh-form-${viewport.width}.png` });
    results.push({ viewport, result: "PASS", fields: Object.keys(payload).length, geometry });
    await page.close();
  }
  assert.deepEqual(errors, []);
} finally {
  await browser.close();
  await new Promise(resolve => server.close(resolve));
}
writeFileSync("docs/checkup/shell-browser.json", JSON.stringify({ scope: "Shared shell with controlled form; not authenticated routes", results, errors }, null, 2) + "\n");
console.log(JSON.stringify({ results, errors }, null, 2));
