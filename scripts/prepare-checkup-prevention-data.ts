/** Planned administrative prevention examples, recorded through the canonical audited service. */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdirSync, writeFileSync } from "node:fs";
import { sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import type { AppContext } from "../src/lib/platform/tenant-context";
import { createPrevention } from "../src/lib/sst/prevention-service";
import type { PreventionPayload } from "../src/lib/sst/prevention-policy";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const packageId = "CHECKUP_PREVENCAO_2026_V1";
const apply = process.argv.includes("--apply");
const rollback = new Error("CHECKUP_PREVIEW_ROLLBACK");
function requestKey(key: string) {
  const hash = createHash("sha256").update(`${packageId}:${key}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}
async function main() {
  const connection = databaseConnection;
  const report = { packageId, mode: apply ? "APPLIED" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), changes: [] as { table: string; id: string; title: string; kind: string }[] };
  try {
    const [actor] = (await connection.db.execute<{ firebaseUid: string }>(sql`SELECT "firebaseUid" FROM "Usuario" WHERE id='cmvba36v700007kqmdslbwhkk' AND ativo`)).rows;
    assert.ok(actor?.firebaseUid);
    const identity = await findIdentityByFirebaseUid(connection.db, actor.firebaseUid);
    assert.ok(identity?.ativo && identity.perfil.codigo === "SYSTEM_ADMINISTRATOR");
    const context: AppContext = { database: connection.db, user: { id: identity.id, firebaseUid: actor.firebaseUid, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo, permissions: identity.perfil.permissoes, modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null } };
    try {
      await withDatabaseTransaction(connection, async tx => inDatabaseTransactionScope(connection, tx, async () => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId}))`);
        const budgetUnitId = "aurora-system-v1:budget-unit:000", personId = "THIAGO_MORCATTY_DEMO_2026_V1:person";
        assert.equal((await tx.execute(sql`SELECT e.id FROM "Employee" e JOIN "Person" p ON p.id=e."personId" JOIN "BudgetUnit" u ON u."secretariatId"=e."secretariatId" WHERE e.id='THIAGO_MORCATTY_DEMO_2026_V1:employee' AND e."personId"=${personId} AND e."isActive" AND p.status='Ativo' AND u.id=${budgetUnitId}`)).rows.length, 1);
        const samples: { key: string; title: string; payload: PreventionPayload }[] = [
          { key: "sipat", title: "Semana de orientação sobre organização e bem-estar no trabalho", payload: {
            kind: "SIPAT", startsAt: "2026-11-23T08:00:00-03:00", endsAt: "2026-11-27T17:00:00-03:00", organizerPersonIds: [personId], activities: [
              { title: "Organização do posto de trabalho e uso dos recursos de TI", location: "Centro Administrativo — sala de capacitação", at: "2026-11-24T09:00:00-03:00", cost: "0.00", responsiblePersonIds: [personId] },
              { title: "Rotina de pausas e canais de orientação ocupacional", location: "Centro Administrativo — sala de capacitação", at: "2026-11-26T10:00:00-03:00", cost: "0.00", responsiblePersonIds: [personId] },
            ],
          } },
          { key: "visit", title: "Visita técnica programada aos postos de atendimento administrativo", payload: {
            kind: "VISIT", type: "Orientação preventiva", at: "2026-11-19T10:00:00-03:00", location: "Centro Administrativo — recepção e sala de suporte", responsiblePersonId: personId,
            details: "Visita programada para levantamento das condições de organização do espaço, circulação e identificação dos equipamentos. Atividade ainda não realizada; recomendações e encaminhamentos serão registrados após a visita.",
          } },
        ];
        for (const sample of samples) {
          const submissionKey = requestKey(sample.key);
          const existing = (await tx.execute<{ id: string }>(sql`SELECT id FROM "SstPreventionRecord" WHERE "createdById"=${identity.id} AND "submissionKey"=${submissionKey}`)).rows;
          const id = await createPrevention(context, { budgetUnitId, title: sample.title, payload: sample.payload, submissionKey }, connection);
          assert.equal((await tx.execute(sql`SELECT id FROM "SstPreventionRecord" WHERE id=${id} AND clinical=false`)).rows.length, 1);
          if (!existing.length) report.changes.push({ table: "SstPreventionRecord", id, title: sample.title, kind: sample.payload.kind });
        }
        if (!apply) throw rollback;
      }));
    } catch (error) { if (error !== rollback) throw error; }
    mkdirSync("docs/checkup/demonstration-data", { recursive: true });
    writeFileSync(`docs/checkup/demonstration-data/prevention-${apply ? "applied" : "preview"}-${Date.now()}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
