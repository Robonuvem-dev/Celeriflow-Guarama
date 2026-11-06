/** Read-only GitHub/Vercel deployment confirmation; credentials remain only in memory. */
import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { setTimeout as delay } from "node:timers/promises";

const repository = "Robonuvem-dev/Celeriflow-Guarama";
const sha = process.argv.find(value => /^[a-f0-9]{40}$/.test(value)) || execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim();
const output = process.env.CHECKUP_DEPLOY_OUTPUT || "docs/checkup/github-deployment";
const wait = process.argv.includes("--wait");
const credential = spawnSync("git", ["credential", "fill"], { input: "protocol=https\nhost=github.com\nusername=Robonuvem-dev\n\n", encoding: "utf8", env: { ...process.env, GCM_INTERACTIVE: "Never" } });
assert.equal(credential.status, 0, "Credencial GitHub da conta de deploy indisponível.");
const values = Object.fromEntries(credential.stdout.trim().split(/\r?\n/).map(line => { const at = line.indexOf("="); return [line.slice(0, at), line.slice(at + 1)]; }));
const headers = { Authorization: `Bearer ${values.password}`, Accept: "application/vnd.github+json", "User-Agent": "Celeriflow-checkup" };
async function api(path) {
  const response = await fetch(`https://api.github.com${path}`, { headers, signal: AbortSignal.timeout(30000) });
  if (!response.ok) throw new Error(`GitHub HTTP ${response.status}: ${path}`);
  return response.json();
}
const user = await api("/user");
assert.equal(user.login, "Robonuvem-dev");
mkdirSync(output, { recursive: true });
const report = { startedAt: new Date().toISOString(), repository, sha, authenticatedLogin: user.login, observations: [] };
const persist = () => writeFileSync(`${output}/report.json`, JSON.stringify(report, null, 2) + "\n");
let lastState;
try {
  const deadline = Date.now() + (wait ? 30 * 60 * 1000 : 0);
  do {
    const [status, checks, deployments] = await Promise.all([
      api(`/repos/${repository}/commits/${sha}/status`),
      api(`/repos/${repository}/commits/${sha}/check-runs`),
      api(`/repos/${repository}/deployments?sha=${sha}&per_page=10`),
    ]);
    const deploymentStatuses = await Promise.all(deployments.map(async deployment => {
      const [latest] = await api(`/repos/${repository}/deployments/${deployment.id}/statuses?per_page=1`);
      return { id: deployment.id, environment: deployment.environment, createdAt: deployment.created_at, state: latest?.state ?? "pending", environmentUrl: latest?.environment_url, logUrl: latest?.log_url, description: latest?.description };
    }));
    const contexts = status.statuses.map(item => ({ context: item.context, state: item.state, description: item.description, targetUrl: item.target_url, updatedAt: item.updated_at }));
    const vercel = contexts.find(item => /vercel/i.test(item.context));
    const observation = { observedAt: new Date().toISOString(), overallState: status.state, statuses: contexts, checks: checks.check_runs.map(item => ({ name: item.name, status: item.status, conclusion: item.conclusion, detailsUrl: item.details_url })), deployments: deploymentStatuses };
    report.observations.push(observation); persist();
    if (lastState !== vercel?.state) { console.log(JSON.stringify({ sha, vercel: vercel ?? null, deployments: deploymentStatuses })); lastState = vercel?.state; }
    if (vercel?.state === "success") { report.result = "VERCEL_SUCCESS"; break; }
    if (vercel && ["failure", "error"].includes(vercel.state)) { report.result = "VERCEL_FAILED"; process.exitCode = 1; break; }
    if (!wait || Date.now() >= deadline) { report.result = wait ? "DEPLOYMENT_TIMEOUT" : "PENDING"; if (wait) process.exitCode = 1; break; }
    await delay(20000);
  } while (true);
} finally { report.finishedAt = new Date().toISOString(); persist(); console.log(JSON.stringify({ sha, result: report.result, observations: report.observations.length })); }
