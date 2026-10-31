// Read-only production acceptance: waits for the GitHub -> Vercel deployment,
// verifies the anonymous player and existing administrative editor, and logs out.
import assert from "node:assert/strict";
import { existsSync, readFileSync } from "node:fs";
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import { randomUUID } from "node:crypto";
import { execFileSync } from "node:child_process";
import { parse } from "dotenv";
import { chromium } from "playwright-core";

for (const file of [".env.local", ".env"]) {
  try { for (const [key, value] of Object.entries(parse(readFileSync(file)))) if (process.env[key] === undefined) process.env[key] = value; }
  catch (error) { if (error.code !== "ENOENT") throw error; }
}
const origin = "https://guarama.celeriflow.com.br";
const commit = execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const run = randomUUID();
const directory = join(process.env.LOCALAPPDATA, "Temp", "opencode", `bi-smarttv-production-${run}`);
const report = { run, at: new Date().toISOString(), origin, commit, status: "FAIL", checks: [], viewports: [], evidenceDirectory: directory };
const check = label => report.checks.push(label);
let browser, app, cookie;
try {
  await mkdir(directory, { recursive: true });
  const deadline = Date.now() + 30 * 60_000;
  for (;;) {
    const response = await fetch(`https://api.github.com/repos/Robonuvem-dev/Celeriflow-Guarama/commits/${commit}/status`, { headers: { "User-Agent": "Celeriflow-SmartTV-Acceptance" }, signal: AbortSignal.timeout(60_000) });
    assert.equal(response.status, 200, "GitHub deployment status unavailable");
    const status = await response.json();
    const vercel = status.statuses.find(item => item.context === "Vercel");
    if (vercel?.state === "success") { report.deployment = { state: vercel.state, url: vercel.target_url }; break; }
    if (vercel && ["error", "failure"].includes(vercel.state)) throw new Error(`Vercel deployment ${vercel.state}: ${vercel.description}`);
    assert(Date.now() < deadline, "Vercel deployment did not finish within thirty minutes");
    await delay(60_000);
  }
  check("github_vercel_deployment_success");
  const pageResponse = await fetch(`${origin}/Smarttv`, { redirect: "manual", signal: AbortSignal.timeout(90_000) });
  assert.equal(pageResponse.status, 200, "Smarttv must open without a login redirect");
  assert((await pageResponse.text()).includes("data-smarttv-player"));
  const alias = await fetch(`${origin}/smarttv`, { redirect: "manual" });
  assert([301, 307, 308].includes(alias.status));
  assert.equal(new URL(alias.headers.get("location"), origin).pathname, "/Smarttv");
  check("anonymous_canonical_page_and_alias");
  const dataResponse = await fetch(`${origin}/api/public/bi/smarttv`, { cache: "no-store" });
  assert.equal(dataResponse.status, 200);
  const manifest = await dataResponse.json();
  assert.equal(manifest.status, "published");
  assert(manifest.slides.length >= 3);
  assert(manifest.municipality.name && manifest.municipality.logoUrl);
  for (const field of ["createdBy", "secretariatId", "draft", "cpf"]) assert(!JSON.stringify(manifest).includes(`"${field}"`), field);
  report.programme = { version: manifest.version, pages: manifest.slides.length, title: manifest.title, municipality: manifest.municipality.name };
  check("published_public_dataset_and_institutional_identity");
  const image = manifest.slides.find(slide => slide.imageUrl);
  assert(image, "Institutional image page is published");
  const imageResponse = await fetch(origin + image.imageUrl);
  assert.equal(imageResponse.status, 200);
  assert.equal(imageResponse.headers.get("content-type"), "image/webp");
  assert((await imageResponse.arrayBuffer()).byteLength > 0);
  check("published_media_is_readable_anonymously");
  const executablePath = ["C:\\Program Files (x86)\\Microsoft\\Edge\\Application\\msedge.exe", "C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe"].find(existsSync);
  assert(executablePath);
  browser = await chromium.launch({ executablePath, headless: true });
  const anonymous = await browser.newContext({ locale: "pt-BR" });
  const tv = await anonymous.newPage();
  const errors = [];
  tv.on("pageerror", () => errors.push("PUBLIC_BROWSER_RUNTIME_ERROR"));
  for (const [name, width, height] of [["hd", 1280, 720], ["full-hd", 1920, 1080], ["4k", 3840, 2160], ["mobile", 390, 844]]) {
    await tv.setViewportSize({ width, height });
    await tv.goto(`${origin}/Smarttv`);
    await tv.locator("[data-smarttv-player] h1").waitFor();
    assert.equal(await tv.getByRole("dialog").count(), 0);
    await tv.waitForFunction(() => [...document.querySelectorAll("[data-smarttv-player] header img")].every(element => element.complete && element.naturalWidth > 0));
    const geometry = await tv.evaluate(() => {
      const main = document.querySelector("[data-smarttv-player] main");
      return { page: [document.documentElement.scrollWidth, document.documentElement.scrollHeight], viewport: [innerWidth, innerHeight], overflow: [...main.querySelectorAll("h1,h3,article,section")].some(element => element.scrollHeight > element.clientHeight + 2) };
    });
    report.viewports.push({ name, ...geometry });
    assert(geometry.page[0] <= width + 1 && geometry.page[1] <= height + 1 && !geometry.overflow, `GEOMETRY_${name}`);
    await tv.screenshot({ path: join(directory, `${name}.png`) });
  }
  assert(!(await anonymous.cookies()).some(item => item.name === "celeriflow_session"));
  check("four_public_viewports_logo_no_overlay_no_scroll_no_session");
  await tv.setViewportSize({ width: 1920, height: 1080 });
  await tv.goto(`${origin}/Smarttv`);
  const position = await tv.locator("[data-smarttv-player] footer > div").last().locator("strong").innerText();
  await tv.waitForFunction(first => document.querySelector("[data-smarttv-player] footer")?.lastElementChild?.querySelector("strong")?.textContent !== first, position, { timeout: 125_000 });
  check("production_automatic_rotation");
  await tv.locator("[data-smarttv-player]").focus();
  await tv.keyboard.press("ArrowRight");
  // The controls intentionally hide after inactivity. Exercise the remote-key
  // shortcut rather than forcing a pointer click through a hidden toolbar.
  await tv.keyboard.press("Space");
  await tv.getByRole("button", { name: "Retomar apresentação", exact: true }).waitFor();
  check("production_remote_keys_and_pause");
  assert.deepEqual(errors, []);
  check("no_public_browser_runtime_errors");
  const privateResponse = await fetch(`${origin}/administracao/bi/smarttv`, { redirect: "manual" });
  assert([301, 307, 308].includes(privateResponse.status));
  assert.equal(new URL(privateResponse.headers.get("location"), origin).pathname, "/login");
  check("administration_requires_login");
  const { initializeApp, cert } = await import("firebase-admin/app");
  const { getAuth } = await import("firebase-admin/auth");
  app = initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) }, `bi-production-${run}`);
  const auth = getAuth(app);
  const user = await auth.getUserByEmail(process.env.SYSTEM_ADMIN_EMAIL);
  assert(!user.disabled && user.emailVerified);
  const token = await auth.createCustomToken(user.uid);
  const exchange = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token, returnSecureToken: true }) });
  assert.equal(exchange.status, 200);
  const credentials = await exchange.json();
  const session = await fetch(`${origin}/api/auth/session`, { method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify({ idToken: credentials.idToken }) });
  assert.equal(session.status, 200);
  cookie = session.headers.getSetCookie().find(value => value.startsWith("celeriflow_session=")).split(";")[0];
  const authenticated = await browser.newContext({ locale: "pt-BR", viewport: { width: 1440, height: 1000 } });
  await authenticated.addCookies([{ name: "celeriflow_session", value: cookie.slice(cookie.indexOf("=") + 1), url: origin, httpOnly: true, secure: true, sameSite: "Lax" }]);
  const editor = await authenticated.newPage();
  editor.on("pageerror", () => errors.push("ADMINISTRATIVE_BROWSER_RUNTIME_ERROR"));
  await editor.goto(`${origin}/administracao/bi/smarttv`);
  await editor.getByRole("button", { name: "Manter somente necessários", exact: true }).click();
  await editor.getByLabel("Título da página", { exact: true }).waitFor();
  assert(await editor.getByRole("button", { name: "Publicar", exact: true }).isEnabled());
  assert(await editor.getByRole("button", { name: "Salvar rascunho", exact: true }).isEnabled());
  assert((await editor.getByLabel("Página em edição").locator("option").count()) >= 3);
  await editor.screenshot({ path: join(directory, "administration.png") });
  assert.deepEqual(errors, []);
  check("authenticated_production_editor_and_saved_programme");
  report.status = "PASS";
} catch (error) {
  report.failure = String(error.message).replace(/https?:\/\/\S+|[\w-]{35,}/g, "[redacted]").slice(0, 400);
  process.exitCode = 1;
} finally {
  if (cookie) {
    const logout = await fetch(`${origin}/api/auth/session/logout`, { method: "POST", headers: { cookie, origin } }).catch(() => null);
    report.loggedOut = logout?.ok ?? false;
  }
  await browser?.close();
  if (app) { const { deleteApp } = await import("firebase-admin/app"); await deleteApp(app); }
  report.finishedAt = new Date().toISOString();
  await writeFile("docs/BI_SMARTTV_PRODUCAO_RESULTADO.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
}
