import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync, readdirSync } from "node:fs";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { assertManagerEmployeeChange, resolveSecretariatManager } from "../src/lib/administration/secretariat-manager";

test("responsável é servidor cadastrado com cargo e lotação válida; alterações preservam o vínculo", { timeout: 300000 }, async () => {
  const memory = new PGlite();
  const socket = new PGLiteSocketServer({ db: memory, host: "127.0.0.1", port: 0 });
  let db: PrismaClient | undefined;
  try {
    for (const directory of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(d => d.isDirectory()).map(d => d.name).sort()) await memory.exec(readFileSync(`prisma/migrations-ibema/${directory}/migration.sql`, "utf8"));
    await socket.start();
    db = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${socket.getServerConn()}/postgres`, max: 1 }) });
    const role = await db.role.create({ data: { name: "Secretário Municipal de Educação" } });
    const education = await db.secretariat.create({ data: { name: "Educação" } });
    const health = await db.secretariat.create({ data: { name: "Saúde" } });
    const employee = await db.employee.create({ data: { name: "Antônio Nunes", roleId: role.id, secretariatId: education.id } });
    const manager = await db.$transaction(tx => resolveSecretariatManager(tx, education.id, employee.id));
    await db.secretariat.update({ where: { id: education.id }, data: manager });
    assert.equal((await db.secretariat.findUniqueOrThrow({ where: { id: education.id }, include: { manager: true } })).manager?.id, employee.id);
    await assert.rejects(db.$transaction(tx => resolveSecretariatManager(tx, health.id, employee.id)), /lotado nesta secretaria/);
    await assert.rejects(db.$transaction(tx => assertManagerEmployeeChange(tx, employee.id, { isActive: false })), /Substitua/);
    await assert.rejects(db.$transaction(tx => assertManagerEmployeeChange(tx, employee.id, { secretariatId: health.id })), /lotação/);
    await assert.rejects(db.$transaction(tx => assertManagerEmployeeChange(tx, employee.id, { roleId: null })), /cargo ativo/);
    const unassigned = await db.employee.create({ data: { name: "Bruna Almeida", roleId: role.id } });
    await db.$transaction(tx => resolveSecretariatManager(tx, health.id, unassigned.id));
    assert.equal((await db.employee.findUniqueOrThrow({ where: { id: unassigned.id } })).secretariatId, health.id);
    const inactive = await db.employee.create({ data: { name: "Servidor inativo", isActive: false } });
    await assert.rejects(db.$transaction(tx => resolveSecretariatManager(tx, education.id, inactive.id)), /servidor ativo/);
  } finally { await db?.$disconnect(); await socket.stop(); await memory.close(); }
});
