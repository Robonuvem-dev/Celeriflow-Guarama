import { config } from "dotenv";
import { databaseMigrateMain } from "./database-migrate.mjs";

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
if (operation === "foundation") throw new Error("Migração histórica isolada não é uma operação da autoridade SQL. Use bootstrap:test-db para criar uma fixture de teste ou db:migrate:plan para conferir um banco existente.");
if (!["status", "deploy"].includes(operation)) throw new Error("Unsupported operation.");
process.exitCode = await databaseMigrateMain([operation === "status" ? "plan" : "deploy", ...process.argv.slice(3)], {
  ...process.env,
  DATABASE_MIGRATION_URL: process.env.TEST_DATABASE_URL_UNPOOLED || testUrl,
});
