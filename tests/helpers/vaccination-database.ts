import { readFile, readdir } from "node:fs/promises";
import type { HealthVaccinationContext } from "../../src/lib/contracts/health-vaccination";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Real historical SQL in disposable PGlite, accessed by Neon WebSocket/Drizzle.
 * Open and close sequentially: the driver's WebSocket settings are global. */
export async function createVaccinationDatabase() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const root = new URL("../../prisma/migrations-ibema/", import.meta.url);
    const migrations = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const migration of migrations) await fixture.database.exec(await readFile(new URL(`${migration}/migration.sql`, root), "utf8"));
    await fixture.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('vaccination-profile','VACCINATION_OPERATOR','Imunização','{}','2026-10-19');
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('vaccination-actor','Operador de imunização','vaccination@example.test','vaccination-profile','2026-10-19');
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('vaccination-secretariat','Saúde','2026-10-19');
      INSERT INTO "Department" (id,name,"secretariatId","updatedAt") VALUES ('vaccination-department','Imunização','vaccination-secretariat','2026-10-19');
      INSERT INTO "Employee" (id,name,"departmentId","isActive","updatedAt") VALUES ('vaccination-employee','Profissional da unidade','vaccination-department',true,'2026-10-19'),('vaccination-assigned-employee','Profissional com lotação externa','vaccination-department',true,'2026-10-19'),('vaccination-inactive-employee','Servidor inativo','vaccination-department',false,'2026-10-19');
      INSERT INTO "HealthUnit" (id,name,type,"updatedAt") VALUES ('vaccination-unit','UBS autorizada','UBS','2026-10-19'),('vaccination-other-unit','UBS externa','UBS','2026-10-19');
      INSERT INTO "HealthTeam" (id,name,"unitId","updatedAt") VALUES ('vaccination-team','Equipe local','vaccination-unit','2026-10-19'),('vaccination-other-team','Equipe externa','vaccination-other-unit','2026-10-19');
      INSERT INTO "HealthProfessional" (id,"employeeId","unitId","teamId","updatedAt") VALUES ('vaccination-professional','vaccination-employee','vaccination-unit','vaccination-team','2026-10-19'),('vaccination-assigned-professional','vaccination-assigned-employee','vaccination-other-unit','vaccination-other-team','2026-10-19'),('vaccination-inactive-professional','vaccination-inactive-employee','vaccination-unit',NULL,'2026-10-19');
      INSERT INTO "HealthProfessionalAssignment" (id,"professionalId","unitId","updatedAt") VALUES ('vaccination-assignment','vaccination-assigned-professional','vaccination-unit','2026-10-19'),('vaccination-other-assignment','vaccination-professional','vaccination-other-unit','2026-10-19');
      INSERT INTO "Person" (id,"fullName",cpf,"birthDate","deathDate","updatedAt") VALUES
        ('vaccination-person','Paciente principal','12345678909','2010-01-01',NULL,'2026-10-19'),
        ('vaccination-second-person','Paciente segunda aplicação','98765432100','2010-01-01',NULL,'2026-10-19'),
        ('vaccination-external-person','Paciente sigiloso externo','11144477735','2010-01-01',NULL,'2026-10-19'),
        ('vaccination-appointment-person','Paciente com atendimento','11122233344','2010-01-01',NULL,'2026-10-19'),
        ('vaccination-history-person','Paciente com histórico autorizado','11122233345','2010-01-01',NULL,'2026-10-19'),
        ('vaccination-dead-person','Paciente falecido','11122233346','2010-01-01','2026-01-01','2026-10-19'),
        ('vaccination-no-birth-person','Paciente sem nascimento','11122233347',NULL,NULL,'2026-10-19'),
        ('vaccination-rollback-person','Paciente rollback','11122233348','2010-01-01',NULL,'2026-10-19'),
        ('vaccination-clinical-person','Paciente contexto clínico','11122233349','2010-01-01',NULL,'2026-10-19');
      INSERT INTO "Patient" (id,"personId","referenceUnitId","updatedAt") VALUES
        ('vaccination-patient','vaccination-person','vaccination-unit','2026-10-19'),
        ('vaccination-second-patient','vaccination-second-person','vaccination-unit','2026-10-19'),
        ('vaccination-external-patient','vaccination-external-person','vaccination-other-unit','2026-10-19'),
        ('vaccination-appointment-patient','vaccination-appointment-person','vaccination-other-unit','2026-10-19'),
        ('vaccination-history-patient','vaccination-history-person','vaccination-other-unit','2026-10-19'),
        ('vaccination-dead-patient','vaccination-dead-person','vaccination-unit','2026-10-19'),
        ('vaccination-no-birth-patient','vaccination-no-birth-person','vaccination-unit','2026-10-19'),
        ('vaccination-rollback-patient','vaccination-rollback-person','vaccination-unit','2026-10-19'),
        ('vaccination-clinical-patient','vaccination-clinical-person','vaccination-unit','2026-10-19');
      INSERT INTO "Neighborhood" (id,name,type,city,state,"updatedAt") VALUES ('vaccination-neighborhood','Centro','Urbano','Município','PR','2026-10-19');
      INSERT INTO "Address" (id,"personId","addressType","neighborhoodId","streetName",number,"createdAt","updatedAt") VALUES ('vaccination-old-address','vaccination-person','Residencial','vaccination-neighborhood','Rua antiga','1','2026-01-01','2026-10-19'),('vaccination-address','vaccination-person','Residencial','vaccination-neighborhood','Rua atual','2','2026-10-19 12:34:56.789','2026-10-19'),('vaccination-work-address','vaccination-person','Comercial','vaccination-neighborhood','Rua comercial','3','2026-10-20','2026-10-19');
      INSERT INTO "HealthPatientContact" (id,"patientId",name,phone,kinship,"actorUsuarioId","updatedAt") VALUES ('vaccination-contact','vaccination-patient','Responsável','41999990000','Familiar','vaccination-actor','2026-10-19');
      INSERT INTO "Warehouse" (id,name,"healthUnitId","updatedAt") VALUES ('vaccination-warehouse','Sala de imunização','vaccination-unit','2026-10-19'),('vaccination-other-warehouse','Sala externa','vaccination-other-unit','2026-10-19'),('vaccination-unlinked-warehouse','Estoque sem unidade',NULL,'2026-10-19');
      INSERT INTO "MaterialCategory" (id,name,code,"updatedAt") VALUES ('vaccination-category','Assistenciais','VACCINATION','2026-10-19');
      INSERT INTO "Material" (id,code,name,"categoryId","unitOfMeasure","updatedAt") VALUES ('vaccination-material','VAC-A','Imunobiológico A','vaccination-category','DOSE','2026-10-19'),('vaccination-material-b','VAC-B','Imunobiológico B','vaccination-category','DOSE','2026-10-19'),('vaccination-diluent','VAC-DIL','Diluente','vaccination-category','UN','2026-10-19');
      INSERT INTO "HealthMaterialProfile" (id,"materialId","productKind","updatedAt") VALUES ('vaccination-material-profile','vaccination-material','IMMUNOBIOLOGICAL','2026-10-19'),('vaccination-material-b-profile','vaccination-material-b','IMMUNOBIOLOGICAL','2026-10-19'),('vaccination-diluent-profile','vaccination-diluent','DILUENT','2026-10-19');
      INSERT INTO "Vaccine" (id,name,"materialId","dosesRequired","diluentMaterialId","diluentUnitsPerVial","useAfterOpeningHours","updatedAt") VALUES ('vaccination-vaccine','Imunobiológico A','vaccination-material',2,'vaccination-diluent',0.25,6,'2026-10-19'),('vaccination-vaccine-b','Imunobiológico B','vaccination-material-b',1,NULL,1,NULL,'2026-10-19');
      INSERT INTO "MaterialStock" (id,"warehouseId","materialId","batchNumber",quantity,"unitCost","expirationDate","blockedAt","createdAt","updatedAt") VALUES
        ('vaccination-stock','vaccination-warehouse','vaccination-material','LOT',40,1.25,'2030-12-31',NULL,'2026-10-19 12:34:56.789','2026-10-19'),
        ('vaccination-blocked-stock','vaccination-warehouse','vaccination-material','BLOCKED',10,1.25,'2030-12-31','2026-10-01','2026-10-19','2026-10-19'),
        ('vaccination-expired-stock','vaccination-warehouse','vaccination-material','EXPIRED',10,1.25,'2000-01-01',NULL,'2026-10-19','2026-10-19'),
        ('vaccination-other-stock','vaccination-other-warehouse','vaccination-material','OTHER',20,1.25,'2030-12-31',NULL,'2026-10-19','2026-10-19'),
        ('vaccination-stock-b','vaccination-warehouse','vaccination-material-b','LOT-B',10,1,'2030-12-31',NULL,'2026-10-19','2026-10-19'),
        ('vaccination-diluent-stock','vaccination-warehouse','vaccination-diluent','DIL',10,2,'2030-12-31',NULL,'2026-10-19','2026-10-19');
      INSERT INTO "HealthVaccineManufacturer" (id,name,"rndsCode","sourceReference","actorUsuarioId") VALUES ('vaccination-manufacturer','Fabricante original','MAKER-1','Fonte do fabricante','vaccination-actor');
      INSERT INTO "HealthVaccineLotProfile" ("stockId","dosesPerVial","manufacturerId","manufacturerName","actorUsuarioId") VALUES ('vaccination-stock',10,'vaccination-manufacturer','Fabricante original','vaccination-actor'),('vaccination-blocked-stock',10,NULL,NULL,'vaccination-actor'),('vaccination-expired-stock',10,NULL,NULL,'vaccination-actor'),('vaccination-other-stock',10,'vaccination-manufacturer','Fabricante original','vaccination-actor'),('vaccination-stock-b',1,NULL,NULL,'vaccination-actor');
      INSERT INTO "HealthVaccineCodeMapping" (id,"vaccineId",system,code,version,"sourceReference","actorUsuarioId","createdAt") VALUES ('vaccination-code','vaccination-vaccine','RNDS','VAC-ORIGINAL','1','Fonte original','vaccination-actor','2026-10-19 12:34:56.789');
      INSERT INTO "HealthVaccineCalendarRule" (id,code,version,"vaccineId","doseNumber",strategy,"ageUnit","minimumAge","minimumIntervalDays","validFrom","sourceReference","actorUsuarioId") VALUES ('vaccination-rule','VAC-DOSE-1',1,'vaccination-vaccine',1,'ROTINA','YEAR',0,0,'2020-01-01','Calendário original','vaccination-actor'),('vaccination-rule-two','VAC-DOSE-2',1,'vaccination-vaccine',2,'ROTINA','YEAR',0,30,'2020-01-01','Calendário original','vaccination-actor');
      INSERT INTO "HealthVaccinationCampaign" (id,name,"startsAt","endsAt","publicInformation","actorUsuarioId") VALUES ('vaccination-campaign','Campanha do teste','2020-01-01','2030-12-31','Informação pública','vaccination-actor');
      INSERT INTO "HealthAppointment" (id,date,"patientId","unitId","professionalId",status,"updatedAt") VALUES ('vaccination-access-appointment','2026-10-19 12:34:56.789','vaccination-appointment-patient','vaccination-unit','vaccination-professional','Atendido','2026-10-19'),('vaccination-clinical-appointment','2026-10-19 12:34:56.789','vaccination-clinical-patient','vaccination-unit','vaccination-professional','Em Atendimento','2026-10-19');
      INSERT INTO "MedicalRecord" (id,date,"patientId","unitId","professionalId","appointmentId","updatedAt") VALUES ('vaccination-medical-record','2026-10-19 12:34:56.789','vaccination-clinical-patient','vaccination-unit','vaccination-professional','vaccination-clinical-appointment','2026-10-19');
      INSERT INTO "VaccinationRecord" (id,date,"vaccineId","patientId","professionalId","unitId","doseNumber","codeSnapshot","updatedAt") VALUES ('vaccination-history','2025-01-01','vaccination-vaccine-b','vaccination-history-patient','vaccination-professional','vaccination-unit',1,NULL,'2026-10-19');
      INSERT INTO "Institution" (id,name,cnpj,"updatedAt") VALUES ('vaccination-institution','Saúde municipal do teste','11222333000181','2026-10-19');
    `);
    const context: HealthVaccinationContext = { database: fixture.connection.db, user: { id: "vaccination-actor", firebaseUid: "vaccination-actor", name: "Operador de imunização", email: "vaccination@example.test", role: "OPERADOR", profileCode: "VACCINATION_OPERATOR", modulePermissions: [], allowedBudgetUnitIds: [], hasHealthAccessScope: true, allowedHealthUnitIds: ["vaccination-unit"], employeeId: "vaccination-employee", departmentId: "vaccination-department", secretariatId: "vaccination-secretariat" } };
    const denied: HealthVaccinationContext = { ...context, user: { ...context.user, allowedHealthUnitIds: [] } };
    const network: HealthVaccinationContext = { ...context, user: { ...context.user, hasHealthAccessScope: false } };
    return { ...fixture, context, denied, network };
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
