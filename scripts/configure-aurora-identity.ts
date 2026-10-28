import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { governmentEntities } from "../src/db/schema/master-data";
import { secretariats } from "../src/db/schema/administration";
import { accessProfiles, users } from "../src/db/schema/identity";
import { financialAuditLogs } from "../src/db/schema/finance-identity";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const definitions = [
  { id: "p0-current-exe", type: "PREFEITURA", previousCode: "POC-P0-EXE", code: "AURORA-EXEC", previousName: "POC P0 — Prefeitura (ensaio)", name: "Prefeitura Municipal de Aurora das Veredas", secretariatId: "p0-current-secretariat-exe", previousSecretariat: "POC P0 — Administração exe", secretariat: "Secretaria Municipal de Administração" },
  { id: "p0-current-leg", type: "CAMARA", previousCode: "POC-P0-LEG", code: "AURORA-LEG", previousName: "POC P0 — Câmara (ensaio)", name: "Câmara Municipal de Aurora das Veredas", secretariatId: "p0-current-secretariat-leg", previousSecretariat: "POC P0 — Administração leg", secretariat: "Diretoria Administrativa da Câmara Municipal" },
];

async function main() {
  try {
    const report = await withDatabaseTransaction(databaseConnection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('AURORA_MUNICIPAL_IDENTITY_V1', 0))::text`);
      const [actor] = apply ? await tx.select({ id: users.id }).from(users).innerJoin(accessProfiles, eq(users.perfilId, accessProfiles.id)).where(and(eq(users.ativo, true), eq(accessProfiles.codigo, "SYSTEM_ADMINISTRATOR"))).limit(1) : [];
      if (apply && !actor) throw new Error("Administrador ativo não encontrado para configurar a identidade municipal.");
      const changes = [];
      for (const definition of definitions) {
        const [entity] = await tx.select().from(governmentEntities).where(eq(governmentEntities.id, definition.id)).limit(1);
        const [secretariat] = await tx.select().from(secretariats).where(eq(secretariats.id, definition.secretariatId)).limit(1);
        if (!entity || !secretariat) throw new Error(`Entidade ou secretaria não encontrada para ${definition.id}.`);
        if (entity.type !== definition.type || ![definition.previousCode, definition.code].includes(entity.code) || ![definition.previousName, definition.name].includes(entity.name) || ![definition.previousSecretariat, definition.secretariat].includes(secretariat.name)) throw new Error(`Identidade alterada para ${definition.id}; preservar a configuração e conciliar antes da adoção.`);
        const changed = entity.code !== definition.code || entity.name !== definition.name || secretariat.name !== definition.secretariat;
        if (apply && changed) {
          await tx.update(governmentEntities).set({ code: definition.code, name: definition.name }).where(eq(governmentEntities.id, entity.id));
          await tx.update(secretariats).set({ name: definition.secretariat }).where(eq(secretariats.id, secretariat.id));
          await tx.insert(financialAuditLogs).values({ action: "CONFIGURE_MUNICIPAL_IDENTITY", entityType: "GovernmentEntity", entityId: entity.id, authorUsuarioId: actor!.id, payload: { municipality: "Aurora das Veredas", source: "OWNER_CONFIGURATION", before: { code: entity.code, name: entity.name, secretariatId: secretariat.id, secretariatName: secretariat.name }, after: { code: definition.code, name: definition.name, secretariatName: definition.secretariat }, preservedEntityId: entity.id } });
        }
        changes.push({ id: entity.id, code: definition.code, name: definition.name, secretariatId: secretariat.id, secretariatName: definition.secretariat, changed });
      }
      return { mode: apply ? "APPLIED" : "READ_ONLY", entities: changes };
    }, { timeoutMs: 60000 });
    console.log(JSON.stringify(report, null, 2));
  } finally { await databaseConnection.pool.end(); }
}

main().catch((error: unknown) => { console.error(error); process.exitCode = 1; });
