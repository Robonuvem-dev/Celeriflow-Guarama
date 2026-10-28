import assert from "node:assert/strict";
import { config } from "dotenv";
import { inspectAnnualConsistency } from "../src/lib/financeiro/annual-consistency";
import type { DatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { openFinanceSetupConnection, readSetupActor, readSetupYear } from "./lib/finance-setup-tools";

config({ path: ".env.local", quiet: true });
config({ quiet: true });

export async function verifyAnnualReadiness(connection: DatabaseConnection) {
    const admin = await readSetupActor(connection.db);
    assert.ok(admin.ativo && admin.employeeId && admin.perfil.codigo === "SYSTEM_ADMINISTRATOR", "Responsável autorizado não disponível.");
    const evidence = [];
    for (const suffix of ["exe", "leg"]) {
      const governmentEntityId = `p0-current-${suffix}`;
      const year = await readSetupYear(connection.db, governmentEntityId);
      const report = await withDatabaseTransaction(connection, async tx => {
        return inspectAnnualConsistency(tx, {}, year.id);
      }, { isolationLevel: "repeatable read", accessMode: "read only", timeoutMs: 120000 });
      assert.equal(report.governmentEntityId, governmentEntityId);
      assert.equal(report.fullEntity, true);
      await assert.rejects(withDatabaseTransaction(connection, tx => inspectAnnualConsistency(tx, { allowedBudgetUnitIds: [`${governmentEntityId}-ug-1`] }, year.id)), /todas as UGs/);
      const issuesByCode: Record<string, number> = {};
      for (const issue of report.issues) issuesByCode[issue.code] = (issuesByCode[issue.code] ?? 0) + 1;
      evidence.push({ governmentEntityId, financialYearId: year.id, year: year.year, status: report.status, generatedAt: report.generatedAt, counts: report.counts, issuesByCode, partialOperatorRejected: true, reportPersisted: false, accountingFactsCreated: false });
    }
    return { mode: "READ_ONLY", evidence };
}
async function main() {
  const connection = openFinanceSetupConnection();
  try { console.log(JSON.stringify(await verifyAnnualReadiness(connection), null, 2)); }
  finally { await connection.pool.end(); }
}

if (require.main === module) main().catch(error => { console.error(error instanceof Error ? error.message : "Falha na conferência anual de leitura."); process.exitCode = 1; });
