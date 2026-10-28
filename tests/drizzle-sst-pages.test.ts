import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { createSstPagesDatabase } from "./helpers/sst-pages-database";
import { readSstSettingsPage, findSstReasonPage, readSstProfessionalsPage, readSstShiftsPage, readSstBoardsPage, readSstExposurePage } from "../src/db/repositories/sst-pages/administration";
import { readSstAgendaPage, readSstAgendaEmployees, readSstAppointmentsPage, findSstAppointmentPage } from "../src/db/repositories/sst-pages/agenda";
import { readSstProgramsPage, findSstProgramScope, findSstProgramPage } from "../src/db/repositories/sst-pages/programs";
import { readSstQuestionnairesPage, findSstQuestionnairePage, searchSstWorkerPeople, readSstUserProfessionals, readSstClinicalQuestionnaireOptions } from "../src/db/repositories/sst-pages/clinical-options";
import { readSstAsosPage, findSstAsoScope, findSstAnamnesisScope, findSstAnamnesisPage, readSstAnamnesisHistory } from "../src/db/repositories/sst-pages/aso";
import { readSstNewCertificateOptions, findSstCertificateReceipt } from "../src/db/repositories/sst-pages/certificates";
import { findSstEquipmentPage, findSstEquipmentSupplier, searchSstPageEquipment, readSstEquipmentCatalogOptions } from "../src/db/repositories/sst-pages/equipment";
import { searchSstAccidentEmployees } from "../src/db/repositories/sst-pages/accidents";

const unit = { id: "ug", name: "Prefeitura", secretariatId: "secretariat" };

