/** Exercises the repaired controls; --apply saves a fictional scheduled session and a draft's unchanged text. */
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { chromium } from "playwright-core";

const base = process.env.CHECKUP_LOCAL_BASE || "http://localhost:3100";
const output = process.env.CHECKUP_CHAMBER_OUTPUT || "docs/checkup/chamber-sessions-local";
const apply = process.argv.includes("--apply");
const browser = await chromium.connectOverCDP("http://127.0.0.1:9337");
const source = browser.contexts().find(context => context.pages().some(page => page.url().startsWith("https://guarama.celeriflow.com.br/")));
const session = (await source.cookies("https://guarama.celeriflow.com.br")).find(cookie => cookie.name === "celeriflow_session");
assert.ok(session);
const report = { startedAt: new Date().toISOString(), base, appliesFictionalData: apply, cases: [] };
mkdirSync(output, { recursive: true });
const persist = () => writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, timezoneId: "America/Sao_Paulo" });
await context.addCookies([{ name: session.name, value: session.value, url: base, httpOnly: true, secure: base.startsWith("https:"), sameSite: "Lax" }]);
const page = await context.newPage();
const errors = [];
page.on("pageerror", error => errors.push(error.message));
async function check(label, run) { try { const observations = await run(); report.cases.push({ label, passed: true, observations }); } catch (error) { report.cases.push({ label, passed: false, error: error.message }); process.exitCode = 1; } persist(); }
async function closeDialog(target) { await target.getByRole("dialog").getByRole("button", { name: "Fechar", exact: true }).click(); }
try {
  await page.goto(`${base}/camara/sessoes`, { waitUntil: "load", timeout: 120000 });
  await page.getByRole("button", { name: "Manter somente necessários", exact: true }).click();
  await check("Nova sessão abre e preserva rascunho ao fechar e reabrir", async () => {
    await page.getByRole("button", { name: "Nova Sessão", exact: true }).click();
    await page.getByLabel("Número da sessão", { exact: true }).fill("8205");
    await page.getByLabel("Tipo da sessão", { exact: true }).fill("Ordinária");
    await page.getByLabel("Data e hora da sessão", { exact: true }).fill("2026-11-29T14:00");
    await page.getByLabel("Local da sessão", { exact: true }).fill("Plenário das Veredas");
    await page.getByLabel("Quórum da sessão", { exact: true }).fill("9");
    await closeDialog(page);
    await page.getByRole("button", { name: "Nova Sessão", exact: true }).click();
    assert.equal(await page.getByLabel("Número da sessão", { exact: true }).inputValue(), "8205");
    assert.equal(await page.getByLabel("Data e hora da sessão", { exact: true }).inputValue(), "2026-11-29T14:00");
    await closeDialog(page);
    return { number: "8205", draftPreserved: true };
  });
  if (apply) await check("Sessão fictícia salva pela UI e reaberta com horário de Brasília preservado", async () => {
    const existing = page.getByRole("button", { name: "Gerenciar 8205ª sessão", exact: true });
    if (await existing.count()) await existing.click();
    else await page.getByRole("button", { name: "Nova Sessão", exact: true }).click();
    await page.getByRole("button", { name: "Salvar sessão", exact: true }).click();
    await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 30000 });
    await page.reload({ waitUntil: "load" });
    await page.getByRole("button", { name: "Gerenciar 8205ª sessão", exact: true }).click();
    assert.equal(await page.getByLabel("Data e hora da sessão", { exact: true }).inputValue(), "2026-11-29T14:00");
    assert.equal(await page.getByLabel("Situação da sessão", { exact: true }).inputValue(), "Agendada");
    await closeDialog(page);
    return { number: "8205", status: "Agendada", savedLocalTime: "2026-11-29T14:00" };
  });
  await check("Gerenciar sessão existente preenche os campos", async () => {
    await page.getByRole("button", { name: /Gerenciar \d+ª sessão/ }).first().click();
    assert.ok(await page.getByLabel("Número da sessão", { exact: true }).inputValue());
    assert.ok(await page.getByLabel("Data e hora da sessão", { exact: true }).inputValue());
    assert.ok(await page.getByLabel("Legislatura da sessão", { exact: true }).inputValue());
    await closeDialog(page); return { fieldsPopulated: true };
  });
  await page.getByLabel("Visualização de sessões").selectOption("atas");
  await check("Visualizar ata mostra conteúdo integral somente para leitura", async () => {
    await page.getByRole("button", { name: /Visualizar ata / }).first().click();
    const text = await page.getByLabel("Conteúdo da ata", { exact: true }).inputValue();
    assert.ok(text.length > 40);
    assert.equal(await page.getByLabel("Conteúdo da ata", { exact: true }).getAttribute("readonly"), "");
    assert.equal(await page.getByRole("button", { name: "Salvar ata", exact: true }).count(), 0);
    await closeDialog(page); return { characters: text.length, readOnly: true };
  });
  await check("Editar ata preserva texto ao fechar e reabrir", async () => {
    const edit = page.getByRole("button", { name: /Editar ata / }).first();
    await edit.click();
    const before = await page.getByLabel("Conteúdo da ata", { exact: true }).inputValue();
    await page.getByLabel("Conteúdo da ata", { exact: true }).fill(`${before}\nConferência do rascunho.`);
    await closeDialog(page); await edit.click();
    assert.equal(await page.getByLabel("Conteúdo da ata", { exact: true }).inputValue(), `${before}\nConferência do rascunho.`);
    await page.getByLabel("Conteúdo da ata", { exact: true }).fill(before);
    await closeDialog(page); return { draftPreserved: true, originalTextRestored: true };
  });
  if (apply) await check("Salvar ata em rascunho e rejeitar edição concorrente com versão antiga", async () => {
    const stale = await context.newPage();
    try {
      await stale.goto(`${base}/camara/sessoes`, { waitUntil: "load", timeout: 120000 });
      await stale.getByLabel("Visualização de sessões").selectOption("atas");
      await stale.getByRole("button", { name: /Editar ata / }).first().click();
      await page.getByRole("button", { name: /Editar ata / }).first().click();
      const original = await page.getByLabel("Conteúdo da ata", { exact: true }).inputValue();
      await page.getByRole("button", { name: "Salvar ata", exact: true }).click();
      await page.getByRole("dialog").waitFor({ state: "hidden", timeout: 30000 });
      await stale.getByRole("button", { name: "Salvar ata", exact: true }).click();
      await stale.getByRole("alert").filter({ hasText: /alterada, removida ou não está mais em rascunho/ }).waitFor({ timeout: 30000 });
      assert.equal(await stale.getByLabel("Conteúdo da ata", { exact: true }).inputValue(), original);
      return { staleEditRejected: true, textPreserved: true };
    } finally { await stale.close(); }
  });
  assert.deepEqual(errors, []);
} finally {
  await page.screenshot({ path: `${output}/final.png` }).catch(() => {});
  await context.close(); await browser.close();
  report.finishedAt = new Date().toISOString(); report.errors = errors; persist();
  console.log(JSON.stringify(report, null, 2));
}
