import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { readFileSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import path from "node:path";
import test from "node:test";
import { PGlite } from "@electric-sql/pglite";
import { PGLiteSocketServer } from "@electric-sql/pglite-socket";
import { Prisma, PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { runConstructionAutomaticViability, listConstructionAutomaticViability, downloadConstructionAutomaticViability } from "../src/lib/obras/construction-automatic-viability";

// Builds a disposable DB from the already generated Prisma scalar metadata; no generate/build needed.
function fixtureTables() {
  const schema = readFileSync("prisma/schema.prisma", "utf8");
  const names = ["Person", "Company", "ConstructionCompanyProfile", "ConstructionProfessional", "ConstructionPortalIdentity", "ConstructionParticipant", "ConstructionExternalApplication", "ConstructionDefinitionVersion", "ConstructionCase", "Process", "ConstructionCaseProperty", "RealEstate", "ConstructionPropertyZone", "ConstructionZoneVersion", "ConstructionCatalogEntry", "ConstructionViabilityResult", "DocumentClass", "Document", "DocumentVersion", "DocumentSignature", "DocumentIcpEvidence", "ProcessDocument", "ConstructionStaffRole", "Employee", "Usuario", "ProcessEvent"];
  return names.map((name) => {
    const model = Prisma.dmmf.datamodel.models.find((m) => m.name === name)!;
    assert.ok(model, `Modelo gerado ${name}`);
    const block = schema.match(new RegExp(`model ${name} \\{([\\s\\S]*?)\\n\\}`))![1];
    const fields = model.fields.filter((f) => f.kind !== "object").map((f) => {
      const declaration = block.split("\n").find((line) => new RegExp(`^\\s*${f.name}\\s`).test(line))!;
      const scalar = declaration.trim().split(/\s+/)[1];
      const isList = scalar.endsWith("[]"); const isRequired = !scalar.endsWith("?");
      const type = isList ? "TEXT[]" : ({ Int: "INTEGER", Float: "DOUBLE PRECISION", Decimal: "NUMERIC", Boolean: "BOOLEAN", DateTime: "TIMESTAMP(3)", Json: "JSONB", BigInt: "BIGINT", Bytes: "BYTEA" } as Record<string, string>)[f.type] || "TEXT";
      let value = isRequired ? (isList ? "'{}'" : ["Int", "Float", "Decimal", "BigInt"].includes(f.type) ? "0" : f.type === "Boolean" ? "false" : f.type === "DateTime" ? "CURRENT_TIMESTAMP" : f.type === "Json" ? "'{}'" : "''") : "NULL";
      const simpleDefault = declaration.match(/@default\((true|false|\d+|"[^"\n]*")\)/)?.[1];
      if (simpleDefault) value = simpleDefault.startsWith('"') ? `'${JSON.parse(simpleDefault).replaceAll("'", "''")}'` : simpleDefault;
      return `"${f.name}" ${type} DEFAULT ${value}${declaration.includes("@id") ? " PRIMARY KEY" : declaration.includes("@unique") ? " UNIQUE" : ""}`;
    });
    return `CREATE TABLE "${name}" (${fields.join(",")});`;
  }).join("\n");
}

test("Prisma/PGlite: portal autorizado, decisão automática, replay, GED pendente, assinatura e imutabilidade", async () => {
  const db = new PGlite();
  const server = new PGLiteSocketServer({ db, port: 0, host: "127.0.0.1" });
  const root = process.env.TEMP || "C:/Users/trici/AppData/Local/Temp/opencode";
  const backup = await mkdtemp(path.join(root, "construction-auto-"));
  const previous = process.env.CONSTRUCTION_DOCUMENT_BACKUP_DIR;
  const previousInstance = process.env.CELERIFLOW_INSTANCE_ID;
  const previousBlob = process.env.BLOB_READ_WRITE_TOKEN;
  process.env.CONSTRUCTION_DOCUMENT_BACKUP_DIR = backup;
  process.env.CELERIFLOW_INSTANCE_ID = "automatic-viability-test";
  delete process.env.BLOB_READ_WRITE_TOKEN;
  let prisma: PrismaClient | undefined;
  try {
    await db.exec(fixtureTables());
    await db.exec(readFileSync("prisma/migrations-ibema/20261010290000_construction_automatic_viability/migration.sql", "utf8"));
    await db.exec(`
      INSERT INTO "Person" (id,status) VALUES ('person','Ativo');
      INSERT INTO "ConstructionProfessional" (id,"personId","professionalType","isActive","startsAt") VALUES ('professional','person','BROKER',true,'2020-01-01'),('professional2','person','BROKER',true,'2020-01-01');
      INSERT INTO "ConstructionPortalIdentity" (id,"professionalId","firebaseUid","isActive") VALUES ('identity','professional','uid1',true),('other','professional2','uid2',true);
      INSERT INTO "Process" (id,"protocolNumber",status,"currentDepartmentId","personId","subjectId") VALUES ('process','AUTO-2026-1','Aguardando Recebimento','sector','person','subject');
      INSERT INTO "ConstructionCase" (id,"processId",category,"locationType","catalogSnapshot","totalArea") VALUES ('case','process','BUILDING','URBAN','{"purpose":{"id":"purpose","label":"Residencial"}}',100);
      INSERT INTO "ConstructionParticipant" (id,"caseId","identityId","isActive","startsAt") VALUES ('participant','case','identity',true,'2020-01-01');
      INSERT INTO "ConstructionCatalogEntry" (id,kind,"isActive") VALUES ('purpose','PURPOSE',true);
      INSERT INTO "ConstructionDefinitionVersion" (id,kind,version,definition,"publishedBy","publishedAt") VALUES ('definition','VIABILITY',1,'{"fields":[],"checks":[{"key":"territory","label":"Zoneamento e índices conferidos (DEMONSTRAÇÃO)","required":true}],"documents":[]}','CONSTRUCTION_DEMO_SEED','2020-01-01');
      INSERT INTO "RealEstate" (id,"municipalInsc","landArea") VALUES ('property','AUTHORIZED',300);
      INSERT INTO "ConstructionCaseProperty" (id,"caseId","realEstateId","cadastralSnapshot") VALUES ('link','case','property','{"municipalInsc":"AUTHORIZED"}');
      INSERT INTO "ConstructionZoneVersion" (id,code,version,name,"legalBasis","startsAt","allowedPurposeIds","allowedCategories","minimumLandArea","maxFloorAreaRatio",automatic,"publishedAt") VALUES ('zone','Z1',1,'Zona DEMO','Parâmetros demonstrativos, sem lei oficial presumida','2020-01-01',ARRAY['purpose'],ARRAY['BUILDING'],200,0.5,true,'2020-01-01');
      INSERT INTO "ConstructionPropertyZone" (id,"realEstateId","zoneId") VALUES ('zoning','property','zone');
      INSERT INTO "Employee" (id,"departmentId","isActive") VALUES ('manager','sector',true);
      INSERT INTO "ConstructionStaffRole" (id,"employeeId","departmentId",role,"startsAt","isActive") VALUES ('manager-role','manager','sector','MANAGER','2020-01-01',true);
      INSERT INTO "Usuario" (id,"employeeId",nome,email,ativo) VALUES ('signer','manager','Gestor demonstrativo','signer@example.test',true);
    `);
    await server.start();
    prisma = new PrismaClient({ adapter: new PrismaPg({ connectionString: `postgresql://postgres:postgres@${server.getServerConn()}/postgres`, max: 1 }) });
    const input = { caseId: "case", requestKey: randomUUID() };
    await assert.rejects(runConstructionAutomaticViability(prisma, "other", input), /indisponível/);
    const id = await runConstructionAutomaticViability(prisma, "identity", input);
    assert.equal(await runConstructionAutomaticViability(prisma, "identity", input), id);
    const runs = await listConstructionAutomaticViability(prisma, "identity", "case");
    assert.equal(runs.length, 1); assert.equal(runs[0].outcome, "APPROVED"); assert.equal(runs[0].downloadable, false);
    assert.equal(runs[0].signatureRoutingStatus, "REQUESTED");
    assert.equal(await prisma.constructionViabilityResult.count(), 1);
    const signatures = await prisma.documentSignature.findMany();
    assert.equal(signatures.length, 1); assert.equal(signatures[0].status, "PENDING"); assert.equal(signatures[0].requestedByUsuarioId, null);
    await assert.rejects(downloadConstructionAutomaticViability(prisma, "identity", "case", id), /assinaturas válidas/);
    const version = await prisma.documentVersion.findFirstOrThrow();
    // Represents a real GED signer completing its workflow; the automatic service never sets SIGNED.
    await db.exec(`UPDATE "DocumentVersion" SET status='SIGNED'; UPDATE "DocumentSignature" SET status='SIGNED',"authenticationMethod"='PASSWORD_REAUTHENTICATED',"signedAt"=CURRENT_TIMESTAMP`);
    const artifact = await downloadConstructionAutomaticViability(prisma, "identity", "case", id);
    assert.equal(artifact.hash, version.hashSha256); assert.ok(Buffer.from(artifact.bytes).subarray(0, 5).equals(Buffer.from("%PDF-")));
    await db.exec(`UPDATE "DocumentSignature" SET "documentHash"='tampered'`);
    await assert.rejects(downloadConstructionAutomaticViability(prisma, "identity", "case", id), /assinaturas válidas/);
    await assert.rejects(db.exec(`UPDATE "ConstructionAutomaticViabilityRun" SET outcome='DENIED'`), /imutável/);
    await assert.rejects(db.exec(`DELETE FROM "ConstructionAutomaticViabilityRun"`), /imutável/);
    await db.exec(`UPDATE "ConstructionStaffRole" SET "isActive"=false; UPDATE "ConstructionCase" SET "totalArea"=160`);
    const denied = await runConstructionAutomaticViability(prisma, "identity", { ...input, requestKey: randomUUID() });
    const [row] = (await db.query<{ outcome: string; signatureRoutingStatus: string }>('SELECT outcome,"signatureRoutingStatus" FROM "ConstructionAutomaticViabilityRun" WHERE id=$1', [denied])).rows;
    assert.equal(row.outcome, "DENIED"); assert.equal(row.signatureRoutingStatus, "AWAITING_SIGNER_CONFIGURATION");
    await db.exec(`UPDATE "Process" SET "currentDepartmentId"=NULL`);
    const withoutDepartment = await runConstructionAutomaticViability(prisma, "identity", { ...input, requestKey: randomUUID() });
    const [withoutDepartmentRow] = (await db.query<{ signatureRoutingStatus: string }>('SELECT "signatureRoutingStatus" FROM "ConstructionAutomaticViabilityRun" WHERE id=$1', [withoutDepartment])).rows;
    assert.equal(withoutDepartmentRow.signatureRoutingStatus, "AWAITING_SIGNER_CONFIGURATION");
    await db.exec(`UPDATE "Process" SET "currentDepartmentId"='sector'`);
    await db.exec(`INSERT INTO "ConstructionDefinitionVersion" (id,kind,version,definition,"publishedBy","publishedAt") VALUES ('definition2','VIABILITY',2,'{"fields":[],"checks":[{"key":"environment","label":"Licença ambiental","required":true}],"documents":[]}','actor','2020-01-01')`);
    const manual = await runConstructionAutomaticViability(prisma, "identity", { ...input, requestKey: randomUUID() });
    const [manualRow] = (await db.query<{ outcome: string; documentId: string | null }>('SELECT outcome,"documentId" FROM "ConstructionAutomaticViabilityRun" WHERE id=$1', [manual])).rows;
    assert.equal(manualRow.outcome, "MANUAL"); assert.equal(manualRow.documentId, null);
    assert.equal(await prisma.document.count(), 3);
    await db.exec(`INSERT INTO "ConstructionExternalApplication" (id,"caseId","identityId","personId","propertyIds","subjectIds","expiresAt") VALUES ('auth','case','identity','person',ARRAY['property'],ARRAY['subject'],'2020-01-01')`);
    await assert.rejects(runConstructionAutomaticViability(prisma, "identity", { ...input, requestKey: randomUUID() }), /vencida/);
    await db.exec(`DELETE FROM "ConstructionExternalApplication"`);
    await db.exec(`UPDATE "Process" SET "companyId"='unqualified-builder',"personId"=NULL`);
    await assert.rejects(runConstructionAutomaticViability(prisma, "identity", { ...input, requestKey: randomUUID() }), /construtora/);
    await db.exec(`UPDATE "Process" SET "companyId"=NULL,"personId"='person'`);
    await db.exec(`UPDATE "ConstructionPortalIdentity" SET "isActive"=false WHERE id='identity'`);
    await assert.rejects(listConstructionAutomaticViability(prisma, "identity", "case"), /vigente/);
  } finally {
    await prisma?.$disconnect(); await server.stop(); await db.close();
    if (previous === undefined) delete process.env.CONSTRUCTION_DOCUMENT_BACKUP_DIR; else process.env.CONSTRUCTION_DOCUMENT_BACKUP_DIR = previous;
    if (previousInstance === undefined) delete process.env.CELERIFLOW_INSTANCE_ID; else process.env.CELERIFLOW_INSTANCE_ID = previousInstance;
    if (previousBlob === undefined) delete process.env.BLOB_READ_WRITE_TOKEN; else process.env.BLOB_READ_WRITE_TOKEN = previousBlob;
    await rm(backup, { recursive: true, force: true });
  }
});