test("SST pages: real Neon driver over PGlite, historical DDL, scopes and wire scalars", async t => {
  // The page fixture replays the full SQL history, including baseline FKs.
  // No production connection is opened by this test.
  const f = await createSstPagesDatabase();
  const database = f.connection.db;
  try {
    await f.database.exec(`
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretariat','Secretaria SST',now()),('other-secretariat','Outra secretaria',now());
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','UG','Prefeitura','secretariat',now()),('other','OTHER','Outra UG','other-secretariat',now());
      INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('doctor','Médica','00000000001',now()),('worker','Servidor Pessoa','00000000002',now()),('outsider','Servidor Externo','00000000003',now());
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('profile','SST_PAGES_TEST','Operador SST','{}',now());
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('user','Ativo','sst@example.invalid','profile',now()),('disabled','Inativo','disabled@example.invalid','profile',now());
      UPDATE "Usuario" SET ativo=false WHERE id='disabled';
      INSERT INTO "Role" (id,name,"updatedAt") VALUES ('role','Cargo',now());
      INSERT INTO "Department" (id,name,"secretariatId","updatedAt") VALUES ('department','Local','secretariat',now()),('other-department','Outro local','secretariat',now());
      INSERT INTO "Employee" (id,name,"personId","secretariatId","departmentId","roleId","updatedAt") VALUES
        ('worker','Servidor Pessoa','worker','secretariat','department','role',now()),
        ('no-group','Servidor Sem GHE',NULL,'secretariat',NULL,NULL,now()),
        ('outsider','Servidor Externo','outsider','other-secretariat','department','role',now()),
        ('inactive','Servidor Inativo',NULL,'secretariat','department','role',now());
      UPDATE "Employee" SET "isActive"=false WHERE id='inactive';
      INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('entity','SST','Prefeitura SST','PREFEITURA',now());
      INSERT INTO "AdministrativeUnit" (id,name,type,"secretariatId","updatedAt") VALUES ('local','Unidade SST','Sede','secretariat',now());
      INSERT INTO "CostCenter" (id,code,name,"governmentEntityId","secretariatId","updatedAt") VALUES ('center','SST','Centro SST','entity','secretariat',now());
      INSERT INTO "ConfiguracaoInstancia" (id,"nomePrefeitura",municipio,uf,"updatedAt") VALUES ('instance','Prefeitura SST','Ibema','PR',now());
      INSERT INTO "HrPayrollRuleSet" (id,"configuracaoInstanciaId",code,name,"effectiveFrom","updatedAt") VALUES ('rules','instance','SST','Regras SST','2026-01-01',now());
      INSERT INTO "HrEmploymentRegime" (id,"ruleSetId",code,name,"employmentNature","updatedAt") VALUES ('regime','rules','SST','Regime SST','Estatutário',now());
      INSERT INTO "HrBudgetUnitEntityMapping" (id,"budgetUnitId","governmentEntityId","sourceReference","createdById") VALUES ('mapping','ug','entity','Mapeamento oficial SST','user');
      INSERT INTO "HrEmployeeFunctionalPeriod" (id,"employeeId","budgetUnitId","governmentEntityId","employmentRegimeId","roleId","departmentId","localId","costCenterId","startsAt","endsAt","contractReference","sourceReference",snapshot,"requestHash","createdById") VALUES
        ('period','worker','ug','entity','regime','role','department','local','center','2026-01-01','2028-01-01','Contrato SST','Fonte documental SST','{}','hash','user');
      INSERT INTO "SstCertificateReason" (id,"budgetUnitId",code,name,"restrictedRoleIds","updatedAt") VALUES ('reason','ug','MED','Médico',NULL,now()),('other-reason','other','MED','Outro',ARRAY[]::text[],now());
      INSERT INTO "Dependent" (id,"employeeId",name,relationship,"updatedAt") VALUES ('dependent','worker','Dependente','Filho',now());
      INSERT INTO "SstAccessGrant" (id,"usuarioId","budgetUnitId","canReadClinical","updatedAt") VALUES ('grant','user','ug',true,now());
      INSERT INTO "SstProfessionalRole" (id,"budgetUnitId","personId","usuarioId",discipline,council,"startsAt","endsAt","createdById") VALUES
        ('medicine','ug','doctor','user','MEDICINE','CRM','2026-01-01','2027-01-01','user'),
        ('nursing','ug','doctor','user','NURSING','COREN','2026-01-01','2027-01-01','user'),
        ('other-professional','other','doctor','user','MEDICINE','CRM','2026-01-01','2027-01-01','user');
      INSERT INTO "SstExposureGroup" (id,"budgetUnitId",code,name,"departmentIds","roleIds","startsAt","createdById","updatedAt") VALUES ('group','ug','G','GHE',ARRAY['department'],NULL,'2026-01-01','user',now());
      INSERT INTO "SstOccupationalProgram" (id,"budgetUnitId",code,kind,version,"startsAt","endsAt","responsiblePersonId","responsibleCouncil","responsibleSnapshot",content,"createdById") VALUES
        ('program','ug','PCMSO','PCMSO',1,'2026-01-01','2027-01-01','doctor','CRM','{"name":"Médica","council":"CRM"}','null','user'),
        ('other-program','other','PCMSO','PCMSO',1,'2026-01-01','2027-01-01','doctor','CRM','{}','{}','user');
      INSERT INTO "SstProgramExposureGroup" (id,"programId","groupId","groupSnapshot",risks,exams) VALUES ('version-group','program','group','{"departmentIds":["department"],"startsAt":"2026-01-01"}','[]','[]');
      INSERT INTO "SstQuestionnaireVersion" (id,"budgetUnitId",discipline,code,title,version,questions,"submissionKey","requestHash","createdById","createdAt")
        SELECT 'q-'||lpad(i::text,2,'0'),'ug','MEDICINE','Q-'||i,'Histórico',1,'[{"key":"history","label":"Histórico"}]','q-'||i,'hash','user','2026-01-01'::timestamp FROM generate_series(1,23) i;
      INSERT INTO "SstQuestionnaireVersion" (id,"budgetUnitId",discipline,code,title,version,questions,"submissionKey","requestHash","createdById") VALUES
        ('nursing-q','ug','NURSING','N','Histórico',1,'[{}]','n','hash','user'),('other-q','other','MEDICINE','O','Histórico',1,'[{}]','o','hash','user');
      INSERT INTO "SstMedicalBoard" (id,"budgetUnitId",name,"startsAt","endsAt","createdById","updatedAt") VALUES ('board','ug','Junta','2026-01-01 05:00:00.123','2027-01-01','user',now());
      INSERT INTO "SstMedicalBoardMember" (id,"boardId","personId",council) VALUES ('member','board','doctor','CRM');
      INSERT INTO "SstPlannedShift" (id,"budgetUnitId","employeeId","startsAt","endsAt","createdById") VALUES ('shift','ug','worker','2026-01-01 05:00:00.123','2026-01-01 09:00:00.123','user');
      INSERT INTO "SstScheduleAvailability" (id,"budgetUnitId","professionalPersonId","unitName","startsAt","endsAt","slotMinutes","createdById","updatedAt") VALUES ('window','ug','doctor','Unidade','2026-01-01 05:00:00.123','2026-01-01 09:00:00.123',30,'user',now());
      INSERT INTO "SstAppointment" (id,"availabilityId","employeeId",purpose,"startsAt","endsAt",status,"createdById","updatedAt") VALUES
        ('appointment','window','worker','Consulta','2026-01-01 05:00:00.123','2026-01-01 05:30:00.123','BOOKED','user',now()),
        ('cancelled','window','worker','Consulta','2026-01-01 06:00:00.123','2026-01-01 06:30:00.123','CANCELLED','user',now());
      INSERT INTO "SstMedicalCertificate" (id,"budgetUnitId","employeeId","reasonId","issuerPersonId","issuerCouncil","startsAt","endsAt","presentedAt","protocolNumber","createdById","updatedAt") VALUES
        ('certificate','ug','worker','reason','doctor','CRM','2026-01-01 05:00:00.123','2026-01-02 05:00:00.123','2026-01-01 05:00:00.123','SST-1','user',now());
      INSERT INTO "MaterialCategory" (id,code,name,"updatedAt") VALUES ('category','SST','Equipamentos SST',now());
      INSERT INTO "Material" (id,code,name,"categoryId","updatedAt") VALUES ('material','M','Equipamento','category',now());
      INSERT INTO "Supplier" (id,"updatedAt") VALUES ('supplier',now());
      INSERT INTO "SstEquipment" (id,"budgetUnitId","materialId",kind,ca,"caValidUntil","validityDays","reviewDays","supplierId","createdById","createdAt","submissionKey","requestHash") VALUES
        ('equipment','ug','material','EPI','CA','2027-01-01',365,30,'supplier','user','2026-01-01 05:00:00.123','equipment','hash');
      -- Both deferred ASO guards require exams and the validated flow before COMMIT.
      BEGIN;
      INSERT INTO "SstAso" (id,"budgetUnitId","personId","employeeId","programGroupId","examinerPersonId","examinerCouncil",kind,result,"performedAt","validUntil",recommendations,"expectedExamCount",snapshot,"submissionKey","requestHash","createdById") VALUES
        ('aso','ug','worker','worker','version-group','doctor','CRM','PERIODICO','APTO','2026-01-01','2027-01-01','',1,'null','aso','hash','user');
      INSERT INTO "SstOccupationalExam" (id,"asoId",name,kind,source,"performedAt","validUntil",result,"professionalPersonId","professionalCouncil",snapshot) VALUES
        ('exam','aso','Clínico','CLINICO','REALIZADO','2026-01-01','2027-01-01','APTO','doctor','CRM','{}');
      INSERT INTO "SstAnamnesis" (id,"asoId","questionnaireVersionId",revision,answers,snapshot,"revisionReason","submissionKey","requestHash","createdById","createdAt") VALUES
        ('anamnesis','aso','q-01',1,'{}','{"recordedByName":"Operador"}','','a','hash','user','2026-01-01 05:00:00.123');
      INSERT INTO "SstAsoFlowSource" ("asoId","anamnesisId","physicianRoleId","functionalPeriodId") VALUES ('aso','anamnesis','medicine','period');
      COMMIT;
    `);

    await t.test("authorized UG, discipline, user, active flags and stable pagination", async () => {
      const settings = await readSstSettingsPage(database, ["ug"], "99", false);
      assert.deepEqual(settings.reasons.map(r => r.id), ["reason"]);
      assert.deepEqual(settings.users, []);
      assert.deepEqual(settings.grants, []);
      const reason = await findSstReasonPage(database, "reason");
      assert.deepEqual(reason?.restrictedRoleIds, []);
      const admin = await readSstSettingsPage(database, ["ug"], "1", true);
      assert.deepEqual(admin.users.map(u => u.id), ["user"]);
      assert.equal(admin.grants[0].budgetUnit.name, unit.name);
      const page = await readSstQuestionnairesPage(database, ["ug"], { page: "99", q: "Histórico" });
      assert.equal(page.total, 23);
      assert.equal(page.page, 2);
      assert.deepEqual(page.records.map(q => q.id), ["q-21", "q-22", "q-23"]);
      assert.equal((await readSstQuestionnairesPage(database, [], {})).total, 0);
      assert.equal((await readSstProfessionalsPage(database, ["ug"], "1", false)).total, 2);
      const professionals = await readSstUserProfessionals(database, "ug", "MEDICINE", "user", true);
      assert.deepEqual(professionals.map(p => p.id), ["medicine"]);
      assert.equal(professionals[0].startsAt.toISOString(), "2026-01-01T00:00:00.000Z");
      assert.deepEqual(await readSstUserProfessionals(database, "ug", "MEDICINE", "missing", false), []);
      const versions = await readSstClinicalQuestionnaireOptions(database, "ug", "MEDICINE", { questionnaireVersionId: "nursing-q" });
      assert.equal(versions.selected, undefined);
      assert.equal((await findSstQuestionnairePage(database, "q-01"))?.questions instanceof Array, true);
    });

    await t.test("secretariat/active scope, GHE nullable arrays and without-group complement", async () => {
      const included = await readSstExposurePage(database, unit, { groupId: "group" }, new Date("2026-10-01T00:00:00Z"));
      assert.deepEqual(included.workers.map(e => e.id), ["worker"]);
      assert.deepEqual(included.groups[0].roleIds, []);
      const excluded = await readSstExposurePage(database, unit, { without: "1" }, new Date("2026-10-01T00:00:00Z"));
      assert.deepEqual(excluded.workers.map(e => e.id), ["no-group"]);
      assert.equal((await readSstExposurePage(database, undefined, {}, new Date())).total, 0);
      assert.deepEqual((await searchSstAccidentEmployees(database, [unit.secretariatId], "Servidor")).map(e => e.id), ["worker", "no-group"]);
      assert.deepEqual((await searchSstWorkerPeople(database, "Pessoa")).map(p => p.id), ["worker"]);
    });

    await t.test("program relations, Date columns and JSON null remain intact", async () => {
      const programs = await readSstProgramsPage(database, ["ug"], undefined, "1");
      assert.deepEqual(programs.records.map(p => p.id), ["program"]);
      assert.equal(programs.records[0].content, null);
      assert.equal(programs.records[0].startsAt.toISOString(), "2026-01-01T00:00:00.000Z");
      assert.deepEqual(await findSstProgramScope(database, "program"), { budgetUnitId: "ug" });
      const program = await findSstProgramPage(database, "program");
      assert.equal(program?.groups[0].id, "version-group");
      assert.equal(program?.budgetUnit.name, unit.name);
      assert.equal((await readSstBoardsPage(database, ["ug"], "1")).boards[0].members[0].person.fullName, "Médica");
      assert.equal((await readSstShiftsPage(database, ["ug"], unit, "1")).shifts[0].startsAt.toISOString(), "2026-01-01T05:00:00.123Z");
    });

    await t.test("agenda excludes cancelled slots and retains nullable appointment fields", async () => {
      const agenda = await readSstAgendaPage(database, ["ug"], { availabilityId: "window" });
      assert.deepEqual(agenda.selected?.appointments.map(a => a.id), ["appointment"]);
      assert.equal(agenda.selected?.startsAt.toISOString(), "2026-01-01T05:00:00.123Z");
      assert.equal((await readSstAgendaPage(database, [], { availabilityId: "window" })).selected, null);
      assert.deepEqual((await readSstAgendaEmployees(database, unit.secretariatId)).map(e => e.id), ["worker", "no-group"]);
      assert.equal((await readSstAppointmentsPage(database, ["ug"], { q: "Pessoa" })).total, 2);
      const appointment = await findSstAppointmentPage(database, "appointment");
      assert.equal(appointment?.cancelledAt, null);
      assert.equal(appointment?.employee.registration, null);
      assert.equal(appointment?.availability.professional.fullName, "Médica");
    });

    await t.test("ASO civil endpoints, immutable history, certificate dependent selection", async () => {
      const asos = await readSstAsosPage(database, ["ug"], { q: "Pessoa" }, new Date("2027-01-01T00:00:00Z"), new Date("2027-01-01T00:00:00Z"));
      assert.equal(asos.total, 1);
      assert.equal(asos.records[0].validUntil.toISOString(), "2027-01-01T00:00:00.000Z");
      assert.equal(asos.records[0].snapshot, null);
      assert.equal((await readSstAsosPage(database, [], {}, undefined, undefined)).total, 0);
      assert.deepEqual(await findSstAsoScope(database, "aso"), { budgetUnitId: "ug" });
      assert.deepEqual(await findSstAnamnesisScope(database, "anamnesis"), { aso: { budgetUnitId: "ug" } });
      assert.equal((await findSstAnamnesisPage(database, "anamnesis"))?.createdAt.toISOString(), "2026-01-01T05:00:00.123Z");
      const history = await readSstAnamnesisHistory(database, "aso", "ug", { questionnaireVersionId: "other-q" });
      assert.equal(history.selected, undefined);
      assert.equal(history.history[0].questionnaireVersion.title, "Histórico");
      assert.deepEqual((await readSstNewCertificateOptions(database, unit, "worker")).dependents.map(d => d.id), ["dependent"]);
      assert.deepEqual((await readSstNewCertificateOptions(database, unit, "outsider")).dependents, []);
      assert.equal((await findSstCertificateReceipt(database, "certificate"))?.presentedAt.toISOString(), "2026-01-01T05:00:00.123Z");
    });

    await t.test("raw SQL dates, full catalog fields and absent supplier relations", async () => {
      const equipment = await findSstEquipmentPage(database, "equipment", sql`IN ('ug')`);
      assert.equal(equipment?.createdAt.toISOString(), "2026-01-01T05:00:00.123Z");
      assert.equal(equipment?.caValidUntil?.toISOString(), "2027-01-01T00:00:00.000Z");
      assert.equal(equipment?.submissionKey, "equipment");
      assert.equal(equipment?.createdById, "user");
      assert.equal(await findSstEquipmentPage(database, "equipment", sql`IN ('other')`), undefined);
      assert.deepEqual(await findSstEquipmentSupplier(database, "supplier"), { person: null, company: null });
      assert.equal((await searchSstPageEquipment(database, "ug", "Equipamento"))[0].createdAt instanceof Date, true);
      const options = await readSstEquipmentCatalogOptions(database, { materialQ: "Equipamento" });
      assert.deepEqual(options.materials.map(m => m.id), ["material"]);
    });
  } finally { await f.close(); }
});
