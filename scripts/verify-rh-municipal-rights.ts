import "dotenv/config";
import assert from "node:assert/strict";
import { readFile, writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import { processAutomaticRights } from "../src/lib/rh/automatic-rights-processing";
import { runAutomaticRightsSchedule } from "../src/lib/rh/automatic-rights-scheduler";
import type { AppContext } from "../src/lib/platform/tenant-context";

async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  try {
    const [actor] = (await connection.db.execute<{ id: string; firebaseUid: string }>(sql`SELECT u.id,u."firebaseUid" FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.ativo AND p.ativo AND p.codigo='SYSTEM_ADMINISTRATOR' AND u."firebaseUid" IS NOT NULL ORDER BY u.id LIMIT 1`)).rows;
    assert.ok(actor);
    const identity = await findIdentityByFirebaseUid(connection.db, actor.firebaseUid);
    assert.ok(identity);
    const context: AppContext = { database: connection.db, user: {
      id: identity.id, firebaseUid: actor.firebaseUid, email: identity.email, name: identity.nome, role: identity.perfil.nome, profileCode: identity.perfil.codigo,
      permissions: identity.perfil.permissoes, additionalProfiles: identity.additionalProfiles?.map(p => ({ id: p.id, code: p.codigo, name: p.nome, permissions: p.permissoes })),
      modulePermissions: identity.modulePermissions, allowedBudgetUnitIds: identity.allowedBudgetUnitIds, employeeId: identity.employee?.id ?? null, departmentId: identity.employee?.departmentId ?? null, secretariatId: identity.employee?.secretariatId ?? null,
    } };
    const contracts = (await connection.db.execute<{ id: string }>(sql`SELECT id FROM "HrEmploymentContract" WHERE details->>'seedPackage'='RH_PORTAL_2026_V1' ORDER BY id`)).rows;
    assert.equal(contracts.length, 198);
    const evidence: Array<{ contractId: string; result: string; rows?: number; error?: string }> = [];
    const referenceDate = new Date().toLocaleDateString("sv-SE", { timeZone: "America/Sao_Paulo" });
    if (process.argv.includes("--retry-failed")) {
      const previous = JSON.parse(await readFile("docs/RH_VEREDA_DIREITOS_VERIFICACAO.json", "utf8"));
      assert.equal(previous.referenceDate, referenceDate, "Retomada só admite evidência da mesma referência.");
      evidence.push(...previous.evidence.filter((row: { result: string; contractId: string }) => row.result === "PASS" && contracts.some(contract => contract.id === row.contractId)));
    }
    for (const contract of contracts) {
      if (evidence.some(row => row.contractId === contract.id)) continue;
      try {
        const result = await processAutomaticRights(connection, context, { contractIds: [contract.id], referenceDate, mode: "PREVIA" });
        evidence.push({ contractId: contract.id, result: "PASS", rows: result.rows.length });
      } catch (error) {
        const cause = error instanceof Error && error.cause instanceof Error ? error.cause : error;
        evidence.push({ contractId: contract.id, result: "FAIL", error: cause instanceof Error ? cause.message : String(cause) });
      }
    }
    const schedule = [];
    if (process.argv.includes("--run-schedule") && evidence.every(row => row.result === "PASS")) {
      for (let batch = 0; batch < 10; batch++) {
        const result = await runAutomaticRightsSchedule(connection, actor.id);
        schedule.push(result);
        if (!result.results.length || result.results.some(row => !row.processed)) break;
      }
    }
    const result = { checkedAt: new Date().toISOString(), referenceDate, layer: "SERVICO_INTERNO_NAO_VALIDACAO_VISUAL", actorId: actor.id, passed: evidence.filter(row => row.result === "PASS").length, failed: evidence.filter(row => row.result === "FAIL").length, scheduled: schedule.reduce((sum, batch) => sum + batch.results.filter(row => row.processed).length, 0), scheduleFailures: schedule.flatMap(batch => batch.results.filter(row => !row.processed)), evidence };
    await writeFile("docs/RH_VEREDA_DIREITOS_VERIFICACAO.json", JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result));
    if (result.failed || result.scheduleFailures.length) process.exitCode = 1;
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
