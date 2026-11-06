/** Read-only confirmation of the additive Orçamento/SST presentation samples. */
import assert from "node:assert/strict";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { openCheckupBrowser } from "./lib/checkup-isolated-browser.mjs";

const base = process.env.CHECKUP_LOCAL_BASE || "http://localhost:3103";
const output = process.env.CHECKUP_SAMPLES_OUTPUT || "docs/checkup/finance-sst-samples-development";
const selectedPaths = process.env.CHECKUP_SAMPLES_PATHS ? new Set(JSON.parse(process.env.CHECKUP_SAMPLES_PATHS)) : null;
const actionManifest = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
const lookupActionIds = new Set(Object.entries(actionManifest.node).filter(([, action]) => action.filename === "src/app/app-domain/planejamento/actions.ts" && action.exportedName === "searchPlanningOptions").map(([id]) => id));
const { browser, sourceCookies } = await openCheckupBrowser();
const context = await browser.newContext({ viewport: { width: 1366, height: 768 }, timezoneId: "America/Sao_Paulo" });
await context.addCookies(sourceCookies.map(cookie => ({ name: cookie.name, value: cookie.value, url: base, httpOnly: cookie.httpOnly, secure: base.startsWith("https:"), sameSite: cookie.sameSite })));
context.setDefaultNavigationTimeout(180000);
context.setDefaultTimeout(30000);
mkdirSync(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), base, cases: [] };
async function check(label, path, run) {
  if (selectedPaths && !selectedPaths.has(path)) return;
  const page = await context.newPage(); const errors = [], mutations = [], readOnlyLookups = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.route("**/*", route => {
    const action = route.request().headers()["next-action"];
    if (action && !lookupActionIds.has(action)) { mutations.push(new URL(route.request().url()).pathname); return route.abort(); }
    if (action) readOnlyLookups.push("searchPlanningOptions");
    return route.continue();
  });
  try {
    const response = await page.goto(`${base}${path}`, { waitUntil: "load" });
    assert.equal(response.status(), 200);
    const consent = page.getByRole("button", { name: "Manter somente necessários", exact: true });
    await consent.waitFor({ state: "visible", timeout: 5000 }).catch(() => {});
    if (await consent.isVisible()) await consent.click();
    const observations = await run(page);
    assert.deepEqual(errors, []); assert.deepEqual(mutations, []);
    report.cases.push({ label, path, passed: true, observations, readOnlyLookups: readOnlyLookups.length });
  } catch (error) { report.cases.push({ label, path, passed: false, error: error.message, errors }); process.exitCode = 1; }
  finally { await page.screenshot({ path: `${output}/${report.cases.length}.png` }).catch(() => {}); await page.close(); writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n"); }
}
try {
  await check("Orçamento: duas despesas solicitadas, com valores e origem preservados", "/financeiro/orcamento", async page => {
    await page.getByRole("button", { name: "Consultar Solicitações de Despesa", exact: true }).click();
    const dialog = page.getByRole("dialog");
    const first = dialog.getByRole("row").filter({ hasText: "Materiais de expediente para organização do atendimento administrativo" });
    const second = dialog.getByRole("row").filter({ hasText: "Materiais de consumo para organização e identificação dos equipamentos de TI" });
    assert.equal(await first.count(), 1); assert.equal(await second.count(), 1);
    assert.match(await first.innerText(), /480,00/); assert.match(await second.innerText(), /320,00/);
    assert.match(await first.innerText(), /Solicitada/); assert.match(await second.innerText(), /Solicitada/);
    return { expenses: 2, total: "800.00", state: "Solicitada" };
  });
  await check("SST: consulta de Thiago visível às 9h de Brasília", "/sst/agenda/agendamentos", async page => {
    const row = page.getByRole("row").filter({ hasText: "Thiago Morcatty" });
    assert.equal(await row.count(), 1);
    assert.match(await row.innerText(), /30\/11\/2026.*09:00/);
    assert.match(await row.innerText(), /Renata Barbosa Ferreira/);
    assert.match(await row.innerText(), /BOOKED/);
    return { employee: "Thiago Morcatty", localTime: "2026-11-30T09:00", state: "BOOKED" };
  });
  await check("Portal pessoal: agendamento integrado e horários de Brasília sem erro de hidratação", "/portal-servidor/sst/agenda", async page => {
    const appointment = page.locator("article").filter({ hasText: "Renata Barbosa Ferreira" });
    assert.equal(await appointment.count(), 1);
    assert.match(await appointment.innerText(), /30\/11\/2026.*09:00/);
    const slots = await page.locator('select[name="startsAt"] option').allTextContents();
    assert.ok(slots.some(text => /30\/11\/2026.*09:30/.test(text)), JSON.stringify(slots));
    return { appointmentVisible: true, nextSlot: "2026-11-30T09:30", slots: slots.length - 1 };
  });
  await check("Prevenção: programação SIPAT e visita técnica na listagem compartilhada", "/sst/prevencao", async page => {
    assert.equal(await page.getByRole("row").filter({ hasText: "Semana de orientação sobre organização e bem-estar no trabalho" }).count(), 1);
    assert.equal(await page.getByRole("row").filter({ hasText: "Visita técnica programada aos postos de atendimento administrativo" }).count(), 1);
    return { records: 2, kinds: ["SIPAT", "VISIT"] };
  });
  await check("SIPAT: responsáveis canônicos, atividades e horário de Brasília", "/sst/prevencao/7c937d9f-adf9-4f7a-bc95-efb47dab5c66", async page => {
    const article = page.locator("article");
    assert.match(await article.innerText(), /Thiago Morcatty/);
    assert.match(await article.innerText(), /Custo total da programação: R\$ 0,00/);
    const dates = await article.locator("time").allTextContents();
    assert.ok(dates.some(text => /24\/11\/2026.*09:00.*Brasília/.test(text)), JSON.stringify(dates));
    assert.ok(dates.some(text => /26\/11\/2026.*10:00.*Brasília/.test(text)), JSON.stringify(dates));
    await page.getByRole("button", { name: "Próxima parte", exact: true }).click();
    const secondActivity = page.getByText("Rotina de pausas e canais de orientação ocupacional", { exact: true });
    const fits = await secondActivity.evaluate(node => {
      const bounds = node.getBoundingClientRect(), viewport = node.closest("[data-operational-content-viewport]").getBoundingClientRect();
      return bounds.top >= viewport.top && bounds.bottom <= viewport.bottom;
    });
    assert.ok(fits, "A segunda atividade precisa ficar acessível pela paginação de conteúdo");
    return { plannedActivities: 2, cost: "0.00", organizer: "Thiago Morcatty", secondContentPageVerified: true };
  });
  await check("Visita preventiva: detalhe com programação e responsável integrados", "/sst/prevencao/9b3570ce-88b4-4ff6-9ff7-b9220f720c28", async page => {
    const article = page.locator("article");
    assert.match(await article.innerText(), /Thiago Morcatty/);
    assert.match(await article.innerText(), /Atividade ainda não realizada/);
    assert.match(await article.locator("time").innerText(), /19\/11\/2026.*10:00.*Brasília/);
    return { planned: true, responsible: "Thiago Morcatty", localTime: "2026-11-19T10:00" };
  });
  for (const [kind, codes] of [
    ["atividade", ["ATV-001", "ATV-002"]],
    ["procedimento-fiscal", ["CAD-001", "CAD-002"]],
    ["evento-contabil", ["EVT-001", "EVT-002"]],
    ["codigo-tributacao-desif", ["CTD-001", "CTD-002"]],
    ["codigo-tributacao-municipal", ["CTM-001", "CTM-002"]],
  ]) {
    await check(`Referências fiscais: ${kind}, rótulos e busca no catálogo`, `/tributacao/referencias?catalogo=${kind}`, async page => {
      const catalog = page.getByRole("combobox").filter({ has: page.locator('option[value="procedimento-fiscal"]') });
      await catalog.waitFor();
      assert.equal(await catalog.inputValue(), kind);
      for (const code of codes) {
        const row = page.getByRole("row").filter({ has: page.getByRole("cell", { name: code, exact: true }) });
        assert.equal(await row.count(), 1);
        assert.match(await row.innerText(), /Prefeitura Municipal de Aurora das Veredas/);
        assert.match(await row.innerText(), /Referência auxiliar do ambiente municipal fictício/);
        assert.doesNotMatch(await row.innerText(), /\b(?:DEMO|POC|Teste|dummy|placeholder)\b/i);
      }
      const search = page.getByLabel("Pesquisar código, nome ou descrição", { exact: true });
      await search.fill(codes[0]);
      assert.equal(await page.getByRole("row").filter({ has: page.getByRole("cell", { name: codes[1], exact: true }) }).count(), 0);
      await search.fill("");
      assert.equal(await page.getByRole("row").filter({ has: page.getByRole("cell", { name: codes[1], exact: true }) }).count(), 1);
      return { kind, codes, originVerified: true, searchVerified: true };
    });
  }
  for (const [kind, id, code, title] of [
    ["ldo", "cmw599c0s0001gchymhv20hk1", "MINUTA-LDO-2026-01", "Minuta de diretrizes orçamentárias 2026"],
    ["loa", "cmw599c8i0004gchy601v86jw", "MINUTA-LOA-2026-01", "Minuta da programação orçamentária anual 2026"],
  ]) {
    await check(`Planejamento: ${kind.toUpperCase()} em elaboração na listagem`, `/planejamento/${kind}`, async page => {
      const row = page.getByRole("row").filter({ hasText: code });
      assert.equal(await row.count(), 1);
      assert.ok((await row.innerText()).includes(title));
      assert.match(await row.innerText(), /Em elaboração/);
      assert.match(await row.innerText(), /Prefeitura Municipal de Aurora das Veredas/);
      assert.equal(await row.getByRole("link", { name: "Abrir", exact: true }).getAttribute("href"), `/planejamento/${kind}/${id}`);
      return { code, state: "DRAFT", id };
    });
    await check(`Planejamento: detalhe da minuta ${kind.toUpperCase()}`, `/planejamento/${kind}/${id}`, async page => {
      await page.getByRole("combobox", { name: "Área da consulta", exact: true }).selectOption("context");
      await page.locator('div[aria-label="Contexto e operações"]').waitFor();
      assert.equal(new URL(page.url()).pathname, `/planejamento/${kind}/${id}`);
      const text = await page.locator("body").innerText();
      assert.match(text, /Em elaboração/);
      assert.match(text, /Prefeitura Municipal de Aurora das Veredas/);
      assert.doesNotMatch(text, /Application error:|Erro Interno do Servidor|This page could not be found\./);
      await page.getByRole("combobox", { name: "Área da consulta", exact: true }).selectOption("lines");
      assert.match(await page.locator("body").innerText(), /Nenhuma previsão cadastrada/);
      return { instrumentId: id, state: "DRAFT", contextVerified: true, forecastRows: 0 };
    });
  }
  await check("Planejamento: audiência programada e contribuição comunitária em análise", "/planejamento/audiencias?hearingId=cmw599cgo0006gchys9gxitbi", async page => {
    const row = page.getByRole("row").filter({ hasText: "Daniel Ribeiro Freitas" });
    assert.equal(await row.count(), 1);
    assert.match(await row.innerText(), /Melhoria da sinalização dos serviços/);
    assert.match(await row.innerText(), /Em análise/);
    await page.getByRole("combobox", { name: "Área da consulta", exact: true }).selectOption("context");
    await page.locator('[data-slot="card-title"]').filter({ hasText: "Audiência programada: prioridades de atendimento e modernização administrativa" }).waitFor();
    assert.match(await page.locator("body").innerText(), /26\/11\/2026/);
    return { hearingPlanned: true, demandState: "PENDING", requester: "Daniel Ribeiro Freitas" };
  });
  await check("Controle Interno: Thiago integrado ao centro de custo e à revisão contratual", "/controle-interno/consultas/rh?employeeId=THIAGO_MORCATTY_DEMO_2026_V1%3Aemployee&financialYearId=aurora-mg-50k-v1%3Afinancial-year%3A000&referenceDate=2026-12-31", async page => {
    const role = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Coordenador de TI", exact: true }) });
    assert.equal(await role.count(), 1);
    assert.equal((await role.getByRole("cell").nth(8).innerText()).trim(), "1");
    assert.equal((await role.getByRole("cell").nth(9).innerText()).trim(), "1");
    await page.getByRole("combobox", { name: "Visão das estatísticas funcionais", exact: true }).selectOption("records");
    const employee = page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Thiago Morcatty", exact: true }) });
    assert.equal(await employee.count(), 1);
    assert.match(await employee.innerText(), /Paço Municipal/);
    assert.equal((await employee.getByRole("cell").nth(7).innerText()).trim(), "2");
    return { people: 1, contracts: 1, contractVersion: 2, center: "Paço Municipal" };
  });
  await check("Controle Interno: consulta histórica de outubro não recebe o vínculo de novembro", "/controle-interno/consultas/rh?employeeId=THIAGO_MORCATTY_DEMO_2026_V1%3Aemployee&financialYearId=aurora-mg-50k-v1%3Afinancial-year%3A000&referenceDate=2026-10-31", async page => {
    await page.getByRole("combobox", { name: "Visão das estatísticas funcionais", exact: true }).selectOption("records");
    assert.equal(await page.getByRole("row").filter({ has: page.getByRole("cell", { name: "Thiago Morcatty", exact: true }) }).count(), 0);
    return { historicalOctoberPreserved: true, costScopeRows: 0 };
  });
} finally { await context.close(); await browser.close(); report.finishedAt = new Date().toISOString(); writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report, null, 2)); }
