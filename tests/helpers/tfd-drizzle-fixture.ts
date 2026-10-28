import { readFileSync, readdirSync } from "node:fs";
import type { PermissionUser } from "../../src/lib/contracts/identity";
import type { HealthTfdContext } from "../../src/lib/contracts/health-tfd";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

export function tfdTestContext(user: Partial<PermissionUser> = {}): HealthTfdContext {
  return { user: {
    id: "tfd-user", name: "Profissional TFD", firebaseUid: "fixture", email: "tfd@example.invalid", role: "Operador", profileCode: "TFD_OPERATOR",
    employeeId: "tfd-doctor", departmentId: "tfd-department", secretariatId: "tfd-secretariat", allowedBudgetUnitIds: ["tfd-budget"],
    hasHealthAccessScope: false, allowedHealthUnitIds: [], modulePermissions: [{ code: "SAUDE", canView: true, canEdit: true }, { code: "RH", canView: true, canEdit: true }], ...user,
  } };
}

/** Independent original-history fixture. Production Neon/Drizzle transport,
 * shared local server capped at 10 connections and production pool capped at 5.
 * Do not run alongside another fixture in this worker (Neon global transport). */
export async function createTfdDrizzleFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    for (const name of readdirSync("prisma/migrations-ibema", { withFileTypes: true }).filter(entry => entry.isDirectory()).map(entry => entry.name).sort()) {
      await fixture.database.exec(readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    }
    await fixture.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('tfd-profile','TFD_OPERATOR','TFD','{}',CURRENT_TIMESTAMP);
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('tfd-secretariat','Saúde',CURRENT_TIMESTAMP);
      INSERT INTO "Department" (id,name,"secretariatId","updatedAt") VALUES ('tfd-department','Transporte sanitário','tfd-secretariat',CURRENT_TIMESTAMP),('tfd-other-department','Outro setor','tfd-secretariat',CURRENT_TIMESTAMP);
      INSERT INTO "Person" (id,"fullName","birthDate",status,"updatedAt") VALUES ('tfd-person','Paciente titular','1990-02-03','Ativo',CURRENT_TIMESTAMP),('tfd-person2','Outro paciente',null,'Ativo',CURRENT_TIMESTAMP),('tfd-person3','Paciente sem unidade',null,'Ativo',CURRENT_TIMESTAMP),('tfd-driver-person','Motorista identificado',null,'Ativo',CURRENT_TIMESTAMP);
      INSERT INTO "Employee" (id,name,"departmentId","personId","updatedAt") VALUES ('tfd-doctor','Profissional TFD','tfd-department',null,CURRENT_TIMESTAMP),('tfd-driver-employee','Motorista identificado','tfd-department','tfd-driver-person',CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('tfd-user','Profissional TFD','tfd@example.invalid','tfd-profile','tfd-doctor',CURRENT_TIMESTAMP),('tfd-second','Segundo operador','tfd2@example.invalid','tfd-profile',null,CURRENT_TIMESTAMP);
      INSERT INTO "HealthUnit" (id,name,type,"updatedAt") VALUES ('tfd-u1','Unidade solicitante','UBS',CURRENT_TIMESTAMP),('tfd-u2','Unidade restrita','UBS',CURRENT_TIMESTAMP);
      INSERT INTO "Patient" (id,"personId","referenceUnitId","updatedAt") VALUES ('tfd-patient','tfd-person','tfd-u1',CURRENT_TIMESTAMP),('tfd-patient2','tfd-person2','tfd-u2',CURRENT_TIMESTAMP),('tfd-patient3','tfd-person3',null,CURRENT_TIMESTAMP);
      INSERT INTO "HealthProfessional" (id,"employeeId","unitId","updatedAt") VALUES ('tfd-professional','tfd-doctor','tfd-u1',CURRENT_TIMESTAMP);
      INSERT INTO "MedicalRecord" (id,"patientId","professionalId","unitId","updatedAt") VALUES ('tfd-record','tfd-patient','tfd-professional','tfd-u1',CURRENT_TIMESTAMP),('tfd-wrong-record','tfd-patient2','tfd-professional','tfd-u1',CURRENT_TIMESTAMP);
      INSERT INTO "HealthSusImportBatch" (id,source,competence,origin,"fileName","fileFormat","contractVersion",checksum,"actorUsuarioId") VALUES ('tfd-catalog','TEST','2026-10','Fixture','fixture.csv','CSV','fixture-v1','tfd-checksum','tfd-user');
      INSERT INTO "HealthSusProcedure" (id,source,competence,code,description,"sourceBatchId","updatedAt") VALUES ('tfd-procedure','TEST','2026-10','TFD.1','Tratamento especializado','tfd-catalog',CURRENT_TIMESTAMP);
      INSERT INTO "HealthRegulationRequest" (id,"patientId","requestUnitId","createdByUsuarioId","updatedAt") VALUES ('tfd-regulation','tfd-patient','tfd-u1','tfd-user',CURRENT_TIMESTAMP),('tfd-wrong-regulation','tfd-patient2','tfd-u2','tfd-user',CURRENT_TIMESTAMP);
      INSERT INTO "FleetUnit" (id,code,name,category,"departmentId","createdById","updatedAt") VALUES ('tfd-vehicle','TFD-1','Veículo sanitário','VEICULO','tfd-department','tfd-user',CURRENT_TIMESTAMP);
      INSERT INTO "FleetUnitControl" ("unitId","meterType","allowedLicenseCategories","updatedAt") VALUES ('tfd-vehicle','SEM_MARCADOR','["D"]',CURRENT_TIMESTAMP);
      INSERT INTO "FleetDriver" (id,"personId","employeeId","departmentId","cnhNumber","cnhCategories","cnhExpiresAt","policyReference","createdById","updatedAt") VALUES ('tfd-driver','tfd-driver-person','tfd-driver-employee','tfd-department','12345678901','["D"]','2099-12-31','Política de transporte da fixture','tfd-user',CURRENT_TIMESTAMP);
      INSERT INTO "FleetRoute" (id,code,name,origin,destination,itinerary,"departmentId","createdById","updatedAt") VALUES ('tfd-route','TFD-ROUTE','Rota sanitária','Unidade solicitante','Hospital regional','Trajeto documentado','tfd-department','tfd-user',CURRENT_TIMESTAMP);
      INSERT INTO "Institution" (id,name,"updatedAt") VALUES ('tfd-institution','Saúde municipal da fixture',CURRENT_TIMESTAMP);
      CREATE FUNCTION tfd_fail_event() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected TFD event failure'; END $$;
    `);
    const context = tfdTestContext();
    const restricted = tfdTestContext({ hasHealthAccessScope: true, allowedHealthUnitIds: ["tfd-u1"] });
    return { ...fixture, db: fixture.connection.db, context, restricted };
  } catch (error) { await fixture.close(); throw error; }
}

export function tfdClinicalInput(requestId: string) {
  return { requestId, expectedVersion: 0, medicalRecordId: "tfd-record", professionalId: "tfd-professional", procedureId: "tfd-procedure", diagnosis: "Diagnóstico fundamentado", diagnosticCode: null,
    clinicalHistory: "História clínica registrada", examinations: "Exames clínicos documentados", treatment: "Tratamento especializado", localTreatmentUnavailableReason: "Indisponível no município", transportType: "TERRESTRE", transportJustification: "Transporte sanitário indicado",
    companionRequired: true, companionJustification: "Apoio ao paciente durante o deslocamento", reason: "Inclusão clínica fundamentada" };
}
