import { Sandbox } from "@vercel/sandbox";
import { db, databaseConnection } from "../src/db/client.ts";
import { resolveIdentityUser } from "../src/lib/platform/identity-service.ts";
import { processGedVersion } from "../src/lib/documents/ged-service.ts";
import { runGedWorkerBatch, runGedValidityBatch } from "../src/lib/documents/ged-worker.ts";

try {
  if (process.env.GED_JOB_VERSION_ID) {
    const user = await resolveIdentityUser(db, { firebaseUid: process.env.GED_JOB_FIREBASE_UID, email: process.env.GED_JOB_EMAIL, name: process.env.GED_JOB_NAME, authTime: Date.now() / 1000 });
    await processGedVersion({ user, database: db }, process.env.GED_JOB_VERSION_ID);
    console.log(JSON.stringify({ event: "ged.manual", status: "SUCCEEDED" }));
  } else {
    const deadline = Date.now() + 25 * 60_000;
    do {
      const result = await runGedWorkerBatch(1);
      console.log(JSON.stringify({ event: "ged.processing", ...result }));
      if (!result.processed && !result.failed) break;
    } while (Date.now() < deadline);
    console.log(JSON.stringify({ event: "ged.validity", ...await runGedValidityBatch() }));
  }
} catch {
  console.error("GED_VERCEL_WORKER_FAILED: consulte a fila de processamento.");
  process.exitCode = 1;
} finally {
  await databaseConnection.pool.end();
  // Stop our own nonpersistent VM after the work, without a long-lived server.
  if (process.env.GED_SANDBOX_NAME) {
    try { const sandbox = await Sandbox.get({ name: process.env.GED_SANDBOX_NAME }); await sandbox.stop(); }
    catch { console.error("GED: timeout do Sandbox permanece como limite de encerramento."); }
  }
}
