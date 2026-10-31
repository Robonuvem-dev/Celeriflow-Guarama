// Real authenticated HTTP + configured Neon/Blob. Only synthetic HML records
// are created; signed evidence is intentionally retained for traceability.
import assert from "node:assert/strict";
import { randomUUID, randomInt, createHash } from "node:crypto";
import { readFileSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { parse } from "dotenv";
import { createCanvas } from "@napi-rs/canvas";
import { PDFDocument } from "pdf-lib";
import { Document, Packer, Paragraph } from "docx";
import JSZip from "jszip";
import { put as clientPut } from "@vercel/blob/client";

for (const file of [".env.local", ".env"]) {
  try { for (const [key, value] of Object.entries(parse(readFileSync(file)))) if (process.env[key] === undefined) process.env[key] = value; } catch (error) { if (error.code !== "ENOENT") throw error; }
}
const origin = "http://localhost:3309";
const centralOrigin = "https://guarama.celeriflow.com.br";
const resume = process.argv.includes("--resume-browser") ? JSON.parse(readFileSync("docs/GED_HOMOLOGACAO_RESULTADO.json", "utf8")) : null;
if (resume) assert(resume.checks.some(item => item.check === "central_signature_original_version_link_idempotent_receipt_public_proof_and_permanent_archive" && item.passed), "Execute o ensaio completo antes de retomar a etapa de navegador.");
const run = resume?.run || randomUUID(), name = `HML-GED-${run}`;
const report = resume ? { ...resume, status: "FAIL", checks: resume.checks.filter(item => item.passed && !["logout", "production_logout"].includes(item.check)) } : { run, date: new Date().toISOString(), origin, scope: "REAL_NEON_BLOB_TESSERACT_AUTHENTICATED_HTTP_AND_BROWSER", status: "FAIL", checks: [], documents: [], limitations: ["A1 real depende de certificado e credencial disponibilizados.", "Tesseract local: publicação HTTPS do serviço ainda necessária para Vercel."], retention: "Documentos sintéticos HML e evidências mantidos para conferência; nenhum registro preexistente alterado." };
let cookie = "", productionCookie = "", idToken = "", app, databaseConnection;
const require = createRequire(import.meta.url);
const hash = bytes => createHash("sha256").update(bytes).digest("hex");
let phase = "preparation";
function check(label, value = true) { assert(value, label); report.checks = report.checks.filter(item => item.check !== label); report.checks.push({ check: label, passed: true }); }
async function http(path, { method = "GET", body, anonymous = false, headers = {}, targetOrigin = origin } = {}) {
  assert(path.startsWith("/") && !path.startsWith("//"));
  assert([origin, centralOrigin].includes(targetOrigin));
  const activeCookie = targetOrigin === centralOrigin ? productionCookie : cookie;
  const response = await fetch(targetOrigin + path, { method, headers: { ...(!anonymous && activeCookie ? { cookie: activeCookie } : {}), ...(method === "POST" ? { origin: targetOrigin } : {}), ...headers }, body, redirect: "manual", signal: AbortSignal.timeout(120_000) });
  return response;
}
async function json(path, options = {}) {
  const response = await http(path, options); const result = await response.json();
  if (!response.ok || result.error) throw new Error(`HTTP_${response.status}_${String(result.error || "JSON_OPERATION_FAILED").replace(/https?:\/\/\S+|[\w-]{25,}/g, "[redacted]").slice(0, 160)}`);
  return result;
}
const command = async (command, id = "", data = {}) => (await json("/api/assinatura-digital/ged", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ command, id, data }) })).result;
const detail = id => json(`/api/assinatura-digital/ged?documentId=${encodeURIComponent(id)}`);
const query = data => json(`/api/assinatura-digital/ged?${new URLSearchParams(data)}`);
async function page(path) {
  const response = await http(path); const html = await response.text();
  assert.equal(response.status, 200, `HTML_STATUS_${path}`);
  assert(!/\n[0-9a-f]+:E\{|__next_error__|NEXT_HTTP_ERROR_FALLBACK;500/.test(html), `NEXT_PAGE_ERROR_${path}`);
  return html;
}
async function upload(filename, bytes, mimeType, userId, options = {}) {
  const id = randomUUID(), safe = filename.normalize("NFKD").replace(/[^a-zA-Z0-9._-]/g, "-").slice(-120);
  const pathname = `instances/${process.env.CELERIFLOW_INSTANCE_ID}/documents/ged/${userId}/${id}/${safe}`;
  const metadata = { id, batchId: run, filename, title: `${name} ${filename}`, classCode: "GED_INTERNAL_ALLOWED", legacyReference: name, ...options };
  const token = await json("/api/assinatura-digital/ged/upload", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ type: "blob.generate-client-token", payload: { pathname, clientPayload: JSON.stringify(metadata), multipart: false } }) });
  const blob = await clientPut(pathname, bytes, { access: "private", contentType: mimeType, token: token.clientToken });
  const confirmed = await command("confirm-upload", id, { url: blob.url, comment: options.checkinDocumentId ? "Nova versão sintética de homologação" : "" });
  const repeat = await command("confirm-upload", id, { url: blob.url, comment: "Repetição idempotente" });
  assert.equal(confirmed.documentId, repeat.documentId);
  if (!report.documents.includes(confirmed.documentId)) report.documents.push(confirmed.documentId);
  return confirmed.documentId;
}
async function workflow(id, userId) {
  const review = await command("start-review", id, { assignments: Object.fromEntries(["ELABORACAO", "CONSENSO", "APROVACAO", "HOMOLOGACAO"].map(stage => [stage, [userId]])), dueAt: new Date(Date.now() + 86_400_000).toISOString() });
  for (const stage of ["Elaboração", "Consenso", "Aprovação", "Homologação"]) await command("decide-review", review.id, { decision: "APPROVE", comment: `${stage} em ensaio sintético controlado` });
  assert.equal((await detail(id)).document.editorialStatus, "HOMOLOGADO");
}
function syntheticCpf() {
  let digits = Array.from({ length: 9 }, () => randomInt(0, 10));
  for (const length of [9, 10]) { const remainder = digits.reduce((sum, digit, index) => sum + digit * (length + 1 - index), 0) % 11; digits.push(remainder < 2 ? 0 : 11 - remainder); }
  return digits.join("");
}
try {
  phase = "existing_admin_authentication";
  const { initializeApp, cert } = await import("firebase-admin/app"); const { getAuth } = await import("firebase-admin/auth");
  app = initializeApp({ credential: cert({ projectId: process.env.FIREBASE_PROJECT_ID, clientEmail: process.env.FIREBASE_CLIENT_EMAIL, privateKey: process.env.FIREBASE_PRIVATE_KEY.replace(/\\n/g, "\n") }) }, `ged-hml-${run}`);
  const auth = getAuth(app), user = await auth.getUserByEmail(process.env.SYSTEM_ADMIN_EMAIL);
  assert(!user.disabled && user.emailVerified);
  const customToken = await auth.createCustomToken(user.uid);
  phase = "firebase_token_exchange";
  const exchange = await fetch(`https://identitytoolkit.googleapis.com/v1/accounts:signInWithCustomToken?key=${encodeURIComponent(process.env.NEXT_PUBLIC_FIREBASE_API_KEY)}`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: customToken, returnSecureToken: true }), signal: AbortSignal.timeout(60_000) });
  assert.equal(exchange.status, 200); const credentials = await exchange.json(); idToken = credentials.idToken;
  const claims = await auth.verifyIdToken(idToken); assert.equal(claims.uid, user.uid);
  phase = "local_application_session";
  const session = await http("/api/auth/session", { method: "POST", anonymous: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
  assert.equal(session.status, 200); cookie = session.headers.getSetCookie().find(value => value.startsWith("celeriflow_session=")).split(";")[0];
  check("existing_verified_identity_and_application_session");
  const client = await import("../src/db/client.ts"); databaseConnection = client.databaseConnection; const { db } = client; const { sql } = await import("drizzle-orm");
  const account = (await db.execute(sql`SELECT u.id,u.nome,u.email,p.codigo,p.permissoes FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u."firebaseUid"=${user.uid} AND u.ativo AND p.ativo`)).rows[0];
  assert.equal(account.codigo, "SYSTEM_ADMINISTRATOR");
  const context = { database: db, user: { id: account.id, firebaseUid: user.uid, email: account.email, name: account.nome, role: account.codigo, profileCode: account.codigo, permissions: account.permissoes, modulePermissions: [], allowedBudgetUnitIds: [], employeeId: null, departmentId: null, secretariatId: null } };
  if (resume) {
    phase = "audit_and_final_readback";
    const { inArray } = await import("drizzle-orm"), { auditEvents } = await import("../src/db/schema/audit.ts");
    assert((await db.select({ id: auditEvents.id }).from(auditEvents).where(inArray(auditEvents.targetId, report.documents)).limit(1)).length);
    for (const id of report.documents) await page(`/assinatura-digital/acervo/${id}`);
    check("audit_events_and_all_document_details_readable");
    phase = "hydrated_browser_and_viewport_homologation";
    const textId = report.documents[0], scanId = report.documents[1], folderId = (await detail(textId)).document.folderId;
    const { homologateGedBrowser } = await import("./ged-browser-homologation.mjs");
    report.browser = await homologateGedBrowser({ origin, cookie, run, folderId, scanId, textId });
    report.documents = [...new Set([...report.documents, ...report.browser.documents])];
    check("hydrated_browser_batch_upload_visual_zone_version_panel_and_four_viewports");
    report.status = "PASS";
  } else {
  phase = "boundaries_and_pages";
  assert.notEqual((await http("/api/assinatura-digital/ged", { anonymous: true })).status, 200);
  const csrf = await fetch(origin + "/api/assinatura-digital/ged", { method: "POST", headers: { cookie, origin: "https://invalid.example", "Content-Type": "application/json" }, body: JSON.stringify({ command: "checkout", id: "invalid" }) }); assert.equal(csrf.status, 403);
  check("anonymous_and_cross_origin_boundaries");
  for (const path of ["", "/acervo", "/pesquisa", "/pastas-inteligentes", "/importacoes", "/processamento", "/tarefas", "/fluxos", "/modelos", "/classes", "/thesaurus", "/pendentes", "/historico", "/registros", "/assine-agora", "/validacao", "/acervo/integrados", "/modelos/anteriores"]) { await page(`/assinatura-digital${path}`); check(`page${path || "/painel"}`); }
  phase = "physical_batch_upload_and_text_search";
  const folder = await command("create-folder", "", { name, parentId: "" });
  const text = Buffer.from(`Acervo de homologacao ${run}. Contrato municipal de aquisicao de veiculos. ORIGINAL IMUTAVEL.`);
  const textId = await upload("legado.txt", text, "text/plain", account.id, { folderId: folder.id });
  await command("index-document", textId);
  const initial = await detail(textId); assert.equal(initial.document.hashSha256, hash(text));
  assert((await query({ section: "pesquisa", text: "contrato municipal", mode: "phrase" })).documents.some(document => document.id === textId));
  const term = `hml${run.replaceAll("-", "")}`;
  await command("save-term", "", { term, equivalents: ["veiculos"] });
  assert((await query({ section: "pesquisa", text: term, thesaurus: "true" })).documents.some(document => document.id === textId));
  check("real_private_blob_upload_idempotency_hash_full_text_and_thesaurus");
  phase = "tesseract_scanned_pdf_and_zone";
  const canvas = createCanvas(1400, 700), drawing = canvas.getContext("2d"); drawing.fillStyle = "white"; drawing.fillRect(0, 0, 1400, 700); drawing.fillStyle = "black"; drawing.font = "64px Arial";
  drawing.fillText("PROTOCOLO MUNICIPAL 2026", 70, 150); drawing.fillText("PROCESSO 4321", 70, 410);
  const image = canvas.toBuffer("image/png"), pdf = await PDFDocument.create(), embedded = await pdf.embedPng(image); pdf.addPage([700, 350]).drawImage(embedded, { x: 0, y: 0, width: 700, height: 350 });
  const scan = Buffer.from(await pdf.save()), scanId = await upload("digitalizado.pdf", scan, "application/pdf", account.id, { folderId: folder.id });
  await command("index-document", scanId); const extracted = await detail(scanId);
  assert.match(extracted.pages[0].text, /PROTOCOLO MUNICIPAL 2026/);
  const zone = await command("ocr-zone", scanId, { page: 1, label: "Processo", x: 0.02, y: 0.4, width: 0.95, height: 0.3, rotation: 0 });
  assert.match(zone.text, /PROCESSO 4321/); assert.doesNotMatch(zone.text, /PROTOCOLO/);
  assert((await query({ section: "pesquisa", text: "4321" })).documents.some(document => document.id === scanId));
  check("real_scanned_pdf_tesseract_zone_confidence_and_search");
  phase = "checkout_checkin_history_and_zip";
  await command("checkout", textId);
  const revised = Buffer.from(`Nova versao de homologacao ${run}. Contrato revisado e aprovado.`);
  assert.equal(await upload("revisado.txt", revised, "text/plain", account.id, { checkinDocumentId: textId }), textId);
  const current = await detail(textId); assert.equal(current.document.versionNumber, 2); assert.equal(current.versionTotal, 2); assert.equal(current.document.hashSha256, hash(revised));
  const selections = [{ id: textId, versionId: initial.document.versionId }, { id: scanId }];
  const zipped = await http(`/api/assinatura-digital/ged/download?zip=1&items=${encodeURIComponent(JSON.stringify(selections))}`); assert.equal(zipped.status, 200);
  const zip = await JSZip.loadAsync(await zipped.arrayBuffer()), manifest = JSON.parse(await zip.file("manifesto.json").async("string"));
  assert.equal(manifest.files.length, 2);
  for (const item of manifest.files) assert.equal(hash(await zip.file(item.filename).async("nodebuffer")), item.sha256);
  assert.equal(manifest.files[0].sha256, hash(text));
  await command("move-document", textId, { folderId: "" }); await command("move-document", textId, { folderId: folder.id });
  check("checkin_creates_version_two_historical_original_and_zip_hashes_preserved");
  phase = "docx_template_import_version_and_generation";
  const word = await Packer.toBuffer(new Document({ sections: [{ children: [new Paragraph("Documento de homologacao para {{nome}}, referencia {{codigo}}.")] }] }));
  const form = new FormData(); form.set("name", name); form.set("file", new File([word], "modelo.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }));
  const template = (await json("/api/assinatura-digital/ged/upload", { method: "POST", body: form })).result;
  const imported = await json(`/api/assinatura-digital/ged?templateId=${template.id}`); assert(imported.markers.includes("nome"));
  const newer = await command("save-template", "", { name, templateKey: imported.templateKey, content: imported.content + "\nVersao revisada." });
  assert.equal((await json(`/api/assinatura-digital/ged?templateId=${newer.id}`)).version, 2);
  const generated = await command("generate-template", newer.id, { values: { nome: "Pessoa ficticia de ensaio", codigo: run }, classCode: "GED_INTERNAL_ALLOWED" });
  report.documents.push(generated.documentId); await command("index-document", generated.documentId);
  assert.match((await detail(generated.documentId)).pages[0].text, /Pessoa ficticia de ensaio/);
  check("docx_bytes_import_markers_version_two_and_generated_searchable_original");
  phase = "editorial_workflow_saved_query_and_pending_signature";
  const smart = await command("save-smart", "", { name, query: { status: "HOMOLOGADO" }, shared: false });
  assert(!(await query({ smartId: smart.id })).documents.some(document => document.id === textId));
  await workflow(textId, account.id); assert((await query({ smartId: smart.id })).documents.some(document => document.id === textId));
  const requested = await command("sign-request", textId, { signerIds: [account.id] });
  assert.equal(requested.documentVersionId, current.document.versionId);
  assert.equal((await detail(textId)).document.versionStatus, "PENDING_SIGNATURE");
  const manifestActions = JSON.parse(readFileSync(".next/server/server-reference-manifest.json", "utf8"));
  const bindings = Object.entries(manifestActions.node).filter(([, entry]) => entry.exportedName === "signPendingDocument" && entry.filename === "src/app/app-domain/assinatura-digital/actions.ts");
  assert.equal(bindings.length, 1, "SIGNATURE_ACTION_BINDING");
  const { encodeReply } = require("next/dist/compiled/react-server-dom-webpack/client.node");
  const body = await encodeReply([textId, idToken]);
  const signed = await http("/assinatura-digital/pendentes", { method: "POST", body, headers: { "Next-Action": bindings[0][0], ...(typeof body === "string" ? { "Content-Type": "text/plain;charset=UTF-8" } : {}) } });
  const flight = await signed.text(); assert.equal(signed.status, 200); assert(flight.includes('"error":null'), "SIGNED_ACTION_FAILED");
  assert.equal((await detail(textId)).document.versionStatus, "SIGNED");
  const publicHtml = await page(`/validar-documento/${requested.publicValidationCode}`); assert(publicHtml.includes("Assinado") || publicHtml.includes("SIGNED"));
  check("four_editorial_stages_dynamic_saved_query_exact_version_and_reauthenticated_signature");
  phase = "central_signature_and_archive";
  // The existing production key is stable and stays in Vercel; never invent a
  // disposable signing key or copy the production secret into this runner.
  const liveSession = await http("/api/auth/session", { targetOrigin: centralOrigin, method: "POST", anonymous: true, headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken }) });
  assert.equal(liveSession.status, 200); productionCookie = liveSession.headers.getSetCookie().find(value => value.startsWith("celeriflow_session=")).split(";")[0];
  const central = await import("../src/lib/signatures/central-service.ts"); const password = randomUUID();
  const signer = await central.saveCentralSigner(context, { kind: "CIDADAO", name: `${name} FICTICIO`, role: "Somente ensaio", documentId: syntheticCpf(), phone: "", mobile: "", email: "", active: true, validUntil: new Date(Date.now() + 86_400_000).toISOString(), employeeId: null, personId: null, accountUserId: null, password });
  const type = await central.saveCentralDocumentType(context, { name, description: "Tipo sintético de homologação", active: true });
  await workflow(generated.documentId, account.id);
  const signBody = new FormData();
  for (const [key, value] of Object.entries({ gedDocumentId: generated.documentId, gedVersionId: (await detail(generated.documentId)).document.versionId, signerId: signer.id, documentTypeId: type.id, method: "INTERNAL", password, requestId: randomUUID() })) signBody.set(key, value);
  const record = (await json("/api/assinatura-digital/ged/sign", { targetOrigin: centralOrigin, method: "POST", body: signBody })).record;
  assert.equal((await json("/api/assinatura-digital/ged/sign", { targetOrigin: centralOrigin, method: "POST", body: signBody })).record.id, record.id);
  const proof = new FormData(); proof.set("code", record.code);
  assert.equal((await json("/api/assinatura-digital/validar", { targetOrigin: centralOrigin, method: "POST", body: proof, anonymous: true })).valid, true);
  const archive = await command("archive-central", record.id, { classCode: "GED_INTERNAL_ALLOWED" }); report.documents.push(archive.documentId);
  const archived = await detail(archive.documentId); assert.equal(archived.document.hashSha256, record.hashSha256); assert.equal(archived.document.origin, "CENTRAL");
  check("central_signature_original_version_link_idempotent_receipt_public_proof_and_permanent_archive");
  phase = "audit_and_final_readback";
  const { inArray } = await import("drizzle-orm"), { auditEvents } = await import("../src/db/schema/audit.ts");
  assert((await db.select({ id: auditEvents.id }).from(auditEvents).where(inArray(auditEvents.targetId, report.documents)).limit(1)).length);
  for (const id of report.documents) await page(`/assinatura-digital/acervo/${id}`);
  check("audit_events_and_all_document_details_readable");
  phase = "hydrated_browser_and_viewport_homologation";
  const { homologateGedBrowser } = await import("./ged-browser-homologation.mjs");
  report.browser = await homologateGedBrowser({ origin, cookie, run, folderId: folder.id, scanId, textId });
  report.documents.push(...report.browser.documents);
  check("hydrated_browser_batch_upload_visual_zone_version_panel_and_four_viewports");
  report.status = "PASS";
  }
} catch (error) {
  if (error.browserReport) { report.browser = error.browserReport; report.documents = [...new Set([...report.documents, ...error.browserReport.documents])]; }
  report.checks.push({ check: phase, passed: false, reason: /Failed query/i.test(error.message) ? "DATABASE_QUERY_FAILED" : String(error.message).replace(/https?:\/\/\S+|[A-Za-z0-9_-]{40,}/g, "[redacted]").slice(0, 220), ...(error.cause?.code ? { transportCode: error.cause.code } : {}) });
} finally {
  if (cookie) { try { const logout = await http("/api/auth/session/logout", { method: "POST" }); check("logout", logout.status === 200); } catch { report.checks.push({ check: "logout", passed: false }); report.status = "FAIL"; } }
  if (productionCookie) { try { const logout = await http("/api/auth/session/logout", { targetOrigin: centralOrigin, method: "POST" }); check("production_logout", logout.status === 200); } catch { report.checks.push({ check: "production_logout", passed: false }); report.status = "FAIL"; } }
  cookie = ""; productionCookie = ""; idToken = "";
  if (app) { const { deleteApp } = await import("firebase-admin/app"); await deleteApp(app); }
  if (databaseConnection) await databaseConnection.pool.end();
  report.completedAt = new Date().toISOString();
  writeFileSync("docs/GED_HOMOLOGACAO_RESULTADO.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.status === "PASS" ? 0 : 1;
}
