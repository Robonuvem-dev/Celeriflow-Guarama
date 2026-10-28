import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";

const groupATestRoots = [
  "tests",
  "src/lib",
];

const groupATestPattern = /^(?:tests|src\/lib)\/.*\.(?:test|spec)\.(?:[cm]?[jt]sx?)$/;

export function findGroupATests() {
  // Include new tests before staging, with the same selection in local and CI
  // runs. Git still excludes ignored artifacts, fixtures and dependency trees.
  const files = execFileSync("git", ["ls-files", "--cached", "--others", "--exclude-standard", "--", ...groupATestRoots], { encoding: "utf8" });
  return [...new Set(files.split(/\r?\n/).filter(file => groupATestPattern.test(file) && existsSync(file)))].sort();
}
