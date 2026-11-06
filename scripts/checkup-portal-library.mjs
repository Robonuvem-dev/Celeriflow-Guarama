import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.CHECKUP_LOCAL_BASE || "https://guarama.celeriflow.com.br";
const output = process.env.CHECKUP_LIBRARY_OUTPUT || "docs/checkup/demonstration-data/library-production";
const directory = "docs/checkup/demonstration-data";
const expected = readdirSync(directory).filter(name => name.startsWith("portal-library-applied-")).flatMap(name => JSON.parse(readFileSync(`${directory}/${name}`, "utf8")).created);
assert.equal(expected.length, 2);
const browser = await chromium.connectOverCDP("http://127.0.0.1:9337");
const original = browser.contexts().find(context => context.pages().some(page => page.url().startsWith("https://guarama.celeriflow.com.br/")));
const session = (await original.cookies("https://guarama.celeriflow.com.br")).find(cookie => cookie.name === "celeriflow_session"); assert.ok(session);
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, timezoneId: "America/Sao_Paulo" });
await context.addCookies([{ name: session.name, value: session.value, url: base, httpOnly: true, secure: base.startsWith("https:"), sameSite: "Lax" }]);
const page = await context.newPage();
const report = { startedAt: new Date().toISOString(), base, cases: [] };
mkdirSync(output, { recursive: true });
try {
  await page.goto(`${base}/portal-servidor/biblioteca`, { waitUntil: "load", timeout: 120000 });
  for (const file of expected) {
    const row = page.locator("tbody tr").filter({ hasText: file.title });
    assert.equal(await row.count(), 1, file.title);
    const link = row.getByRole("link", { name: "Baixar", exact: true });
    const url = await link.getAttribute("href");
    assert.equal(url, `/api/portal-servidor/biblioteca/${file.id}`);
    const response = await context.request.get(new URL(url, base).href);
    assert.equal(response.status(), 200);
    const bytes = await response.body();
    const sha256 = createHash("sha256").update(bytes).digest("hex");
    assert.equal(sha256, file.sha256);
    report.cases.push({ id: file.id, title: file.title, status: response.status(), contentType: response.headers()["content-type"], bytes: bytes.length, sha256, passed: true });
  }
  await page.screenshot({ path: `${output}/library.png` });
} finally {
  await context.close(); await browser.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
