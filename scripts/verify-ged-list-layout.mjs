import assert from "node:assert/strict";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { config } from "dotenv";
import { initializeApp, cert, deleteApp } from "firebase-admin/app";
import { getAuth } from "firebase-admin/auth";
import { chromium } from "playwright-core";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const origin = process.argv.find(value => value.startsWith("--origin="))?.slice(9) || "http://localhost:3309";
const output = process.argv.find(value => value.startsWith("--output="))?.slice(9) || "docs/plano-populacao-2026-11-08/execucao/ged-layout";
mkdirSync(output, { recursive: true });
const app = initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) }, `ged-layout-${Date.now()}`);
const report = { startedAt: new Date().toISOString(), origin, scope: "AUTHENTICATED_APPLICATION_ROUTES", cases: [], errors: [], status: "RUNNING" };
let browser, cookie;
try {
  const auth = getAuth(app);
  const user = await auth.getUserByEmail(process.env.SYSTEM_ADMIN_EMAIL);
  assert.ok(!user.disabled && user.emailVerified);
  const customToken = await auth.createCustomToken(user.uid);
  const exchange = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }) });
  assert.equal(exchange.status, 200, "FIREBASE_TOKEN_EXCHANGE");
  const credentials = await exchange.json();
  const session = await fetch(`${origin}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify({ idToken: credentials.idToken }) });
  assert.equal(session.status, 200, "APPLICATION_SESSION");
  cookie = session.headers.getSetCookie().find(value => value.startsWith("celeriflow_session=")).split(";")[0];
  const executablePath = process.env.CHROMIUM_PATH || ["C:/Program Files/Google/Chrome/Application/chrome.exe", "C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe"].find(existsSync);
  browser = await chromium.launch({ executablePath, headless: true });
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1920, height: 1080 }, { width: 1280, height: 720 }]) {
    const context = await browser.newContext({ viewport, locale: "pt-BR" });
    const separator = cookie.indexOf("=");
    await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: origin, httpOnly: true, secure: origin.startsWith("https:"), sameSite: "Lax" }]);
    const page = await context.newPage();
    page.on("pageerror", error => report.errors.push(error.message.slice(0, 300)));
    for (const section of ["pastas-inteligentes", "modelos"]) {
      await page.goto(`${origin}/assinatura-digital/${section}`, { waitUntil: "domcontentloaded", timeout: 90_000 });
      const consent = page.getByRole("button", { name: "Manter somente necessários", exact: true });
      if (await consent.isVisible()) await consent.click();
      await page.locator("[data-operational-table]:visible").waitFor();
      await page.waitForFunction(() => [...document.querySelectorAll("[data-operational-table]")].some(element => element.checkVisibility() && Number(element.getAttribute("data-required-height")) > 0));
      const geometry = await page.locator("[data-operational-table]:visible").evaluate(element => {
        const box = element.getBoundingClientRect();
        const ancestors = []; let parent = element.parentElement;
        while (parent && ancestors.length < 8) { const rect = parent.getBoundingClientRect(), style = getComputedStyle(parent); ancestors.push({ tag: parent.tagName, class: parent.className, width: rect.width, height: rect.height, display: style.display, flex: style.flex, grid: style.gridTemplateRows }); parent = parent.parentElement; }
        const footer = document.querySelector("[data-operational-pagination]")?.getBoundingClientRect();
        return { fit: element.dataset.fit, availableWidth: box.width, availableHeight: box.height, requiredWidth: Number(element.dataset.requiredWidth), requiredHeight: Number(element.dataset.requiredHeight), rows: element.querySelectorAll("tbody tr").length, documentWidth: document.documentElement.scrollWidth, documentHeight: document.documentElement.scrollHeight, footerBottom: footer?.bottom, ancestors };
      });
      await page.screenshot({ path: `${output}/${section}-${viewport.width}.png`, fullPage: true });
      const item = { section, viewport, geometry, passed: geometry.fit === "ready" && geometry.availableHeight >= geometry.requiredHeight && geometry.rows === 20 && geometry.documentWidth <= viewport.width + 1 && geometry.documentHeight <= viewport.height + 1 && geometry.footerBottom <= viewport.height + 1 };
      report.cases.push(item);
      if (item.passed) {
        const first = await page.locator("tbody tr").first().innerText();
        await page.getByRole("button", { name: "Próxima página", exact: true }).click();
        await page.waitForFunction(previous => { const row = document.querySelector("tbody tr"); return row && row.innerText !== previous; }, first);
        assert.ok(await page.locator("tbody tr").count() > 0);
        await page.getByRole("button", { name: "Primeira página", exact: true }).click();
        await page.waitForFunction(previous => document.querySelector("tbody tr")?.innerText === previous, first);
        item.pagination = "PASS";
        const search = page.getByRole("textbox", { name: "Buscar documentos ou registros", exact: true });
        await search.fill("zzzzconsultaquenãopossuicorrespondência");
        await page.getByRole("button", { name: "Buscar", exact: true }).click();
        await page.getByText("Nenhum registro encontrado neste escopo.", { exact: true }).waitFor();
        await search.fill(""); await page.getByRole("button", { name: "Buscar", exact: true }).click();
        await page.locator("tbody tr").nth(19).waitFor();
        item.searchAndEmpty = "PASS";
      }
    }
    await context.close();
  }
  report.status = report.cases.every(item => item.passed) && !report.errors.length ? "PASS" : "FAIL";
} catch (error) {
  report.status = "FAIL"; report.errors.push(error instanceof Error ? error.message.slice(0, 300) : "Falha na verificação");
} finally {
  await browser?.close();
  if (cookie) await fetch(`${origin}/api/auth/session/logout`, { method: "POST", headers: { cookie, origin } }).catch(() => {});
  await deleteApp(app);
  writeFileSync(`${output}/result.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  if (report.status !== "PASS") process.exitCode = 1;
}
