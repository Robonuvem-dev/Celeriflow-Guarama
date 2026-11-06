/** Complete the requested fictional employee's missing cost scope, preserving closed payroll/history. */
import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { eq, sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { findIdentityByFirebaseUid } from "../src/db/repositories/platform/identity";
import { insertAuditEvent } from "../src/db/repositories/platform/audit";
import { hrEmploymentContracts } from "../src/db/schema/personnel-workforce";
import { saveEmploymentContract } from "../src/lib/rh/workforce-service";
import { readControlWorkforceStatistics } from "../src/lib/c7/workforce-statistics";
import { auditEventTypes } from "../src/lib/platform/audit-evidence";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const packageId = "CHECKUP_THIAGO_CUSTOS_2026_V1";
const apply = process.argv.includes("--apply");
const rollback = new Error("CHECKUP_PREVIEW_ROLLBACK");
const civil = (value: Date | null) => value?.toISOString().slice(0, 10) ?? "";
async function main() {
  const connection = databaseConnection;
  const report = { packageId, mode: apply ? "APPLIED" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), changes: [] as { contractId: string; beforeVersion: number; afterVersion: number; costCenterId: string; effectiveFrom: string }[], verification: {} as Record<string, unknown> };
  try {
    const [actor] = (await connection.db.execute<{ firebaseUid: string }>(sql`SELECT "firebaseUid" FROM "Usuario" WHERE id='cmvba36v700007kqmdslbwhkk' AND ativo`)).rows;
    assert.ok(actor?.firebaseUid);
    const identity = await findIdentityByFirebaseUid(connection.db, actor.firebaseUid);
    assert.ok(identity?.ativo && identity.perfil.codigo === "SYSTEM_ADMINISTRATOR");
    try {
      await withDatabaseTransaction(connection, async tx => inDatabaseTransactionScope(connection, tx, async () => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId}))`);
        const contractId = "cmw519rhr0001uohydvgktkea", employeeId = "THIAGO_MORCATTY_DEMO_2026_V1:employee", costCenterId = "aurora-mg-50k-v1:cost-center:000";
        const [contract] = await tx.select().from(hrEmploymentContracts).where(eq(hrEmploymentContracts.id, contractId)).for("update");
        assert.ok(contract && contract.employeeId === employeeId && contract.status === "ATIVO");
        assert.equal(contract.salary.toFixed(2), "8500.00");
        assert.equal(contract.monthlyHours, 200);
        assert.equal((await tx.execute(sql`SELECT c.id FROM "CostCenter" c JOIN "Employee" e ON e."secretariatId"=c."secretariatId" JOIN "Department" d ON d.id=e."departmentId" AND d."secretariatId"=c."secretariatId" WHERE e.id=${employeeId} AND c.id=${costCenterId} AND c."governmentEntityId"='p0-current-exe'`)).rows.length, 1);
        const [statementBefore] = (await tx.execute<{ hash: string }>(sql`SELECT md5(to_jsonb(s)::text) AS hash FROM "HrPayrollStatement" s WHERE s.id='cmw519vid000vuohy4co53zwb'`)).rows;
        assert.ok(statementBefore?.hash);
        const historicalBefore = await readControlWorkforceStatistics(connection, { usuarioId: identity.id }, { financialYearId: "aurora-mg-50k-v1:financial-year:000", referenceDate: "2026-10-31", employeeId });
        if (contract.costCenterId === null) {
          const updated = await saveEmploymentContract(connection, identity.id, {
            id: contract.id, version: contract.version, effectiveFrom: "2026-11-06", employeeId, registration: contract.registration,
            regimeId: contract.regimeId, roleId: contract.roleId, departmentId: contract.departmentId ?? undefined, costCenterId,
            workLocation: contract.workLocation, salaryLevel: contract.salaryLevel ?? undefined,
            admittedAt: civil(contract.admittedAt), appointedAt: civil(contract.appointedAt), swornAt: civil(contract.swornAt), endsAt: civil(contract.endsAt),
            monthlyHours: contract.monthlyHours, salary: contract.salary.toFixed(2), details: contract.details,
            reason: `${packageId}: completar o vínculo do cadastro fictício ao centro de custo da Administração, após a competência fechada de outubro, preservando remuneração e histórico.`,
          });
          assert.equal(updated.version, contract.version + 1);
          assert.deepEqual(updated.details, contract.details);
          report.changes.push({ contractId, beforeVersion: contract.version, afterVersion: updated.version, costCenterId, effectiveFrom: "2026-11-06" });
          await insertAuditEvent(tx, { actorUsuarioId: identity.id, eventType: auditEventTypes.administrativeMutation, targetType: "HR_EMPLOYMENT_CONTRACT", targetId: contractId });
        } else assert.equal(contract.costCenterId, costCenterId, "Centro de custo alterado por outra operação; revisar individualmente.");
        const current = await readControlWorkforceStatistics(connection, { usuarioId: identity.id }, { financialYearId: "aurora-mg-50k-v1:financial-year:000", referenceDate: "2026-12-31", employeeId });
        assert.equal(current.totalPeople, 1); assert.equal(current.totalContracts, 1);
        assert.equal(current.rows[0].costCenterId, costCenterId);
        assert.equal(current.rows[0].employeeName, "Thiago Morcatty");
        const historicalAfter = await readControlWorkforceStatistics(connection, { usuarioId: identity.id }, { financialYearId: "aurora-mg-50k-v1:financial-year:000", referenceDate: "2026-10-31", employeeId });
        assert.deepEqual(historicalAfter, historicalBefore);
        const [statementAfter] = (await tx.execute<{ hash: string }>(sql`SELECT md5(to_jsonb(s)::text) AS hash FROM "HrPayrollStatement" s WHERE s.id='cmw519vid000vuohy4co53zwb'`)).rows;
        assert.equal(statementAfter.hash, statementBefore.hash);
        report.verification = { totalPeople: current.totalPeople, totalContracts: current.totalContracts, center: current.rows[0].costCenterName, historicalOctoberPreserved: true, closedStatementPreserved: true };
        if (!apply) throw rollback;
      }));
    } catch (error) { if (error !== rollback) throw error; }
    mkdirSync("docs/checkup/demonstration-data", { recursive: true });
    writeFileSync(`docs/checkup/demonstration-data/thiago-cost-center-${apply ? "applied" : "preview"}-${Date.now()}.json`, JSON.stringify(report, null, 2) + "\n");
    console.log(JSON.stringify(report, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
