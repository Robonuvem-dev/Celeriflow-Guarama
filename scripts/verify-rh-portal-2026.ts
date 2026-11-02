import "dotenv/config";
import assert from "node:assert/strict";
import { writeFile } from "node:fs/promises";
import { sql } from "drizzle-orm";
import { createDatabaseConnection } from "../src/db/connection";
import { getPayrollStatement, renderPayrollStatementPdf } from "../src/lib/rh/statement-service";
import { ownReleasedStatementIds } from "../src/lib/portal-servidor/payroll-publication";
import { buildOwnPersonalReport } from "../src/lib/portal-servidor/personal-reports";
import { renderHrReport } from "../src/lib/rh/report-service";
import type { AppContext } from "../src/lib/platform/tenant-context";

async function main() {
  const connection = createDatabaseConnection(process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL!);
  try {
    const { rows: population } = await connection.db.execute<{ competence: string; statements: number; released: number; employees: number; balanced: boolean }>(sql`
      SELECT p.competence,count(s.id)::int statements,count(s.id) FILTER(WHERE s."releaseAt"<=now() AND s."revokedAt" IS NULL)::int released,
        count(DISTINCT c."employeeId")::int employees,bool_and(s.gross-s.deductions=s.net AND r.mode='OFICIAL' AND r.scope='DEMONSTRACAO' AND r.status='FECHADA') balanced
      FROM "Payroll" p JOIN "HrPayrollRun" r ON r."payrollId"=p.id JOIN "HrPayrollStatement" s ON s."runId"=r.id JOIN "HrEmploymentContract" c ON c.id=s."contractId"
      WHERE starts_with(p.id,'RH_PORTAL_2026_V1:') GROUP BY p.competence ORDER BY p.competence`);
    const { rows: [active] } = await connection.db.execute<{ total: number }>(sql`SELECT count(*)::int total FROM "Employee" WHERE "isActive"`);
    assert.equal(population.length, 3, "o recorte padrão exige três competências concluídas");
    for (const row of population) { assert.equal(row.statements, active.total); assert.equal(row.employees, active.total); assert.equal(row.released, row.statements); assert.equal(row.balanced, true); }
    const { rows: [reconciliation] } = await connection.db.execute<{ invalid: number }>(sql`
      SELECT count(*)::int invalid FROM "HrPayrollRun" r JOIN "Payroll" p ON p.id=r."payrollId"
      WHERE starts_with(p.id,'RH_PORTAL_2026_V1:') AND (
        r.net IS DISTINCT FROM (SELECT sum(s.net) FROM "HrPayrollStatement" s WHERE s."runId"=r.id)
        OR r.net IS DISTINCT FROM p."totalValueDecimal"
        OR r.net IS DISTINCT FROM (SELECT sum(CASE WHEN e.type='Vencimento' THEN i."valueDecimal" WHEN e.type='Desconto' THEN -i."valueDecimal" ELSE 0 END) FROM "PayrollItem" i JOIN "PayrollEvent" e ON e.id=i."eventId" WHERE i."payrollId"=p.id))`);
    assert.equal(reconciliation.invalid, 0, "líquidos devem reconciliar entre cálculo, demonstrativos e projeção");
    const { rows: samples } = await connection.db.execute<{ id: string; employeeId: string }>(sql`SELECT s.id,c."employeeId" FROM "HrPayrollStatement" s JOIN "HrEmploymentContract" c ON c.id=s."contractId" WHERE c.details->>'seedPackage'='RH_PORTAL_2026_V1' ORDER BY c.id,s.id LIMIT 1`);
    const sample = samples[0]; assert.ok(sample);
    const statement = await getPayrollStatement(connection.db, sample.id, sample.employeeId);
    assert.ok((await renderPayrollStatementPdf(statement)).subarray(0, 4).toString() === "%PDF");
    assert.ok((await ownReleasedStatementIds(connection.db, sample.employeeId)).includes(sample.id));
    await assert.rejects(getPayrollStatement(connection.db, sample.id, "UNRELATED_EMPLOYEE"), /indisponível/);
    // Service-layer verification of the selected holder, not a fabricated authenticated session.
    const context = { database: connection.db, user: { employeeId: sample.employeeId } } as AppContext;
    const mirror = await buildOwnPersonalReport(context, { kind: "PONTO", from: "2026-08-01", until: "2026-10-31", format: "PDF" });
    assert.ok(mirror.rows.length > 40);
    assert.ok(mirror.rows.some(row => row.includes("Presente")));
    const mirrorFile = await renderHrReport(mirror, "PDF"); assert.equal(mirrorFile.bytes.subarray(0, 4).toString(), "%PDF");
    const result = { checkedAt: new Date().toISOString(), result: "PASS", validationLayer: "database-and-service-not-browser", employees: active.total, population, reconciliation, checks: ["mesmos servidores em três competências", "bruto menos descontos igual líquido", "totais do cálculo/demonstrativos/projeção conciliados", "publicação reconhecida pelo serviço do Portal", "contracheque real em PDF", "acesso cruzado negado", "espelho pessoal integral em PDF com rastreabilidade interna"], realPayments: false };
    await writeFile("docs/RH_PORTAL_VERIFICACAO_2026.json", JSON.stringify(result, null, 2) + "\n");
    console.log(JSON.stringify(result, null, 2));
  } finally { await connection.pool.end(); }
}
main().catch(error => { console.error(error); process.exitCode = 1; });
