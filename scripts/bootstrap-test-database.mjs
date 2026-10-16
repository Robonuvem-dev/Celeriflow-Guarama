import { readdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });

const isWindows = process.platform === "win32";
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testDatabaseUrlUnpooled = process.env.TEST_DATABASE_URL_UNPOOLED ?? testDatabaseUrl;

if (!testDatabaseUrl) {
  console.error("TEST_DATABASE_URL is required; refusing to reset the database configured in .env.local.");
  process.exit(1);
}

process.env.DATABASE_URL = testDatabaseUrl;
process.env.DATABASE_URL_UNPOOLED = testDatabaseUrlUnpooled;

function run(...args) {
  console.log(`$ npx ${args.join(" ")}`);
  const result = isWindows
    ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npx ${args.join(" ")}`], { stdio: "inherit" })
    : spawnSync("npx", args, { stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

const migrations = readdirSync("prisma/migrations-ibema", { withFileTypes: true })
  .filter((entry) => entry.isDirectory())
  .map((entry) => entry.name)
  .sort();

run("prisma", "db", "push", "--force-reset", "--accept-data-loss");
run("prisma", "db", "execute", "--file", "prisma/bootstrap-test/audit-immutability.sql");
run("tsx", "prisma/bootstrap-test/seed.ts");

for (const migration of migrations) {
  run("prisma", "migrate", "resolve", "--applied", migration);
}
