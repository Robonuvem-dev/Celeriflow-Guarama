/** Read-only UI checks: no business action is submitted. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { openCheckupBrowser } from "./lib/checkup-isolated-browser.mjs";

const base = process.env.CHECKUP_LOCAL_BASE || "http://localhost:3103";
const output = process.env.CHECKUP_WORKFLOWS_OUTPUT || "docs/checkup/final-workflows-development";
const { browser, sourceCookies } = await openCheckupBrowser();
const session = sourceCookies.find(cookie => cookie.name === "celeriflow_session");
assert.ok(session);
const report = { startedAt: new Date().toISOString(), base, cases: [] };
mkdirSync(output, { recursive: true });
try {
  for (const viewport of [{ width: 1366, height: 768 }, { width: 1280, height: 720 }]) {
    const context = await browser.newContext({ viewport, timezoneId: "America/Sao_Paulo" });
    await context.addCookies([{ name: session.name, value: session.value, url: base, httpOnly: true, sameSite: "Lax" }]);
    context.setDefaultTimeout(30000);
    context.setDefaultNavigationTimeout(180000);
    async function check(label, path, run) {
      const page = await context.newPage();
      const errors = [], mutations = [];
      page.on("pageerror", error => errors.push(error.message));
      page.on("request", request => { if (request.headers()["next-action"]) mutations.push(request.url()); });
      try {
        await page.goto(`${base}${path}`, { waitUntil: "load" });
        const consent = page.getByRole("button", { name: "Manter somente necessários", exact: true });
        await consent.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
        if (await consent.isVisible()) await consent.click();
        await run(page);
        assert.deepEqual(errors, []);
        assert.deepEqual(mutations, [], "Nenhuma gravação de negócio deve ser enviada");
        report.cases.push({ label, viewport, passed: true });
      } catch (error) { report.cases.push({ label, viewport, passed: false, message: error.message, errors }); process.exitCode = 1; }
      finally { await page.screenshot({ path: `${output}/${viewport.width}-${report.cases.length}.png` }).catch(() => {}); await page.close(); writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n"); }
    }
    const fits = async page => {
      assert.equal(await page.getByRole("heading", { name: "Esta área ainda não comporta a tabela no padrão.", exact: true }).count(), 0);
      assert.ok(await page.locator("[data-operational-list] table").isVisible());
      const geometry = await page.evaluate(() => ({ width: innerWidth, height: innerHeight, docWidth: document.documentElement.scrollWidth, docHeight: document.documentElement.scrollHeight }));
      assert.ok(geometry.docWidth <= geometry.width + 1 && geometry.docHeight <= geometry.height + 1, JSON.stringify(geometry));
    };
    try {
      await check("Motor fiscal: tabela, busca e rascunhos das operações", "/tributacao/motor-fiscal", async page => {
        await fits(page);
        await page.getByLabel("Buscar na visão atual", { exact: true }).fill("consulta sem correspondência 94827");
        assert.equal(await page.locator("[data-operational-list] tbody tr").count(), 0);
        await page.getByLabel("Buscar na visão atual", { exact: true }).fill("");
        await page.getByRole("button", { name: "Operações e formulários", exact: true }).click();
        await page.getByLabel("Fundamento da reversão", { exact: true }).fill("Conferência de rascunho sem envio");
        await page.getByRole("button", { name: "Consultar registros", exact: true }).click();
        await fits(page);
        await page.getByRole("button", { name: "Operações e formulários", exact: true }).click();
        assert.equal(await page.getByLabel("Fundamento da reversão", { exact: true }).inputValue(), "Conferência de rascunho sem envio");
        assert.equal(await page.locator("form form").count(), 0);
      });
      await check("Usuários: tabela e perfis complementares com rascunho preservado", "/configuracoes/usuarios", async page => {
        await fits(page);
        await page.getByRole("button", { name: "Perfis complementares", exact: true }).click();
        const details = page.locator("details").first();
        await details.locator("summary").click();
        const box = details.getByRole("checkbox").first();
        const original = await box.isChecked();
        await box.setChecked(!original);
        await page.getByRole("button", { name: "Voltar aos usuários", exact: true }).click();
        await fits(page);
        await page.getByRole("button", { name: "Perfis complementares", exact: true }).click();
        assert.equal(await box.isChecked(), !original);
        await box.setChecked(original);
        assert.equal(await page.locator("form form").count(), 0);
      });
      await check("Frota: painel mantém campos, arquivo e payload ao reabrir", "/frotas/movimentos", async page => {
        await fits(page);
        const open = () => page.getByRole("button", { name: "Registrar movimento ou importar arquivo", exact: true }).click();
        await open();
        let dialog = page.getByRole("dialog");
        await dialog.locator('[name="reason"]').fill("Origem do arquivo para conferência");
        await dialog.locator('[name="externalPlate"]').fill("ABC1D23");
        const fileText = "placa;referencia;data;descricao;quantidade;valor\nABC1D23;8309;2026-11-06;Consumo;10;60";
        await dialog.locator('input[type="file"]').setInputFiles({ name: "conferencia.csv", mimeType: "text/csv", buffer: Buffer.from(fileText) });
        const requestId = await dialog.locator('[name="requestId"]').inputValue();
        await dialog.getByRole("button", { name: "Fechar", exact: true }).click();
        await open(); dialog = page.getByRole("dialog");
        const payload = await dialog.locator("form").evaluate(async form => { const data = new FormData(form); const file = data.get("file"); return { reason: data.get("reason"), plate: data.get("externalPlate"), requestId: data.get("requestId"), name: file.name, content: await file.text() }; });
        assert.deepEqual(payload, { reason: "Origem do arquivo para conferência", plate: "ABC1D23", requestId, name: "conferencia.csv", content: fileText });
        await dialog.getByRole("button", { name: "Remover arquivo", exact: true }).click();
        assert.equal(await dialog.locator('input[type="file"]').evaluate(input => input.files.length), 0);
        assert.equal(await page.locator("form form").count(), 0);
      });
    } finally { await context.close(); }
  }
} finally { await browser.close(); report.finishedAt = new Date().toISOString(); writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report, null, 2)); }
