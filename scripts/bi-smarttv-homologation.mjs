// Connected browser verification. Requires the local application and configured Firebase/Neon.
// Uses the existing administrator identity; never logs credentials or session cookies.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { chromium } from "playwright-core";
import sharp from "sharp";

for (const file of [".env.local", ".env"]) {
  try { for (const [key, value] of Object.entries(parse(readFileSync(file)))) if (process.env[key] === undefined) process.env[key] = value; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
const port = Number(process.env.BI_HML_PORT || 3312);
const origin = `http://app.localhost:${port}`, local = `http://localhost:${port}`;
const run = randomUUID();
const directory = join(process.env.LOCALAPPDATA, "Temp", "opencode", `bi-smarttv-${run}`);
const report = { run, at: new Date().toISOString(), status: "FAIL", checks: [], viewports: [], evidenceDirectory: directory };
const check = label => report.checks.push(label);
let browser, app, connection, previous, editor, changed = false;
try {
  await mkdir(directory, { recursive: true });
  const { initializeApp, cert, deleteApp } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  app = initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) }, `bi-smarttv-${run}`);
  const auth = getAuth(app), user = await auth.getUserByEmail(process.env.SYSTEM_ADMIN_EMAIL);
  assert(!user.disabled && user.emailVerified);
  const token = await auth.createCustomToken(user.uid);
  const exchange = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) });
  assert.equal(exchange.status, 200);
  const { idToken } = await exchange.json();
  const response = await fetch(`${local}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json", origin: local }, body: JSON.stringify({ idToken }) });
  assert.equal(response.status, 200);
  const cookie = response.headers.getSetCookie().find(value => value.startsWith("celeriflow_session=")).split(";")[0].split("=").slice(1).join("=");
  const { databaseConnection } = await import("../src/db/client.ts"); connection = databaseConnection;
  const { loadDisplayChannel } = await import("../src/db/repositories/administration/bi-display.ts");
  previous = await loadDisplayChannel(connection.db);
  const executablePath = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find(existsSync);
  assert(executablePath);
  browser = await chromium.launch({ executablePath, headless: true });
  const authenticated = await browser.newContext({ viewport: { width: 1440, height: 1000 }, locale: "pt-BR" });
  await authenticated.addCookies([{ name: "celeriflow_session", value: cookie, url: origin, httpOnly: true, sameSite: "Lax" }]);
  editor = await authenticated.newPage();
  const errors = [];
  editor.on("pageerror", error => errors.push(error.message));
  await editor.goto(`${origin}/administracao/bi/smarttv`);
  await editor.getByRole("button", { name: "Manter somente necessários", exact: true }).click();
  await editor.getByLabel("Título da página", { exact: true }).waitFor();
  check("authenticated_editor_loaded");
  // Keep existing installations intact; initialize the municipality only when explicitly requested.
  const publishInitial = process.argv.includes("--publish-initial") && !previous?.publishedVersionId;
  assert(!previous?.publishedVersionId || !process.argv.includes("--publish-initial"), "Programação publicada existente: execute sem --publish-initial para preservá-la.");
  changed = true;
  await editor.getByLabel("Título da página", { exact: true }).fill("Visão geral da prefeitura");
  await editor.getByLabel("Tempo de exibição (segundos)").fill("10");
  await editor.getByLabel("Legenda / mensagem importante").fill("Indicadores da administração municipal. Estrutura e equipe: posição atual.");
  await editor.getByRole("button", { name: "Salvar rascunho", exact: true }).click();
  await editor.getByRole("status").filter({ hasText: "Rascunho salvo" }).waitFor();
  const beforePublish = await (await fetch(`${local}/api/public/bi/smarttv`)).json();
  assert.equal(beforePublish.version, previous?.publishedVersionId ?? null);
  check("draft_does_not_replace_publication");
  await editor.getByRole("button", { name: "Página", exact: true }).click();
  await editor.getByLabel("Título da página", { exact: true }).fill("Demandas e prazos");
  await editor.getByLabel("Tempo de exibição (segundos)").fill("10");
  await editor.getByLabel("Demandas canceladas", { exact: true }).check();
  await editor.getByLabel("Demandas vencidas", { exact: true }).check();
  await editor.getByLabel("Gráfico", { exact: true }).selectOption("timeline");
  await editor.getByRole("button", { name: "Página", exact: true }).click();
  await editor.getByLabel("Título da página", { exact: true }).fill("Informações à população");
  await editor.getByLabel("Tipo de página").selectOption("image");
  await editor.getByLabel("Tempo de exibição (segundos)").fill("10");
  const image = await sharp(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" width="1600" height="900"><rect width="1600" height="900" fill="#103653"/><circle cx="1400" cy="120" r="340" fill="#1b6c7a"/><text x="100" y="300" font-family="Arial" font-size="58" fill="#8ae4d9">INFORMAÇÃO PÚBLICA</text><text x="100" y="430" font-family="Arial" font-size="64" font-weight="bold" fill="white">Gestão municipal em números</text><text x="100" y="540" font-family="Arial" font-size="34" fill="white">Acompanhe os indicadores e resultados da administração.</text></svg>`)).png().toBuffer();
  await editor.getByLabel(/Enviar imagem para divulgação/).setInputFiles({ name: "informacao-municipal.png", mimeType: "image/png", buffer: image });
  await editor.getByRole("status").filter({ hasText: "Imagem enviada" }).waitFor();
  await editor.getByLabel("Legenda / mensagem importante").fill("Informações públicas do município · Dados atualizados pelo sistema municipal.");
  await editor.getByLabel("Fonte / crédito").fill("Administração municipal");
  await editor.getByRole("button", { name: "Prévia", exact: true }).click();
  await editor.locator("[data-smarttv-player]").waitFor();
  await editor.screenshot({ path: join(directory, "editor-preview.png") });
  await editor.getByRole("button", { name: "Voltar à edição" }).click();
  check("image_uploaded_and_live_dataset_preview");
  await editor.getByRole("button", { name: "Publicar", exact: true }).click();
  await editor.getByRole("status").filter({ hasText: "Programação publicada" }).waitFor();
  check("three_page_programme_published_from_ui");
  const published = await (await fetch(`${local}/api/public/bi/smarttv`)).json();
  assert.equal(published.status, "published");
  assert.equal(published.slides.length, (previous?.draft.slides.length ?? 1) + 2);
  const publicImage = published.slides.find(slide => slide.kind === "image").imageUrl;
  assert.equal((await fetch(local + publicImage)).headers.get("content-type"), "image/webp");
  assert(!JSON.stringify(published).includes("createdBy"));
  const publicContext = await browser.newContext({ locale: "pt-BR" });
  const tv = await publicContext.newPage();
  tv.on("pageerror", error => errors.push(error.message));
  for (const [name, width, height] of [["hd", 1280, 720], ["full-hd", 1920, 1080], ["4k", 3840, 2160], ["mobile", 390, 844]]) {
    await tv.setViewportSize({ width, height });
    await tv.goto(`${origin}/Smarttv`);
    await tv.locator("[data-smarttv-player] h1").waitFor();
    assert.equal(await tv.getByRole("dialog").count(), 0, "Nenhum overlay de cookies no player");
    const geometry = await tv.evaluate(() => {
      const player = document.querySelector("[data-smarttv-player]");
      const main = player.querySelector("main"), footer = player.querySelector("footer");
      return { viewport: [innerWidth, innerHeight], page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], mainBottom: main.getBoundingClientRect().bottom, footerTop: footer.getBoundingClientRect().top, overflow: [...main.querySelectorAll("h1,h3,article,section")].some(element => element.scrollHeight > element.clientHeight + 2) };
    });
    report.viewports.push({ name, ...geometry });
    await tv.screenshot({ path: join(directory, `${name}.png`) });
    assert(geometry.page[0] <= width + 1 && geometry.page[1] <= height + 1, `VIEWPORT_${name}`);
    assert(geometry.mainBottom <= geometry.footerTop + 1, `FOOTER_${name}`);
    assert(!geometry.overflow, `CONTENT_OVERFLOW_${name}`);
  }
  check("anonymous_player_no_overlay_no_overflow_four_viewports");
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto(`${origin}/Smarttv`);
  const firstPosition = await tv.locator("[data-smarttv-player] footer").innerText();
  await tv.waitForFunction(first => document.querySelector("[data-smarttv-player] footer")?.innerText !== first, firstPosition, { timeout: 25_000 });
  check("automatic_rotation");
  await tv.locator("[data-smarttv-player]").focus();
  await tv.keyboard.press("ArrowRight");
  await tv.getByRole("button", { name: "Pausar apresentação", exact: true }).click({ force: true });
  await tv.getByRole("button", { name: "Retomar apresentação", exact: true }).waitFor();
  check("remote_keys_and_pause");
  await publicContext.setOffline(true);
  await tv.evaluate(() => window.dispatchEvent(new Event("online")));
  await tv.getByText(/Sem conexão/).waitFor();
  await publicContext.setOffline(false);
  await tv.evaluate(() => window.dispatchEvent(new Event("online")));
  await tv.waitForFunction(() => !document.querySelector("[data-smarttv-player] footer")?.textContent.includes("Sem conexão"));
  check("offline_retention_and_reconnection");
  // Stress the public renderer without writing artificial municipal records.
  const { metricKeys } = await import("../src/lib/bi/display-model.ts");
  let fixtureDisplay = structuredClone(published);
  fixtureDisplay.version = `fixture-${run}`;
  fixtureDisplay.slides = [{ ...fixtureDisplay.slides[0], id: randomUUID(), title: "Ensaio visual de página mista", subtitle: "Imagem institucional e indicadores selecionados", kind: "mixed", imageUrl: publicImage, duration: 10,
    metricOrder: metricKeys.slice(0, 6), dataset: { metrics: Object.fromEntries(metricKeys.slice(0, 6).map((key, index) => [key, index * 1000])), periodLabel: "Ano atual · Estrutura e equipe na posição atual", chartMax: 400,
      chart: [1, 2, 3, 4].map(index => ({ name: `Secretaria Municipal de Planejamento e Desenvolvimento Institucional ${index}`, value: index * 100 })) } }];
  await tv.route("**/api/public/bi/smarttv", route => route.fulfill({ json: fixtureDisplay }));
  await tv.goto(`${origin}/Smarttv`);
  await tv.getByRole("heading", { name: "Ensaio visual de página mista", exact: true }).waitFor({ timeout: 25_000 });
  for (const [name, width, height] of [["mixed-hd", 1280, 720], ["mixed-mobile", 390, 844]]) {
    await tv.setViewportSize({ width, height });
    const overflow = await tv.locator("[data-smarttv-player] main").evaluate(main => [...main.querySelectorAll("h1,h3,article,section")].filter(element => element.scrollHeight > element.clientHeight + 2).map(element => element.tagName));
    assert.deepEqual(overflow, [], `MIXED_CONTENT_OVERFLOW_${name}`);
    await tv.screenshot({ path: join(directory, `${name}.png`) });
  }
  check("mixed_image_six_metrics_long_category_labels_hd_and_mobile");
  fixtureDisplay = { ...fixtureDisplay, version: `fixture-next-${run}`, slides: [{ ...fixtureDisplay.slides[0], title: "Nova versão de página única" }] };
  await tv.evaluate(() => window.dispatchEvent(new Event("online")));
  await tv.getByRole("heading", { name: "Nova versão de página única", exact: true }).waitFor({ timeout: 25_000 });
  check("single_page_programme_receives_new_version");
  fixtureDisplay = { ...fixtureDisplay, validUntil: new Date(Date.now() + 2000).toISOString() };
  await tv.evaluate(() => window.dispatchEvent(new Event("online")));
  await tv.getByRole("heading", { name: "Reconectando a programação", exact: true }).waitFor({ timeout: 8000 });
  check("expired_public_manifest_stops_display");
  for (let count = await editor.getByLabel("Página em edição").locator("option").count(); count < 21; count++) {
    await editor.getByRole("button", { name: "Duplicar", exact: true }).click();
  }
  await editor.getByRole("button", { name: /Organizar páginas/ }).click();
  const table = editor.getByRole("table");
  await table.waitFor(); assert.equal(await table.locator("tbody tr").count(), 20);
  await editor.screenshot({ path: join(directory, "pages-table.png") });
  await editor.getByRole("dialog").getByRole("button", { name: "Próxima página", exact: true }).click();
  assert.equal(await table.locator("tbody tr").count(), 1);
  await editor.getByRole("button", { name: "Fechar", exact: true }).click();
  check("shared_operational_table_20_1_pagination");
  await editor.getByRole("button", { name: "Identidade e publicação", exact: true }).click();
  await editor.getByRole("button", { name: "Retirar programação pública", exact: true }).click();
  await editor.getByRole("status").filter({ hasText: "Programação retirada" }).waitFor();
  assert.equal((await fetch(local + publicImage)).status, 404);
  assert.equal((await (await fetch(`${local}/api/public/bi/smarttv`)).json()).status, "empty");
  check("withdrawal_removes_public_media_and_programme");
  if (publishInitial) {
    await editor.getByRole("button", { name: "Publicar", exact: true }).click();
    await editor.getByRole("status").filter({ hasText: "Programação publicada" }).waitFor();
    report.initialProgrammePublished = true;
    changed = false;
  }
  assert.deepEqual(errors, [], "Erros JavaScript");
  check("no_browser_runtime_errors");
  report.status = "PASS";
  await deleteApp(app); app = null;
} catch (error) {
  report.failure = String(error.message).replace(/https?:\/\/\S+|[\w-]{35,}/g, "[redacted]").slice(0, 500);
  if (editor && !editor.isClosed()) {
    await editor.screenshot({ path: join(directory, "failure.png") }).catch(() => {});
    report.editorAlert = (await editor.getByRole("alert").allTextContents().catch(() => [])).join(" ").slice(0, 300);
  }
  process.exitCode = 1;
} finally {
  if (changed && connection) {
    const { biDisplayChannels } = await import("../src/db/schema/bi-display.ts");
    const { eq, sql } = await import("drizzle-orm");
    if (previous) await connection.db.update(biDisplayChannels).set({ draft: previous.draft, publishedVersionId: previous.publishedVersionId, revision: sql`${biDisplayChannels.revision} + 1`, updatedAt: new Date(), updatedBy: previous.updatedBy }).where(eq(biDisplayChannels.id, "municipal-public"));
    else await connection.db.update(biDisplayChannels).set({ publishedVersionId: null }).where(eq(biDisplayChannels.id, "municipal-public"));
  }
  await browser?.close();
  if (app) { const { deleteApp } = await import("firebase-admin/app"); await deleteApp(app); }
  await connection?.pool.end();
  await writeFile("docs/BI_SMARTTV_HOMOLOGACAO_RESULTADO.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
