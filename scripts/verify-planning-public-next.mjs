import assert from "node:assert/strict";
import { createServer } from "node:net";
import { get as getHttp } from "node:http";
import { spawn } from "node:child_process";
import { join } from "node:path";

// GET-only smoke against the compiled Next application. No session is fabricated.
const probe = createServer();
await new Promise((resolve, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", resolve); });
const port = probe.address().port;
await new Promise((resolve, reject) => probe.close((error) => error ? reject(error) : resolve()));
const child = spawn(process.execPath, [join(process.cwd(), "node_modules", "next", "dist", "bin", "next"), "start", "--hostname", "127.0.0.1", "--port", String(port)], { stdio: ["ignore", "ignore", "ignore"], env: process.env });
let childError;
child.once("error", (error) => { childError = error; });
try {
  const base = `http://127.0.0.1:${port}`;
  let ready = false;
  for (let attempt = 0; attempt < 90; attempt++) { if (childError) throw childError; if (child.exitCode !== null) throw new Error("Next não iniciou para o ensaio público."); try { const response = await fetch(`${base}/api/transparencia/planejamento`); if (response.status === 200) { ready = true; break; } } catch {} await new Promise((resolve) => setTimeout(resolve, 1000)); }
  assert.ok(ready, "API pública deve iniciar sem sessão");
  const api = await fetch(`${base}/api/transparencia/planejamento`); const data = await api.json();
  assert.equal(api.status, 200); assert.ok(Array.isArray(data.records)); assert.ok(!("fileUrl" in (data.records[0] ?? {})));
  const page = await fetch(`${base}/portal/planejamento`, { redirect: "manual" }); const html = await page.text();
  assert.equal(page.status, 200); assert.ok(html.includes("Documentos de Planejamento e Orçamento"));
  const protectedPage = await new Promise((resolve, reject) => { const request = getHttp(`${base}/planejamento`, { headers: { Host: `app.localhost:${port}` } }, (response) => { response.resume(); resolve({ status: response.statusCode, location: response.headers.location ?? "" }); }); request.once("error", reject); });
  assert.ok([307, 308].includes(protectedPage.status), `Redirecionamento administrativo esperado; recebido ${protectedPage.status}.`); assert.ok(protectedPage.location.includes("/login"));
  console.log(JSON.stringify({ mode: "GET_ONLY_NEXT_SMOKE", publicApi: "PASS", publicPage: "PASS", administrativeRouteWithoutSession: "LOGIN_REDIRECT_PASS", publicRecords: data.total, authenticatedBrowserAcceptance: "NOT_EXECUTED" }, null, 2));
} finally { child.kill(); await new Promise((resolve) => { if (child.exitCode !== null) resolve(); else child.once("exit", resolve); }); }
