// Exercises the real editor without saving a draft or changing its publication.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import { parse } from "dotenv";
import { chromium } from "playwright-core";

for (const file of [".env.local", ".env"]) {
  try { for (const [key, value] of Object.entries(parse(readFileSync(file)))) if (process.env[key] === undefined) process.env[key] = value; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
const origin = process.env.BI_EDITOR_ORIGIN || "http://app.localhost:3312";
const run = randomUUID();
const directory = join(process.env.LOCALAPPDATA, "Temp", "opencode", `bi-smarttv-editor-${run}`);
const report = { run, origin, at: new Date().toISOString(), status: "FAIL", checks: [], evidenceDirectory: directory };
const check = label => report.checks.push(label);
let browser, app, cookie;
try {
  await mkdir(directory, { recursive: true });
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  app = initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) }, `bi-editor-${run}`);
  const auth = getAuth(app), user = await auth.getUserByEmail(process.env.SYSTEM_ADMIN_EMAIL);
  assert(!user.disabled && user.emailVerified);
  const token = await auth.createCustomToken(user.uid);
  const exchange = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) });
  assert.equal(exchange.status, 200);
  const { idToken } = await exchange.json();
  const sessionOrigin = origin.replace("app.localhost", "localhost");
  const session = await fetch(`${sessionOrigin}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json", origin: sessionOrigin }, body: JSON.stringify({ idToken }) });
  assert.equal(session.status, 200);
  cookie = session.headers.getSetCookie().find(value => value.startsWith("celeriflow_session=")).split(";")[0];
  const before = await (await fetch(`${sessionOrigin}/api/public/bi/smarttv`)).json();
  const executablePath = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find(existsSync);
  browser = await chromium.launch({ executablePath, headless: true });
  const context = await browser.newContext({ locale: "pt-BR", viewport: { width: 1440, height: 1000 } });
  await context.addCookies([{ name: "celeriflow_session", value: cookie.slice(cookie.indexOf("=") + 1), url: origin, httpOnly: true, secure: origin.startsWith("https:"), sameSite: "Lax" }]);
  const page = await context.newPage(), errors = [];
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(`${origin}/administracao/bi/smarttv`);
  const consent = page.getByRole("button", { name: "Manter somente necessários", exact: true });
  if (await consent.count()) await consent.click();
  const title = page.getByLabel("Título da página", { exact: true });
  await title.waitFor();
  await page.waitForLoadState("networkidle");
  const options = await page.getByLabel("Página em edição").locator("option").evaluateAll(items => items.map(item => ({ id: item.value, title: item.textContent.replace(/^\d+\. /, "") })));
  assert(options.length > 1, "This acceptance requires multiple existing pages");
  const selected = options[1];
  await page.getByRole("button", { name: /^Organizar páginas/ }).click();
  await page.getByRole("button", { name: `Visualizar ${selected.title}`, exact: true }).click();
  await page.locator("[data-smarttv-player] h1").filter({ hasText: selected.title }).waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.match(await page.locator("[data-smarttv-player] footer").innerText(), /de 1/);
  await page.screenshot({ path: join(directory, "selected-page-preview.png") });
  check("eye_closes_list_and_previews_selected_page_only");
  await page.getByRole("button", { name: "Voltar à edição", exact: true }).click();
  assert.equal(await title.inputValue(), selected.title);
  check("return_to_editing_preserves_selected_page");
  await page.getByRole("button", { name: /^Organizar páginas/ }).click();
  await page.getByRole("button", { name: `Editar ${options[0].title}`, exact: true }).click();
  await title.waitFor();
  assert.equal(await page.getByRole("dialog").count(), 0);
  assert.equal(await title.inputValue(), options[0].title);
  assert(await title.isEditable());
  await page.screenshot({ path: join(directory, "selected-page-editing.png") });
  check("explicit_edit_button_closes_list_and_opens_correct_form");
  const unsavedTitle = `Prévia sem salvar ${run.slice(0, 8)}`;
  await title.fill(unsavedTitle);
  await page.getByLabel("Exibir a partir de (opcional)").fill("2099-01-01T10:00");
  await page.getByRole("button", { name: "Visualizar página", exact: true }).click();
  await page.getByRole("heading", { name: unsavedTitle, exact: true }).waitFor();
  check("selected_preview_uses_unsaved_changes_and_shows_scheduled_page");
  await page.getByRole("button", { name: "Voltar à edição", exact: true }).click();
  assert.equal(await title.inputValue(), unsavedTitle);
  assert.equal(await page.getByLabel("Exibir a partir de (opcional)").inputValue(), "2099-01-01T10:00");
  check("preview_preserves_draft_fields_and_publication_window");
  await page.reload();
  await title.waitFor();
  assert.equal(await title.inputValue(), options[0].title);
  await page.getByRole("button", { name: "Prévia", exact: true }).click();
  await page.locator("[data-smarttv-player] h1").waitFor();
  check("whole_programme_preview_remains_available");
  const after = await (await fetch(`${sessionOrigin}/api/public/bi/smarttv`)).json();
  assert.equal(after.version, before.version);
  assert.deepEqual(errors, []);
  check("no_persisted_changes_no_publication_change_no_runtime_errors");
  report.status = "PASS";
} catch (error) { report.failure = error.message; process.exitCode = 1; }
finally {
  await browser?.close();
  if (cookie) await fetch(`${origin.replace("app.localhost", "localhost")}/api/auth/session/logout`, { method: "POST", headers: { cookie, origin: origin.replace("app.localhost", "localhost") } }).catch(() => null);
  if (app) { const { deleteApp } = await import("firebase-admin/app"); await deleteApp(app); }
  await writeFile("docs/BI_SMARTTV_EDITOR_RESULTADO.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
