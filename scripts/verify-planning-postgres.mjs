import { randomUUID } from "node:crypto";
import { createServer } from "node:net";
import { spawn } from "node:child_process";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { rm, stat } from "node:fs/promises";

// Optional test tooling is installed outside the application. No operational database is used.
const modulePath = process.env.CELERIFLOW_EMBEDDED_POSTGRES_MODULE;
const temporaryParent = process.env.CELERIFLOW_POSTGRES_TEST_TEMP;
if (!modulePath || !temporaryParent) throw new Error("Configure CELERIFLOW_EMBEDDED_POSTGRES_MODULE e CELERIFLOW_POSTGRES_TEST_TEMP para a instalação isolada do PostgreSQL.");
if (!(await stat(temporaryParent)).isDirectory()) throw new Error("O diretório temporário deve existir.");
const { default: EmbeddedPostgres } = await import(pathToFileURL(resolve(modulePath)).href);
const probe = createServer();
await new Promise((accept, reject) => { probe.once("error", reject); probe.listen(0, "127.0.0.1", accept); });
const port = probe.address().port;
await new Promise((accept, reject) => probe.close((error) => error ? reject(error) : accept()));
const password = randomUUID();
const databaseDir = join(temporaryParent, `planning-pg-${randomUUID()}`);
// Own cleanup so transient Windows file locks can be retried after the server exits.
// Prisma's timestamp-without-time-zone values use UTC, including trigger-generated timestamps.
// Full historical replay/cleanup touches thousands of tables, indexes and
// sequences in one transaction. PostgreSQL's default lock table is too small
// for this fixture; this is independent of the application's V8 heap budget.
const database = new EmbeddedPostgres({ databaseDir, user: "postgres", password, port, persistent: true, createPostgresUser: false, initdbFlags: ["--encoding=UTF8"], postgresFlags: ["-h", "127.0.0.1", "-c", "timezone=UTC", "-c", "max_locks_per_transaction=4096", "-c", "max_connections=20"], onLog: () => {}, onError: (error) => console.error(String(error).replaceAll(password, "[redacted]")) });
let testExitCode = 1;
try {
  await database.initialise();
  await database.start();
  await database.createDatabase("planning_s2");
  const tests = process.argv.slice(2);
  if (!tests.length) tests.push("tests/planning-execution.test.ts");
  console.log("PostgreSQL local isolado iniciado; execução com múltiplas conexões reais.");
  const child = spawn(process.execPath, ["--conditions=react-server", "--import", "tsx", "--test", "--test-concurrency=1", "--test-reporter=spec", ...tests], { stdio: "inherit", env: { ...process.env, CELERIFLOW_PLANNING_TEST_POSTGRES_URL: `postgresql://postgres:${password}@127.0.0.1:${port}/planning_s2` } });
  testExitCode = await new Promise((accept, reject) => { child.once("error", reject); child.once("exit", (code) => accept(code ?? 1)); });
} finally {
  await database.stop();
  await rm(databaseDir, { recursive: true, force: true, maxRetries: 15, retryDelay: 200 });
  // The embedded server's shutdown may change process.exitCode; retain the test result.
  process.exitCode = testExitCode;
}
// async-exit-hook uses code 0 on natural beforeExit; pass the actual result explicitly.
process.exit(testExitCode);
