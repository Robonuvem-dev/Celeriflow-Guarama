import { readFile, readdir } from "node:fs/promises";
import type { HealthPharmacyContext } from "../../src/lib/contracts/health-pharmacy";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Authoritative migrations and fixed data in disposable PostgreSQL only.
 * Real Neon WebSocket/Drizzle transport; open/close sequentially. */
export async function createPharmacyDatabase() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const root = new URL("../../prisma/migrations-ibema/", import.meta.url);
    const migrations = (await readdir(root, { withFileTypes: true })).filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const migration of migrations) await fixture.database.exec(await readFile(new URL(`${migration}/migration.sql`, root), "utf8"));
    await fixture.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('pharmacy-profile','HEALTH_OPERATOR','Farmácia','{}','2026-10-19');
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('pharmacy-actor','Operador da farmácia','pharmacy@example.test','pharmacy-profile','2026-10-19'),('pharmacy-reviewer','Aprovador do inventário','pharmacy-reviewer@example.test','pharmacy-profile','2026-10-19');
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('pharmacy-secretariat','Saúde','2026-10-19');
      INSERT INTO "Department" (id,name,"secretariatId","updatedAt") VALUES ('pharmacy-department','Assistência farmacêutica','pharmacy-secretariat','2026-10-19');
      INSERT INTO "Employee" (id,name,"departmentId","updatedAt") VALUES ('pharmacy-employee','Profissional da farmácia','pharmacy-department','2026-10-19');
      INSERT INTO "HealthUnit" (id,name,type,"updatedAt") VALUES ('pharmacy-unit','UBS autorizada','UBS','2026-10-19'),('pharmacy-unit-two','UBS destinatária','UBS','2026-10-19');
      INSERT INTO "HealthProfessional" (id,"employeeId","unitId","updatedAt") VALUES ('pharmacy-professional','pharmacy-employee','pharmacy-unit','2026-10-19');
      INSERT INTO "HealthProfessionalAssignment" (id,"professionalId","unitId","updatedAt") VALUES ('pharmacy-assignment','pharmacy-professional','pharmacy-unit-two','2026-10-19');
      INSERT INTO "Person" (id,"fullName",cpf,"deathDate","updatedAt") VALUES ('pharmacy-person','Paciente farmacêutico','12345678909',NULL,'2026-10-19'),('pharmacy-receiver','Familiar autorizado','98765432100',NULL,'2026-10-19'),('pharmacy-dead','Pessoa falecida','11144477735','2026-01-01','2026-10-19');
      INSERT INTO "Patient" (id,"personId","referenceUnitId","updatedAt") VALUES ('pharmacy-patient','pharmacy-person','pharmacy-unit','2026-10-19'),('pharmacy-other-patient','pharmacy-receiver','pharmacy-unit-two','2026-10-19'),('pharmacy-dead-patient','pharmacy-dead','pharmacy-unit','2026-10-19');
      INSERT INTO "Neighborhood" (id,name,type,city,state,"updatedAt") VALUES ('pharmacy-neighborhood','Bairro do paciente','Urbano','Município','PR','2026-10-19');
      INSERT INTO "Address" (id,"personId","addressType","neighborhoodId","createdAt","updatedAt") VALUES ('pharmacy-address','pharmacy-person','Residencial','pharmacy-neighborhood','2026-10-19 12:34:56.789','2026-10-19');
      INSERT INTO "Warehouse" (id,name,"healthUnitId","updatedAt") VALUES ('pharmacy-warehouse','Farmácia autorizada','pharmacy-unit','2026-10-19'),('pharmacy-warehouse-two','Farmácia destinatária','pharmacy-unit-two','2026-10-19'),('pharmacy-unlinked','Estoque não assistencial',NULL,'2026-10-19');
      INSERT INTO "MaterialCategory" (id,name,code,"updatedAt") VALUES ('pharmacy-category','Assistenciais','PHARMACY','2026-10-19');
      INSERT INTO "Material" (id,code,name,"categoryId","updatedAt") VALUES ('pharmacy-material','PH-MED','Medicamento','pharmacy-category','2026-10-19'),('pharmacy-correlate','PH-COR','Correlato','pharmacy-category','2026-10-19'),('pharmacy-vaccine-material','PH-VAC','Imunobiológico','pharmacy-category','2026-10-19');
      INSERT INTO "HealthMaterialProfile" (id,"materialId","productKind","updatedAt") VALUES ('pharmacy-profile-med','pharmacy-material','MEDICINE','2026-10-19'),('pharmacy-profile-cor','pharmacy-correlate','CORRELATE','2026-10-19'),('pharmacy-profile-vac','pharmacy-vaccine-material','IMMUNOBIOLOGICAL','2026-10-19');
      INSERT INTO "Medicine" (id,name,"materialId","updatedAt") VALUES ('pharmacy-medicine','Medicamento cadastrado','pharmacy-material','2026-10-19');
      INSERT INTO "Vaccine" (id,name,"materialId","updatedAt") VALUES ('pharmacy-vaccine','Imunobiológico','pharmacy-vaccine-material','2026-10-19');
      INSERT INTO "MaterialStock" (id,"warehouseId","materialId","batchNumber",quantity,"unitCost","expirationDate","blockedAt","createdAt","updatedAt") VALUES
        ('pharmacy-stock','pharmacy-warehouse','pharmacy-material','LOT',20,1.25,'2030-12-31',NULL,'2026-10-19 12:34:56.789','2026-10-19'),
        ('pharmacy-early-stock','pharmacy-warehouse','pharmacy-material','EARLY',1,1.25,'2029-12-31',NULL,'2026-10-19','2026-10-19'),
        ('pharmacy-blocked-stock','pharmacy-warehouse','pharmacy-material','BLOCKED',10,1.25,'2029-01-01','2026-10-19','2026-10-19','2026-10-19'),
        ('pharmacy-expired-stock','pharmacy-warehouse','pharmacy-material','EXPIRED',10,1.25,'2000-01-01',NULL,'2026-10-19','2026-10-19'),
        ('pharmacy-correlate-stock','pharmacy-warehouse','pharmacy-correlate','AUX',40,0.10,'2030-12-31',NULL,'2026-10-19','2026-10-19'),
        ('pharmacy-vaccine-stock','pharmacy-warehouse','pharmacy-vaccine-material','DOSES',10,1,'2030-12-31',NULL,'2026-10-19','2026-10-19');
      INSERT INTO "HealthPrescription" (id,content,"patientId","professionalId","unitId",date,"validUntil","prescriptionType","updatedAt") VALUES
        ('pharmacy-prescription','Receita original','pharmacy-patient','pharmacy-professional','pharmacy-unit','2026-10-19 12:34:56.789','2030-12-31','SIMPLE','2026-10-19'),
        ('pharmacy-judicial-prescription','Receita judicial','pharmacy-patient','pharmacy-professional','pharmacy-unit','2026-10-19 12:34:56.789','2030-12-31','CONTROLLED','2026-10-19');
      INSERT INTO "HealthPrescriptionItem" (id,"prescriptionId","medicineId","medicineName",dose,frequency,quantity) VALUES ('pharmacy-prescribed','pharmacy-prescription','pharmacy-medicine','Medicamento cadastrado','Uma unidade','Uma vez ao dia',5),('pharmacy-judicial-prescribed','pharmacy-judicial-prescription','pharmacy-medicine','Medicamento cadastrado','Uma unidade','Uma vez ao dia',10);
      INSERT INTO "HealthPatientCondition" (id,"patientId",kind,label,"startedAt",narrative,"professionalId","actorUsuarioId") VALUES ('pharmacy-condition','pharmacy-patient','CHRONIC','Hipertensão','2020-01-01','Acompanhamento ativo','pharmacy-professional','pharmacy-actor');
      INSERT INTO "HealthCareProgram" (id,code,name) VALUES ('pharmacy-program','PH-PROGRAM','Acompanhamento programático');
      INSERT INTO "HealthCareProgramEnrollment" (id,"programId","patientId","unitId","startsAt",reason,"createdByUsuarioId") VALUES ('pharmacy-enrollment','pharmacy-program','pharmacy-patient','pharmacy-unit','2020-01-01','Ingresso vigente','pharmacy-actor');
      INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('pharmacy-company','Fornecedor de teste & Cia','11222333000181','2026-10-19');
      INSERT INTO "Supplier" (id,"companyId","updatedAt") VALUES ('pharmacy-supplier','pharmacy-company','2026-10-19');
      INSERT INTO "ProcessType" (id,name,"updatedAt") VALUES ('pharmacy-process-type','Fornecimento judicial','2026-10-19');
      INSERT INTO "Subject" (id,name,"processTypeId","updatedAt") VALUES ('pharmacy-subject','Medicamento judicial','pharmacy-process-type','2026-10-19');
      INSERT INTO "Process" (id,"protocolNumber","processTypeId","subjectId","personId","updatedAt") VALUES ('pharmacy-protocol','PROC-PHARMACY-001','pharmacy-process-type','pharmacy-subject','pharmacy-person','2026-10-19'),('pharmacy-wrong-protocol','PROC-PHARMACY-002','pharmacy-process-type','pharmacy-subject','pharmacy-receiver','2026-10-19');
      INSERT INTO "PurchaseRequest" (id,number,object,justification,"secretariatId","departmentId","requesterId","updatedAt") VALUES ('pharmacy-purchase','PH-PURCHASE','Medicamento judicial','Cumprimento da decisão','pharmacy-secretariat','pharmacy-department','pharmacy-employee','2026-10-19');
      INSERT INTO "Document" (id,title,"documentType","fileUrl","updatedAt") VALUES ('pharmacy-document','Decisão vinculada','Judicial','https://fixture.invalid/decision.pdf','2026-10-19');
      INSERT INTO "Institution" (id,name,cnpj,"updatedAt") VALUES ('pharmacy-institution','Saúde municipal de teste','11222333000181','2026-10-19');
    `);
    const context: HealthPharmacyContext = { database: fixture.connection.db, user: { id: "pharmacy-actor", firebaseUid: "pharmacy-actor", name: "Operador da farmácia", email: "pharmacy@example.test", role: "OPERADOR", profileCode: "HEALTH_OPERATOR", modulePermissions: [], allowedBudgetUnitIds: [], hasHealthAccessScope: true, allowedHealthUnitIds: ["pharmacy-unit", "pharmacy-unit-two"], employeeId: "pharmacy-employee", departmentId: "pharmacy-department", secretariatId: "pharmacy-secretariat" } };
    const reviewer: HealthPharmacyContext = { ...context, user: { ...context.user, id: "pharmacy-reviewer" } };
    const denied: HealthPharmacyContext = { ...context, user: { ...context.user, allowedHealthUnitIds: ["pharmacy-unit-two"] } };
    return { ...fixture, context, reviewer, denied };
  } catch (error) {
    await fixture.close();
    throw error;
  }
}
