/** Run manually AFTER the final production build and starting its server.
 * No server spawning, database client, file output, browser or credential log.
 * See docs/drizzle-authenticated-homologation-progress.md for the HTTP contracts.
 */
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(new URL("../package.json", import.meta.url));
const COOKIE = "celeriflow_session";
const CATALOG = "/patrimonio/centros-custo";
const ACTION_FILE = "src/app/app-domain/patrimonio/centros-custo/actions.ts";
const allowedOrigins = new Set(["http://localhost:3309", "https://guarama.celeriflow.com.br"]);
// Public URL -> /app-domain URL in src/proxy.ts. Leaf pages avoid known entry
// redirects; navigation/authorization are checked again in the rendered HTML.
const pages = [
  ["ADMINISTRACAO", "/administracao", "/administracao"],
  ["CADASTROS", "/cadastros", null],
  ["PROCESSOS", "/protocolos", "/protocolos"],
  ["ATENDIMENTO", "/atendimento", "/atendimento"],
  ["TRANSPARENCIA", "/transparencia", "/transparencia"],
  ["TRIBUTACAO", "/tributacao", "/tributacao"],
  ["FINANCEIRO", "/financeiro", "/financeiro"],
  ["PLANEJAMENTO", "/planejamento", "/planejamento"],
  ["SST", "/sst", "/sst"],
  ["COMPRAS", "/compras/catalogo", "/compras"],
  ["RH", "/rh", "/rh"],
  ["PATRIMONIO", CATALOG, "/patrimonio"],
  ["EDUCACAO", "/educacao", "/educacao"],
  ["SAUDE", "/saude", "/saude"],
  ["SOCIAL", "/social", "/social"],
  ["MEIO_AMBIENTE", "/meio-ambiente", "/meio-ambiente"],
  ["SANEAMENTO", "/saneamento/unidades", "/saneamento"],
  ["OBRAS", "/obras", "/obras"],
  ["FROTAS", "/frotas", "/frotas"],
  ["CEMITERIOS", "/cemiterios/estrutura", "/cemiterios"],
];

class CheckError extends Error {
  constructor(code) { super(code); this.code = code; }
}
function ensure(condition, code) { if (!condition) throw new CheckError(code); }
const safeCode = error => error instanceof CheckError ? error.code : "UNEXPECTED_FAILURE_REDACTED";
const normalize = value => value.normalize("NFD").replace(/\p{M}/gu, "").toLowerCase().replace(/\s+/g, " ").trim();

function argumentsFrom(argv) {
  if (argv.length === 1 && argv[0] === "--help") return null;
  const originArgs = argv.filter(value => value.startsWith("--origin="));
  ensure(originArgs.length === 1 && argv.every(value => value.startsWith("--origin=") || value === "--crud"), "USAGE_EXPLICIT_ORIGIN_REQUIRED");
  ensure(argv.filter(value => value === "--crud").length <= 1, "USAGE_DUPLICATE_CRUD");
  let origin;
  try { origin = new URL(originArgs[0].slice("--origin=".length)); } catch { throw new CheckError("ORIGIN_INVALID"); }
  ensure(!origin.username && !origin.password && origin.pathname === "/" && !origin.search && !origin.hash && allowedOrigins.has(origin.origin), "ORIGIN_NOT_ALLOWLISTED");
  return { origin: origin.origin, crud: argv.includes("--crud") };
}

async function environment() {
  const { parse } = await import("dotenv");
  // Same production-file precedence as Next. Existing process env wins.
  const env = { ...process.env };
  for (const name of [".env.production.local", ".env.local", ".env.production", ".env"]) {
    const path = resolve(root, name);
    if (!existsSync(path)) continue;
    let values;
    try { values = parse(readFileSync(path)); } catch { throw new CheckError("ENV_FILE_UNREADABLE"); }
    for (const [key, value] of Object.entries(values)) if (env[key] === undefined) env[key] = value;
  }
  for (const key of ["SYSTEM_ADMIN_EMAIL", "FIREBASE_PROJECT_ID", "FIREBASE_CLIENT_EMAIL", "FIREBASE_PRIVATE_KEY", "NEXT_PUBLIC_FIREBASE_API_KEY"]) ensure(typeof env[key] === "string" && env[key].trim().length > 0, `ENV_REQUIRED_${key}`);
  ensure(!env.FIREBASE_AUTH_EMULATOR_HOST, "FIREBASE_EMULATOR_NOT_REAL_AUTH");
  return env;
}

