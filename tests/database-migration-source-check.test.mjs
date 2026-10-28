import assert from "node:assert/strict";
import test from "node:test";
import ts from "typescript";
import { findLegacyDatabaseReferences } from "../scripts/lib/database-migration-source-check.mjs";

const inspect = text => findLegacyDatabaseReferences(ts.createSourceFile("fixture.ts", text, ts.ScriptTarget.Latest, true));

test("completion gate distinguishes historical SQL data paths from executable legacy dependencies", () => {
  assert.deepEqual(inspect(`
    const historical = join("prisma", "migrations-ibema");
    const sql = readFileSync("prisma/migrations-ibema/fixture/migration.sql", "utf8");
    const fixture = { ledger: "_prisma_migrations" };
    const historicalParts = ["prisma", "migrations-ibema"];
    console.log("@prisma/client");
    // import { Prisma } from "@prisma/client";
    await db.execute(sql);
  `), []);
});

test("completion gate catches static, dynamic, type-only and CommonJS module boundaries", () => {
  for (const text of [
    'import type { Prisma as ORM } from "@prisma/client";',
    'export { PrismaClient } from "@prisma/client";',
    'type Transaction = import("@prisma/client").Prisma.TransactionClient;',
    'const { prisma } = await import("@/lib/prisma");',
    'const oldClient = require("../src/lib/prisma");',
    'const location = require.resolve("@prisma/adapter-neon");',
    'const oldClient = module.require("prisma/config");',
    'import oldClient = require("@prisma/client");',
    'import { createRequire as makeRequire } from "node:module"; const load = makeRequire(import.meta.url); const oldClient = load("@prisma/client");',
  ]) assert.ok(inspect(text).some(match => ["module", "dynamic-module", "import-type"].includes(match.kind)), text);
});

test("completion gate catches clients, legacy context bindings and ORM namespaces", () => {
  for (const text of [
    "const client = new PrismaClient();", "const { prisma: legacy } = context;", "await context.prisma.user.findMany();",
    "await tx.$transaction(operation);", "await tx.$queryRawUnsafe(sql);", "await tx.$disconnect();",
    "const value = Prisma.JsonNull;", "type Value = Prisma.TransactionClient;",
  ]) assert.notEqual(inspect(text).length, 0, text);
});

test("completion gate retains CLI checks when imports have already been removed", () => {
  for (const text of [
    'const cli = join(process.cwd(), "node_modules", "prisma", "build", "index.js");',
    'const cli = resolve("node_modules/prisma/build/index.js");',
    'spawnSync("prisma", ["generate"]);',
    'run("prisma", ["migrate", "deploy"]);',
    'const args = operation === "foundation" ? ["prisma", "db", "execute", "--file", "prisma/migrations-ibema/fixture/migration.sql"] : ["prisma", "migrate", operation]; spawnSync("npx", args);',
    'spawnSync("npx", ["prisma", "generate"]);',
    'execSync("npx prisma migrate deploy");',
    'spawnSync("cmd.exe", ["/c", "npx prisma validate"]);',
  ]) assert.ok(inspect(text).some(match => match.kind === "legacy-tooling"), text);
});

test("completion gate catches model delegates hidden behind fixture aliases and context doubles", () => {
  for (const text of [
    'await fixture.db.family.findUnique({ where: { id } });',
    'await connection.taxPayment.findUniqueOrThrow({ where: { id } });',
    'await fake.healthFamily.findFirst({ where: filter });',
    'await tx.familyMember.upsert(input);',
    'await f.db.person.createMany({ data });',
    'await f.db.person.create({ data: { name } });',
    'await f.db.person.update({ where: { id }, data });',
    'await f.db.person.delete({ where: { id } });',
    'await f.db.person.count();',
    'await f.db.person.aggregate({ _count: true });',
    'await f.db.person.groupBy({ by: ["status"] });',
    'await db["family"]["findMany"]({ where });',
    'const context = { prisma: { family: { findUnique: async () => candidate } } };',
    'const context = { "prisma": client };',
    'await tx["$queryRawUnsafe"](query);',
    'const oldClient = context["prisma"];',
  ]) assert.notEqual(inspect(text).length, 0, text);
  assert.deepEqual(inspect(`
    const fixture = { connection, database: connection.db };
    const methodNames = ["findMany", "upsert", "prisma"];
    await fixture.database.select().from(families).where(eq(families.id, id));
    await fixture.database.update(families).set(data).where(eq(families.id, id));
    await fixture.database.delete(families).where(eq(families.id, id));
    await fixture.database.select({ total: count() }).from(families).groupBy(families.id);
    await withDatabaseTransaction(fixture.connection, tx => tx.insert(families).values(data));
  `), []);
});
