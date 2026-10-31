import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright-core";

export async function homologateGedBrowser({ origin, cookie, run, folderId, scanId, textId }) {
  const executablePath = process.env.GED_HML_BROWSER_EXECUTABLE || ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find(existsSync);
  assert(executablePath, "Configure GED_HML_BROWSER_EXECUTABLE para homologação visual.");
  const browser = await chromium.launch({ executablePath, headless: true });
  const evidenceDirectory = join(tmpdir(), "opencode", `ged-homologation-${run}`);
  await mkdir(evidenceDirectory, { recursive: true });
  const report = { engine: "chromium", viewportChecks: [], documents: [], evidenceDirectory, browserBatch: false, visualZone: false, versionPanel: false, resizeAndDetails: false };
  const separator = cookie.indexOf("=");
  async function context(options = {}) {
    const context = await browser.newContext({ locale: "pt-BR", ...options });
    await context.addCookies([{ name: cookie.slice(0, separator), value: cookie.slice(separator + 1), url: origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
    return context;
  }
  try {
    for (const device of [
      { name: "desktop", viewport: { width: 1440, height: 900 } },
      { name: "notebook", viewport: { width: 1366, height: 768 } },
      { name: "tablet", viewport: { width: 820, height: 1180 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (iPad; CPU OS 17_0 like Mac OS X) AppleWebKit/605.1.15 Version/17.0 Mobile/15E148 Safari/604.1" },
      { name: "mobile", viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, userAgent: "Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 Chrome/130.0.0.0 Mobile Safari/537.36" },
    ]) {
      const { name: deviceName, ...options } = device;
      const ctx = await context(options), page = await ctx.newPage();
      await page.goto(`${origin}/assinatura-digital/acervo?folderId=${encodeURIComponent(folderId)}`);
      await page.getByRole("button", { name: "Manter somente necessários", exact: true }).click();
      await page.getByRole("button", { name: "Buscar", exact: true }).waitFor();
      await page.locator("table tbody tr").first().waitFor();
      const geometry = await page.evaluate(() => {
        const table = document.querySelector("table"), box = table.getBoundingClientRect();
        return { viewport: window.innerWidth, pageWidth: document.documentElement.scrollWidth, tableWidth: Math.round(box.width), tableLeft: Math.round(box.left), tableRight: Math.round(box.right), rows: table.querySelectorAll("tbody tr").length, fontSize: getComputedStyle(table.querySelector("tbody td")).fontSize };
      });
      assert(geometry.rows <= 20, `MAX_20_ROWS_${device.name}`);
      assert(geometry.pageWidth <= geometry.viewport + 2, `PAGE_HORIZONTAL_OVERFLOW_${device.name}`);
      if (!["tablet", "mobile"].includes(device.name)) assert(geometry.tableRight <= geometry.viewport + 2, `TABLE_DESKTOP_OVERFLOW_${device.name}`);
      if (device.name === "mobile") {
        assert((await page.getByRole("button", { name: "Buscar", exact: true }).boundingBox()).width >= 24, "MOBILE_SEARCH_TARGET");
        assert((await page.getByRole("textbox", { name: "Buscar documentos ou registros" }).boundingBox()).width >= 55, "MOBILE_SEARCH_FIELD");
        const scroll = await page.locator("[data-operational-table]").evaluate(element => { const before = element.scrollLeft; element.scrollLeft = 150; const after = element.scrollLeft; element.scrollLeft = before; return { before, after }; });
        assert(scroll.after > scroll.before, "MOBILE_TABLE_NOT_SCROLLABLE");
      }
      await page.screenshot({ path: join(evidenceDirectory, `${device.name}.png`), fullPage: true });
      report.viewportChecks.push({ device: deviceName, ...geometry, passed: true });
      await ctx.close();
    }
    const ctx = await context({ viewport: { width: 1440, height: 1000 } }), page = await ctx.newPage();
    const pageErrors = [];
    page.on("pageerror", () => pageErrors.push("BROWSER_RUNTIME_ERROR"));
    await page.goto(`${origin}/assinatura-digital/acervo?folderId=${encodeURIComponent(folderId)}`);
    await page.getByRole("button", { name: "Manter somente necessários", exact: true }).click();
    const header = page.getByRole("columnheader", { name: "Documento", exact: true });
    const before = (await header.boundingBox()).width;
    const resize = page.getByRole("button", { name: "Ajustar largura de Documento", exact: true });
    const handle = await resize.boundingBox();
    await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2); await page.mouse.down();
    await page.mouse.move(handle.x + handle.width / 2 + 40, handle.y + handle.height / 2, { steps: 8 }); await page.mouse.up();
    assert((await header.boundingBox()).width > before + 20, "COLUMN_RESIZE_NOT_APPLIED");
    const resized = (await header.boundingBox()).width;
    await page.reload();
    await page.waitForFunction(width => Math.abs(document.querySelector('th[aria-label="Documento"]').getBoundingClientRect().width - width) < 2, resized);
    const full = page.getByRole("button", { name: /^Ver pasta completo de HML-GED/ }).first();
    await full.click();
    const details = page.getByRole("dialog"); await details.locator("[data-full-value-body]").filter({ hasText: run }).waitFor();
    await details.getByRole("button", { name: "Fechar", exact: true }).click();
    await resize.press("Home");
    report.resizeAndDetails = true;
    await page.getByRole("button", { name: "Importar lote", exact: true }).click();
    await page.getByRole("dialog").waitFor();
    await page.getByLabel(/^Classe documental/).selectOption("GED_INTERNAL_ALLOWED");
    const attempt = randomUUID().slice(0, 8);
    const filenames = [1, 2].map(number => `hml-${run}-${attempt}-browser-${number}.txt`);
    await page.getByLabel("Arquivos PDF, imagens, TXT ou DOCX", { exact: true }).setInputFiles(filenames.map(name => ({ name, mimeType: "text/plain", buffer: Buffer.from(`Documento sintético para lote real pelo navegador. ${run}`) })));
    await page.getByRole("button", { name: "Importar / repetir pendentes", exact: true }).click();
    await page.waitForFunction(() => { const value = document.querySelector('textarea[aria-label="Resultado individual do lote"]')?.value; return value && value.split("\n").length === 2 && value.split("\n").every(line => line.endsWith(": DONE")); }, undefined, { timeout: 120_000 });
    const uploads = await page.evaluate(async run => (await (await fetch(`/api/assinatura-digital/ged?section=importacoes&text=${encodeURIComponent(run)}`)).json()).rows, run);
    for (const item of uploads.filter(item => filenames.includes(item.title))) {
      const resumed = await page.evaluate(async id => (await (await fetch("/api/assinatura-digital/ged", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command: "resume-upload", id }) })).json()).result, item.id);
      assert(resumed.documentId); report.documents.push(resumed.documentId);
    }
    assert.equal(report.documents.length, 2);
    report.browserBatch = true;
    await page.screenshot({ path: join(evidenceDirectory, "batch-upload.png"), fullPage: true });
    await page.keyboard.press("Escape");
    await page.goto(`${origin}/assinatura-digital/acervo/${scanId}`);
    await page.getByRole("button", { name: "OCR por zonas", exact: true }).click();
    const selection = page.getByRole("img", { name: "Área de seleção OCR", exact: true });
    await selection.waitFor({ timeout: 60_000 });
    await page.getByLabel("Nome do campo", { exact: true }).fill("Processo via seleção visual");
    const box = await selection.boundingBox(); assert(box);
    await page.mouse.move(box.x + box.width * 0.02, box.y + box.height * 0.4); await page.mouse.down();
    await page.mouse.move(box.x + box.width * 0.97, box.y + box.height * 0.7, { steps: 12 }); await page.mouse.up();
    await page.getByRole("button", { name: "Reconhecer zona", exact: true }).click();
    await page.getByRole("status").filter({ hasText: /PROCESSO 4321/ }).waitFor({ timeout: 90_000 });
    report.visualZone = true;
    await page.screenshot({ path: join(evidenceDirectory, "ocr-zone.png"), fullPage: true });
    await page.getByRole("button", { name: "Texto pesquisável", exact: true }).click(); await page.locator("pre").filter({ hasText: /PROTOCOLO MUNICIPAL/ }).waitFor();
    await page.goto(`${origin}/assinatura-digital/acervo/${textId}`);
    await page.getByRole("button", { name: "Abrir Histórico de versões", exact: true }).click();
    const dialog = page.getByRole("dialog"); await dialog.locator("table tbody tr").nth(1).waitFor();
    await page.waitForFunction(() => { const rect = document.querySelector('[role="dialog"]')?.getBoundingClientRect(); return rect && Math.abs(rect.width - innerWidth) < 2 && Math.abs(rect.height - innerHeight) < 2; }, undefined, { timeout: 5000 });
    const panel = await dialog.boundingBox(); report.versionPanelGeometry = panel;
    assert(panel.width >= 1438 && panel.height >= 998, "VERSION_PANEL_NOT_FULLSCREEN");
    report.versionPanel = true;
    await page.screenshot({ path: join(evidenceDirectory, "version-panel.png"), fullPage: true });
    assert.equal(pageErrors.length, 0, "BROWSER_RUNTIME_ERRORS");
    await ctx.close();
    return report;
  } catch (error) {
    error.browserReport = report;
    for (const [index, context] of browser.contexts().entries()) for (const [number, page] of context.pages().entries()) await page.screenshot({ path: join(evidenceDirectory, `failure-${index}-${number}.png`), fullPage: true }).catch(() => {});
    throw error;
  } finally { await browser.close(); }
}
