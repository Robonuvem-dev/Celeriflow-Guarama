import { sql } from "drizzle-orm";
import { readFile } from "node:fs/promises";
import type { DatabaseExecutor } from "../../src/db/transaction";

/** Persist the administrators already represented by the payroll fixture contexts. */
export async function preparePersonnelFinanceIdentity(db: DatabaseExecutor) {
  await db.execute(sql.raw(await readFile(new URL("../../db/migrations/20261030120600_user_additional_profiles/migration.sql", import.meta.url), "utf8")));
  await db.execute(sql`INSERT INTO "ConfiguracaoPerfil" (id,codigo,nome,permissoes,"updatedAt") VALUES ('rh-finance-admin','SYSTEM_ADMINISTRATOR','Administrador','{"acesso":"total"}',NOW())`);
  await db.execute(sql`UPDATE "Usuario" SET "firebaseUid"='rh-finance-'||id,"perfilId"='rh-finance-admin',ativo=true WHERE id IN ('ana','beatriz')`);
}
