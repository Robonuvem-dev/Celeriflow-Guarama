import { readFile, readdir } from "node:fs/promises";
import { eq, sql, type SQL } from "drizzle-orm";
import type { DatabaseExecutor } from "../../src/db/transaction";
import type { JsonValue } from "../../src/db/json";
import { taxRegistryEntries } from "../../src/db/schema/taxation-registry";
import { planningCatalogEntries, planningCatalogVersions } from "../../src/db/schema/planning-catalog";
import type { PlanningContext } from "../../src/lib/planejamento/access";
import type { TaxActor } from "../../src/lib/tributacao";
import { createLocalDrizzleDatabase } from "./local-drizzle-database";

export function firstTaxRow<T>(rows: T[]): T {
  const row = rows[0];
  if (row === undefined) throw new Error("Registro esperado ausente na fixture tributária.");
  return row;
}

/** Direct SQL assertion reader. Identifiers and predicates are separate from values. */
export async function countTaxRows(database: DatabaseExecutor, table: string, predicate: SQL = sql`true`): Promise<number> {
  const result = await database.execute<{ total: number }>(sql`SELECT count(*)::int AS total FROM ${sql.identifier(table)} WHERE ${predicate}`);
  return firstTaxRow(result.rows).total;
}

export async function readTaxChainRecord<T extends Record<string, unknown>>(database: DatabaseExecutor, query: SQL) {
  return firstTaxRow((await database.execute<T>(query)).rows);
}

export async function readTaxChainRegistry(database: DatabaseExecutor, predicate: SQL) {
  return firstTaxRow(await database.select().from(taxRegistryEntries).where(predicate).limit(1));
}

export function taxChainObject(value: JsonValue | null | undefined): { [key: string]: JsonValue } {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Objeto JSON esperado na memória tributária.");
  return value;
}

/** Drizzle retains PostgreSQL trigger messages in Error.cause. The expected
 * message must occur in that causal chain; an unrelated rejection cannot pass. */
export function taxChainDatabaseFailure(pattern: RegExp): (error: unknown) => boolean {
  return (error: unknown): boolean => error instanceof Error && (pattern.test(error.message) || taxChainDatabaseFailure(pattern)(error.cause));
}

/** Independent historical DDL and explicit municipal seed. Await close() before
 * opening another fixture: the shared Neon transport settings are process-wide. */
