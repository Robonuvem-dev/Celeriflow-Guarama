import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import test from "node:test";
import type { DatabaseExecutor } from "../src/db/transaction";
import { listPreparedProgramPayments } from "../src/db/repositories/finance/accounting-pending";
import { readAccountingPaymentBasis } from "../src/db/repositories/finance/accounting";
import { listBankSourceRedistributions } from "../src/db/repositories/finance/bank-sources";
import { findCommitmentContract, findCommitmentCovenant, findCommitmentPublicityCampaign } from "../src/db/repositories/finance/commitment-origins";
import { readCostSettlement } from "../src/db/repositories/finance/cost-origins";
import { listPayableActivePayments } from "../src/db/repositories/finance/payables";

// Unit decoder inputs only: this fake execute() does not exercise a driver,
// PostgreSQL columns, SQL semantics or transaction behavior.
function rawRows(rows: Record<string, unknown>[]): DatabaseExecutor {
  return { execute: async () => ({ rows }) } as unknown as DatabaseExecutor;
}

async function verifyRawScalarContracts() {
  const rawDate = "2026-12-31 23:59:59.123456";
  const expectedDate = "2026-12-31T23:59:59.123Z";
  const exactAmount = "9007199254740993.01";
  const [prepared, emptyBankDate] = await listPreparedProgramPayments(rawRows([
    { id: "prepared", date: rawDate, bankProcessedAt: "2027-01-01 02:59:59.123+03", valueDecimal: exactAmount, netValueDecimal: "9007199254740992.99" },
    { id: "empty-bank-date", date: "2026-12-31", bankProcessedAt: null, valueDecimal: null, netValueDecimal: null },
  ]), ["prepared", "empty-bank-date"]);
  assert.equal(prepared.date.toISOString(), expectedDate);
  assert.equal(prepared.bankProcessedAt?.toISOString(), expectedDate);
  assert.equal(prepared.valueDecimal?.toFixed(2), exactAmount);
  assert.equal(prepared.netValueDecimal?.toFixed(2), "9007199254740992.99");
  assert.equal(emptyBankDate.date.toISOString(), "2026-12-31T00:00:00.000Z");
  assert.equal(emptyBankDate.bankProcessedAt, null);
  assert.equal(emptyBankDate.valueDecimal, null);
  assert.equal(emptyBankDate.netValueDecimal, null);

  const basis = await readAccountingPaymentBasis(rawRows([{ date: rawDate, valueDecimal: exactAmount, netValueDecimal: null }]), "payment");
  assert.equal(basis?.date.toISOString(), expectedDate);
  assert.equal(basis?.valueDecimal?.toFixed(2), exactAmount);
  assert.equal(basis?.netValueDecimal, null);
  assert.equal(await readAccountingPaymentBasis(rawRows([]), "missing"), null);

  const [redistribution] = await listBankSourceRedistributions(rawRows([{ date: rawDate, valueDecimal: exactAmount }]), "bank", "source");
  assert.equal(redistribution.date.toISOString(), expectedDate);
  assert.equal(redistribution.valueDecimal.toFixed(2), exactAmount);

  for (const readOrigin of [findCommitmentContract, findCommitmentCovenant, findCommitmentPublicityCampaign]) {
    const origin = await readOrigin(rawRows([{ startDate: "2026-01-01", endDate: rawDate }]), "origin");
    assert.equal(origin?.startDate.toISOString(), "2026-01-01T00:00:00.000Z");
    assert.equal(origin?.endDate.toISOString(), expectedDate);
    // The last execution instant of the year must still be inside the origin's validity.
    assert.ok(origin && new Date(expectedDate) <= origin.endDate);
    assert.equal(await readOrigin(rawRows([]), "missing"), null);
  }

  const settlement = await readCostSettlement(rawRows([{ id: "settlement", date: rawDate, valueDecimal: exactAmount, reservationId: "reservation", expenseId: "expense", expenseValueDecimal: exactAmount }]), "settlement");
  assert.equal(settlement.date.toISOString(), expectedDate);
  assert.equal(settlement.valueDecimal?.toFixed(2), exactAmount);
  assert.equal(settlement.commitment.reservation?.expense?.valueDecimal?.toFixed(2), exactAmount);
  const [payablePayment] = await listPayableActivePayments(rawRows([{ id: "payment", date: rawDate, valueDecimal: exactAmount }]), "payable");
  assert.equal(payablePayment.date.toISOString(), expectedDate);
  assert.equal(payablePayment.valueDecimal?.toFixed(2), exactAmount);

  const mappedDate = new Date(expectedDate);
  const [alreadyMapped] = await listPayableActivePayments(rawRows([{ date: mappedDate, valueDecimal: null }]), "payable");
  assert.equal(alreadyMapped.date.toISOString(), expectedDate);
  assert.notEqual(alreadyMapped.date, mappedDate);
  assert.equal(alreadyMapped.valueDecimal, null);
  await assert.rejects(() => listPayableActivePayments(rawRows([{ date: "invalid", valueDecimal: null }]), "payable"), /Timestamp inválido/);
}

test("finance raw DTO unit decoders preserve UTC, validity cutoffs, nulls and exact amounts across host timezones", async () => {
  if (process.env.CELERIFLOW_FINANCE_SCALAR_CHILD === "1") {
    await verifyRawScalarContracts();
    return;
  }
  for (const timezone of ["UTC", "America/Sao_Paulo", "Pacific/Auckland"]) {
    const output = execFileSync(process.execPath, ["--max-old-space-size=128", "--conditions=react-server", "--import", "tsx", "--test", "tests/finance-raw-scalars.test.ts"], {
      cwd: process.cwd(),
      env: { ...process.env, NODE_TEST_CONTEXT: undefined, TZ: timezone, CELERIFLOW_FINANCE_SCALAR_CHILD: "1" },
      encoding: "utf8",
      stdio: "pipe",
    });
    assert.match(output, /pass 1\b/, timezone);
  }
});
