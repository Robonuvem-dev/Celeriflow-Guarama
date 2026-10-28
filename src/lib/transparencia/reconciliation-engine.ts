/**
 * reconciliation-engine.ts
 * 
 * Motor de Reconciliação entre o Portal da Transparência Pública 
 * e a Contabilidade Interna (1:1), garantindo divergência R$ 0,00 
 * antes e depois da publicação de demonstrativos orçamentários e fiscais.
 */

import { and, eq, inArray } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseExecutor } from "@/db/transaction";
import { financialYears } from "@/db/schema/finance-years";
import { publicAppropriations, publicCommitments, publicPayments, publicRevenues, publicSettlements } from "@/db/schema/transparency-financial";

type ReconciliationValue = ConstructorParameters<typeof Decimal>[0];

/** The financial report owner supplies its canonical reader. The reader must
 * use this executor so a transactional caller keeps a single database snapshot. */
export type ReadReconciliationRreo = (
  db: DatabaseExecutor,
  filter: { financialYearId: string },
) => Promise<{
  expenseSummary: { committedValue: ReconciliationValue; settledValue: ReconciliationValue; paidValue: ReconciliationValue }[];
  revenueSummary: { realizedValue: ReconciliationValue }[];
}>;

export type ReconciliationResult = {
  financialYearId: string;
  year: number;
  reconciledAt: string;
  isReconciled: boolean;
  divergenceTotal: number;
  checks: {
    name: string;
    internalValue: number;
    publicValue: number;
    difference: number;
    status: "MATCH" | "DIVERGENCE";
  }[];
};

export async function reconcilePublicAndInternalData(
  db: DatabaseExecutor,
  financialYearId: string,
  readInternalRreo: ReadReconciliationRreo,
): Promise<ReconciliationResult> {
  const [financialYear] = await db.select({ id: financialYears.id, year: financialYears.year }).from(financialYears).where(eq(financialYears.id, financialYearId)).limit(1);

  if (!financialYear) {
    throw new Error("Exercício financeiro não encontrado para reconciliação.");
  }

  // 1. Apuração Contábil Interna
  const internalRREO = await readInternalRreo(db, { financialYearId });
  const internalTotalCommitted = internalRREO.expenseSummary.reduce((s, e) => s.add(e.committedValue), new Decimal(0));
  const internalTotalSettled = internalRREO.expenseSummary.reduce((s, e) => s.add(e.settledValue), new Decimal(0));
  const internalTotalPaid = internalRREO.expenseSummary.reduce((s, e) => s.add(e.paidValue), new Decimal(0));
  const internalTotalRevenueCollected = internalRREO.revenueSummary.reduce((s, r) => s.add(r.realizedValue), new Decimal(0));

  // 2. Apuração Portal Público (soma dos fatos expostos publicamente)
  const [commitments, settlements, payments, revenues] = await Promise.all([
    db.select({ valueDecimal: publicCommitments.valueDecimal, value: publicCommitments.value }).from(publicCommitments)
      .innerJoin(publicAppropriations, eq(publicAppropriations.id, publicCommitments.appropriationId))
      .where(and(eq(publicAppropriations.financialYearId, financialYearId), inArray(publicCommitments.status, ["Emitido", "Liquidado", "Pago"]))),
    db.select({ valueDecimal: publicSettlements.valueDecimal, value: publicSettlements.value }).from(publicSettlements)
      .innerJoin(publicCommitments, eq(publicCommitments.id, publicSettlements.commitmentId))
      .innerJoin(publicAppropriations, eq(publicAppropriations.id, publicCommitments.appropriationId))
      .where(and(eq(publicAppropriations.financialYearId, financialYearId), eq(publicSettlements.status, "Liquidado"))),
    db.select({ valueDecimal: publicPayments.valueDecimal, value: publicPayments.value }).from(publicPayments)
      .innerJoin(publicCommitments, eq(publicCommitments.id, publicPayments.commitmentId))
      .innerJoin(publicAppropriations, eq(publicAppropriations.id, publicCommitments.appropriationId))
      .where(and(eq(publicAppropriations.financialYearId, financialYearId), inArray(publicPayments.status, ["Pago", "Paga"]))),
    db.select({ valueDecimal: publicRevenues.valueDecimal, value: publicRevenues.value, classification: publicRevenues.classification }).from(publicRevenues)
      .where(and(eq(publicRevenues.financialYearId, financialYearId), eq(publicRevenues.stage, "ARRECADADA"))),
  ]);

  const publicTotalCommitted = commitments.reduce((s, c) => s.add(c.valueDecimal ?? c.value), new Decimal(0));
  const publicTotalSettled = settlements.reduce((s, st) => s.add(st.valueDecimal ?? st.value), new Decimal(0));
  const publicTotalPaid = payments.reduce((s, p) => s.add(p.valueDecimal ?? p.value), new Decimal(0));
  const publicTotalRevenueCollected = revenues.reduce(
    (s, r) => s.add(new Decimal(r.valueDecimal ?? r.value).mul(r.classification === "REDUTORA" ? -1 : 1)),
    new Decimal(0),
  );

  const diffCommitted = internalTotalCommitted.sub(publicTotalCommitted).abs();
  const diffSettled = internalTotalSettled.sub(publicTotalSettled).abs();
  const diffPaid = internalTotalPaid.sub(publicTotalPaid).abs();
  const diffRevenue = internalTotalRevenueCollected.sub(publicTotalRevenueCollected).abs();

  const totalDivergence = diffCommitted.add(diffSettled).add(diffPaid).add(diffRevenue);
  const isReconciled = totalDivergence.lt("0.01");

  const checks: ReconciliationResult["checks"] = [
    {
      name: "Total de Despesa Empenhada",
      internalValue: internalTotalCommitted.toNumber(),
      publicValue: publicTotalCommitted.toNumber(),
      difference: diffCommitted.toNumber(),
      status: diffCommitted.lt("0.01") ? "MATCH" : "DIVERGENCE",
    },
    {
      name: "Total de Despesa Liquidada",
      internalValue: internalTotalSettled.toNumber(),
      publicValue: publicTotalSettled.toNumber(),
      difference: diffSettled.toNumber(),
      status: diffSettled.lt("0.01") ? "MATCH" : "DIVERGENCE",
    },
    {
      name: "Total de Despesa Paga",
      internalValue: internalTotalPaid.toNumber(),
      publicValue: publicTotalPaid.toNumber(),
      difference: diffPaid.toNumber(),
      status: diffPaid.lt("0.01") ? "MATCH" : "DIVERGENCE",
    },
    {
      name: "Total de Receita Arrecadada",
      internalValue: internalTotalRevenueCollected.toNumber(),
      publicValue: publicTotalRevenueCollected.toNumber(),
      difference: diffRevenue.toNumber(),
      status: diffRevenue.lt("0.01") ? "MATCH" : "DIVERGENCE",
    },
  ];

  return {
    financialYearId,
    year: financialYear.year,
    reconciledAt: new Date().toISOString(),
    isReconciled,
    divergenceTotal: totalDivergence.toNumber(),
    checks,
  };
}