export async function createTaxChainDatabase(jurisdiction: "EXECUTIVE" | "LEGISLATIVE" = "EXECUTIVE") {
  const local = await createLocalDrizzleDatabase();
  try {
    const migrations = (await readdir("prisma/migrations-ibema", { withFileTypes: true }))
      .filter(entry => entry.isDirectory()).map(entry => entry.name).sort();
    for (const migration of migrations) {
      await local.database.exec(await readFile(`prisma/migrations-ibema/${migration}/migration.sql`, "utf8"));
    }
    const db = local.connection.db;
    await local.database.exec(`
      INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('chain-profile','SYSTEM_ADMINISTRATOR','Administrador da fixture','{}',CURRENT_TIMESTAMP);
      INSERT INTO "Employee" (id,name,"isActive","updatedAt") VALUES ('servidora-ana','Ana Paula Martins',true,CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","employeeId","firebaseUid","updatedAt") VALUES ('ana','Ana Paula Martins','ana.martins@example.org','chain-profile','servidora-ana','chain-ana',CURRENT_TIMESTAMP);
      INSERT INTO "Usuario" (id,nome,email,"perfilId","updatedAt") VALUES ('beatriz','Beatriz Oliveira Santos','beatriz.santos@example.org','chain-profile',CURRENT_TIMESTAMP);
      INSERT INTO "Secretariat" (id,name,"updatedAt") VALUES ('secretaria','Administração Municipal',CURRENT_TIMESTAMP);
      INSERT INTO "BudgetUnit" (id,code,name,"secretariatId","updatedAt") VALUES ('ug','01.01','Unidade Municipal','secretaria',CURRENT_TIMESTAMP),('ug-restrita','02.01','Unidade de Obras','secretaria',CURRENT_TIMESTAMP);
      INSERT INTO "ResourceSource" (id,code,name,"updatedAt") VALUES ('livre','000','Recursos ordinários',CURRENT_TIMESTAMP),('vinculada','303','Recursos vinculados',CURRENT_TIMESTAMP);
      INSERT INTO "RevenueNature" (id,code,name,"updatedAt") VALUES ('receita','1.7.1.1.51','Transferências da União',CURRENT_TIMESTAMP);
      INSERT INTO "ExpenseNature" (id,code,name,"updatedAt") VALUES ('despesa','3.3.90.39','Serviços de terceiros',CURRENT_TIMESTAMP);
      INSERT INTO "Company" (id,"corporateName",cnpj,"updatedAt") VALUES ('empresa','Araucárias Serviços Municipais Ltda.','11222333000181',CURRENT_TIMESTAMP);
      INSERT INTO "Supplier" (id,"companyId",status,"updatedAt") VALUES ('fornecedor','empresa','Ativo',CURRENT_TIMESTAMP);
      INSERT INTO "AccountingPlan" (id,code,name,type,"updatedAt") VALUES ('debito','ISOLATED.D','Conta de débito da fixture isolada','Ativo',CURRENT_TIMESTAMP),('credito','ISOLATED.C','Conta de crédito da fixture isolada','Passivo',CURRENT_TIMESTAMP);
      INSERT INTO "Document" (id,title,"documentType","fileUrl",status,"updatedAt") VALUES ('documento-fiscal','Documento fiscal municipal','FISCAL','https://arquivos.example.org/fiscal.pdf','Válido',CURRENT_TIMESTAMP);
      INSERT INTO "BankAccount" (id,"bankName",agency,"accountNumber","accountType","resourceSourceId","budgetUnitId","accountingPlanId","currentBalance","currentBalanceDecimal","isActive","updatedAt") VALUES ('banco','Banco Municipal','0001','1000-1','Corrente','livre','ug','debito',0,0,true,CURRENT_TIMESTAMP);
      INSERT INTO "UsuarioUnidadeGestora" (id,"usuarioId","budgetUnitId") VALUES ('chain-ana-unit','ana','ug');
    `);
    await db.execute(sql`INSERT INTO "GovernmentEntity" (id,code,name,type,status,"updatedAt") VALUES ('ente','VA','Vila das Araucárias',${jurisdiction === "EXECUTIVE" ? "PREFEITURA" : "CAMARA"},'ATIVA',CURRENT_TIMESTAMP)`);
    await db.execute(sql`INSERT INTO "PlanningEntityScope" ("governmentEntityId",jurisdiction) VALUES ('ente',${jurisdiction})`);
    await local.database.exec(`
      INSERT INTO "PlanningEntityUnit" ("budgetUnitId","governmentEntityId") VALUES ('ug','ente'),('ug-restrita','ente');
      INSERT INTO "FinancialYear" (id,year,"governmentEntityId",status,"startDate","endDate","updatedAt") VALUES ('ano',2026,'ente','Aberto','2026-01-01','2026-12-31T23:59:59.999',CURRENT_TIMESTAMP);
    `);
    await db.insert(planningCatalogVersions).values({ id: "chain-account-catalog", year: 2026, label: "Contas da cadeia tributária isolada", normativeReference: "Matriz explícita da fixture histórica", sourceHash: "chain-account-catalog-v1", status: "DRAFT", createdById: "ana" });
    await db.insert(planningCatalogEntries).values(["debito", "credito"].map((id, index) => ({ versionId: "chain-account-catalog", kind: "ACCOUNT", degree: 7, code: index ? "ISOLATED.C" : "ISOLATED.D", name: id, canonicalId: id, attributes: { operational: true, pocOnly: false, postingAllowed: true, informationNature: "P", balanceNature: index ? "C" : "D", effectiveFrom: "2026-01-01", effectiveUntil: "2026-12-31" } })));
    await db.update(planningCatalogVersions).set({ status: "PUBLISHED" }).where(eq(planningCatalogVersions.id, "chain-account-catalog"));
    for (const code of ["TAX_COLLECTION_EXCESS", "TAX_CREDIT_REFUNDED", "TAX_CREDIT_COMPENSATED", "EMPENHO_EMITIDO", "LIQUIDACAO_REGISTRADA", "PAGAMENTO_EFETIVADO", "PAGAMENTO_ESTORNADO", "RECEITA_LANCADA", "RECEITA_ARRECADADA", "RECEITA_ESTORNADA", "RECEITA_REDISTRIBUIDA_FONTE"]) {
      await db.execute(sql`INSERT INTO "AccountingEventCatalog" (id,code,name,"updatedAt") VALUES (${code},${code},${code},CURRENT_TIMESTAMP)`);
      const debit = code === "TAX_COLLECTION_EXCESS" || !code.startsWith("TAX_") ? "debito" : "credito";
      await db.execute(sql`INSERT INTO "AccountingPostingRule" (id,"eventId","debitAccountId","creditAccountId","isReference","updatedAt") VALUES (${`rule:${code}`},${code},${debit},${debit === "debito" ? "credito" : "debito"},false,CURRENT_TIMESTAMP)`);
    }
    const actor: TaxActor = { usuarioId: "ana", employeeId: "servidora-ana", allowedBudgetUnitIds: ["ug"] };
    const context: PlanningContext = {
      database: db, connection: local.connection, jurisdiction,
      user: { id: "ana", firebaseUid: "chain-ana", email: "ana.martins@example.org", name: "Ana Paula Martins", role: "Administrador da fixture", profileCode: "SYSTEM_ADMINISTRATOR", permissions: "{}", modulePermissions: [], allowedBudgetUnitIds: ["ug"], employeeId: "servidora-ana", departmentId: null, secretariatId: null },
    };
    return { ...local, db, actor, context, year: 2026 };
  } catch (error) { await local.close(); throw error; }
}
