import { existsSync } from "node:fs";
import { resolve } from "node:path";
import { run } from "node:test";
import { tap } from "node:test/reporters";

const files = JSON.parse(process.argv[2]).map(file => resolve(file));
for (const file of files) if (!existsSync(file)) throw new Error(`Missing domain suite: ${file}`);
// Explicit files preserve Next.js [id] directories: CLI glob expansion would
// silently omit their tests, interpreting the directory as a character class.
const stream = run({ files, concurrency: 1 });
stream.on("test:fail", () => { process.exitCode = 1; });
stream.compose(tap).pipe(process.stdout);
