import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { config } from "dotenv";
import { findCommittedGroupATests } from "./group-a-tests.mjs";

config({ path: ".env.local", quiet: true });

const tests = findCommittedGroupATests();
if (!tests.length) {
  console.error("No committed Group A test files were found.");
  process.exit(1);
}

console.log(`Running ${tests.length} committed Group A test file(s).`);
const tsxCli = fileURLToPath(new URL("../node_modules/tsx/dist/cli.mjs", import.meta.url));
const testDatabaseUrl = process.env.TEST_DATABASE_URL;
const testDatabaseUrlUnpooled = process.env.TEST_DATABASE_URL_UNPOOLED ?? testDatabaseUrl;
const env = testDatabaseUrl
  ? { ...process.env, DATABASE_URL: testDatabaseUrl, DATABASE_URL_UNPOOLED: testDatabaseUrlUnpooled }
  : process.env;
const result = spawnSync(process.execPath, [tsxCli, "--conditions=react-server", "--test", "--test-concurrency=1", ...tests], { stdio: "inherit", env });

if (result.error) throw result.error;
process.exit(result.status ?? 1);