function buildArtifacts(crud) {
  let buildId, manifest;
  try {
    buildId = readFileSync(resolve(root, ".next/BUILD_ID"), "utf8").trim();
    if (crud) manifest = JSON.parse(readFileSync(resolve(root, ".next/server/server-reference-manifest.json"), "utf8"));
  } catch { throw new CheckError("FINAL_BUILD_ARTIFACTS_REQUIRED"); }
  ensure(buildId.length > 0, "FINAL_BUILD_ID_REQUIRED");
  return { manifest };
}

function actionId(manifest, exportedName, worker) {
  const matches = [];
  for (const entries of [manifest?.node, manifest?.edge]) {
    for (const [id, entry] of Object.entries(entries ?? {})) {
      const binding = entry.workers?.[worker];
      if ((entry.exportedName ?? binding?.exportedName) === exportedName && (entry.filename ?? binding?.filename) === ACTION_FILE && binding) matches.push(id);
    }
  }
  ensure(matches.length === 1 && /^[a-f0-9]{40,}$/.test(matches[0]), "ACTION_MANIFEST_BINDING_NOT_UNIQUE");
  return matches[0];
}

async function responseText(response, limit = 16 * 1024 * 1024) {
  if (!response.body) return "";
  const reader = response.body.getReader(), decoder = new TextDecoder();
  let size = 0, text = "";
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      ensure(size <= limit, "RESPONSE_BODY_LIMIT_EXCEEDED");
      text += decoder.decode(value, { stream: true });
    }
    return text + decoder.decode();
  } finally { await reader.cancel().catch(() => {}); reader.releaseLock(); }
}

function parseJson(text) {
  try { return JSON.parse(text); } catch { throw new CheckError("JSON_RESPONSE_REQUIRED"); }
}

function assertJsonOk(response, code) {
  ensure(response.status === 200 && !response.headers.has("location") && /^application\/json(?:;|$)/i.test(response.headers.get("content-type") ?? "") && parseJson(response.text).ok === true, code);
}

