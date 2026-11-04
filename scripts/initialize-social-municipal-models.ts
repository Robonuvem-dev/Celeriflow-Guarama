import { config } from "dotenv";
import { and, eq, sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { users } from "../src/db/schema/identity";
import { socialUnits } from "../src/db/schema/social";
import { socialFollowups } from "../src/db/schema/social-workflows";
import * as m from "../src/db/schema/social-operation-models";
import { saveSocialWorkflow } from "../src/db/repositories/social/workflow-operations";
import { defaultImportLayout, defaultMunicipalParameters } from "../src/lib/social/municipal-contract";

config({ path: ".env.local", quiet: true });
async function main() {
  if (!process.argv.includes("--apply")) { console.log("Inicializa parâmetros e layout; deriva prontuários e relatórios em elaboração exclusivamente dos acompanhamentos existentes. Use --apply."); return; }
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL ausente.");
  const connection = createDatabaseConnection(process.env.DATABASE_URL);
  try {
    const result = await withDatabaseTransaction(connection, async tx => {
      await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtextextended('social-municipal-initialization',0))`);
      const [actor] = await tx.select().from(users).where(and(eq(users.email, process.env.SYSTEM_ADMIN_EMAIL || "admin@email.com"), eq(users.ativo, true)));
      if (!actor) throw new Error("Administrador ativo não encontrado.");
      const access = { administrator: true, userId: actor.id, employeeId: null, links: [] };
      const save = (area: "parametros" | "layouts" | "prontuarios" | "mensal", values: Record<string, string>) => saveSocialWorkflow(tx, access, area, undefined, values);
      if (!(await tx.select().from(m.socialMunicipalSettings)).length) await save("parametros", { ...Object.fromEntries(Object.entries(defaultMunicipalParameters).map(([key, value]) => [key, Array.isArray(value) ? JSON.stringify(value) : String(value)])), revision: "0" });
      if (!(await tx.select().from(m.socialImportLayouts).where(and(eq(m.socialImportLayouts.name, "Cadastro familiar municipal"), eq(m.socialImportLayouts.isActive, true)))).length) await save("layouts", { name: "Cadastro familiar municipal", version: "1.0", delimiter: "AUTO", dateFormat: "ISO", encoding: "utf-8", mapping: JSON.stringify(defaultImportLayout.mapping) });
      const units = await tx.select().from(socialUnits).where(eq(socialUnits.isActive, true));
      const followups = await tx.select().from(socialFollowups).where(eq(socialFollowups.status, "ACTIVE"));
      let cases = 0, statements = 0;
      for (const followup of followups) {
        const unit = units.find(unit => unit.id === followup.unitId); if (!unit) continue;
        const [existing] = await tx.select().from(m.socialCaseFiles).where(and(eq(m.socialCaseFiles.unitId, unit.id), eq(m.socialCaseFiles.status, "ACTIVE"), followup.familyId ? eq(m.socialCaseFiles.familyId, followup.familyId) : eq(m.socialCaseFiles.personId, followup.personId!)));
        if (existing) continue;
        await save("prontuarios", { unitId: unit.id, familyId: followup.familyId || "", personId: followup.personId || "", professionalId: followup.professionalId, receivedAt: followup.startsAt, enteredVia: "Registro de acompanhamento", initialDemand: followup.diagnosis, diagnosis: followup.diagnosis, objectives: followup.objectives, plannedActions: followup.actions, reviewAt: followup.reviewAt || "", secrecyLevel: unit.type === "CREAS" ? "CREAS" : "Normal", status: "ACTIVE" });
        cases++;
      }
      const competence = new Date().toISOString().slice(0, 7);
      for (const unit of units.filter(unit => ["CRAS", "CREAS"].includes(unit.type))) {
        if ((await tx.select().from(m.socialMonthlyStatements).where(and(eq(m.socialMonthlyStatements.unitId, unit.id), eq(m.socialMonthlyStatements.competence, competence)))).length) continue;
        const reference = followups.find(followup => followup.unitId === unit.id); if (!reference) continue;
        await save("mensal", { unitId: unit.id, professionalId: reference.professionalId, competence, declaredValues: "{}", status: "DRAFT", observations: "Apuração dos registros municipais. Indicadores sem fonte automática permanecem não informados até a conferência da unidade." });
        statements++;
      }
      return { casesCreated: cases, statementsCreated: statements };
    }, { timeoutMs: 120000 });
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na inicialização municipal."); process.exitCode = 1; });
