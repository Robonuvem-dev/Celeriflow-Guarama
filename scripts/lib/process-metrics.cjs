// Optional preload for final cold/warm validation. Samples are observed peaks,
// not a claim that every allocation was measured; maxRSS comes from the OS.
const directory = process.env.CELERIFLOW_PROCESS_METRICS_DIR;
if (directory) {
  const { mkdirSync, writeFileSync } = require("node:fs");
  const { resolve } = require("node:path");
  const { getHeapStatistics } = require("node:v8");
  const startedAt = new Date().toISOString();
  let heapUsed = 0, heapTotal = 0, rss = 0, samples = 0;
  function sample() {
    const memory = process.memoryUsage();
    heapUsed = Math.max(heapUsed, memory.heapUsed);
    heapTotal = Math.max(heapTotal, memory.heapTotal);
    rss = Math.max(rss, memory.rss);
    samples++;
  }
  sample();
  const timer = setInterval(sample, 250);
  timer.unref();
  process.on("exit", code => {
    clearInterval(timer);
    sample();
    mkdirSync(directory, { recursive: true });
    writeFileSync(resolve(directory, `${process.pid}.json`), JSON.stringify({
      pid: process.pid, startedAt, endedAt: new Date().toISOString(),
      node: process.version, platform: process.platform, argv: process.argv.slice(1),
      exitCode: code, durationSeconds: process.uptime(), samples,
      observedPeakHeapUsedBytes: heapUsed, observedPeakHeapTotalBytes: heapTotal,
      observedPeakRssBytes: rss, osMaxRssKiB: process.resourceUsage().maxRSS,
      heapLimitBytes: getHeapStatistics().heap_size_limit,
    }, null, 2));
  });
}
