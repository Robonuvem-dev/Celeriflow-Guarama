// Read-only visual acceptance. Synthetic non-zero scenarios are intercepted in
// this browser only; the real municipal programme is never saved or republished.
import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

const origin = process.env.BI_VISUAL_ORIGIN || "http://localhost:3312";
const run = randomUUID();
const directory = join(process.env.LOCALAPPDATA, "Temp", "opencode", `smarttv-design-${run}`);
const report = { run, origin, at: new Date().toISOString(), status: "FAIL", checks: [], screenshots: directory };
let browser;
try {
  await mkdir(directory, { recursive: true });
  const executablePath = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find(existsSync);
  assert(executablePath);
  browser = await chromium.launch({ executablePath, headless: true });
  const page = await browser.newPage({ locale: "pt-BR" });
  const errors = []; page.on("pageerror", error => errors.push(error.message));
  const response = await fetch(`${origin}/api/public/bi/smarttv`);
  assert.equal(response.status, 200);
  const real = await response.json();
  assert.equal(real.status, "published");
  const liveSlide = real.slides.find(slide => slide.dataset && slide.kind !== "image");
  assert(liveSlide);
  let scenario;
  await page.route("**/api/public/bi/smarttv", route => route.fulfill({ json: scenario ?? real }));
  const viewports = [["hd", 1280, 720], ["full-hd", 1920, 1080], ["4k", 3840, 2160], ["mobile", 390, 844]];
  async function inspect(name, width, height) {
    await page.setViewportSize({ width, height });
    await page.goto(`${origin}/Smarttv`);
    await page.locator("[data-smarttv-player] h1").waitFor();
    if (scenario) {
      await page.getByRole("heading", { name: scenario.slides[0].title, exact: true }).waitFor();
    }
    await page.waitForFunction(() => [...document.querySelectorAll("[data-smarttv-player] img")].every(image => image.complete && image.naturalWidth > 0));
    // ResizeObserver determines the number of graph categories per screen.
    await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))));
    await page.addStyleTag({ content: '[data-smarttv-player] nav { visibility: hidden !important; } nextjs-portal { display: none !important; }' });
    const bounds = await page.locator("[data-smarttv-player]").evaluate(root => {
      const main = root.querySelector("main"), footer = root.querySelector("footer");
      const overflow = [...main.querySelectorAll("article,section,h1,h3,[data-display-chart] > div")].filter(element => element.scrollHeight > element.clientHeight + 3 || element.scrollWidth > element.clientWidth + 3).map(element => ({ tag: element.tagName, chart: element.closest("[data-display-chart]")?.dataset.displayChart, text: element.textContent.slice(0, 70), height: element.clientHeight, scrollHeight: element.scrollHeight }));
      return { page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], viewport: [innerWidth, innerHeight], footerVisible: footer.getBoundingClientRect().bottom <= innerHeight + 1, overflow };
    });
    await page.screenshot({ path: join(directory, `${name}.png`) });
    report.checks.push({ name, ...bounds });
    assert(bounds.page[0] <= width + 1 && bounds.page[1] <= height + 1 && bounds.footerVisible, `VIEWPORT_${name}`);
    assert.deepEqual(bounds.overflow, [], `CONTENT_${name}`);
  }
  for (const [name, width, height] of viewports) await inspect(`real-${name}`, width, height);
  const image = real.slides.find(slide => slide.imageUrl)?.imageUrl;
  const base = { ...liveSlide, id: randomUUID(), title: "Composição visual · cenário de teste", subtitle: "Dados sintéticos exclusivos deste navegador", kind: "dashboard", duration: 10,
    metricOrder: ["employees", "secretariats", "openDemands", "resolvedDemands", "cancelledDemands", "overdueDemands"],
    dataset: { periodLabel: "Ano 2026 até a captura · Equipe: posição atual", scopeLabel: "Prefeitura inteira", metrics: { employees: 198, secretariats: 13, openDemands: 32, resolvedDemands: 140, cancelledDemands: 8, overdueDemands: 4 },
      chart: [56, 47, 37, 20, 20, 18].map((value, index) => ({ name: ["Secretaria Municipal de Saúde", "Secretaria Municipal de Obras", "Secretaria Municipal de Educação", "Secretaria Municipal de Assistência Social", "Secretaria Municipal de Planejamento e Desenvolvimento Institucional", "Sem secretaria"][index], value })), chartMax: 56 } };
  for (const chart of ["employees", "demands", "timeline", "none", "empty", "mixed"]) {
    const slide = structuredClone(base);
    slide.title = `${base.title} · ${chart}`;
    slide.chart = chart === "mixed" ? "employees" : chart === "empty" ? "demands" : chart;
    if (chart === "mixed") { slide.kind = "mixed"; slide.imageUrl = image; }
    if (chart === "demands") slide.dataset.chart.forEach((item, index) => { item.value = [56, 47, 32, 20, 17, 8][index]; });
    if (chart === "timeline") { slide.dataset.chart = [0, 12, 26, 0, 68, 6, 10, 12, 18, 28].map((value, index) => ({ name: `2026-${String(index + 1).padStart(2, "0")}`, value })); slide.dataset.chartMax = 68; }
    if (chart === "empty") { slide.dataset.chart = []; slide.dataset.metrics = Object.fromEntries(slide.metricOrder.map(key => [key, 0])); }
    scenario = { ...real, version: `${run}-${chart}`, validatedAt: new Date().toISOString(), slides: [slide] };
    for (const [name, width, height] of viewports) await inspect(`${chart}-${name}`, width, height);
  }
  assert.deepEqual(errors, []);
  report.status = "PASS";
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally {
  await browser?.close();
  await writeFile("docs/BI_SMARTTV_DESIGN_RESULTADO.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
