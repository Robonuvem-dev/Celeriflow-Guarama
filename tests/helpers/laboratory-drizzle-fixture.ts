import { readFileSync, readdirSync } from "node:fs";
import type { PermissionUser } from "../../src/lib/contracts/identity";
import type { HealthDiagnosticsContext } from "../../src/lib/contracts/health-diagnostics";
import { getPostgresError } from "../../src/db/errors";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

export function laboratoryTestContext(user: Partial<PermissionUser> = {}): HealthDiagnosticsContext {
  return { user: {
    id: "dx-user", name: "Profissional Diagnostics", firebaseUid: "fixture", email: "dx@example.invalid", role: "Operador", profileCode: "DIAGNOSTICS_OPERATOR",
    employeeId: "dx-employee", departmentId: "dx-department", secretariatId: "dx-secretariat", allowedBudgetUnitIds: ["dx-budget"],
    hasHealthAccessScope: false, allowedHealthUnitIds: [], modulePermissions: [{ code: "SAUDE", canView: true, canEdit: true }], ...user,
  } };
}

// Drizzle preserves PostgreSQL's message in the cause rather than the outer
// query error. Require the injected SQLSTATE and its exact reason, so a schema,
// connection or unrelated constraint failure cannot make rollback tests pass.
export function isDiagnosticInjectedFailure(error: unknown): boolean {
  if (getPostgresError(error)?.code !== "P0001") return false;
  const visited = new Set<unknown>();
  let current = error;
  while (current && typeof current === "object" && !visited.has(current)) {
    visited.add(current);
    if ("message" in current && current.message === "injected diagnostics write failure") return true;
    current = "cause" in current ? current.cause : null;
  }
  return false;
}

/** Independent historical fixture: all 156 original DDL migrations, never ORM
 * metadata. Production Neon + Drizzle through loopback PGlite, server max 10,
 * pool max 5 (shared transport helper). Keep fixtures sequential per worker. */
export async function createLaboratoryDrizzleFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const migrations = readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const name of migrations) await fixture.database.exec(readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    await fixture.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('dx-profile','DIAGNOSTICS_OPERATOR','Diagnostics','{}',CURRENT_TIMESTAMP);
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('dx-secretariat','Saúde',CURRENT_TIMESTAMP);
      INSERT INTO "Department" (id,name,"secretariatId","updatedAt") VALUES ('dx-department','Diagnóstico','dx-secretariat',CURRENT_TIMESTAMP);
      INSERT INTO "Person" (id,"fullName","birthDate",gender,status,"updatedAt") VALUES ('dx-person','Paciente titular','1990-02-03','Feminino','Ativo',CURRENT_TIMESTAMP),('dx-person2','Paciente restrito',NULL,NULL,'Ativo',CURRENT_TIMESTAMP);
      INSERT INTO "Employee" (id,name,"departmentId","updatedAt") VALUES ('dx-employee','Profissional titular','dx-department',CURRENT_TIMESTAMP),('dx-other-employee','Outra equipe','dx-department',CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('dx-user','Profissional Diagnostics','dx@example.invalid','dx-profile','dx-employee',CURRENT_TIMESTAMP);
      INSERT INTO "HealthUnit" (id,name,type,cnes,"updatedAt") VALUES ('dx-u1','Unidade de diagnóstico','UBS','1000001',CURRENT_TIMESTAMP),('dx-u2','Unidade CAPS restrita','cApS',NULL,CURRENT_TIMESTAMP);
      INSERT INTO "HealthTeam" (id,name,"unitId","updatedAt") VALUES ('dx-team','Equipe titular','dx-u1',CURRENT_TIMESTAMP),('dx-other-team','Equipe restrita','dx-u2',CURRENT_TIMESTAMP);
      INSERT INTO "Patient" (id,"personId","referenceUnitId",cns,"updatedAt") VALUES ('dx-patient','dx-person','dx-u1','123456789012345',CURRENT_TIMESTAMP),('dx-patient2','dx-person2','dx-u2',NULL,CURRENT_TIMESTAMP);
      INSERT INTO "HealthProfessional" (id,"employeeId","unitId","teamId",cns,cbo,"updatedAt") VALUES ('dx-professional','dx-employee','dx-u1','dx-team','987654321012345','225125',CURRENT_TIMESTAMP),('dx-other-professional','dx-other-employee','dx-u2','dx-other-team',NULL,NULL,CURRENT_TIMESTAMP);
      INSERT INTO "MedicalRecord" (id,date,"patientId","professionalId","unitId","completedAt",outcome,"updatedAt") VALUES ('dx-record','2026-10-10 12:34:56.789','dx-patient','dx-professional','dx-u1','2026-10-10 13:34:56.789','Retorno',CURRENT_TIMESTAMP),('dx-wrong-record','2026-10-10','dx-patient2','dx-other-professional','dx-u2',NULL,NULL,CURRENT_TIMESTAMP);
      INSERT INTO "Supplier" (id,"updatedAt") VALUES ('dx-provider',CURRENT_TIMESTAMP);
      INSERT INTO "MaterialCategory" (id,code,name,"updatedAt") VALUES ('dx-category','DX','Materiais assistenciais',CURRENT_TIMESTAMP);
      INSERT INTO "Material" (id,code,name,"categoryId","updatedAt") VALUES ('dx-material','DX-1','Material fracionado','dx-category',CURRENT_TIMESTAMP);
      INSERT INTO "Warehouse" (id,name,"healthUnitId","updatedAt") VALUES ('dx-warehouse','Almoxarifado Saúde','dx-u1',CURRENT_TIMESTAMP),('dx-other-warehouse','Unidade restrita','dx-u2',CURRENT_TIMESTAMP);
      INSERT INTO "MaterialStock" (id,"warehouseId","materialId","batchNumber",quantity,"unitCost","expirationDate","updatedAt") VALUES ('dx-stock','dx-warehouse','dx-material','DX-BATCH',20.125,2.125,'2099-12-31',CURRENT_TIMESTAMP),('dx-wrong-stock','dx-other-warehouse','dx-material','DX-BATCH',20.125,2.125,'2099-12-31',CURRENT_TIMESTAMP);
      INSERT INTO "HealthLabExamModel" (id,code,name,"deliveryDays","duplicateWindowDays","updatedAt") VALUES ('dx-model','DX-LAB','Exame da fixture',2,0,CURRENT_TIMESTAMP);
      INSERT INTO "HealthAssistentialDevice" (id,code,name,domain,"deviceType",protocol,"unitId","operatorUsuarioIds","updatedAt") VALUES ('dx-device','DX-DEVICE','Analisador','LABORATORY','ANALYZER','LOCAL','dx-u1','["dx-user"]',CURRENT_TIMESTAMP);
      INSERT INTO "DocumentClass" (id,code,label,"signaturePolicy","updatedAt") VALUES ('dx-document-class','SAUDE_DOCUMENTO_PADRAO','Laudo laboratorial','INTERNAL_ALLOWED',CURRENT_TIMESTAMP) ON CONFLICT (code) DO NOTHING;
      INSERT INTO "HealthSusImportBatch" (id,source,competence,origin,"fileName","fileFormat","contractVersion",checksum,"actorUsuarioId") VALUES ('dx-catalog','TEST','2026-10','Fixture','fixture.csv','CSV','fixture-v1','dx-checksum','dx-user');
      INSERT INTO "HealthSusProcedure" (id,source,competence,code,description,"unitValue","sourceBatchId","updatedAt") VALUES ('dx-procedure','TEST','2026-10','DX.1','Procedimento realizado',999999999999.99,'dx-catalog',CURRENT_TIMESTAMP);
      INSERT INTO "HealthSusReference" (id,source,competence,kind,code,description,"sourceBatchId","updatedAt") VALUES ('dx-cid','TEST','2026-10','CID','Z00','Exame geral','dx-catalog',CURRENT_TIMESTAMP);
      CREATE FUNCTION dx_fail_write() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected diagnostics write failure'; END $$;
    `);
    return { ...fixture, db: fixture.connection.db, migrations: migrations.length, context: laboratoryTestContext(), restricted: laboratoryTestContext({ hasHealthAccessScope: true, allowedHealthUnitIds: ["dx-u1"] }) };
  } catch (error) { await fixture.close(); throw error; }
}
