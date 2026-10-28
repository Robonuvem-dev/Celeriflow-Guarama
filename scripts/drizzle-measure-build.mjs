import { spawn, execFileSync } from "node:child_process";
import { mkdirSync, writeFileSync } from "node:fs";
import { resolve, join } from "node:path";
import os from "node:os";
import WebSocket from "ws";

const capturedAt = new Date().toISOString();
const directory = resolve(".agent/drizzle/metrics", capturedAt.replaceAll(":", "-"));
mkdirSync(directory, { recursive: true });
const preload = resolve("scripts/drizzle-measure-preload.cjs").replaceAll("\\", "/");
const options = [process.env.NODE_OPTIONS || "", `--require="${preload}"`].filter(Boolean).join(" ");
const samples = new Map();
const connections = [];
const watchers = new Set();
function observe(marker) {
  if (samples.has(marker.pid)) return;
  const entry = { ...marker, heapPeakBytes: 0, heapCommittedPeakBytes: 0, samples: 0 };
  samples.set(marker.pid, entry);
  const socket = new WebSocket(marker.url);
  connections.push(socket);
  let id = 0;
  let interval;
  socket.on("open", () => {
    const sample = () => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ id: ++id, method: "Runtime.getHeapUsage" })); };
    sample(); interval = setInterval(sample, 500); watchers.add(interval);
  });
  socket.on("message", bytes => {
    const message = JSON.parse(bytes.toString());
    if (!message.result?.usedSize) return;
    entry.samples++;
    entry.heapPeakBytes = Math.max(entry.heapPeakBytes, message.result.usedSize);
    entry.heapCommittedPeakBytes = Math.max(entry.heapCommittedPeakBytes, message.result.totalSize);
  });
  socket.on("error", () => {});
  socket.on("close", () => { clearInterval(interval); watchers.delete(interval); });
}
const start = Date.now();
let output = "";
const child = spawn(process.execPath, ["scripts/build.mjs"], { stdio: ["ignore", "pipe", "pipe"], env: { ...process.env, NODE_OPTIONS: options, DRIZZLE_METRICS_DIRECTORY: directory } });
const consume = bytes => {
  const text = bytes.toString();
  output += text;
  process.stdout.write(text);
  for (const match of output.matchAll(/\[drizzle-metrics\](\{[^\n]+\})/g)) observe(JSON.parse(match[1]));
  // Node delays exit while a debugger is attached. Release completed children.
  if (text.includes("Waiting for the debugger to disconnect")) for (const socket of connections) socket.close();
};
child.stdout.on("data", consume);
child.stderr.on("data", consume);
let exitCode;
try { exitCode = await new Promise((resolve, reject) => { child.on("error", reject); child.on("exit", code => resolve(code ?? 1)); }); }
finally { for (const timer of watchers) clearInterval(timer); for (const socket of connections) socket.close(); }
writeFileSync(join(directory, "build.log"), output);
const report = { capturedAt, sha: execFileSync("git", ["rev-parse", "HEAD"], { encoding: "utf8" }).trim(), command: "npm run build (same scripts/build.mjs entrypoint; inspector sampling enabled)", cache: process.argv.includes("--cold") ? "cold-requested; inspect cache before accepting" : "existing-cache", platform: process.platform, node: process.version, ramBytes: os.totalmem(), durationMs: Date.now() - start, exitCode, processes: [...samples.values()], samplingIntervalMs: 500, heapMeasurement: "Observed peak via V8 inspector sampling; not an exhaustive allocation trace", directory };
writeFileSync(join(directory, "summary.json"), JSON.stringify(report, null, 2));
console.log(JSON.stringify({ durationMs: report.durationMs, exitCode, directory }, null, 2));
process.exitCode = exitCode;
