import { config } from "dotenv";
import assert from "node:assert/strict";
import { mkdirSync, writeFileSync } from "node:fs";
import { and, eq, sql } from "drizzle-orm";
import { databaseConnection } from "../src/db/client";
import { withDatabaseTransaction } from "../src/db/transaction";
import { financialAuditLogs } from "../src/db/schema/finance-identity";
import { taxAssessments, taxGuides } from "../src/db/schema/taxation-core";
import { taxPayments } from "../src/db/schema/tax-accounting";
import { confirmTaxPaymentInTransaction } from "../src/lib/tributacao";
import { populationContext } from "./lib/population-context";
import { key } from "./municipal-system-dataset";

config({ path: ".env.local", quiet: true }); config({ quiet: true });
const apply = process.argv.includes("--apply"), packageId = "MUNICIPAL_TAX_RECEIPTS_20261108";
const report = { mode: apply ? "APPLY" : "PREVIEW_ROLLED_BACK", startedAt: new Date().toISOString(), receipts: [] as { assessmentId: string; guideId: string; amount: string; status: string; reused: boolean }[], checks: [] as string[], status: "RUNNING", error: "" };
async function main() {
  try {
    const context = await populationContext(), rollback = new Error("POPULATION_PREVIEW_ROLLBACK");
    try {
      await withDatabaseTransaction(databaseConnection, async tx => {
        await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${packageId}))`);
        for (let index = 0; index < 15; index++) {
          const [receipt] = await tx.select().from(financialAuditLogs).where(and(eq(financialAuditLogs.action, "MUNICIPAL_TAX_CASE_POPULATED"), eq(financialAuditLogs.entityId, key("tax-case", index))));
          const data = receipt?.payload as { assessmentId?: string; guideId?: string };
          assert.ok(data?.assessmentId && data.guideId, `Caso tributário não encontrado: ${index}`);
          const [assessment] = await tx.select().from(taxAssessments).where(eq(taxAssessments.id, data.assessmentId));
          assert.ok(assessment?.finalValueDecimal);
          const amount = index < 10 ? assessment.finalValueDecimal : assessment.finalValueDecimal.div(2);
          const idempotencyKey = `${packageId}:${index}`;
          const [prior] = await tx.select().from(taxPayments).where(eq(taxPayments.idempotencyKey, idempotencyKey));
          const guide = await confirmTaxPaymentInTransaction(tx, { usuarioId: context.user.id, employeeId: context.user.employeeId }, { guideId: data.guideId, amountPaid: amount, paymentDate: new Date("2026-11-06T12:00:00Z"), paymentMethod: "Transferência", idempotencyKey });
          assert.equal(guide.status, index < 10 ? "Paga" : "Parcial");
          report.receipts.push({ assessmentId: assessment.id, guideId: guide.id, amount: amount.toFixed(2), status: guide.status, reused: Boolean(prior) });
        }
        const [totals] = (await tx.execute<{ payments: string; revenue: string; treasury: string; entries: string }>(sql`SELECT
          (SELECT sum("amountPaidDecimal")::text FROM "TaxPayment" WHERE "idempotencyKey" LIKE ${`${packageId}:%`}) AS payments,
          (SELECT sum(r."valueDecimal")::text FROM "Revenue" r JOIN "TaxRevenueIntegrationEvent" i ON i."revenueId"=r.id JOIN "TaxPayment" p ON p.id=i."taxPaymentId" WHERE p."idempotencyKey" LIKE ${`${packageId}:%`}) AS revenue,
          (SELECT sum(t."valueDecimal")::text FROM "TreasuryMovement" t JOIN "TaxRevenueIntegrationEvent" i ON i."revenueId"=t."revenueId" JOIN "TaxPayment" p ON p.id=i."taxPaymentId" WHERE p."idempotencyKey" LIKE ${`${packageId}:%`}) AS treasury,
          (SELECT sum(CASE WHEN e.type='Débito' THEN e."valueDecimal" ELSE -e."valueDecimal" END)::text FROM "AccountingEntry" e JOIN "AccountingTransaction" t ON t.id=e."transactionId" WHERE t.status='POSTADO') AS entries`)).rows;
        assert.equal(totals.payments, totals.revenue); assert.equal(totals.payments, totals.treasury); assert.equal(Number(totals.entries), 0);
        const [remaining] = await tx.select().from(taxGuides).where(eq(taxGuides.id, report.receipts[0].guideId)); assert.ok(remaining);
        report.checks.push(`Pagamentos = receitas = entradas de tesouraria: R$ ${totals.payments}`, "Partidas postadas: débitos menos créditos = 0", "Dez guias pagas, cinco parciais; demais casos preservados para operação");
        if (!apply) throw rollback;
      }, { timeoutMs: 240_000 });
    } catch (error) { if (error !== rollback) throw error; }
    report.status = "PASS";
  } catch (error) { report.status = "FAIL"; report.error = error instanceof Error ? error.message.slice(0, 600) : "Falha na arrecadação"; process.exitCode = 1; }
  finally { const output = "docs/plano-populacao-2026-11-08/execucao/tributacao"; mkdirSync(output, { recursive: true }); writeFileSync(`${output}/${apply ? "receipts-applied" : "receipts-preview"}.json`, JSON.stringify(report, null, 2) + "\n"); console.log(JSON.stringify(report, null, 2)); await databaseConnection.pool.end(); }
}
void main();
