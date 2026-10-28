import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { fileURLToPath } from "node:url";
import ts from "typescript";
import { findLegacyDatabaseReferences, legacyDatabaseModule as legacyModule } from "./lib/database-migration-source-check.mjs";

const root = fileURLToPath(new URL("../", import.meta.url));
const reportOnly = process.argv.slice(2).includes("--report-only");
if (process.argv.slice(2).some(argument => argument !== "--report-only")) throw new Error("Use somente --report-only para inventariar sem gate de conclusão.");
const sourceExtension = /\.(?:[cm]?[jt]sx?)$/;

function sourceFiles(directory) {
  return readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    if (entry.name.startsWith(".") || entry.name === "node_modules" || entry.name === "generated") return [];
    const path = join(directory, entry.name);
    return entry.isDirectory() ? sourceFiles(path) : sourceExtension.test(entry.name) ? [path] : [];
  });
}

const files = [
  ...["src", "scripts", "tests", "prisma"].flatMap(directory => sourceFiles(join(root, directory))),
  ...readdirSync(root).filter(name => sourceExtension.test(name)).map(name => join(root, name)),
].sort();
const findings = [];
for (const path of files) {
  const source = ts.createSourceFile(path, readFileSync(path, "utf8"), ts.ScriptTarget.Latest, true);
  const matches = findLegacyDatabaseReferences(source);
  if (matches.length) findings.push({ file: relative(root, path).replaceAll("\\", "/"), matches });
}

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const dependencies = ["dependencies", "devDependencies", "optionalDependencies"].flatMap(section => Object.keys(manifest[section] ?? {}).filter(name => legacyModule.test(name)).map(name => ({ section, name })));
const scripts = Object.entries(manifest.scripts ?? {}).filter(([, value]) => /\bprisma(?:\s|$)|node_modules[\\/](?:@prisma[\\/]|prisma[\\/])/.test(value)).map(([name, command]) => ({ name, command }));
const lock = JSON.parse(readFileSync(join(root, "package-lock.json"), "utf8"));
const lockPackages = Object.keys(lock.packages ?? {}).filter(name => /(?:^|\/)node_modules\/(?:@prisma\/|prisma(?:\/|$))/.test(name));
const result = findings.length || dependencies.length || scripts.length || lockPackages.length ? "INCOMPLETE" : "PASS";
console.log(JSON.stringify({ result, mode: reportOnly ? "INVENTORY_ONLY" : "COMPLETION_GATE", sources: files.length, filesWithLegacyAccess: findings.length, occurrences: findings.reduce((sum, file) => sum + file.matches.length, 0), dependencies, scripts, lockPackages, findings }, null, 2));
if (result !== "PASS" && !reportOnly) process.exitCode = 1;
