import "dotenv/config";
import { setTimeout } from "node:timers/promises";
import { databaseConnection } from "../src/db/client.ts";
import { runGedWorkerBatch, runGedValidityBatch } from "../src/lib/documents/ged-worker.ts";

const missing = ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN", "CELERIFLOW_INSTANCE_ID"].filter(name => !process.env[name]);
if (missing.length) throw new Error(`Configure o worker: ${missing.join(", ")}.`);
const stop = new AbortController();
for (const signal of ["SIGINT", "SIGTERM"]) process.once(signal, () => { stop.abort(); });
try {
  while (!stop.signal.aborted) {
    let failed = false;
    try { console.log(JSON.stringify({ event: "ged.processing", ...await runGedWorkerBatch(3) })); }
    catch { failed = true; console.error("GED worker: processamento interrompido; confira configuração e migrações."); }
    if (!stop.signal.aborted) {
      try { console.log(JSON.stringify({ event: "ged.validity", ...await runGedValidityBatch() })); }
      catch { failed = true; console.error("GED worker: alertas interrompidos; confira configuração e migrações."); }
    }
    if (process.argv.includes("--once")) { if (failed) process.exitCode = 1; break; }
    try { await setTimeout(15000, undefined, { signal: stop.signal }); }
    catch (error) { if (error.name !== "AbortError") throw error; }
  }
} finally {
  await databaseConnection.pool.end();
}
