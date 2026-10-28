import { config } from "dotenv";
import { auditEventTypes } from "../src/lib/contracts/audit";
import { insertAuditEvent } from "../src/db/repositories/platform/audit";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { and, eq, sql } from "drizzle-orm";
import { users } from "../src/db/schema/identity";
import { employees } from "../src/db/schema/administration";
import { people } from "../src/db/schema/people";
import { families, familyMembers } from "../src/db/schema/master-data";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { socialFamilies, socialProfessionalLinks, socialUnits } from "../src/db/schema/social";

config({ path: ".env.local", quiet: true });
config({ quiet: true });
const apply = process.argv.includes("--apply");
const key = "aurora-social-catalogs-2026-v1";
const decision = "Estrutura socioassistencial exemplificativa autorizada: CRAS, profissional e três famílias unipessoais com pessoas fictícias previamente documentadas. Sem NIS, renda, vulnerabilidade, benefício ou atendimento presumidos.";

async function main() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL não configurada.");
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  try {
    const result = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended(${key}, 0))::text`);
      const [actor] = await tx.select({ id: users.id, ativo: users.ativo }).from(users).where(eq(users.email, "admin@email.com"));
      if (!actor) throw new Error("Administrador autorizado não encontrado.");
      if (!actor.ativo) throw new Error("Administrador autorizado inativo.");
      const binding = (await tx.execute<{ budgetUnitId: string; governmentEntityId: string }>(sql`SELECT "budgetUnitId","governmentEntityId" FROM "PlanningEntityUnit" WHERE "budgetUnitId"='p0-current-exe-ug-1'`)).rows[0];
      if (!binding) throw new Error("Vínculo do Executivo não encontrado.");
      if (binding.governmentEntityId !== "p0-current-exe") throw new Error("Vínculo do Executivo divergente.");
      const unit = (await tx.execute<{ secretariatId: string }>(sql`SELECT "secretariatId" FROM "BudgetUnit" WHERE id=${binding.budgetUnitId}`)).rows[0];
      if (!unit) throw new Error("Unidade orçamentária não encontrada.");
      const [prior] = await tx.select({ id: financialAuditLogs.id }).from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "PREPARE_SOCIAL_CATALOGS"), eq(financialAuditLogs.entityId, key))).limit(1);
      if (!prior) {
        for (let number = 1; number <= 3; number++) {
          const personId = `p1-poc-person-${number}`;
          if (!(await tx.select({ id: people.id }).from(people).where(and(eq(people.id, personId), eq(people.status, "Ativo")))).length) throw new Error("Pessoa fictícia ativa não encontrada.");
          if ((await tx.select({ id: familyMembers.id }).from(familyMembers).where(eq(familyMembers.personId, personId)).limit(1)).length || (await tx.select({ id: socialFamilies.id }).from(socialFamilies).where(eq(socialFamilies.representativeId, personId)).limit(1)).length) throw new Error("Pessoa já possui composição familiar; preserve e concilie o cadastro existente.");
        }
        if (apply) {
          const employeeId = `${key}:employee`;
          const unitId = `${key}:cras`;
          await tx.insert(employees).values({ id: employeeId, name: "Lúcia Monteiro", secretariatId: unit.secretariatId });
          await tx.insert(socialUnits).values({ id: unitId, name: "CRAS Central — Aurora das Veredas", type: "CRAS", managerId: employeeId });
          await tx.insert(socialProfessionalLinks).values({ employeeId, unitId, jobTitle: "Técnica de referência", startsAt: new Date("2026-01-01"), individualScope: "UNIT", familyScope: "UNIT", includeInRma: false });
          for (let number = 1; number <= 3; number++) {
            const personId = `p1-poc-person-${number}`;
            const familyId = `${key}:family:${number}`;
            await tx.insert(families).values({ id: familyId, responsiblePersonId: personId });
            await tx.insert(familyMembers).values({ familyId, personId, kinship: "RESPONSAVEL", isRepresentative: true });
            await tx.insert(socialFamilies).values({ id: `${key}:social-family:${number}`, representativeId: personId, masterFamilyId: familyId });
          }
          await tx.insert(financialAuditLogs).values({ action: "PREPARE_SOCIAL_CATALOGS", entityType: "MUNICIPAL_CONFIGURATION", entityId: key, authorUsuarioId: actor.id, payload: { decision, parameterOrigin: "OWNER_ESTIMATE", unitId, employeeId, families: 3, benefitsCreated: false, attendancesCreated: false } });
          await insertAuditEvent(tx, { actorUsuarioId: actor.id, eventType: auditEventTypes.instanceConfigurationChanged, targetType: "SOCIAL_CATALOGS", targetId: key });
        }
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", replay: Boolean(prior), unitId: `${key}:cras`, families: 3, decision };
    }, { timeoutMs: 60000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}

main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na preparação socioassistencial."); process.exitCode = 1; });
