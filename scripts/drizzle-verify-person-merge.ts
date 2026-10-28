import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import ts from "typescript";
import { config } from "dotenv";
import { Prisma } from "@prisma/client";
import * as policy from "../src/lib/cadastros/person-merge-policy";
import { createDatabaseConnection } from "../src/db/connection";
import { getPersonMergeCandidates, loadPersonMergePage } from "../src/db/repositories/registry/person-merge";

config({ path: ".env.local", quiet: true }); config({ quiet: true });

async function main() {
  assert.ok(process.env.DATABASE_URL);
  const { createPrismaClient } = await import("../src/lib/prisma");
  const legacy = createPrismaClient(process.env.DATABASE_URL);
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  const original = execFileSync("git", ["show", "3f05dcd:src/lib/cadastros/person-merge-service.ts"], { encoding: "utf8" });
  const compiled = ts.transpileModule(original, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const exports: { getPersonMergeCandidates?: (db: unknown, id: string) => Promise<unknown> } = {};
  new Function("exports", "require", compiled)(exports, (id: string) => {
    if (id === "@prisma/client") return { Prisma };
    if (id === "./person-merge-policy") return policy;
    assert.equal(id, "@/lib/platform/audit-evidence");
    return {};
  });
  assert.ok(exports.getPersonMergeCandidates);
  let comparisons = 0;
  try {
    const expected = { people: await legacy.person.findMany({ where: { status: { not: "Arquivado por mesclagem" } }, select: { id: true, fullName: true, cpf: true }, orderBy: { fullName: "asc" }, take: 250 }), requests: await legacy.personMergeRequest.findMany({ select: { id: true, status: true, sourcePerson: { select: { fullName: true } }, targetPerson: { select: { fullName: true } }, proposedByUsuario: { select: { nome: true } } }, orderBy: { createdAt: "desc" }, take: 50 }) };
    assert.deepEqual(await loadPersonMergePage(connection.db), expected); comparisons++;
    const sources = await legacy.person.findMany({ where: { status: { not: "Arquivado por mesclagem" } }, select: { id: true }, take: 250 });
    for (const source of [...sources.slice(0, 5), ...sources.slice(-5)]) {
      assert.deepEqual(await getPersonMergeCandidates(connection.db, source.id), await exports.getPersonMergeCandidates(legacy, source.id)); comparisons++;
    }
    await assert.rejects(getPersonMergeCandidates(connection.db, "absent-drizzle-person"), /origem não encontrada/);
    await assert.rejects(exports.getPersonMergeCandidates(legacy, "absent-drizzle-person"), /origem não encontrada/); comparisons++;
    console.log(JSON.stringify({ result: "PASS", mode: "READ ONLY", comparisons, scope: "Person merge page DTO/ordering and candidate rankings for ten sources plus absent identity" }, null, 2));
  } finally { await legacy.$disconnect(); await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
