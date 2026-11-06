import { chromium } from "playwright-core";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";

const inventory = JSON.parse(readFileSync("docs/checkup/all-menu-production-retest/report.json", "utf8"));
const targets = inventory.menu.filter(item => !item.path && /^https:\/\//.test(item.href));
const browser = await chromium.connectOverCDP("http://127.0.0.1:9337");
const context = await browser.newContext({ viewport: { width: 1366, height: 768 } });
const report = { startedAt: new Date().toISOString(), cases: [] };
const output = "docs/checkup/external-menu-production";
mkdirSync(output, { recursive: true });
try {
  for (const target of targets) {
    const page = await context.newPage();
    try {
      const response = await page.goto(target.href, { waitUntil: "domcontentloaded", timeout: 60000 });
      const title = await page.title();
      report.cases.push({ ...target, finalUrl: page.url(), status: response?.status(), title, result: response && response.status() < 400 ? "OPENED_EXTERNAL" : "EXTERNAL_HTTP_ERROR" });
      await page.screenshot({ path: `${output}/${target.module}-${report.cases.length}.png`, timeout: 10000 }).catch(() => {});
    } catch (error) { report.cases.push({ ...target, result: "EXTERNAL_NAVIGATION_ERROR", error: error.message.slice(0, 1000) }); }
    finally { await page.close(); }
  }
} finally {
  await context.close(); await browser.close();
  report.finishedAt = new Date().toISOString();
  writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