function sessionCookie(headers, cleared = false) {
  const values = headers.getSetCookie();
  const selected = values.filter(value => value.startsWith(`${COOKIE}=`));
  ensure(values.length === 1 && selected.length === 1, "SESSION_COOKIE_NOT_UNIQUE");
  const parts = selected[0].split(";").map(part => part.trim());
  const value = parts.shift().slice(COOKIE.length + 1);
  const attributes = new Map(parts.map(part => { const at = part.indexOf("="); return at < 0 ? [part.toLowerCase(), ""] : [part.slice(0, at).toLowerCase(), part.slice(at + 1)]; }));
  ensure(attributes.has("httponly") && attributes.has("secure") && attributes.get("samesite")?.toLowerCase() === "lax" && attributes.get("path") === "/" && !attributes.has("domain"), "SESSION_COOKIE_ATTRIBUTES_INVALID");
  ensure(Number(attributes.get("max-age")) === (cleared ? 0 : 432000), "SESSION_COOKIE_DURATION_INVALID");
  ensure(cleared ? value === "" : /^[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+$/.test(value), "SESSION_COOKIE_VALUE_INVALID");
  return value;
}

class HttpSession {
  #cookie = "";
  constructor(origin) { this.origin = origin; }
  setCookie(value) { this.#cookie = value; }
  clear() { this.#cookie = ""; }
  async request(path, { method = "GET", body, headers = {}, authenticated = true } = {}) {
    ensure(path.startsWith("/") && !path.startsWith("//"), "TARGET_PATH_INVALID");
    const target = new URL(path, this.origin);
    ensure(target.origin === this.origin, "TARGET_ORIGIN_CHANGED");
    const requestHeaders = new Headers({ accept: "text/html", "cache-control": "no-store", ...headers });
    if (authenticated && this.#cookie) requestHeaders.set("cookie", `${COOKIE}=${this.#cookie}`);
    if (method === "POST") { requestHeaders.set("origin", this.origin); requestHeaders.set("referer", new URL(path, this.origin).href); }
    let response;
    try { response = await fetch(target, { method, body, headers: requestHeaders, redirect: "manual", cache: "no-store", signal: AbortSignal.timeout(90_000) }); }
    catch { throw new CheckError("HTTP_REQUEST_FAILED_OR_TIMED_OUT"); }
    let text;
    try { text = await responseText(response); } catch (error) { throw error instanceof CheckError ? error : new CheckError("HTTP_RESPONSE_INCOMPLETE"); }
    return { status: response.status, headers: response.headers, text };
  }
}

function flightText(document) {
  let text = "";
  for (const script of document.querySelectorAll("script")) {
    // script is an HTML raw-text element: decoding entities here would corrupt
    // Flight strings containing literal &quot; or &amp; from application data.
    const match = script.rawText.trim().match(/^self\.__next_f\.push\((\[[\s\S]*\])\);?$/);
    if (!match) continue;
    let frame;
    try { frame = JSON.parse(match[1]); } catch { throw new CheckError("NEXT_FLIGHT_FRAME_INVALID"); }
    if (frame[0] === 1 && typeof frame[1] === "string") text += frame[1];
  }
  return text;
}

function assertNoNextError(text, document) {
  const flight = document ? flightText(document) : text;
  ensure(!/NEXT_HTTP_ERROR_FALLBACK;(?:401|403|404|500)|NEXT_REDIRECT|(?:^|\n)[a-f0-9]+:E\{/i.test(flight), "NEXT_ERROR_OR_SOFT_REDIRECT");
  ensure(!/__next_error__|NextError500|NEXT_HTTP_ERROR_FALLBACK;500/i.test(text), "NEXT_SOFT_500");
  if (!document) return;
  const notices = document.querySelectorAll("title,h1,h2,h3,[role=alert]").map(node => normalize(node.textContent)).join(" ");
  ensure(!/erro interno do servidor|internal server error|application error|a server.side exception|something went wrong|sessao expirad|entre novamente para acessar|aguarda atualizacao do banco|nao foi possivel carregar|falha tecnica|acesso .{0,70} indisponivel|nao autorizad|acesso negado/.test(notices), "PRIVATE_PAGE_ERROR_FALLBACK");
  ensure(!document.querySelector('input[type="password"]'), "PRIVATE_PAGE_IS_LOGIN_FORM");
}

function html(response, parse, { protectedPage = true } = {}) {
  ensure(response.status === 200 && !response.headers.has("location"), "HTML_EXPECTED_200_WITHOUT_REDIRECT");
  ensure(/^text\/html(?:;|$)/i.test(response.headers.get("content-type") ?? ""), "HTML_CONTENT_TYPE_REQUIRED");
  const document = parse(response.text);
  ensure(document.querySelector("html") && document.querySelector("body"), "HTML_DOCUMENT_INCOMPLETE");
  assertNoNextError(response.text, document);
  if (protectedPage) ensure(document.querySelector('a[href="/dashboard"]') && document.querySelector("main"), "AUTHENTICATED_SHELL_REQUIRED");
  return document;
}

function formFromHtml(document, expectedActionId, path, origin, bound = false) {
  const forms = document.querySelectorAll("form").filter(form => form.querySelector('input[name="code"]') && form.querySelector('input[name="name"]') && form.querySelector('textarea[name="description"]'));
  ensure(forms.length === 1, "CATALOG_FORM_NOT_UNIQUE");
  const form = forms[0];
  ensure(form.getAttribute("method")?.toLowerCase() === "post" && form.getAttribute("enctype")?.toLowerCase() === "multipart/form-data", "NATIVE_MULTIPART_ACTION_CONTRACT_REQUIRED");
  const target = new URL(form.getAttribute("action") || path, origin);
  ensure(target.origin === origin && target.pathname === path && !target.search && !target.hash, "CATALOG_FORM_TARGET_CHANGED");
  const data = new FormData();
  for (const field of form.querySelectorAll("input")) {
    const name = field.getAttribute("name");
    if (!name?.startsWith("$ACTION_")) continue;
    ensure(field.getAttribute("type")?.toLowerCase() === "hidden" && !field.hasAttribute("disabled"), "ACTION_METADATA_NOT_HIDDEN");
    data.append(name, field.getAttribute("value") ?? "");
  }
  const names = [...data.keys()];
  ensure(new Set(names).size === names.length, "ACTION_METADATA_DUPLICATED");
  if (!bound) ensure(names.length === 1 && names[0] === `$ACTION_ID_${expectedActionId}`, "CREATE_FORM_ACTION_BUILD_MISMATCH");
  else {
    const markers = names.filter(name => name.startsWith("$ACTION_REF_"));
    ensure(markers.length === 1 && !names.some(name => name.startsWith("$ACTION_ID_")), "EDIT_FORM_BOUND_ACTION_REQUIRED");
    const prefix = `$ACTION_${markers[0].slice("$ACTION_REF_".length)}:`;
    ensure(names.every(name => name === markers[0] || name.startsWith(prefix)), "EDIT_FORM_EXTRA_ACTION_METADATA");
    const metadata = parseJson(String(data.get(`${prefix}0`)));
    ensure(metadata.id === expectedActionId && typeof metadata.bound === "string", "EDIT_FORM_ACTION_BUILD_MISMATCH");
    // Opaque bound metadata is copied verbatim, never reconstructed. The
    // source's bind(null, row.id) belongs to this edit URL.
  }
  return { data, initial: { code: form.querySelector('input[name="code"]').getAttribute("value") ?? "", name: form.querySelector('input[name="name"]').getAttribute("value") ?? "", description: form.querySelector('textarea[name="description"]').textContent } };
}

async function nativeSubmit(http, path, form, values) {
  for (const [name, value] of Object.entries(values)) form.data.set(name, value);
  const response = await http.request(path, { method: "POST", body: form.data });
  ensure(response.status === 303, "CATALOG_FORM_EXPECTED_303");
  let location;
  try { location = new URL(response.headers.get("location"), http.origin); } catch { throw new CheckError("CATALOG_FORM_REDIRECT_INVALID"); }
  ensure(location.origin === http.origin && location.pathname === CATALOG && !location.search && !location.hash, "CATALOG_FORM_REDIRECT_UNEXPECTED");
}

async function findOwnRecord(http, parse, code) {
  const response = await http.request(`${CATALOG}?${new URLSearchParams({ q: code })}`);
  const document = html(response, parse);
  const matches = document.querySelectorAll("tbody tr").filter(row => row.querySelectorAll("td")[0]?.textContent.trim() === code);
  ensure(matches.length <= 1, "CATALOG_TEST_IDENTITY_AMBIGUOUS");
  if (!matches.length) return null;
  const row = matches[0], cells = row.querySelectorAll("td");
  const links = row.querySelectorAll("a").map(link => link.getAttribute("href")).filter(href => /^\/patrimonio\/centros-custo\/[^/]+\/editar$/.test(href ?? ""));
  ensure(links.length === 1 && cells.length >= 6, "CATALOG_ROW_EDIT_LINK_REQUIRED");
  const id = links[0].split("/")[3];
  ensure(/^[A-Za-z0-9_-]{1,191}$/.test(id), "CATALOG_SCOPED_ID_INVALID");
  ensure(/^0 almoxarifado\(s\)$/.test(cells[3].textContent.trim()), "CATALOG_TEST_RECORD_HAS_LINKS");
  return { id, editPath: links[0], name: cells[1].textContent.trim(), description: cells[2].textContent.trim() };
}

async function catalogCrud(http, parse, manifest, recordCheck, report) {
  const worker = "app/app-domain/patrimonio/centros-custo";
  const createId = actionId(manifest, "createCostCenterAction", `${worker}/novo/page`);
  const updateId = actionId(manifest, "updateCostCenterAction", `${worker}/[id]/editar/page`);
  const deleteId = actionId(manifest, "deleteCostCenterAction", `${worker}/page`);
  const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node");
  ensure(typeof encodeReply === "function", "NEXT_ACTION_ENCODER_UNAVAILABLE");
  // No temp code/name/ID/trace is included in report or console output.
  const trace = randomUUID(), code = `HML-${trace.toUpperCase()}`;
  const values = { code, name: `Homologação HTTP ${new Date().toISOString()} ${trace}`, description: `Registro temporário isolado de homologação ${trace}` };
  const edited = { ...values, name: `${values.name} revisado` };
  let attempted = false, confirmed = false, knownId = null;
  try {
    ensure(await findOwnRecord(http, parse, code) === null, "CATALOG_TEST_IDENTITY_ALREADY_EXISTS");
    const createPath = `${CATALOG}/novo`;
    const form = formFromHtml(html(await http.request(createPath), parse), createId, createPath, http.origin);
    attempted = true; // Set BEFORE dispatch: a failed response may follow COMMIT.
    await nativeSubmit(http, createPath, form, values);
    confirmed = true;
    let own = await findOwnRecord(http, parse, code);
    ensure(own?.name === values.name && own.description === values.description, "CATALOG_CREATE_READBACK_FAILED");
    knownId = own.id; recordCheck("crud_create_and_readback", true);
    const editForm = formFromHtml(html(await http.request(own.editPath), parse), updateId, own.editPath, http.origin, true);
    ensure(editForm.initial.code === code && editForm.initial.name === values.name && editForm.initial.description === values.description, "CATALOG_EDIT_IDENTITY_MISMATCH");
    await nativeSubmit(http, own.editPath, editForm, edited);
    own = await findOwnRecord(http, parse, code);
    ensure(own?.id === knownId && own.name === edited.name && own.description === values.description, "CATALOG_UPDATE_READBACK_FAILED");
    recordCheck("crud_update_and_readback", true);
  } catch (error) {
    recordCheck("crud_operation", false, safeCode(error));
    throw error;
  } finally {
    if (attempted) {
      report.crud.cleanup = "UNCONFIRMED";
      try {
        // Never repeat create/update after an ambiguous response. Rediscover the
        // one UUID-scoped record, including a create committed before HTTP error.
        let own = null;
        for (let attempt = 0; attempt < 3; attempt++) {
          own = await findOwnRecord(http, parse, code);
          if (own || confirmed) break;
          await new Promise(resolve => setTimeout(resolve, 1000));
        }
        if (own) {
          ensure((!knownId || own.id === knownId) && [values.name, edited.name].includes(own.name) && own.description === values.description, "CLEANUP_CATALOG_IDENTITY_MISMATCH");
          knownId = own.id;
          const actual = formFromHtml(html(await http.request(own.editPath), parse), updateId, own.editPath, http.origin, true);
          ensure(actual.initial.code === code && actual.initial.description === values.description && [values.name, edited.name].includes(actual.initial.name), "CLEANUP_EDIT_IDENTITY_MISMATCH");
          // Real client-action POST, not a fabricated REST endpoint. encodeReply
          // is the installed Next/React encoder used by server-action-reducer.
          const response = await http.request(CATALOG, { method: "POST", body: await encodeReply([own.id]), headers: { accept: "text/x-component", "Next-Action": deleteId } });
          ensure(response.status === 200 && response.headers.get("content-type")?.startsWith("text/x-component") && response.headers.get("x-nextjs-action-not-found") !== "1" && !response.headers.has("location") && !response.headers.has("x-action-redirect"), "CATALOG_DELETE_ACTION_RESPONSE_INVALID");
          assertNoNextError(response.text);
          ensure(await findOwnRecord(http, parse, code) === null, "CATALOG_DELETE_READBACK_FAILED");
          ensure((await http.request(own.editPath)).status === 404, "CATALOG_DELETED_ID_STILL_READABLE");
        } else {
          ensure(confirmed && knownId, "CATALOG_CREATE_OUTCOME_UNKNOWN");
          ensure((await http.request(`${CATALOG}/${knownId}/editar`)).status === 404, "CLEANUP_SCOPED_ID_NOT_REMOVED");
        }
        report.crud.cleanup = "PASS"; recordCheck("crud_delete_and_absence", true);
      } catch (error) {
        recordCheck("crud_cleanup", false, safeCode(error));
        throw error;
      }
    }
  }
}

async function main(options) {
  const report = { scope: options.crud ? "AUTHENTICATED_READS_AND_ONE_CATALOG_CRUD" : "AUTHENTICATED_READS", origin: options.origin, status: "FAIL", domainsExpected: 20, domainsPassed: 0, crud: { requested: options.crud, status: options.crud ? "NOT_RUN" : "NOT_REQUESTED", cleanup: "NOT_NEEDED" }, checks: [] };
  const http = new HttpSession(options.origin);
  const recordCheck = (check, passed, reason, status) => report.checks.push({ check, passed, ...(reason ? { reason } : {}), ...(status === undefined ? {} : { status }) });
  let app, deleteApp, sessionAttempted = false, phase = "local_preparation";
  try {
    const artifacts = buildArtifacts(options.crud);
    const env = await environment();
    const { parse } = require("next/dist/compiled/node-html-parser");
    // No token minted until the host/rewrite is proven to protect private URLs.
    phase = "unauthenticated_boundary";
    const denied = await http.request("/dashboard", { authenticated: false });
    ensure(denied.status === 307, "PRIVATE_ROUTE_MUST_REDIRECT_ANONYMOUS");
    const redirect = new URL(denied.headers.get("location"), options.origin);
    ensure(redirect.origin === options.origin && redirect.pathname === "/login" && redirect.searchParams.get("returnTo") === "/dashboard", "PRIVATE_ROUTE_REWRITE_NOT_CONFIGURED");
    recordCheck("unauthenticated_private_boundary", true, undefined, denied.status);

    phase = "firebase_existing_identity";
    const adminApp = await import("firebase-admin/app"); deleteApp = adminApp.deleteApp;
    const { getAuth } = await import("firebase-admin/auth");
    app = adminApp.initializeApp({ credential: adminApp.cert({ projectId: env.FIREBASE_PROJECT_ID, clientEmail: env.FIREBASE_CLIENT_EMAIL, privateKey: env.FIREBASE_PRIVATE_KEY.replace(/^"|"$/g, "").replace(/\\n/g, "\n") }) }, `homologation-${randomUUID()}`);
    const auth = getAuth(app), email = env.SYSTEM_ADMIN_EMAIL.trim().toLowerCase();
    const user = await auth.getUserByEmail(email);
    ensure(!user.disabled && user.emailVerified === true && user.email?.toLowerCase() === email, "FIREBASE_EXISTING_USER_NOT_ACTIVE_VERIFIED");
    // No additional claims, new identity, custom-claim mutation or password reset.
    let customToken = await auth.createCustomToken(user.uid);
    phase = "firebase_custom_token_exchange";
    let exchange;
    try { exchange = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(env.NEXT_PUBLIC_FIREBASE_API_KEY)}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }), redirect: "manual", signal: AbortSignal.timeout(60_000) }); }
    catch { throw new CheckError("FIREBASE_EXCHANGE_REQUEST_FAILED"); }
    customToken = undefined;
    ensure(exchange.status === 200 && !exchange.headers.has("location") && /^application\/json(?:;|$)/i.test(exchange.headers.get("content-type") ?? ""), "FIREBASE_EXCHANGE_EXPECTED_200_JSON");
    let credentials = parseJson(await responseText(exchange, 128 * 1024));
    // Custom-token REST responses may omit localId; the verified ID token below
    // is authoritative for UID. If present, localId must agree as well.
    ensure((credentials.localId === undefined || credentials.localId === user.uid) && credentials.isNewUser !== true && typeof credentials.idToken === "string", "FIREBASE_EXCHANGE_IDENTITY_MISMATCH");
    let idToken = credentials.idToken; credentials = undefined; // Discard refresh token.
    let claims = await auth.verifyIdToken(idToken);
    const age = Date.now() / 1000 - claims.auth_time;
    ensure(claims.uid === user.uid && claims.email?.toLowerCase() === email && claims.email_verified === true && Number.isFinite(age) && age >= -60 && age < 300, "FIREBASE_ID_TOKEN_PRINCIPAL_INVALID");
    claims = undefined; recordCheck("firebase_existing_identity_exchange", true);

    phase = "application_session";
    sessionAttempted = true;
    const response = await http.request("/api/auth/session", { method: "POST", body: JSON.stringify({ idToken }), headers: { "content-type": "application/json", accept: "application/json" }, authenticated: false });
    idToken = undefined;
    assertJsonOk(response, "APPLICATION_SESSION_EXPECTED_200_JSON");
    let cookie = sessionCookie(response.headers);
    http.setCookie(cookie);
    let principal = await auth.verifySessionCookie(cookie, true);
    ensure(principal.uid === user.uid && principal.email?.toLowerCase() === email && principal.email_verified === true, "APPLICATION_COOKIE_PRINCIPAL_MISMATCH");
    cookie = undefined; principal = undefined;
    recordCheck("session_status_cookie_and_principal", true, undefined, response.status);

    phase = "authenticated_dashboard";
    const dashboard = html(await http.request("/dashboard"), parse);
    const entries = new Set(dashboard.querySelectorAll("a[href]").map(link => link.getAttribute("href")));
    recordCheck("authenticated_dashboard", true, undefined, 200);
    phase = "authenticated_domain_reads";
    for (const [domain, path, entry] of pages) {
      let status;
      try {
        const response = await http.request(path); status = response.status;
        html(response, parse);
        ensure(!entry || entries.has(entry), "MODULE_NOT_ACTIVE_IN_DASHBOARD_NAVIGATION");
        report.domainsPassed++; recordCheck(`domain_${domain}`, true, undefined, status);
      } catch (error) { recordCheck(`domain_${domain}`, false, safeCode(error), status); }
    }

    phase = "session_login_audit_read";
    const from = new Date(Date.now() - 86_400_000).toISOString().slice(0, 10);
    const audit = html(await http.request(`/configuracoes/auditoria?${new URLSearchParams({ eventType: "SESSION_LOGIN", targetType: "SESSION", from })}`), parse);
    const ownLogin = audit.querySelectorAll("tbody tr").some(row => {
      const cells = row.querySelectorAll("td");
      return cells.length === 5 && cells[1].getAttribute("title")?.toLowerCase().endsWith(` · ${email}`) && cells[2].textContent.trim() === "Iniciou sessão" && cells[3].textContent.trim() === "SESSION";
    });
    ensure(ownLogin, "SESSION_LOGIN_NOT_VISIBLE_IN_AUTHENTICATED_AUDIT");
    recordCheck("session_login_audit_visible", true, undefined, 200);
    ensure(report.domainsPassed === 20, "AUTHENTICATED_DOMAIN_READS_INCOMPLETE");

    if (options.crud) {
      phase = "one_catalog_crud";
      await catalogCrud(http, parse, artifacts.manifest, recordCheck, report);
      report.crud.status = "PASS";
    }
  } catch (error) {
    recordCheck(phase, false, safeCode(error));
    if (phase === "one_catalog_crud") report.crud.status = "FAIL";
  } finally {
    if (sessionAttempted) {
      try {
        const response = await http.request("/api/auth/session/logout", { method: "POST", headers: { accept: "application/json" } });
        assertJsonOk(response, "LOGOUT_EXPECTED_200_JSON");
        sessionCookie(response.headers, true); http.clear();
        const denied = await http.request("/dashboard", { authenticated: false });
        const location = new URL(denied.headers.get("location"), options.origin);
        ensure(denied.status === 307 && location.origin === options.origin && location.pathname === "/login", "LOGOUT_PRIVATE_BOUNDARY_FAILED");
        recordCheck("logout_cookie_clear_and_private_boundary", true, undefined, response.status);
      } catch (error) { recordCheck("session_cleanup", false, safeCode(error)); }
    }
    http.clear();
    if (app) {
      try { await deleteApp(app); } catch { recordCheck("firebase_sdk_cleanup", false, "SDK_CLEANUP_FAILED"); }
    }
  }
  report.status = report.checks.length > 0 && report.domainsPassed === 20 && report.checks.every(check => check.passed) && (!options.crud || report.crud.status === "PASS" && report.crud.cleanup === "PASS") ? "PASS" : "FAIL";
  // Deliberately no error.message/stack/cause, headers, bodies, DOM, query strings,
  // action IDs, temp record identity, tokens, user email/UID or decoded claims.
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "PASS" ? 0 : 1;
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try {
    const options = argumentsFrom(process.argv.slice(2));
    if (options) await main(options);
    else console.log("After final build/server start: node scripts/drizzle-final-homologation.mjs --origin=http://localhost:3309 [--crud]\nAlso allowed: --origin=https://guarama.celeriflow.com.br (matching build artifacts required for CRUD).\nSession credentials and private HTML remain in memory; stdout is redacted JSON only.");
  } catch (error) {
    console.log(JSON.stringify({ status: "FAIL", reason: safeCode(error) }));
    process.exitCode = 1;
  }
}
