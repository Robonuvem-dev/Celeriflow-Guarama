import { readFileSync } from "node:fs";
import { createSstDrizzleFixture } from "./sst-drizzle-fixture";
import { sstTestContext } from "./sst-drizzle-context";

/** Real historical SST constraints shared by clinical, certificate and ASO tests. */
export async function createSstClinicalFixture() {
  const local = await createSstDrizzleFixture(["BudgetUnit", "Person", "Employee", "Role", "Department", "Company", "Leave", "Process", "Dependent", "Usuario", "Document", "DocumentClass", "Vaccine", "Vacation", "ConfiguracaoModulo", "ConfiguracaoPerfil", "UsuarioModulo", "UsuarioUnidadeGestora", "AuditEvent", "HrEmploymentRegime", "AdministrativeUnit", "CostCenter"]);
  const db = local.database;
  try {
    await db.exec(`CREATE TABLE "GovernmentEntity" (id TEXT PRIMARY KEY);
      ALTER TABLE "CostCenter" ADD "governmentEntityId" TEXT, ADD "parentId" TEXT, ADD "secretariatId" TEXT, ADD "departmentId" TEXT, ADD "administrativeUnitId" TEXT;
      INSERT INTO "GovernmentEntity" VALUES ('entity');
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','UG','Prefeitura','s',now()),('other','OTHER','Outra unidade','other-s',now());
      INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('doctor','Médico',NULL,now()),('candidate','Candidato','00000000000',now()),('worker','Servidor',NULL,now());
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('user','SST','sst@example.invalid','profile',now());
      INSERT INTO "Role" (id,name,"updatedAt") VALUES ('historical-role','Cargo histórico',now());
      INSERT INTO "Department" (id,name,"secretariatId","updatedAt") VALUES ('department','Departamento','s',now());
      INSERT INTO "AdministrativeUnit" (id,name,type,"secretariatId","updatedAt") VALUES ('local','Local','Sede','s',now());
      INSERT INTO "CostCenter" (id,code,name,"governmentEntityId","secretariatId","updatedAt") VALUES ('center','CENTER','Centro','entity','s',now());
      INSERT INTO "Employee" (id,name,"personId","secretariatId","departmentId","roleId","updatedAt") VALUES ('employee','Servidor','worker','s','department','historical-role',now());
      INSERT INTO "HrEmploymentRegime" (id,"ruleSetId",code,name,"employmentNature","updatedAt") VALUES ('regime','rules','REG','Regime','Estatutário',now());`);
    for (const name of ["20261010150000_add_sst_certificates", "20261010160000_add_sst_agenda_boards", "20261010170000_add_sst_exposure_groups", "20261010180000_add_sst_programs", "20261010190000_add_sst_aso", "20261010210000_add_sst_questionnaires", "20261011010000_add_sst_clinical_services", "20261011070000_add_sst_functional_history", "20261011080000_complete_sst_aso_workflow", "20261011120000_harden_sst_clinical_integrity"]) {
      await db.exec(readFileSync(`prisma/migrations-ibema/${name}/migration.sql`, "utf8"));
    }
    await db.exec(`INSERT INTO "SstAccessGrant" (id,"usuarioId","budgetUnitId","canReadClinical","canAssess","updatedAt") VALUES ('grant','user','ug',true,true,now());
      INSERT INTO "SstDisciplineGrant" (id,"usuarioId","budgetUnitId",discipline,"canRead","canWrite") VALUES ('medicine','user','ug','MEDICINE',true,true),('nursing','user','ug','NURSING',true,true),('psychology','user','ug','PSYCHOLOGY',true,true),('social','user','ug','SOCIAL_WORK',true,true);
      INSERT INTO "SstCertificateReason" (id,"budgetUnitId",code,name,"createLeaveOnApproval","updatedAt") VALUES ('reason','ug','MED','Médico',true,now());
      INSERT INTO "HrBudgetUnitEntityMapping" (id,"budgetUnitId","governmentEntityId","sourceReference","createdById") VALUES ('mapping','ug','entity','Mapeamento oficial','user');
      INSERT INTO "HrEmployeeFunctionalPeriod" (id,"employeeId","budgetUnitId","governmentEntityId","employmentRegimeId","roleId","departmentId","localId","costCenterId","startsAt","endsAt","contractReference","sourceReference",snapshot,"requestHash","createdById") VALUES ('period','employee','ug','entity','regime','historical-role','department','local','center','2026-01-01','2028-01-01','Contrato oficial','Fonte documental','{"registration":"001","role":"Cargo histórico","department":"Departamento histórico"}','hash','user');
      INSERT INTO "SstExposureGroup" (id,"budgetUnitId",code,name,"startsAt","createdById","updatedAt") VALUES ('g','ug','ADM','Administrativo','2026-01-01','user',now());
      INSERT INTO "SstOccupationalProgram" (id,"budgetUnitId",code,kind,version,"startsAt","endsAt","responsiblePersonId","responsibleCouncil","responsibleSnapshot",content,"createdById") VALUES ('program','ug','PCMSO','PCMSO',2,'2026-01-01','2027-12-31','doctor','CRM PR 123','{}','{}','user');
      INSERT INTO "SstProgramExposureGroup" (id,"programId","groupId","groupSnapshot",risks,exams) VALUES ('pg','program','g','{"code":"ADM","name":"Administrativo","departmentIds":[],"roleIds":[],"startsAt":"2026-01-01","endsAt":null}','[]','[]');
      INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId","usuarioId",discipline,council,"startsAt","endsAt","createdById") VALUES ('role','ug','doctor','user','MEDICINE','CRM PR 123','2026-01-01','2027-12-31','user');
      INSERT INTO "SstQuestionnaireVersion" (id,"budgetUnitId",code,title,version,questions,"submissionKey","requestHash","createdById") VALUES ('questionnaire','ug','MED','Anamnese',1,'[{"key":"history","label":"Histórico","section":"Geral","kind":"BOOLEAN","required":true,"choices":[]}]','seed','hash','user');
      CREATE TABLE "SstLeavePayrollOrigin" (id TEXT PRIMARY KEY,"certificateId" TEXT,kind TEXT,"reversesId" TEXT,"payrollItemId" TEXT,competence TEXT);
      CREATE TABLE "Payroll" (id TEXT PRIMARY KEY,competence TEXT,status TEXT);
      CREATE TABLE "PayrollItem" (id TEXT PRIMARY KEY,"payrollId" TEXT,"employeeId" TEXT,"eventId" TEXT);`);
    const context = sstTestContext(local.connection.db, { permissions: JSON.stringify({ modules: { SST: { blocked: false, create: true, update: true, issueReports: true }, RH: { blocked: false, create: true, update: true } } }) });
    return { ...local, context };
  } catch (error) { await local.close(); throw error; }
}
