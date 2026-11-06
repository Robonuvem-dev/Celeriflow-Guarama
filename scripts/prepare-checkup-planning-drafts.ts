/** Draft-only planning examples through audited domain services; rollback preview by default. */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import type { PlanningContext } from "../src/lib/planejamento/access";
import { createPlanningInstrument } from "../src/lib/planejamento/service";
import { registerCommunityDemand, registerPlanningHearing } from "../src/lib/planejamento/hearings";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const packageId = "CHECKUP_PLANEJAMENTO_MINUTAS_2026_V1";
const apply = process.argv.includes("--apply");
const rollback = new Error("CHECKUP_PREVIEW_ROLLBACK");
async function main() {
  const connection = databaseConnection;
  const report = { packageId, mode: apply ? "APPLIED" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), references: {} as Record<string, string>, changes: [] as { table: string; id: string; state: string }[] };
  try {
    const [actor] = (await connection.db.execute<{ firebaseUid: string }>(sql`SELECT "firebaseUid" FROM "Usuario" WHERE id='cmvba36v700007kqmdslbwhkk' AND ativo`)).rows;
    assert.ok(actor?.firebaseUid);
    const identity = await findIdentityByFirebaseUid(connection.db, actor.firebaseUid);
    assert.ok(identity?.ativo && identity.perfil.codigo === "SYSTEM_ADMINISTRATOR");
    const context: PlanningContext = { jurisdiction: "EXECUTIVE", database: connection.db, user: { id: identity.id, firebaseUid: actor.firebaseUid, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo, permissions: identity.perfil.permissoes, modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null } };
    try {
      await withDatabaseTransaction(connection, async tx => inDatabaseTransactionScope(connection, tx, async () => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId}))`);
        const parentId = "aurora-system-v1:ppa-instrument:000", governmentEntityId = "p0-current-exe";
        assert.equal((await tx.execute(sql`SELECT i.id FROM "PlanningInstrument" i JOIN "MultiYearPlan" p ON p.id=i."multiYearPlanId" WHERE i.id=${parentId} AND i.kind='PPA' AND i."governmentEntityId"=${governmentEntityId} AND i."startYear"=2026 AND i."endYear"=2029 AND p.status='DRAFT'`)).rows.length, 1);
        let chainParent = parentId;
        for (const kind of ["LDO", "LOA"] as const) {
          const code = `MINUTA-${kind}-2026-01`;
          const [existing] = (await tx.execute<{ id: string; parentId: string; status: string }>(sql`SELECT i.id,i."parentId",coalesce(g.status,l.status) AS status FROM "PlanningInstrument" i LEFT JOIN "BudgetGuideline" g ON g.id=i."budgetGuidelineId" LEFT JOIN "AnnualBudgetLaw" l ON l.id=i."annualBudgetLawId" WHERE i."governmentEntityId"=${governmentEntityId} AND i.kind=${kind} AND i.code=${code}`)).rows;
          let id: string;
          if (existing) { assert.equal(existing.parentId, chainParent); assert.equal(existing.status, "DRAFT"); id = existing.id; }
          else {
            id = await createPlanningInstrument(context, {
              governmentEntityId, kind, code, title: kind === "LDO" ? "Minuta de diretrizes orçamentárias 2026" : "Minuta da programação orçamentária anual 2026",
              startYear: 2026, endYear: 2026, revenueDegree: 6, expenseDegree: 6, expenseLevel: "ELEMENT_SOURCE", parentId: chainParent,
              legalText: "Minuta para elaboração no ambiente municipal fictício. Conteúdo sujeito à composição das previsões e metas e posterior análise. Sem aprovação, sanção, publicação ou vigência legal.",
            });
            report.changes.push({ table: "PlanningInstrument", id, state: "DRAFT" });
          }
          report.references[kind] = id;
          chainParent = id;
        }
        const title = "Audiência programada: prioridades de atendimento e modernização administrativa";
        const [existingHearing] = (await tx.execute<{ id: string }>(sql`SELECT id FROM "PlanningHearing" WHERE "instrumentId"=${parentId} AND title=${title}`)).rows;
        const hearingId = existingHearing?.id ?? await registerPlanningHearing(context, { instrumentId: parentId, title, heldAt: new Date("2026-11-26T14:00:00-03:00"), location: "Centro Administrativo — sala de reuniões" });
        report.references.hearing = hearingId;
        if (!existingHearing) report.changes.push({ table: "PlanningHearing", id: hearingId, state: "PLANNED" });
        const [requester] = (await tx.execute<{ fullName: string; email: string }>(sql`SELECT "fullName",email FROM "Person" WHERE id='aurora-system-v1:person:000' AND status='Ativo'`)).rows;
        assert.ok(requester?.email?.endsWith("@example.com"));
        const request = "Melhoria da sinalização dos serviços e ampliação dos canais digitais de atendimento ao cidadão.";
        const [existingDemand] = (await tx.execute<{ id: string }>(sql`SELECT id FROM "PlanningCommunityDemand" WHERE "hearingId"=${hearingId} AND "requesterName"=${requester.fullName} AND request=${request}`)).rows;
        const demandId = existingDemand?.id ?? await registerCommunityDemand(context, { hearingId, requesterName: requester.fullName, email: requester.email, neighborhood: "Centro", request, responsibleUnitId: "aurora-system-v1:budget-unit:000" });
        report.references.demand = demandId;
        if (!existingDemand) report.changes.push({ table: "PlanningCommunityDemand", id: demandId, state: "PENDING" });
        if (!apply) throw rollback;
      }));
    } catch (error) { if (error !== rollback) throw error; }
    mkdirSync("docs/checkup/demonstration-data", { recursive: true });
    writeFileSync(`docs/checkup/demonstration-data/planning-drafts-${apply ? "applied" : "preview"}-${Date.now()}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
