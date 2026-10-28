import { spawnSync } from "node:child_process";
import { join } from "node:path";

const heapMegabytes = 4096;
const heapOptionPattern = /--max[-_]old[-_]space[-_]size(?:=(\d+)|\s+(\d+))?/g;
const inheritedNodeOptions = process.env.NODE_OPTIONS?.trim() ?? "";
let containsHeapOption = false;
const nodeOptions = inheritedNodeOptions.replace(
  heapOptionPattern,
  () => {
    containsHeapOption = true;
    return `--max-old-space-size=${heapMegabytes}`;
  },
);

const normalizedNodeOptions = containsHeapOption
  ? nodeOptions
  : [nodeOptions, `--max-old-space-size=${heapMegabytes}`].filter(Boolean).join(" ");

// Keep room for native allocations and the OS on Vercel's 8 GB machines.
const environment = {
  ...process.env,
  NODE_ENV: "production",
  NODE_OPTIONS: normalizedNodeOptions,
  CELERIFLOW_TYPES_CHECKED: "0",
};
const commands = {
  migration: join(process.cwd(), "scripts", "database-migrate.mjs"),
  coverage: join(process.cwd(), "scripts", "verify-database-migration.mjs"),
  next: join(process.cwd(), "node_modules", "next", "dist", "bin", "next"),
  typecheck: join(process.cwd(), "scripts", "typecheck-build.mjs"),
};

function run(command, args, overrides = {}) {
  const startedAt = Date.now();
  console.log(`[build] Starting ${command} ${args.join(" ")}`);
  const result = spawnSync(process.execPath, [commands[command], ...args], {
    stdio: "inherit",
    env: { ...environment, ...overrides },
  });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
  if (process.exitCode !== 0) process.exit(process.exitCode);
  console.log(`[build] Finished ${command} in ${Math.round((Date.now() - startedAt) / 1000)}s`);
}

const typecheckOnly = process.argv.includes("--typecheck");
run("coverage", []);
run("migration", ["verify-files"]);
if (!typecheckOnly && process.env.VERCEL_ENV === "production") {
  // The production build selects its existing deployment database explicitly
  // for the SQL runner. The standalone CLI has no DATABASE_URL fallback, and
  // baseline/adoption are separate operations that this build never invokes.
  const migrationUrl = environment.DATABASE_MIGRATION_URL || environment.DATABASE_URL_UNPOOLED || environment.DATABASE_URL;
  if (!migrationUrl) throw new Error("Banco de produção não configurado para o deploy SQL.");
  run("migration", ["deploy"], { DATABASE_MIGRATION_URL: migrationUrl });
}
run("next", ["typegen"]);
// Each command exits before the next one starts, releasing its memory.
run("typecheck", []);
if (!typecheckOnly) {
  // Skip only the duplicate Next.js check, after tsc has succeeded above.
  environment.CELERIFLOW_TYPES_CHECKED = "1";
  run("next", ["build"]);
}
