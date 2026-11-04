import "server-only";
import { Sandbox } from "@vercel/sandbox";
import { getVercelOidcToken } from "@vercel/oidc";
import { after } from "next/server";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canUseGed, requireGedObject } from "./ged-access";
import { requireManagedDocument } from "@/db/repositories/documents/ged";
import { gedUsesVercelSandbox, requireGedSandboxSnapshot } from "./ged-internal-runtime";

export function scheduleGedVercelQueue() {
  if (!gedUsesVercelSandbox()) return;
  after(async () => {
    try { await dispatchGedVercelWorker(); }
    catch { console.error("GED: disparo automático pendente; a fila foi preservada para retomada manual ou agendada."); }
  });
}

/** Detached one-shot worker: the HTTP request only dispatches, never waits for OCR. */
export async function dispatchGedVercelWorker(context?: AppContext, versionId?: string) {
  const snapshotId = requireGedSandboxSnapshot();
  if (Boolean(context) !== Boolean(versionId)) throw new Error("Disparo documental incompleto.");
  if (context && versionId) {
    const result = await (context.database ?? db).execute<{ documentId: string }>(sql`SELECT "documentId" FROM "DocumentVersion" WHERE id=${versionId}`);
    if (!result.rows[0]) throw new Error("Versão não encontrada.");
    const document = await requireManagedDocument(context, result.rows[0].documentId);
    await requireGedObject(context, "document", document.id, document.ownerId === context.user.id && canUseGed(context.user, "import") ? "import" : "edit");
    await (context.database ?? db).execute(sql`UPDATE "GedProcessingJob" SET status='PENDING',attempts=0,"nextAttemptAt"=now(),error=NULL WHERE "versionId"=${versionId} AND (status<>'RUNNING' OR "leaseUntil"<now())`);
  }
  const env: Record<string, string> = { GED_PROCESSING_RUNTIME: "local", HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", GED_OCR_CACHE_PATH: "/vercel/sandbox/ocr-cache" };
  for (const key of ["DATABASE_URL", "BLOB_READ_WRITE_TOKEN", "CELERIFLOW_INSTANCE_ID", "SYSTEM_ADMIN_EMAIL"]) {
    if (process.env[key]) env[key] = process.env[key]!;
  }
  if (!env.DATABASE_URL || !env.BLOB_READ_WRITE_TOKEN || !env.CELERIFLOW_INSTANCE_ID) throw new Error("Configuração de banco, Blob ou instância ausente para o processamento GED.");
  env.VERCEL_OIDC_TOKEN = await getVercelOidcToken();
  if (context && versionId) Object.assign(env, { GED_JOB_VERSION_ID: versionId, GED_JOB_FIREBASE_UID: context.user.firebaseUid, GED_JOB_EMAIL: context.user.email, GED_JOB_NAME: context.user.name });
  const sandbox = await Sandbox.create({ source: { type: "snapshot", snapshotId }, persistent: false, timeout: 30 * 60_000, resources: { vcpus: 2 } });
  try {
    await sandbox.runCommand({ cmd: "node", args: ["--conditions=react-server", "--import", "tsx", "scripts/ged-vercel-worker.mjs"], cwd: "/vercel/sandbox", env: { ...env, GED_SANDBOX_NAME: sandbox.name }, detached: true, timeoutMs: 28 * 60_000 });
    return { queued: true };
  } catch {
    await sandbox.stop().catch(() => {});
    throw new Error("Não foi possível iniciar o processamento interno na Vercel; a fila foi preservada.");
  }
}
