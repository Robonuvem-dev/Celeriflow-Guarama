import "server-only";
import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, writeFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Sandbox } from "@vercel/sandbox";

const run = promisify(execFile);
export type GedInternalTask = "ocr" | "convert" | "pdfa" | "embed";

export function gedUsesVercelSandbox() {
  return process.env.GED_PROCESSING_RUNTIME !== "local" && (process.env.GED_PROCESSING_RUNTIME === "vercel-sandbox" || Boolean(process.env.VERCEL));
}

export function requireGedSandboxSnapshot() {
  const snapshotId = process.env.GED_SANDBOX_SNAPSHOT_ID;
  if (!snapshotId) throw new Error("Prepare o ambiente interno do GED na Vercel e configure GED_SANDBOX_SNAPSHOT_ID.");
  return snapshotId;
}

/** SDK file transfer avoids routing a 20-MiB original through a function HTTP body. */
export async function runGedInternalTask(kind: GedInternalTask, input: unknown): Promise<unknown> {
  const content = Buffer.from(JSON.stringify({ kind, input }));
  if (content.length > 29_000_000) throw new Error("Dados superiores ao limite interno de processamento.");
  if (!gedUsesVercelSandbox()) {
    const directory = await mkdtemp(join(tmpdir(), "ged-internal-"));
    try {
      const inputPath = join(directory, "input.json"), outputPath = join(directory, "output.json");
      await writeFile(inputPath, content);
      await run(process.execPath, [join(process.cwd(), "scripts/ged-sandbox-task.mjs"), inputPath, outputPath], { timeout: 150_000, maxBuffer: 1024 * 1024, windowsHide: true });
      return JSON.parse(await readFile(outputPath, "utf8"));
    } catch { throw new Error("O processamento interno não foi concluído; consulte a fila e repita a operação."); }
    finally { await rm(directory, { recursive: true, force: true }); }
  }
  const sandbox = await Sandbox.create({ source: { type: "snapshot", snapshotId: requireGedSandboxSnapshot() }, persistent: false, timeout: 180_000, resources: { vcpus: 2 }, networkPolicy: "deny-all" });
  try {
    const id = randomUUID(), inputPath = `/tmp/${id}-input.json`, outputPath = `/tmp/${id}-output.json`;
    await sandbox.writeFiles([{ path: inputPath, content }]);
    const command = await sandbox.runCommand({ cmd: "node", args: ["/vercel/sandbox/scripts/ged-sandbox-task.mjs", inputPath, outputPath], cwd: "/vercel/sandbox", env: { HF_HUB_OFFLINE: "1", TRANSFORMERS_OFFLINE: "1", GED_OCR_CACHE_PATH: "/vercel/sandbox/ocr-cache" }, timeoutMs: 150_000 });
    if (command.exitCode !== 0) throw new Error("O processamento interno não foi concluído; consulte a fila e repita a operação.");
    const output = await sandbox.readFileToBuffer({ path: outputPath });
    if (!output || output.length > 29_000_000) throw new Error("Resultado interno ausente ou superior ao limite.");
    return JSON.parse(output.toString("utf8"));
  } finally { await sandbox.stop().catch(() => { console.error("GED: encerramento pendente; timeout do Sandbox permanece ativo."); }); }
}
