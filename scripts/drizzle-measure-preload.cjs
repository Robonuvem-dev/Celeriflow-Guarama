const inspector = require("node:inspector");
const { mkdirSync, writeFileSync } = require("node:fs");
const { join } = require("node:path");

if (process.env.DRIZZLE_METRICS_DIRECTORY) {
  inspector.open(0, "127.0.0.1");
  const start = Date.now();
  const directory = process.env.DRIZZLE_METRICS_DIRECTORY;
  mkdirSync(directory, { recursive: true });
  process.stderr.write(`[drizzle-metrics]${JSON.stringify({ pid: process.pid, url: inspector.url(), argv: process.argv, startedAt: new Date(start).toISOString() })}\n`);
  process.on("exit", code => {
    writeFileSync(join(directory, `${process.pid}-exit.json`), JSON.stringify({ pid: process.pid, argv: process.argv, durationMs: Date.now() - start, exitCode: code, finalMemory: process.memoryUsage(), resourceUsage: process.resourceUsage() }, null, 2));
  });
}
