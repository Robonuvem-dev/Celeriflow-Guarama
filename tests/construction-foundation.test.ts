import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { PrismaPg } from "@prisma/adapter-pg";
import { PrismaClient } from "@prisma/client";
import { calculateConstructionArea, constructionCaseWhere, constructionStaffSchema } from "../src/lib/obras/construction-policy";

test("área urbanística preserva precisão e rejeita regra negativa/inválida", () => {
  const areas = { existingArea: "0.1", expandedArea: "0.2", irregularArea: "0", renovationArea: "0", demolitionArea: "0" };
  const weights = { existingArea: 1, expandedArea: 1, irregularArea: 0, renovationArea: 0, demolitionArea: -1 };
  assert.equal(calculateConstructionArea(areas, weights).total, "0.3000");
  assert.equal(calculateConstructionArea({ ...areas, renovationArea: "0.5" }, weights).total, "0.3000");
  assert.throws(() => calculateConstructionArea({ ...areas, demolitionArea: "1" }, weights), /negativa/);
  assert.throws(() => calculateConstructionArea({ ...areas, existingArea: "0.00001" }, weights));
  assert.throws(() => calculateConstructionArea(areas, { ...weights, expandedArea: 2 }));
});

test("papel urbanístico rejeita vigência invertida e data inexistente", () => {
  const input = { employeeId: "employee", departmentId: "department", role: "ANALYST", startsAt: "2026-10-10", endsAt: "", isActive: true };
  assert.equal(constructionStaffSchema.safeParse(input).success, true);
  assert.equal(constructionStaffSchema.safeParse({ ...input, endsAt: "2026-10-09" }).success, false);
  assert.equal(constructionStaffSchema.safeParse({ ...input, startsAt: "2026-02-30" }).success, false);
});

test("migration protege versões e vínculos; consulta Prisma isola setores", async () => {
  const db = new PGlite();
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  let prisma: PrismaClient | undefined;
  try {
    await db.exec(`CREATE TABLE "Employee" (id TEXT PRIMARY KEY); CREATE TABLE "Department" (id TEXT PRIMARY KEY); CREATE TABLE "RealEstate" (id TEXT PRIMARY KEY); CREATE TABLE "Process" (id TEXT PRIMARY KEY, "currentDepartmentId" TEXT);`);
    await db.exec(readFileSync("prisma/migrations-ibema/20261010160000_construction_foundation/migration.sql", "utf8"));
    const seed = await db.query<{ count: number }>('SELECT COUNT(*)::integer AS count FROM "ConstructionCatalogEntry" WHERE kind=\'CONSTRUCTION_TYPE\'');
    assert.equal(seed.rows[0].count, 14);
    await assert.rejects(db.exec(`INSERT INTO "ConstructionCatalogEntry" (id,kind,name,"updatedAt") VALUES ('duplicate','CONSTRUCTION_TYPE',' concreto superior ',CURRENT_TIMESTAMP)`));
    await db.exec(`INSERT INTO "Process" VALUES ('process-a','sector-a'),('process-b','sector-b'),('process-c','sector-b'); INSERT INTO "RealEstate" VALUES ('property'); INSERT INTO "ConstructionConfigVersion" (id,version,"freeRevisions","correctionDays","checkPropertyDebts","subjectIds","areaWeights",instructions,"publishedBy") VALUES ('config',1,2,30,false,'{subject}','{}','Orientação','actor');`);
    await assert.rejects(db.exec(`UPDATE "ConstructionConfigVersion" SET "freeRevisions"=9 WHERE id='config'`));
    await assert.rejects(db.exec(`DELETE FROM "ConstructionConfigVersion" WHERE id='config'`));
    const insert = 'INSERT INTO "ConstructionCase" (id,"requestKey","processId","configurationId",category,"locationType","catalogSnapshot","existingArea","expandedArea","irregularArea","renovationArea","demolitionArea","totalArea","calculationSnapshot","createdBy") VALUES ($1,$2,$3,\'config\',\'BUILDING\',\'URBAN\',\'{}\',0,0,0,0,0,0,\'{}\',\'actor\')';
    await db.query(insert, ["case-a", "key-a", "process-a"]);
    await db.query(insert, ["case-b", "key-b", "process-b"]);
    await assert.rejects(db.query(insert, ["case-duplicate", "key-a", "process-c"]));
    await db.exec(`INSERT INTO "ConstructionCaseProperty" (id,"caseId","realEstateId","cadastralSnapshot") VALUES ('link','case-a','property','{}')`);
    await assert.rejects(db.exec(`DELETE FROM "RealEstate" WHERE id='property'`));
    await server.start();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const access = { administrator: false, departmentId: "sector-a", employeeId: "employee", roles: ["ANALYST"] };
    const ids = async (scope: typeof access) => (await prisma!.constructionCase.findMany({ where: constructionCaseWhere(scope), select: { id: true }, orderBy: { id: "asc" } })).map((item) => item.id);
    assert.deepEqual(await ids(access), ["case-a"]);
    assert.deepEqual(await ids({ ...access, roles: [] }), []);
    assert.deepEqual(await ids({ ...access, administrator: true }), ["case-a", "case-b"]);
    await db.exec(`UPDATE "Process" SET "currentDepartmentId"='sector-b' WHERE id='process-a'`);
    assert.deepEqual(await ids(access), []);
  } finally { await prisma?.$disconnect(); await server.stop(); await db.close(); }
});
