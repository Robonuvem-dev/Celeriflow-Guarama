import { readFile, readdir } from "node:fs/promises";
import { sql } from "drizzle-orm";
import type { HealthManagementContext } from "../../src/lib/contracts/health-management-operations";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

export const managementPatientLinkTables = ["HealthAppointment", "MedicalRecord", "HealthPrescription", "MedicineDispensation", "VaccinationRecord", "HealthExamRequest", "HealthReferral", "HealthPatientCondition", "HealthOngoingMedication", "HealthHomeCareRequest", "HealthFoodMarker", "HealthPregnancy", "HealthChronicAssessment", "HealthClinicalScreening", "HealthDentalMark", "HealthPharmacyJudicialCase", "HealthPharmacyKitDelivery", "HealthCareProgramEnrollment", "HealthVaccinationCardEvent", "HealthVaccineAdverseEvent", "HealthPanelCall", "HealthLabOrder", "SpecializedTherapeuticPlan", "SpecializedQuota", "SpecializedDistribution", "PharmacyRequest", "HealthRegulationRequest", "HealthTfdRequest", "HealthTfdPassenger", "HealthProductionFact", "HealthHomeVisitParticipant", "HealthEsusForm", "HealthWaitlist", "HealthReception", "HealthBedOccupancy", "HealthObservation", "HealthPatientRegistrationChange", "HealthPatientContact", "HealthPatientCall"];
export const managementChangedTables = [...managementPatientLinkTables, "Patient", "Address", "HealthProfessional", "HealthProfessionalAssignment", "HealthServiceAssignment", "HealthHabilitation", "HealthRegistrationStatusHistory", "HealthPatientRegistration", "HealthPatientDocument", "HealthAdministrativeMerge", "HealthVigilanceEstablishment", "HealthVigilanceComplaint", "HealthVigilanceInspection", "HealthVigilanceInspectionItem", "HealthVigilanceLicense"];
export const managementProtectedTables = ["Person", "Employee", "HealthUnit", "Material", "MaterialStock", "MaterialMovement", "HealthSusImportBatch", "HealthSusReference", "HealthSusProcedure", "HealthTfdPassengerRemoval", "Document", "Covenant", "BudgetAppropriation", "BudgetMovement", "Commitment", "Settlement", "Payment", "FinancialAuditLog", "AuditEvent"];

/** All original SQLs, then independent seeds. Every service uses the actual
 * Neon pool through Drizzle; teardown belongs to this one sequential fixture. */
