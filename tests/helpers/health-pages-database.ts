import assert from "node:assert/strict";
import { sql } from "drizzle-orm";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";
import { loadMigrationSet } from "../../scripts/database-migrate-files.mjs";
import { openMigrationConnection } from "../../scripts/database-migrate-driver.mjs";
import { runDatabaseMigrations } from "../../scripts/database-migrate-core.mjs";

/** Original historical SQL is the schema authority. These fictional records
 * are independent of runtime mappings. DDL, seeds and readers use the real
 * Neon pool (5) over the generic local PostgreSQL socket server (10). */
export async function createHealthPagesDatabase() {
  const fixture = await createLocalDrizzleDatabase();
  let authority: Awaited<ReturnType<typeof openMigrationConnection>> | undefined;
  try {
    assert.equal(fixture.connection.pool.options.max, 5);
    const set = loadMigrationSet();
    assert.equal(set.historical.length, 156);
    const url = fixture.connection.pool.options.connectionString;
    assert.ok(url);
    authority = await openMigrationConnection(url);
    const replay = await runDatabaseMigrations(authority, set, { command: "replay" });
    assert.equal(replay.result, "PASS");
    await authority.close(); authority = undefined;
    await fixture.connection.pool.query(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES
        ('hpg-role','HPG','Operação Saúde','{}',now()),('hpg-admin-role','SYSTEM_ADMINISTRATOR','Administrador','{}',now());
      INSERT INTO "Person" (id,"fullName",cpf,"birthDate","updatedAt") VALUES
        ('hpg-person','Ana Clínica','12345678901','1990-01-02 03:04:05.678',now()),('hpg-null-person','Bruna sem data',NULL,NULL,now());
      INSERT INTO "Employee" (id,name,"personId","updatedAt") VALUES
        ('hpg-employee','Ana Servidora','hpg-person',now()),('hpg-no-person','Bruno sem pessoa',NULL,now());
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId",ativo,"updatedAt") VALUES
        ('hpg-user','Ana Usuária','hpg@example.invalid','hpg-role','hpg-employee',true,now()),
        ('hpg-inactive-user','Bruno Inativo','hpg-inactive@example.invalid','hpg-role',NULL,false,now()),
        ('hpg-admin','Administrador de sistema','hpg-admin@example.invalid','hpg-admin-role',NULL,true,now()),
        ('hpg-admin-email','Administrador por email','admin@email.com','hpg-role',NULL,true,now());
      INSERT INTO "UsuarioModulo" (id,"usuarioId","moduloId","canView","canEdit")
        SELECT 'hpg-permission','hpg-user',id,true,false FROM "ConfiguracaoModulo" WHERE codigo='SAUDE';
      INSERT INTO "HealthUnit" (id,name,type,"isThirdParty","isActive","updatedAt") VALUES
        ('hpg-a','A Clínica','UBS',false,true,now()),('hpg-b','B Clínica','UBS',false,true,now()),
        ('hpg-third-empty','C Terceira sem vínculos','UBS',true,true,now()),('hpg-third-linked','D Terceira habilitada','LAB',true,true,now()),
        ('hpg-inactive','E Unidade inativa','UBS',false,false,now());
      INSERT INTO "HealthUnitShift" (id,"unitId","dayOfWeek","startTime","endTime","isActive","updatedAt") VALUES
        ('hpg-shift2','hpg-a',2,'09:00','12:00',false,now()),('hpg-shift1','hpg-a',1,'08:00','12:00',true,now());
      INSERT INTO "HealthSpecialty" (id,code,name,"updatedAt") VALUES ('hpg-specialty','HPG01','Especialidade A',now()),('hpg-other-specialty','HPG02','Especialidade B',now());
      INSERT INTO "HealthService" (id,code,name,classification,"updatedAt") VALUES ('hpg-service','HPG01','Serviço A','Classificação',now());
      INSERT INTO "HealthCbo" (id,code,description,"updatedAt") VALUES ('hpg-cbo','HPG001','Ocupação A',now());
      INSERT INTO "HealthProfessional" (id,"employeeId","unitId",cns,"updatedAt") VALUES
        ('hpg-professional','hpg-employee','hpg-b','CNS-HPG',now()),('hpg-no-person-professional','hpg-no-person','hpg-b',NULL,now());
      INSERT INTO "HealthProfessionalAssignment" (id,"professionalId","unitId","specialtyId","weeklyHours","isActive","updatedAt") VALUES
        ('hpg-assignment','hpg-professional','hpg-a','hpg-specialty',37,true,now()),
        ('hpg-off-assignment','hpg-no-person-professional','hpg-a','hpg-other-specialty',10,false,now());
      INSERT INTO "HealthUnitSpecialty" (id,"unitId","specialtyId","updatedAt") VALUES ('hpg-unit-specialty','hpg-b','hpg-other-specialty',now());
      INSERT INTO "HealthServiceAssignment" (id,"serviceId","unitId","professionalId","updatedAt") VALUES ('hpg-service-assignment','hpg-service','hpg-a','hpg-professional',now());
      INSERT INTO "HealthHabilitation" (id,code,description,"unitId","updatedAt") VALUES ('hpg-habilitation','HPG','Habilitação nominal','hpg-third-linked',now());
      INSERT INTO "HealthRegistrationStatusHistory" (id,"unitId","professionalId","isActive",reason,"occurredAt") VALUES
        ('hpg-history-new','hpg-a',NULL,true,'Reativação','2026-10-02 12:34:56.789'),
        ('hpg-history-old','hpg-a',NULL,false,NULL,'2026-10-01 00:00:00.123'),
        ('hpg-professional-history',NULL,'hpg-professional',false,'Histórico preservado','2026-09-30 03:04:05.678');
      INSERT INTO "HealthSpecialtyGroup" (id,name,"updatedAt") VALUES ('hpg-group','Grupo A',now());
      INSERT INTO "HealthSpecialtyGroupMember" (id,"groupId","specialtyId") VALUES ('hpg-member','hpg-group','hpg-specialty');
      INSERT INTO "HealthSpecialtyGroupService" (id,"groupId","serviceId") VALUES ('hpg-group-service','hpg-group','hpg-service');
      INSERT INTO "HealthSchedulingGroup" (id,name,"unitId","specialtyGroupId","updatedAt") VALUES ('hpg-scheduling','Agenda A','hpg-a','hpg-group',now());
      INSERT INTO "Patient" (id,"personId","referenceUnitId","updatedAt") VALUES ('hpg-patient','hpg-person','hpg-a',now());
      INSERT INTO "Neighborhood" (id,name,type,city,state,"updatedAt") VALUES ('hpg-neighborhood','Centro','Bairro','Cidade nominal','PR',now());
      INSERT INTO "Address" (id,"personId","streetName",number,"neighborhoodId","updatedAt") VALUES ('hpg-address','hpg-person','Rua nominal','12','hpg-neighborhood',now());
      INSERT INTO "Document" (id,title,"documentType","fileUrl","personId","updatedAt") VALUES ('hpg-document','Documento nominal','Identificação','https://example.invalid/nominal','hpg-person',now());
      INSERT INTO "Company" (id,"corporateName","tradeName",cnpj,"updatedAt") VALUES ('hpg-company','Empresa nominal','Nome fantasia','11222333000181',now());
      INSERT INTO "CalendarEvent" (id,title,date,type,"isHoliday","updatedAt") VALUES
        ('hpg-holiday','Feriado nominal','2026-10-03 12:34:56.789','Municipal',true,now()),('hpg-not-holiday','Outro evento','2026-10-04','Agenda',false,now());
      INSERT INTO "HealthUserAccessScope" (id,"usuarioId","unitId","validFrom","validUntil",weekdays,"startTime","endTime","isActive","updatedAt") VALUES
        ('hpg-scope','hpg-user','hpg-a','2026-01-01',NULL,'1,2,3,4,5','08:00','17:00',false,now());
      INSERT INTO "AuditEvent" (id,"eventType","targetType","targetId","actorUsuarioId","createdAt") VALUES
        ('hpg-audit1','CREATED','HEALTH_PATIENT','hpg-patient','hpg-user','2026-10-01 00:00:00.000'),
        ('hpg-audit2','UPDATED','HEALTHXLEGACY','hpg-patient','hpg-user','2026-10-01 23:59:59.999'),
        ('hpg-audit-case','UPDATED','health_patient','hpg-patient','hpg-user','2026-10-01 12:00:00'),
        ('hpg-audit-out','UPDATED','HEALTH_PATIENT','hpg-patient','hpg-user','2026-10-02 00:00:00');
      INSERT INTO "HealthLaboratoryConfiguration" (id,"unitId","laboratoryName","collectionStartTime","collectionEndTime","resultReleaseDays","effectiveFrom","createdByUsuarioId","isActive","createdAt") VALUES
        ('hpg-lab-active','hpg-a','Laboratório A','08:00','12:00',2,'2026-01-01','hpg-user',true,'2026-01-31 12:34:56.789'),
        ('hpg-lab-off','hpg-a','Laboratório anterior','08:00','12:00',3,'2025-01-01','hpg-user',false,'2026-02-01');
      INSERT INTO "HealthSusImportBatch" (id,source,competence,origin,"fileName","fileFormat","contractVersion",checksum,"actorUsuarioId","startedAt","completedAt") VALUES
        ('hpg-import','SIGTAP','2026-01','Origem nominal','sigtap.csv','CSV','1','hpg-checksum','hpg-user','2026-01-31 12:34:56.789',NULL),
        ('hpg-import-older','SIGTAP','2025-12','Origem anterior','sigtap-anterior.csv','CSV','1','hpg-older-checksum','hpg-user','2025-12-01',NULL);
      INSERT INTO "HealthSusImportIssue" (id,"batchId","rowNumber","entityType",reason) VALUES
        ('hpg-issue-b','hpg-import',2,'PROCEDURE','Linha dois'),('hpg-issue-a','hpg-import',1,'PROCEDURE','Linha um'),
        ('hpg-older-issue-b','hpg-import-older',2,'PROCEDURE','Outra linha dois'),('hpg-older-issue-a','hpg-import-older',1,'PROCEDURE','Outra linha um');
      INSERT INTO "HealthSusImportIssue" (id,"batchId","rowNumber","entityType",reason)
        SELECT 'hpg-issue-'||n,'hpg-import',n,'PROCEDURE','Linha nominal '||n FROM generate_series(3,103) n;
      INSERT INTO "HealthSusProcedure" (id,source,competence,code,description,financing,"sourceBatchId","updatedAt") VALUES
        ('hpg-procedure','SIGTAP','2026-01','HPG0001','Procedimento nominal','MAC','hpg-import',now());
      INSERT INTO "HealthProductionCompetence" (id,period,"createdByUsuarioId","updatedAt") VALUES ('hpg-competence','2026-01','hpg-user',now());
      INSERT INTO "HealthSusFile" (id,"fileType","competenceId",content,hash,quantity,"createdByUsuarioId","createdAt") VALUES
        ('hpg-file','BPA','hpg-competence','Arquivo nominal','hpg-hash',1,'hpg-user','2026-01-31 12:34:56.789');
      INSERT INTO "HealthEsusBatch" (id,competence,"fileContent",hash,total,"createdByUsuarioId","createdAt") VALUES
        ('hpg-esus','2026-01','Lote nominal','hpg-esus-hash',1,'hpg-user','2026-01-31 12:34:56.789');
      INSERT INTO "IntegrationConnection" (id,code,name,category,provider,"updatedAt") VALUES
        ('hpg-connection','MS_RENAME','Conector nominal','SAUDE','Nominal',now()),
        ('hpg-second-connection','MS_CNES','Segundo conector nominal','SAUDE','Nominal',now()),
        ('hpg-other-connection','HPG_OTHER','Outro conector','OUTRO','Nominal',now());
      INSERT INTO "IntegrationRun" (id,"connectionId",operation,environment,status,message,"createdAt")
        SELECT 'hpg-run-'||n,'hpg-connection','Operação '||n,'TEST','SUCCESS','Execução nominal',timestamp '2026-01-01 00:00:00.123'+n*interval '1 day' FROM generate_series(1,7) n;
      INSERT INTO "IntegrationRun" (id,"connectionId",operation,environment,status,message,"createdAt")
        SELECT 'hpg-second-run-'||n,'hpg-second-connection','Segunda operação '||n,'TEST','SUCCESS','Segunda execução nominal',timestamp '2026-02-01 00:00:00.123'+n*interval '1 day' FROM generate_series(1,7) n;
    `);
    await fixture.connection.db.execute(sql`UPDATE "Usuario" SET email=${process.env.SYSTEM_ADMIN_EMAIL?.trim().toLowerCase() || "admin@email.com"} WHERE id='hpg-admin-email'`);
    return fixture;
  } catch (error) {
    try { await authority?.close(); } finally { await fixture.close(); }
    throw error;
  }
}
