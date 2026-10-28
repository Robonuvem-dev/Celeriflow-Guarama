import { config } from "dotenv";
import { createHash } from "node:crypto";
import { asc, eq, inArray } from "drizzle-orm";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import * as t from "../src/db/schema/municipal-setup-tools";
import { firstMunicipalActor, lockMunicipal, openMunicipalSetupConnection } from "./lib/municipal-setup-tools";
import { publishGenericWorkflowDefinition } from "../src/lib/protocols/generic-workflow-definition-service";

config({ path: ".env.local", quiet: true });
const apply = process.argv.includes("--apply");
const decision = "Aurora das Veredas — roteiro inicial estimado de viagens: revisão RH e liberação Financeiro, três dias corridos por etapa; ajustável por nova versão publicada.";
const hash = createHash("sha256").update(decision).digest("hex");

export async function adoptTravelWorkflows(connection: DatabaseConnection, apply = false) {
    return withDatabaseTransaction(connection, async tx => {
      await lockMunicipal(tx, "AURORA:DIARIAS:ROTEIROS:2026:v1");
      const units = await tx.select({ budgetUnitId: t.bindings.budgetUnitId, governmentEntityId: t.bindings.governmentEntityId, governmentEntity: t.entities, budgetUnit: t.units }).from(t.bindings).innerJoin(t.entities, eq(t.entities.id, t.bindings.governmentEntityId)).innerJoin(t.units, eq(t.units.id, t.bindings.budgetUnitId)).where(inArray(t.entities.code, ["AURORA-EXEC", "AURORA-LEG"])).orderBy(asc(t.bindings.budgetUnitId));
      if (!units.length) throw new Error("Identidades municipais devem estar configuradas antes dos roteiros.");
      const actor = await firstMunicipalActor(tx);
      const rows = [];
      for (const unit of units.filter((row, index) => units.findIndex(candidate => candidate.governmentEntityId === row.governmentEntityId) === index)) {
        const prefix = `aurora-travel-workflow:${unit.governmentEntityId}`;
        const definitionId = `${prefix}:v1`;
        const departments = [`${prefix}:rh`, `${prefix}:finance`];
        const [definition] = await tx.select().from(t.workflows).where(eq(t.workflows.id, definitionId)).limit(1);
        const existing = definition ? { ...definition, stages: await tx.select().from(t.stages).where(eq(t.stages.definitionId, definitionId)).orderBy(asc(t.stages.position)) } : null;
        if (existing && (existing.status !== "PUBLISHED" || existing.version !== 1 || existing.stages.length !== 2 || existing.stages.some((stage, index) => stage.departmentId !== departments[index] || stage.slaCalendarDays !== 3))) throw new Error(`Roteiro inicial divergente ${definitionId}; preservar e revisar em nova versão.`);
        if (apply && !existing) {
          for (const [index, id] of departments.entries()) await tx.insert(t.departments).values({ id, name: `${unit.governmentEntity.name} — ${index === 0 ? "Revisão de viagens RH" : "Liberação financeira de viagens"}`, secretariatId: unit.budgetUnit.secretariatId, isActive: true });
          await tx.insert(t.processTypes).values({ id: prefix, name: `${unit.governmentEntity.name} — viagens municipais`, genericWorkflowEnabled: true, requiresInterested: true, description: decision });
          await tx.insert(t.subjects).values({ processTypeId: prefix, id: `${prefix}:subject`, name: "Diária municipal", requiresInterested: true });
          await tx.insert(t.workflows).values({ id: definitionId, processTypeId: prefix, version: 1 });
          await tx.insert(t.stages).values(departments.map((departmentId, index) => ({ definitionId, position: index + 1, departmentId, label: index === 0 ? "Revisão RH" : "Autorização e empenho", slaCalendarDays: 3 })));
          await publishGenericWorkflowDefinition(tx, definitionId, actor.id);
          await tx.insert(t.audits).values({ action: "ADOPT_MUNICIPAL_TRAVEL_WORKFLOW", entityType: "GenericProcessWorkflowDefinition", entityId: definitionId, authorUsuarioId: actor.id, payload: { hash, decision, governmentEntityId: unit.governmentEntityId, budgetUnitId: unit.budgetUnitId } });
        }
        rows.push({ budgetUnitIds: units.filter(row => row.governmentEntityId === unit.governmentEntityId).map(row => row.budgetUnitId), governmentEntityId: unit.governmentEntityId, processTypeId: prefix, subjectId: `${prefix}:subject`, definitionId });
      }
      return { mode: apply ? "ADDITIVE_IDEMPOTENT" : "READ_ONLY", hash, decision, rows };
    }, { timeoutMs: 60000 });
}
async function main() {
  const connection = openMunicipalSetupConnection();
  try { console.log(JSON.stringify(await adoptTravelWorkflows(connection, apply), null, 2)); }
  finally { await connection.pool.end(); }
}
if (require.main === module) main().catch(error => { console.error(error); process.exitCode = 1; });