export async function createHealthManagementOperationsFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
    for (const name of migrations) {
      try { await fixture.database.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8")); }
      catch (error) { throw new Error(`Histórico Saúde management: ${name}`, { cause: error }); }
    }
    await fixture.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('hmo-profile','HMO_ADMIN','Gestão Saúde','{}',now());
      INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('hmo-e-target','Maria Clínica',now()),('hmo-e-source','Maria Clínica',now());
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('hmo-actor','Ator Saúde','hmo@health.invalid','hmo-profile','hmo-e-target',now());
      INSERT INTO "Institution" (id,name,city,state,"updatedAt") VALUES ('hmo-institution','Município teste','Ibema','PR',now());
      INSERT INTO "Neighborhood" (id,name,type,city,state,"updatedAt") VALUES ('hmo-neighborhood','Centro','Urbano','Cascavel','PR',now());
      INSERT INTO "Person" (id,"fullName","birthDate","motherName","phonePrimary",gender,"updatedAt") VALUES
        ('hmo-person-target','Ana Saúde','1990-01-02 12:00:00','Mãe Saúde','11111111','Feminino',now()),
        ('hmo-person-source','ANA SAUDE','1990-01-02 12:00:00','Mae Saude','22222222','Feminino',now()),
        ('hmo-person-hidden','Pessoa fora do escopo','2000-05-01 12:00:00','Outra mãe',null,'Masculino',now()),
        ('hmo-reporter','Identidade sigilosa do denunciante',null,null,null,null,now());
      INSERT INTO "Address" (id,"zipCode","streetName",number,"personId","neighborhoodId","updatedAt") VALUES
        ('hmo-address-target','85878-000','Rua Saúde','1','hmo-person-target','hmo-neighborhood',now()),
        ('hmo-address-source','85878000','RUA SAUDE','2','hmo-person-source','hmo-neighborhood',now());
      INSERT INTO "HealthUnit" (id,name,type,"updatedAt") VALUES ('hmo-u1','UBS Autorizada','UBS',now()),('hmo-u2','UBS Oculta','UBS',now());
      INSERT INTO "HealthTeam" (id,name,"unitId","updatedAt") VALUES ('hmo-team','Equipe Saúde','hmo-u1',now());
      INSERT INTO "Patient" (id,"personId","referenceUnitId",cns,"createdAt","updatedAt") VALUES
        ('hmo-target','hmo-person-target','hmo-u1','123456789012345','2026-05-10 14:15:16.789',now()),
        ('hmo-source','hmo-person-source','hmo-u1','543210987654321','2026-05-10 14:15:16.789',now()),
        ('hmo-hidden','hmo-person-hidden','hmo-u2',null,'2026-05-10 14:15:16.789',now());
      INSERT INTO "HealthProfessional" (id,"employeeId","unitId","teamId",cbo,"updatedAt") VALUES
        ('hmo-prof-target','hmo-e-target','hmo-u1','hmo-team','225125',now()),('hmo-prof-source','hmo-e-source','hmo-u1','hmo-team','225125',now());
      INSERT INTO "HealthSpecialty" (id,code,name,"updatedAt") VALUES ('hmo-sp1','HMO1','Clínica',now()),('hmo-sp2','HMO2','Pediatria',now());
      INSERT INTO "HealthUnitSpecialty" (id,"unitId","specialtyId","updatedAt") VALUES ('hmo-us','hmo-u1','hmo-sp1',now());
      INSERT INTO "HealthSpecialtyGroup" (id,name,"updatedAt") VALUES ('hmo-group','Grupo clínico',now());
      INSERT INTO "HealthSpecialtyGroupMember" (id,"groupId","specialtyId") VALUES ('hmo-member','hmo-group','hmo-sp1');
      INSERT INTO "HealthProfessionalAssignment" (id,"professionalId","unitId","specialtyId","updatedAt") VALUES
        ('hmo-assignment-target','hmo-prof-target','hmo-u1','hmo-sp1',now()),('hmo-assignment-duplicate','hmo-prof-source','hmo-u1','hmo-sp1',now()),
        ('hmo-assignment-target-null','hmo-prof-target','hmo-u1',null,now()),('hmo-assignment-source-null','hmo-prof-source','hmo-u1',null,now()),
        ('hmo-assignment-unique','hmo-prof-source','hmo-u1','hmo-sp2',now());
      INSERT INTO "HealthService" (id,code,name,"updatedAt") VALUES ('hmo-svc1','HMO1','Serviço um',now()),('hmo-svc2','HMO2','Serviço dois',now());
      INSERT INTO "HealthServiceAssignment" (id,"serviceId","professionalId","updatedAt") VALUES ('hmo-svc-target','hmo-svc1','hmo-prof-target',now()),('hmo-svc-duplicate','hmo-svc1','hmo-prof-source',now()),('hmo-svc-unique','hmo-svc2','hmo-prof-source',now());
      INSERT INTO "HealthHabilitation" (id,code,description,"professionalId","updatedAt") VALUES ('hmo-hab-target','HMO1','Habilitação um','hmo-prof-target',now()),('hmo-hab-duplicate','HMO1','Habilitação um','hmo-prof-source',now()),('hmo-hab-unique','HMO2','Habilitação dois','hmo-prof-source',now());
      INSERT INTO "HealthRegistrationStatusHistory" (id,"professionalId","isActive") VALUES ('hmo-status','hmo-prof-source',true);
      INSERT INTO "Document" (id,title,"documentType","fileUrl","updatedAt") VALUES ('hmo-doc-shared','Documento preservado','LAUDO','fixture://shared',now()),('hmo-doc-source','Documento origem','CADASTRO','fixture://source',now());
      INSERT INTO "HealthPatientDocument" (id,"patientId","documentId",kind,"actorUsuarioId") VALUES
        ('hmo-doc-target-link','hmo-target','hmo-doc-shared','LAUDO','hmo-actor'),('hmo-doc-duplicate-link','hmo-source','hmo-doc-shared','LAUDO','hmo-actor'),('hmo-doc-source-link','hmo-source','hmo-doc-source','CADASTRO','hmo-actor');
      INSERT INTO "HealthPatientRegistration" ("patientId",workplace,"updatedAt") VALUES ('hmo-target','Perfil principal',now()),('hmo-source','Perfil origem',now());
      INSERT INTO "HealthSusImportBatch" (id,source,competence,origin,"fileName","fileFormat","contractVersion",checksum,"actorUsuarioId") VALUES ('hmo-batch','SIGTAP','2026-05','Oficial','sigtap.txt','TXT','v1','hmo-sha','hmo-actor');
      INSERT INTO "HealthSusReference" (id,source,competence,kind,code,description,"sourceBatchId","updatedAt") VALUES ('hmo-cid','SIGTAP','2026-05','CID','A00','CID referência','hmo-batch',now());
      INSERT INTO "HealthSusProcedure" (id,source,competence,code,description,financing,"unitValue","sourceBatchId","updatedAt") VALUES ('hmo-procedure','SIGTAP','2026-05','0000000001','Consulta clínica','PAB',1234.56,'hmo-batch',now());
      INSERT INTO "Covenant" (id,number,grantor,description,"totalValueDecimal","startDate","endDate","updatedAt") VALUES ('hmo-covenant','HMO-01','União','Convênio Saúde',123456789012345.67,'2026-05-10 14:15:16.789','2026-12-31 12:00:00',now());
      INSERT INTO "HealthCareSchedule" (id,"unitId","professionalId",kind,"totalSlots","createdByUsuarioId","updatedAt") VALUES ('hmo-schedule','hmo-u1','hmo-prof-source','FIXO',5,'hmo-actor',now());
      INSERT INTO "HealthAppointment" (id,date,"patientId","professionalId","unitId","specialtyId","scheduleId",status,"municipalitySnapshot","stateSnapshot","updatedAt") VALUES
        ('hmo-appointment','2026-05-10 14:15:16.789','hmo-source','hmo-prof-source','hmo-u1','hmo-sp1','hmo-schedule','Faltou','Cascavel','PR',now()),
        ('hmo-appointment-hidden','2026-05-10 14:15:16.789','hmo-hidden','hmo-prof-target','hmo-u2','hmo-sp1',null,'Agendado','Ibema','PR',now()),
        ('hmo-appointment-old','2025-01-01 12:00:00','hmo-target',null,'hmo-u1',null,null,'Cancelado',null,null,now());
      INSERT INTO "HealthWaitlist" (id,"patientId","specialtyId","scheduleId","createdByUsuarioId","createdAt","updatedAt") VALUES ('hmo-wait','hmo-source','hmo-sp1','hmo-schedule','hmo-actor','2026-05-10 14:15:16.789',now());
      INSERT INTO "HealthTriage" (id,"appointmentId","professionalId","chiefComplaint","riskClassification","priorityLabel","createdAt","updatedAt") VALUES ('hmo-triage','hmo-appointment','hmo-prof-source','Queixa clínica','Baixo','Normal','2026-05-10 14:15:16.789',now());
      INSERT INTO "MedicalRecord" (id,date,"patientId","professionalId","unitId","appointmentId","completedAt","chiefComplaint",conduct,"careContextSnapshot","updatedAt") VALUES ('hmo-record','2026-05-10 14:15:16.789','hmo-source','hmo-prof-source','hmo-u1','hmo-appointment','2026-05-10 15:00:00','Queixa clínica','Orientações','{"clinical":{"version":1,"private":true},"items":[1,null,"texto"]}',now());
      INSERT INTO "HealthPerformedProcedure" (id,"medicalRecordId","procedureId","professionalId",quantity,"performedAt") VALUES ('hmo-performed','hmo-record','hmo-procedure','hmo-prof-source',3,'2026-05-10 14:15:16.789');
      INSERT INTO "HealthExamRequest" (id,date,"examName","patientId","professionalId","unitId","updatedAt") VALUES ('hmo-exam','2026-05-10 14:15:16.789','COVID PCR','hmo-source','hmo-prof-source','hmo-u1',now());
      INSERT INTO "HealthReferral" (id,specialty,reason,"patientId","professionalId","updatedAt") VALUES ('hmo-referral','Clínica','Avaliação','hmo-source','hmo-prof-source',now());
      INSERT INTO "HealthPrescription" (id,content,"patientId","professionalId","unitId","updatedAt") VALUES ('hmo-prescription','Uso orientado','hmo-source','hmo-prof-source','hmo-u1',now());
      INSERT INTO "MaterialCategory" (id,code,name,"updatedAt") VALUES ('hmo-cat','HMO','Assistencial',now());
      INSERT INTO "Material" (id,code,name,"categoryId","updatedAt") VALUES ('hmo-material','HMO-MAT','Medicamento teste','hmo-cat',now());
      INSERT INTO "HealthMaterialProfile" (id,"materialId","productKind","updatedAt") VALUES ('hmo-material-profile','hmo-material','CONTROLLED',now());
      INSERT INTO "Medicine" (id,name,"isControlled","materialId","updatedAt") VALUES ('hmo-medicine','Medicamento teste',true,'hmo-material',now());
      INSERT INTO "Warehouse" (id,name,"healthUnitId","updatedAt") VALUES ('hmo-wh1','Estoque autorizado','hmo-u1',now()),('hmo-wh2','Estoque oculto','hmo-u2',now());
      INSERT INTO "MaterialStock" (id,"warehouseId","materialId","batchNumber",quantity,"unitCost","expirationDate","updatedAt") VALUES ('hmo-stock','hmo-wh1','hmo-material','LOTE-1',7.125,0.125,'2027-01-01 12:00:00',now());
      INSERT INTO "MaterialMovement" (id,type,quantity,"unitValue","warehouseId","materialId","stockId",date,"updatedAt") VALUES ('hmo-movement','Saída',0.5,0.125,'hmo-wh1','hmo-material','hmo-stock','2026-05-10 14:15:16.789',now());
      INSERT INTO "MedicineDispensation" (id,date,quantity,"medicineId","patientId","unitId","stockId","dispensedByProfessionalId","updatedAt") VALUES ('hmo-disp','2026-05-10 14:15:16.789',0.5,'hmo-medicine','hmo-source','hmo-u1','hmo-stock','hmo-prof-source',now());
      INSERT INTO "PharmacyRequest" (id,"destinationWarehouseId","patientId","createdByUsuarioId","requestedAt","updatedAt") VALUES ('hmo-pharmacy-request','hmo-wh1','hmo-source','hmo-actor','2026-05-10 14:15:16.789',now());
      INSERT INTO "PharmacyRequestItem" (id,"requestId","materialId","requestedQuantity","fulfilledQuantity") VALUES ('hmo-pharmacy-item','hmo-pharmacy-request','hmo-material',3,0.5);
      INSERT INTO "HealthStockReceipt" (id,"warehouseId","entryType",status,"idempotencyKey","createdByUsuarioId","receivedAt","updatedAt") VALUES ('hmo-receipt','hmo-wh1','PURCHASE','POSTED','hmo-receipt','hmo-actor','2026-05-10 14:15:16.789',now());
      INSERT INTO "HealthStockReceiptItem" (id,"receiptId","materialId","batchNumber",quantity,"unitCost") VALUES ('hmo-receipt-item','hmo-receipt','hmo-material','LOTE-1',1.125,0.125);
      INSERT INTO "HealthStockTransfer" (id,"originWarehouseId","destinationWarehouseId","idempotencyKey","createdByUsuarioId","requestNumber","createdAt","updatedAt") VALUES ('hmo-transfer','hmo-wh2','hmo-wh1','hmo-transfer','hmo-actor','HMO-PEDIDO','2026-05-10 14:15:16.789',now());
      INSERT INTO "HealthStockTransferItem" (id,"transferId","materialId","batchNumber",quantity) VALUES ('hmo-transfer-item','hmo-transfer','hmo-material','LOTE-1',0.125);
      INSERT INTO "Vaccine" (id,name,"updatedAt") VALUES ('hmo-vaccine','Vacina teste',now());
      INSERT INTO "VaccinationRecord" (id,date,"vaccineId","patientId","professionalId","unitId","updatedAt") VALUES ('hmo-vaccination','2026-05-10 14:15:16.789','hmo-vaccine','hmo-source','hmo-prof-source','hmo-u1',now());
      INSERT INTO "HealthLabExamModel" (id,code,name,"procedureId","updatedAt") VALUES ('hmo-exam-model','HMO-PCR','COVID PCR','hmo-procedure',now());
      INSERT INTO "HealthLabOrder" (id,"patientId","examModelId","examRequestId","collectionUnitId","requestUnitId","sampleBarcode","referenceValue","idempotencyKey","createdByUsuarioId","createdAt","updatedAt") VALUES ('hmo-lab','hmo-source','hmo-exam-model','hmo-exam','hmo-u1','hmo-u2','HMO-AMOSTRA',0.125,'hmo-lab','hmo-actor','2026-05-10 14:15:16.789',now());
      INSERT INTO "HealthLabResult" (id,"orderId",version,status,"values","enteredByUsuarioId") VALUES ('hmo-result','hmo-lab',1,'FINAL','{"text":"sigiloso","quantity":0.125}','hmo-actor');
      INSERT INTO "HealthLabReport" (id,"orderId","documentId","updatedAt") VALUES ('hmo-report','hmo-lab','hmo-doc-shared',now());
      INSERT INTO "SpecializedTherapeuticPlan" (id,"patientId","unitId","teamId",goals,"carePlan","plannedConsultations","createdByUsuarioId","updatedAt") VALUES ('hmo-plan','hmo-source','hmo-u1','hmo-team','Meta','Plano',3,'hmo-actor',now());
      INSERT INTO "SpecializedQuota" (id,"patientId","materialId",period,"allowedQuantity","updatedAt") VALUES ('hmo-quota','hmo-source','hmo-material','2026-05',5,now());
      INSERT INTO "SpecializedDistribution" (id,"planId","patientId","warehouseId","materialId","stockId","movementId",quantity,"referenceValue","deliveredByUsuarioId","deliveredAt") VALUES ('hmo-distribution','hmo-plan','hmo-source','hmo-wh1','hmo-material','hmo-stock','hmo-movement',0.5,0.125,'hmo-actor','2026-05-10 14:15:16.789');
      INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('hmo-provider-company','Prestador clínico','12345678000199',now());
      INSERT INTO "Supplier" (id,"companyId","updatedAt") VALUES ('hmo-provider','hmo-provider-company',now());
      INSERT INTO "HealthRegulationQuota" (id,"providerSupplierId","unitId","specialtyId",period,"totalQuantity","unitValue","updatedAt") VALUES ('hmo-reg-quota','hmo-provider','hmo-u1','hmo-sp1','2026-05',10,12.34,now());
      INSERT INTO "HealthRegulationRequest" (id,"patientId","requestUnitId","professionalId","specialtyId","procedureId","quotaId","guideNumber","createdByUsuarioId","createdAt","updatedAt") VALUES ('hmo-regulation','hmo-source','hmo-u1','hmo-prof-source','hmo-sp1','hmo-procedure','hmo-reg-quota','HMO-GUIA','hmo-actor','2026-05-10 14:15:16.789',now());
      INSERT INTO "HealthTfdRequest" (id,"patientId","originUnitId",destination,reason,"createdByUsuarioId","updatedAt") VALUES ('hmo-tfd-request','hmo-source','hmo-u1','Cascavel','Tratamento','hmo-actor',now());
      INSERT INTO "FleetUnit" (id,code,name,category,"createdById","updatedAt") VALUES ('hmo-vehicle','HMO','Veículo Saúde','VEHICLE','hmo-actor',now());
      INSERT INTO "HealthTfdTrip" (id,date,origin,destination,"fleetUnitId",capacity,"createdByUsuarioId","updatedAt") VALUES ('hmo-trip','2026-05-10','Ibema','Cascavel','hmo-vehicle',5,'hmo-actor',now());
      INSERT INTO "HealthTfdPassenger" (id,"tripId","patientId") VALUES ('hmo-passenger','hmo-trip','hmo-source');
      INSERT INTO "HealthProductionFact" (id,"originType","originId","occurredAt",period,"patientId","professionalId","unitId","procedureId","cidReferenceId",quantity,value,"idempotencyKey") VALUES ('hmo-fact','MANUAL','hmo-record','2026-05-10 14:15:16.789','2026-05','hmo-source','hmo-prof-source','hmo-u1','hmo-procedure','hmo-cid',3,0.125,'hmo-fact');
      INSERT INTO "HealthHousehold" (id,"householdCode","updatedAt") VALUES ('hmo-house','HMO-CASA',now());
      INSERT INTO "HealthFamily" (id,"familyCode","householdId","updatedAt") VALUES ('hmo-family','HMO-FAM','hmo-house',now());
      INSERT INTO "HealthFamilyMember" (id,"familyId","personId") VALUES ('hmo-family-member','hmo-family','hmo-person-source');
      INSERT INTO "HealthHomeVisit" (id,"professionalId","visitedAt",actions,"createdByUsuarioId") VALUES ('hmo-visit','hmo-prof-source','2026-05-10 14:15:16.789','Visita','hmo-actor');
      INSERT INTO "HealthHomeVisitParticipant" (id,"visitId","personId","patientId") VALUES ('hmo-visit-person','hmo-visit','hmo-person-source','hmo-source');
      INSERT INTO "HealthEsusForm" (id,kind,period,"patientId","unitId","teamId","householdId","familyId","professionalId","idempotencyKey","createdByUsuarioId","createdAt","updatedAt",payload) VALUES ('hmo-form','VISITA','2026-05','hmo-source','hmo-u1','hmo-team','hmo-house','hmo-family','hmo-prof-source','hmo-form','hmo-actor','2026-05-10 14:15:16.789',now(),'{"nested":[1,null,"texto"]}');
      INSERT INTO "HealthHomeCareRequest" (id,"patientId","unitId","requestedAt",reason,"createdByUsuarioId") VALUES ('hmo-home','hmo-source','hmo-u1',now(),'Acompanhamento','hmo-actor');
      INSERT INTO "HealthFoodMarker" (id,"patientId","unitId","professionalId","recordedAt","ageGroup",place,markers,"actorUsuarioId") VALUES ('hmo-food','hmo-source','hmo-u1','hmo-prof-source',now(),'ADULTO','UBS','{}','hmo-actor');
      INSERT INTO "HealthPatientCondition" (id,"patientId",kind,label,"startedAt",narrative,"professionalId","actorUsuarioId") VALUES ('hmo-condition','hmo-source','CHRONIC','Condição',now(),'Histórico','hmo-prof-source','hmo-actor');
      INSERT INTO "HealthOngoingMedication" (id,"patientId",name,dosage,"startedAt","actorUsuarioId") VALUES ('hmo-ongoing','hmo-source','Medicamento','Uso diário',now(),'hmo-actor');
      INSERT INTO "HealthPregnancy" (id,"patientId","openedMedicalRecordId","unitId","estimatedDeliveryDate","calculationMethod","baselineWeight",height,"pregnancyType","previousPregnancies","createdByUsuarioId") VALUES ('hmo-pregnancy','hmo-source','hmo-record','hmo-u1','2026-12-31','DUM',60.125,1.65,'UNICA',0,'hmo-actor');
      INSERT INTO "HealthChronicAssessment" (id,"patientId","medicalRecordId","conditionKind","assessedAt","riskFactors",complications,notes,"actorUsuarioId") VALUES ('hmo-chronic','hmo-source','hmo-record','HYPERTENSION',now(),ARRAY['risco'],ARRAY[]::text[],'Avaliação','hmo-actor');
      INSERT INTO "HealthClinicalScreening" (id,"patientId","medicalRecordId",kind,eligible,"eligibilityReason","requestedAt",status,"followupNotes","actorUsuarioId") VALUES ('hmo-screen','hmo-source','hmo-record','RASTREIO',true,'Critério',now(),'REQUESTED','Histórico','hmo-actor');
      INSERT INTO "HealthDentalMark" (id,"patientId","medicalRecordId",dentition,"targetType","targetCode",condition,notes,"actorUsuarioId") VALUES ('hmo-dental','hmo-source','hmo-record','PERMANENT','TOOTH','11','Condição','Histórico','hmo-actor');
      INSERT INTO "HealthPharmacyLawyer" (id,"personId",registration,"registrationState") VALUES ('hmo-lawyer','hmo-reporter','123','PR');
      INSERT INTO "HealthPharmacyJudicialCase" (id,"caseNumber","patientId","unitId","lawyerId","openedAt","validUntil",reason,"createdByUsuarioId") VALUES ('hmo-case','HMO-PROC','hmo-source','hmo-u1','hmo-lawyer','2026-01-01','2026-12-31','Decisão','hmo-actor');
      INSERT INTO "HealthPharmacyKit" (id,code,name) VALUES ('hmo-kit','HMO-KIT','Kit teste');
      INSERT INTO "HealthPharmacyKitDelivery" (id,"kitId","kitVersion","patientId","warehouseId",criteria,"sourceSnapshot","generatedByUsuarioId","idempotencyKey") VALUES ('hmo-kit-delivery','hmo-kit',1,'hmo-source','hmo-wh1','{}','{}','hmo-actor','hmo-kit-delivery');
      INSERT INTO "HealthCareProgram" (id,code,name) VALUES ('hmo-program','HMO','Programa');
      INSERT INTO "HealthCareProgramEnrollment" (id,"programId","patientId","unitId","startsAt",reason,"createdByUsuarioId") VALUES ('hmo-enrollment','hmo-program','hmo-source','hmo-u1',now(),'Inclusão','hmo-actor');
      INSERT INTO "HealthVaccinationCardEvent" (id,"patientId","vaccineId",kind,"doseNumber",strategy,"occurredAt","professionalId","unitId",reason,"actorUsuarioId") VALUES ('hmo-card-event','hmo-source','hmo-vaccine','RECORDED',1,'Rotina',now(),'hmo-prof-source','hmo-u1','Registro','hmo-actor');
      INSERT INTO "HealthVaccineAdverseEvent" (id,"patientId","vaccineId","unitId","occurredAt","eventType","lesionType","lesionLocation",severity,"clinicalNotes","actorUsuarioId") VALUES ('hmo-adverse','hmo-source','hmo-vaccine','hmo-u1',now(),'LOCAL','LOCAL','Braço','LEVE','Histórico','hmo-actor');
      INSERT INTO "HealthCallPanel" (id,"unitId",sector,title,"callMessage",news) VALUES ('hmo-panel','hmo-u1','Recepção','Painel','Chamada','Avisos');
      INSERT INTO "HealthPanelCall" (id,"panelId","patientId",message,"actorUsuarioId") VALUES ('hmo-call','hmo-panel','hmo-source','Chamada','hmo-actor');
      INSERT INTO "HealthReception" (id,"patientId","unitId","createdByUsuarioId","updatedAt") VALUES ('hmo-reception','hmo-source','hmo-u1','hmo-actor',now());
      INSERT INTO "HealthBed" (id,"unitId",code,"updatedAt") VALUES ('hmo-bed','hmo-u1','HMO',now());
      INSERT INTO "HealthBedOccupancy" (id,"bedId","patientId") VALUES ('hmo-bed-occupancy','hmo-bed','hmo-source');
      INSERT INTO "HealthObservation" (id,"patientId","unitId","createdByUsuarioId","updatedAt") VALUES ('hmo-observation','hmo-source','hmo-u1','hmo-actor',now());
      INSERT INTO "HealthPatientRegistrationChange" (id,"patientId","actorUsuarioId",changes) VALUES ('hmo-change','hmo-source','hmo-actor','{"before":null,"after":{"label":"preservar"}}');
      INSERT INTO "HealthPatientContact" (id,"patientId",name,phone,kinship,"actorUsuarioId") VALUES ('hmo-contact','hmo-source','Contato','33333333','Familiar','hmo-actor');
      INSERT INTO "HealthPatientCall" (id,"patientId","calledAt",phone,result,"actorUsuarioId") VALUES ('hmo-phone','hmo-source',now(),'33333333','Atendida','hmo-actor');
      INSERT INTO "AuditEvent" (id,"eventType","targetType","targetId","actorUsuarioId","createdAt") VALUES ('hmo-audit','ADMINISTRATIVE_MUTATION','PATIENT','hmo-source','hmo-actor','2026-05-10 14:15:16.789');
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('hmo-secretariat','Saúde',now());
      INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('hmo-entity','HMO','Executivo','PREFEITURA',now());
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('hmo-budget-unit','HMO','Saúde','hmo-secretariat',now());
      INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('hmo-budget-unit','hmo-entity');
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('hmo-resource','HMO','Livres',now());
      INSERT INTO "ExpenseNature" (id,code,name,"updatedAt") VALUES ('hmo-nature','HMO','Despesa',now());
      INSERT INTO "FinancialYear" (id,year,"governmentEntityId","startDate","endDate","updatedAt") VALUES ('hmo-year',2026,'hmo-entity','2026-01-01','2026-12-31',now());
      INSERT INTO "BudgetAppropriation" (id,code,"financialYearId","budgetUnitId","expenseNatureId","resourceSourceId","initialValue","updatedValue","committedValue","initialValueDecimal","updatedValueDecimal","committedValueDecimal","updatedAt") VALUES ('hmo-expense','HMO','hmo-year','hmo-budget-unit','hmo-nature','hmo-resource',123456789012345.67,123456789012345.67,0.125,123456789012345.67,123456789012345.67,0.13,now());
    `);
    const db = fixture.connection.db;
    const context: HealthManagementContext = { database: db, connection: fixture.connection, user: { id: "hmo-actor", name: "Ator Saúde", email: "hmo@health.invalid", firebaseUid: "hmo", role: "ADMIN", profileCode: "HMO_ADMIN", modulePermissions: [{ code: "SAUDE", canView: true, canEdit: true }], allowedBudgetUnitIds: [], allowedHealthUnitIds: ["hmo-u1"], hasHealthAccessScope: true, employeeId: "hmo-e-target", departmentId: null, secretariatId: null } };
    async function snapshot(tables = managementChangedTables) {
      const digests: Record<string, string> = {};
      for (const table of tables) {
        const result = await db.execute<{ digest: string }>(sql`select md5(coalesce(string_agg(to_jsonb(t)::text, E'\n' order by to_jsonb(t)::text),'')) as digest from ${sql.identifier(table)} t`);
        digests[table] = result.rows[0].digest;
      }
      return digests;
    }
    return { ...fixture, db, context, snapshot, migrationCount: migrations.length };
  } catch (error) { await fixture.close(); throw error; }
}
