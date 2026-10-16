import { spawnSync } from "node:child_process";
import { config } from "dotenv";

config({ path: ".env.local", quiet: true });
const testUrl = process.env.TEST_DATABASE_URL;
if (!testUrl) throw new Error("TEST_DATABASE_URL is required.");
const targets = [testUrl, process.env.TEST_DATABASE_URL_UNPOOLED || testUrl].map(value => new URL(value));
const operational = [process.env.DATABASE_URL, process.env.DATABASE_URL_UNPOOLED].filter(Boolean).map(value => new URL(value));
const host = url => url.hostname.replace("-pooler", "");
if (targets.some(test => operational.some(prod => host(test) === host(prod) && test.pathname === prod.pathname))) {
  throw new Error("Test and operational databases must differ.");
}
const operation = process.argv[2] || "status";
if (!["status", "deploy", "foundation"].includes(operation)) throw new Error("Unsupported operation.");
const args = operation === "foundation"
  ? ["prisma", "db", "execute", "--file", "prisma/migrations-ibema/20261010130000_add_master_data_foundation/migration.sql"]
  : ["prisma", "migrate", operation];
const env = { ...process.env, DATABASE_URL: testUrl, DATABASE_URL_UNPOOLED: process.env.TEST_DATABASE_URL_UNPOOLED || testUrl };
const result = process.platform === "win32"
  ? spawnSync("cmd.exe", ["/d", "/s", "/c", `npx ${args.join(" ")}`], { stdio: "inherit", env })
  : spawnSync("npx", args, { stdio: "inherit", env });
if (result.error) throw result.error;
process.exit(result.status ?? 1);
