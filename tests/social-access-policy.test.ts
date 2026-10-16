import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { assertSocialUnitAccess, socialAttendanceWhere, type SocialAccess } from "../src/lib/social/access-policy";
import { professionalLinkSchema } from "../src/lib/social/professional-input";

test("sigilo e escopo SUAS são aplicados pela consulta Prisma no banco", async () => {
  const db = new PGlite();
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  let prisma: PrismaClient | undefined;
  try {
    await db.exec(`
      CREATE TABLE "Employee" (id TEXT PRIMARY KEY);
      CREATE TABLE "SocialUnit" (id TEXT PRIMARY KEY);
      CREATE TABLE "SocialVisit" (id TEXT PRIMARY KEY);
      CREATE TABLE "SocialAttendance" (id TEXT PRIMARY KEY, "unitId" TEXT NOT NULL, "personId" TEXT, "professionalId" TEXT NOT NULL, "secrecyLevel" TEXT NOT NULL);
    `);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010070000_social_professional_access/migration.sql", "utf8"));
    await db.exec(`
      INSERT INTO "SocialUnit" (id,"isConfidential") VALUES ('unit-a',false),('unit-b',false),('secret-unit',true);
      INSERT INTO "SocialAttendance" (id,"unitId","professionalId","secrecyLevel","involvedProfessionalIds") VALUES
        ('own','unit-a','me','Normal','{}'),
        ('team','unit-a','other','Normal','{}'),
        ('restricted-other','unit-a','other','Restrito','{}'),
        ('restricted-involved','unit-a','other','Restrito','{me}'),
        ('outside','unit-b','other','Normal','{}'),
        ('outside-own','unit-b','me','Restrito','{}'),
        ('secret-outside','secret-unit','other','Normal','{}');
    `);
    await server.start();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const access: SocialAccess = { administrator: false, employeeId: "me", links: [{ unitId: "unit-a", individualScope: "UNIT", familyScope: "UNIT" }] };
    const ids = async (scope: SocialAccess) => (await prisma!.socialAttendance.findMany({ where: socialAttendanceWhere(scope), select: { id: true }, orderBy: { id: "asc" } })).map((row) => row.id);
    assert.deepEqual(await ids(access), ["own", "restricted-involved", "team"]);
    assert.deepEqual(await ids({ ...access, links: [] }), []);
    assert.deepEqual(await ids({ ...access, links: [{ unitId: "unit-a", individualScope: "OWN", familyScope: "OWN" }] }), ["own", "restricted-involved"]);
    assert.deepEqual(await ids({ ...access, links: [{ unitId: "unit-a", individualScope: "MUNICIPAL", familyScope: "MUNICIPAL" }] }), ["outside", "own", "restricted-involved", "team"]);
    assert.equal((await ids({ ...access, administrator: true })).length, 7);
    assert.throws(() => assertSocialUnitAccess(access, "unit-b"));
  } finally {
    await prisma?.$disconnect();
    await server.stop();
    await db.close();
  }
});

test("vínculo rejeita período invertido e expediente inválido", () => {
  const valid = { employeeId: "employee", unitId: "unit", jobTitle: "Assistente social", specialty: "", startsAt: "2026-01-01", endsAt: "", isActive: true, individualScope: "UNIT", familyScope: "OWN", workStart: "08:00", workEnd: "17:00", workingDays: [1, 2, 3], includeInRma: true };
  assert.equal(professionalLinkSchema.safeParse(valid).success, true);
  assert.equal(professionalLinkSchema.safeParse({ ...valid, endsAt: "2025-12-31" }).success, false);
  assert.equal(professionalLinkSchema.safeParse({ ...valid, workEnd: "07:00" }).success, false);
  assert.equal(professionalLinkSchema.safeParse({ ...valid, startsAt: "2026-02-30" }).success, false);
  assert.equal(professionalLinkSchema.safeParse({ ...valid, workingDays: [] }).success, false);
});
