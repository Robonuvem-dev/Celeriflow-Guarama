import { chromium } from "playwright-core";
import { mkdirSync, writeFileSync } from "node:fs";

const base = process.env.CHECKUP_BASE_URL ?? "http://localhost:3100";
const routes = [
  "/portal/construcao-civil/autorizacoes", "/portal/construcao-civil/nova",
  "/portal/construcao-civil/pedidos-administrativos", "/portal/convenentes",
  "/portal/departamentos/atestados", "/portal/portaldatransparencia",
  "/portal/licitacoes-e-contratos", "/portal-servidor/entrar",
];
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM_PATH ?? "C:/Program Files/Google/Chrome/Application/chrome.exe", headless: true });
const output = process.env.CHECKUP_BROWSER_OUTPUT ?? "docs/checkup/browser";
mkdirSync(output, { recursive: true });
const report = { date: new Date().toISOString(), base, scope: "Real pages, anonymous browser; login redirects do not validate authenticated content", cases: [] };
try {
  const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
  for (const pathname of routes) {
    const page = await context.newPage();
    const errors = [], httpErrors = [], consoleErrors = [];
    page.on("pageerror", error => errors.push(error.message));
    page.on("console", message => { if (message.type() === "error") consoleErrors.push(message.text()); });
    page.on("response", response => { if (response.status() >= 400 && new URL(response.url()).origin === new URL(base).origin) httpErrors.push({ url: new URL(response.url()).pathname, status: response.status() }); });
    try {
      const response = await page.goto(new URL(pathname, base).href, { waitUntil: "networkidle", timeout: 90000 });
      const text = await page.locator("body").innerText();
      const failed = errors.length || consoleErrors.length || httpErrors.length || response.status() >= 400 || /Application error:|Internal Server Error|Runtime Error/.test(text);
      const item = { pathname, finalUrl: page.url(), status: response.status(), result: failed ? "ERROR" : "PASS", headings: await page.locator("h1,h2").allTextContents(), errors, consoleErrors, httpErrors };
      report.cases.push(item);
      await page.screenshot({ path: `${output}/${pathname.replaceAll("/", "_").slice(1)}.png`, fullPage: false, caret: "initial" });
      console.log(`${item.result} ${pathname} -> ${new URL(page.url()).pathname}`);
    } catch (error) { report.cases.push({ pathname, result: "ERROR", message: error.message, errors, consoleErrors, httpErrors }); }
    await page.close();
  }
} finally {
  await browser.close();
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
}
if (report.cases.some(item => item.result !== "PASS")) process.exitCode = 1;
