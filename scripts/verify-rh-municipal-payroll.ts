import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { withDatabaseTransaction } from "../src/db/transaction";
import { inDatabaseTransactionScope } from "../src/db/transaction-scope";
import { payrolls } from "../src/db/schema/personnel-workforce";
import { calculatePayrollRun } from "../src/lib/rh/workforce-service";
import { Decimal } from "../src/db/decimal";

async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  const rollback = new Error("ROLLBACK_VERIFICACAO_INTERNA_RH");
  let evidence: Record<string, unknown> | undefined;
  const payrollId = "VEREDA_RH_VERIFICACAO_INTERNA_2026_12";
  try {
    const [actor] = (await connection.db.execute<{ id: string }>(sql`SELECT u.id FROM "Usuario" u JOIN "ConfiguracaoPerfil" p ON p.id=u."perfilId" WHERE u.ativo AND p.ativo AND p.codigo='SYSTEM_ADMINISTRATOR' AND u."firebaseUid" IS NOT NULL ORDER BY u.id LIMIT 1`)).rows;
    assert.ok(actor);
    const contracts = (await connection.db.execute<{ id: string }>(sql`SELECT id FROM "HrEmploymentContract" WHERE details->>'seedPackage'='RH_PORTAL_2026_V1' ORDER BY id`)).rows;
    assert.equal(contracts.length, 198);
    try {
      await withDatabaseTransaction(connection, async tx => {
        await tx.insert(payrolls).values({ id: payrollId, competence: "12/2026", type: "Mensal", status: "Aberta" });
        await inDatabaseTransactionScope(connection, tx, async () => {
          const run = await calculatePayrollRun(connection, actor.id, { payrollId, requestKey: payrollId, mode: "SIMULACAO", scope: "DEMONSTRACAO", contractIds: contracts.map(row => row.id) });
          assert.equal(run.statements.length, 198);
          const sum = (key: "gross" | "deductions" | "net" | "employer") => run.statements.reduce((total, row) => total.add(row[key]), new Decimal(0));
          for (const key of ["gross", "deductions", "net", "employer"] as const) assert.ok(sum(key).eq(run[key]), `Total ${key} não concilia.`);
          assert.ok(sum("gross").sub(sum("deductions")).eq(sum("net")));
          evidence = { checkedAt: new Date().toISOString(), result: "PASS", layer: "CALCULO_CANONICO_EM_TRANSACAO_REVERTIDA_NAO_VALIDACAO_VISUAL", competence: "12/2026", mode: "SIMULACAO", statements: run.statements.length, gross: sum("gross").toFixed(2), deductions: sum("deductions").toFixed(2), net: sum("net").toFixed(2), employer: sum("employer").toFixed(2), persisted: false };
        });
        throw rollback;
      }, { timeoutMs: 600000 });
    } catch (error) { if (error !== rollback) throw error; }
    assert.ok(evidence);
    assert.equal((await connection.db.execute(sql`SELECT id FROM "Payroll" WHERE id=${payrollId}`)).rows.length, 0, "Folha de verificação não foi revertida.");
    await writeFile("docs/RH_VEREDA_FOLHA_VERIFICACAO.json", JSON.stringify(evidence, null, 2) + "\n");
    console.log(JSON.stringify(evidence));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
