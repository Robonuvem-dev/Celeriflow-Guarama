/** Authenticated, read-only review of rendered data across every configured menu. */
import { openCheckupBrowser } from "./lib/checkup-isolated-browser.mjs";
import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";

const base = process.env.CHECKUP_DATA_BASE || "https://guarama.celeriflow.com.br";
const output = process.env.CHECKUP_DATA_OUTPUT || "docs/checkup/demonstration-data/browser-production";
const inventory = JSON.parse(readFileSync(process.env.CHECKUP_DATA_INVENTORY || "docs/checkup/all-menu-production/report.json", "utf8"));
const paths = process.env.CHECKUP_DATA_PATHS ? JSON.parse(process.env.CHECKUP_DATA_PATHS) : [...new Set([...inventory.menu.map(item => item.path).filter(Boolean), ...inventory.cases.filter(item => item.geometry?.tables.length).map(item => item.path)])];
const { browser, sourceCookies } = await openCheckupBrowser();
const session = sourceCookies.find(cookie => cookie.name === "celeriflow_session");
if (!session) throw new Error("Sessão autenticada não encontrada.");
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, timezoneId: "America/Sao_Paulo" });
await context.addCookies([{ name: session.name, value: session.value, url: base, httpOnly: true, secure: base.startsWith("https:"), sameSite: "Lax" }]);
await context.route("**/*", route => route.request().headers()["next-router-prefetch"] === "1" ? route.abort() : route.continue());
const report = { startedAt: new Date().toISOString(), base, scope: "Rendered tables and visible labels; no business mutations", total: paths.length, cases: [] };
mkdirSync(output, { recursive: true });
const persist = () => {
  const target = `${output}/report.json`;
  writeFileSync(`${target}.pending`, JSON.stringify(report, null, 2) + "\n");
  try { renameSync(`${target}.pending`, target); } catch (error) { if (!["EPERM", "EBUSY"].includes(error.code)) throw error; }
};
let cursor = 0;
async function worker() {
  while (cursor < paths.length) {
    const path = paths[cursor++];
    const page = await context.newPage();
    const errors = [];
    page.on("pageerror", error => errors.push(error.message.slice(0, 500)));
    try {
      const response = await page.goto(new URL(path, base).href, { waitUntil: "load", timeout: 120000 });
       await page.waitForLoadState("networkidle", { timeout: 2000 }).catch(() => {});
       const consent = page.getByRole("button", { name: "Manter somente necessários", exact: true });
       if (await consent.isVisible()) await consent.click();
       await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const data = await page.evaluate(() => {
        const marker = /(?:^|[^\p{L}\p{N}])(?:DEMO\d{0,4}|POC|Teste|dummy|placeholder)(?:[^\p{L}\p{N}]|$)/iu;
        const visible = node => node.getBoundingClientRect().width > 0 && node.getBoundingClientRect().height > 0;
        const tables = [...document.querySelectorAll("table")].filter(visible).map(table => {
          const rows = [...table.querySelectorAll("tbody tr")].filter(visible);
          const text = rows.map(row => row.innerText.trim());
          return { caption: table.querySelector("caption")?.textContent?.trim() || table.getAttribute("aria-label"), headers: [...table.querySelectorAll("thead th")].map(node => node.textContent?.trim()), rows: rows.length, samples: text.slice(0, 3).map(value => value.slice(0, 600)), markers: text.filter(value => marker.test(value)).map(value => value.slice(0, 700)).slice(0, 20) };
        });
        const text = document.body.innerText;
        return { headings: [...document.querySelectorAll("h1,h2")].filter(visible).map(node => node.textContent?.trim()), tables, visibleMarkers: [...new Set(text.split("\n").map(line => line.trim()).filter(line => marker.test(line)))].slice(0, 30), emptyMessages: [...new Set(text.split("\n").map(line => line.trim()).filter(line => /^(?:Nenhum|Nenhuma|Não há|Sem (?:registros|dados|resultados))\b/.test(line)))].slice(0, 20), appError: /Application error:|Erro Interno do Servidor|Internal Server Error|This page could not be found\./.test(text), layoutBlocked: /Esta área ainda não comporta/.test(text), login: /\/login(?:\?|$)/.test(location.href) };
      });
      const entry = { path, status: response.status(), errors, ...data };
      if (data.visibleMarkers.length || data.appError || data.layoutBlocked || errors.length) {
        entry.screenshot = `${createHash("sha256").update(path).digest("hex").slice(0, 16)}.png`;
        await page.screenshot({ path: `${output}/${entry.screenshot}`, timeout: 10000 }).catch(() => {});
      }
      report.cases.push(entry);
    } catch (error) { report.cases.push({ path, navigationError: error.message.slice(0, 1000), errors }); }
    finally { await page.close(); persist(); }
  }
}
try { await Promise.all(Array.from({ length: Number(process.env.CHECKUP_DATA_WORKERS || 2) }, worker)); }
finally {
  await context.close(); await browser.close();
  report.finishedAt = new Date().toISOString();
  report.summary = { inspected: report.cases.length, markerScreens: report.cases.filter(row => row.visibleMarkers?.length).length, emptyTableScreens: report.cases.filter(row => row.tables?.some(table => !table.rows)).length, errors: report.cases.filter(row => row.navigationError || row.appError || row.errors.length).length, layoutBlocked: report.cases.filter(row => row.layoutBlocked).length };
  persist(); console.log(JSON.stringify(report.summary, null, 2));
}
