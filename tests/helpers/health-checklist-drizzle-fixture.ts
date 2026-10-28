import { readFile, readdir } from "node:fs/promises";
import type { PermissionUser } from "../../src/lib/contracts/identity";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

/** Exclusive checklist database. Every historical constraint/trigger is installed;
 * all runtime reads, writers and transaction participants use this connection. */
export async function createHealthChecklistDrizzleFixture() {
  const fixture = await createLocalDrizzleDatabase();
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true })).filter(e => e.isDirectory()).map(e => e.name).sort();
    if (migrations.length !== 156) throw new Error(`Checklist exige 156 históricos, encontrados ${migrations.length}.`);
    for (const name of migrations) {
      try { await fixture.database.exec(await readFile(`prisma/migrations-ibema/${name}/migration.sql`, "utf8")); }
      catch (cause) { throw new Error(`Checklist histórico: ${name}`, { cause }); }
    }
    await fixture.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('checklist-admin','SYSTEM_ADMINISTRATOR','Administrador checklist','{}',now());
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretaria','Administração Municipal',now());
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','01.01','Unidade Municipal','secretaria',now()),('tfd-budget-unit','01.02','Transporte sanitário','secretaria',now());
      INSERT INTO "Department" (id,name,"secretariatId","updatedAt") VALUES ('pharmacy-department','Farmácia','secretaria',now()),('tfd-department','Transporte sanitário','secretaria',now());
      INSERT INTO "Employee" (id,name,"isActive","updatedAt") VALUES ('servidora-ana','Ana Paula Martins',true,now());
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","updatedAt") VALUES ('ana','Ana Paula Martins','ana.martins@example.org','checklist-admin','servidora-ana',now()),('beatriz','Beatriz Oliveira Santos','beatriz.santos@example.org','checklist-admin',null,now()),('tfd-second-operator','Segundo operador','checklist-tfd@example.org','checklist-admin',null,now());
      INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('empresa','Araucárias Serviços Municipais Ltda.','11222333000181',now());
      INSERT INTO "Supplier" (id,"companyId",status,"updatedAt") VALUES ('fornecedor','empresa','Ativo',now());
      INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"updatedAt") VALUES ('documento-fiscal','Documento fiscal municipal','FISCAL','https://arquivos.example.org/fiscal.pdf','Válido',now());
      INSERT INTO "ProcessType" (id,name,"updatedAt") VALUES ('fixture-type','Processo da checklist',now());
      INSERT INTO "Subject" (id,name,"processTypeId","updatedAt") VALUES ('fixture-subject','Assunto da checklist','fixture-type',now());
      INSERT INTO "FleetUnit" (id,code,name,category,"departmentId","createdById","updatedAt") VALUES ('fixture-fleet','CHECKLIST-FLEET','Transporte da checklist','VEICULO','tfd-department','ana',now());
      INSERT INTO "Institution" (id,name,city,state,"updatedAt") VALUES ('checklist-institution','Município de teste','Ibema','PR',now());
      INSERT INTO "ConfiguracaoInstancia" (id,"nomePrefeitura",municipio,uf,"updatedAt") VALUES ('health-instance','Prefeitura de teste','Ibema','PR',now());
      INSERT INTO "HealthSusImportBatch" (id,source,competence,origin,"fileName","fileFormat","contractVersion",checksum,"actorUsuarioId") VALUES ('fixture','SIGTAP','2026-01','Checklist isolada','fixture.txt','TXT','v1','checklist-fixture','ana');
    `);
    const user: PermissionUser = { id: "ana", firebaseUid: "checklist-ana", email: "ana.martins@example.org", name: "Ana Paula Martins", role: "Administrador", profileCode: "SYSTEM_ADMINISTRATOR", modulePermissions: [], allowedBudgetUnitIds: ["ug"], employeeId: "servidora-ana", departmentId: null, secretariatId: null, hasHealthAccessScope: false };
    return { ...fixture, context: { user, database: fixture.connection.db, databaseConnection: fixture.connection, connection: fixture.connection }, migrationCount: migrations.length };
  } catch (error) { await fixture.close(); throw error; }
}
