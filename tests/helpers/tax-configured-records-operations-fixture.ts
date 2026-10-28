import { readdir } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../../src/db/transaction";
import { insertConfiguredFiscalEntry } from "../../src/db/repositories/tax-configured-records-operations/records";
import type { TaxActor } from "../../src/lib/tributacao";
import { createTaxationDrizzleFixture } from "./taxation-drizzle-fixture";

/** All installed historical SQL, over the production Neon/Drizzle driver locally. */
export async function createConfiguredFiscalOperationsFixture() {
  const migrationCount = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(entry => entry.isDirectory()).length;
  const fixture = await createTaxationDrizzleFixture();
  const db = fixture.connection.db;
  const actor: TaxActor = { usuarioId: "configured-actor", employeeId: "configured-employee", allowedBudgetUnitIds: ["configured-ug"] };
  try {
    await db.execute(sql`SET TIME ZONE 'UTC'`);
    await db.execute(sql`INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('configured-profile','CONFIGURED_TEST','Fiscal','{}',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Employee" (id,name,"updatedAt") VALUES ('configured-employee','Fiscal',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('configured-actor','Fiscal','configured@example.invalid','configured-profile','configured-employee',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('configured-secretariat','Fazenda',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "GovernmentEntity" (id,code,name,type,"updatedAt") VALUES ('configured-entity','CONFIGURED','Município','PREFEITURA',CURRENT_TIMESTAMP),('configured-other-entity','CONFIGURED-OTHER','Outro município','PREFEITURA',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('configured-ug','CONFIGURED-01','Fazenda','configured-secretariat',CURRENT_TIMESTAMP),('configured-other-ug','CONFIGURED-02','Outra UG','configured-secretariat',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('configured-ug','configured-entity'),('configured-other-ug','configured-other-entity')`);
    await db.execute(sql`INSERT INTO "Person" (id,"fullName",cpf,"updatedAt") VALUES ('configured-person','Contribuinte','52998224725',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Taxpayer" (id,"taxpayerType","personId","updatedAt") VALUES ('configured-taxpayer','PF','configured-person',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Neighborhood" (id,name,type,city,state,"updatedAt") VALUES ('configured-neighborhood','Centro','Bairro','Município','PR',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Street" (id,name,type,city,state,"neighborhoodId","updatedAt") VALUES ('configured-street','Principal','Rua','Município','PR','configured-neighborhood',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "ProcessType" (id,name,"updatedAt") VALUES ('configured-process-type','Cadastro fiscal',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Subject" (id,name,"processTypeId","updatedAt") VALUES ('configured-subject','Formulário fiscal','configured-process-type',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Process" (id,"protocolNumber","processTypeId","subjectId","receivedAt","updatedAt") VALUES ('configured-process','CONFIGURED-2026','configured-process-type','configured-subject','2026-10-28T12:34:56.789',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"updatedAt") VALUES ('configured-doc','Matrícula','PDF','/configured.pdf','Válido',CURRENT_TIMESTAMP),('configured-doc-2','Ato','PDF','/configured-2.pdf','Válido',CURRENT_TIMESTAMP),('configured-invalid-doc','Inválido','PDF','/invalid.pdf','Inválido',CURRENT_TIMESTAMP),(${"configured-doc'); DROP TABLE \"Document\"; --"},'ID literal','PDF','/literal.pdf','Válido',CURRENT_TIMESTAMP)`);
    await withDatabaseTransaction(fixture.connection, async tx => {
      await tx.execute(sql`SELECT set_config('celeriflow.cadastral_actor', ${actor.usuarioId}, true)`);
      await tx.execute(sql`INSERT INTO "RealEstate" (id,"municipalInsc","propertyType","landArea","builtArea","updatedAt") VALUES ('configured-property','CONFIGURED-1','Terreno',123.456789,0.125,CURRENT_TIMESTAMP),('configured-other-property','CONFIGURED-2','Terreno',0.1,0,CURRENT_TIMESTAMP),('configured-legacy-property','CONFIGURED-LEGACY','Terreno',NULL,NULL,CURRENT_TIMESTAMP)`);
      for (const [id, entityId, governmentEntityId, budgetUnitId, inscription] of [
        ["configured-property-profile", "configured-property", "configured-entity", "configured-ug", "CONFIGURED-1"],
        ["configured-other-property-profile", "configured-other-property", "configured-other-entity", "configured-other-ug", "CONFIGURED-2"],
      ]) await insertConfiguredFiscalEntry(tx, { entityType: "REAL_ESTATE", entityId, category: "PROPERTY_PROFILE", title: "Perfil", version: 1, status: "ATIVO", actorUsuarioId: actor.usuarioId, data: { id, governmentEntityId, budgetUnitId, kind: "Terreno", inscription } });
      await tx.execute(sql`INSERT INTO "EconomicRegistration" (id,"municipalInsc","primaryCnae","taxRegime","taxpayerId","startDate","updatedAt") VALUES ('configured-economic','CONFIGURED-ECONOMIC','1234567','NORMAL','configured-taxpayer','2026-01-01T00:00:00.123',CURRENT_TIMESTAMP)`);
      await insertConfiguredFiscalEntry(tx, { entityType: "ECONOMIC_REGISTRATION", entityId: "configured-economic", category: "ECONOMIC_PROFILE", title: "Perfil econômico", version: 1, status: "ATIVO", actorUsuarioId: actor.usuarioId, data: { governmentEntityId: "configured-entity", budgetUnitId: "configured-ug", companyType: "LTDA", validateCompanyDebt: false, validatePartnerDebts: false, partners: [] } });
    });
    await db.execute(sql`INSERT INTO "ItbiTransactionType" (id,code,name,rate,"updatedAt") VALUES ('configured-itbi-type','CONFIGURED','Compra e venda',0.020001,CURRENT_TIMESTAMP)`);
    for (const [id, number, governmentEntityId, budgetUnitId] of [
      ["configured-itbi", "CONFIGURED-ITBI", "configured-entity", "configured-ug"],
      ["configured-other-itbi", "CONFIGURED-ITBI-OTHER", "configured-other-entity", "configured-other-ug"],
    ]) await db.execute(sql`INSERT INTO "ItbiDeclaration" (id,"declarationNumber","transactionTypeId","realEstateId","processId","transmittedFraction","declaredPropertyValue","taxableBase","appliedRate","taxAmount","calculationSnapshot","createdByUsuarioId","updatedAt") VALUES (${id},${number},'configured-itbi-type','configured-property','configured-process',1.000000,9999999999999999.99,5000.01,0.020001,100.01,${JSON.stringify({ governmentEntityId, budgetUnitId, year: 2026 })}::jsonb,'configured-actor',CURRENT_TIMESTAMP)`);
    return { ...fixture, db, actor, migrationCount };
  } catch (error) { await fixture.close(); throw error; }
}
