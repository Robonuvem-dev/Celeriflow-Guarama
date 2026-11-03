import assert from "node:assert/strict";
import test from "node:test";
import { Decimal } from "../src/db/decimal";
import type { BiddingDetail } from "../src/db/repositories/procurement/bidding";
import { biddingDateInPeriod, biddingReportCsv, buildBiddingReport, validateBiddingReportPeriod } from "../src/lib/compras/bidding-reports";
import { validateBiddingStatusReason } from "../src/lib/compras/bidding-status-reason";
import { BIDDING_STATUS } from "../src/lib/compras/bidding-workflow";

function fixture(): BiddingDetail {
  const participant = (id: string) => ({ id, supplierId: id, supplier: { company: id === "pj" ? { corporateName: "Empresa; Comercial", tradeName: null } : null, person: id === "pf" ? { fullName: "Pessoa física" } : null } });
  const bid = (id: string, sequence: number, value: string, status = "Aceito", person = "pj") => ({ id, participantId: person, participant: participant(person), sequence, totalValueDecimal: new Decimal(value), unitValueDecimal: null, submittedAt: new Date("2026-11-03T15:00:00Z"), status });
  // Focused domain fixture: the builder deliberately consumes only these fields.
  return {
    number: "PE-01/2026", status: "Homologado", modality: "Pregão Eletrônico", publicationDate: null, sessionDate: new Date("2026-11-03T15:00:00Z"),
    process: { number: "PROC-01", object: "Aquisição", secretariat: { name: "Administração" }, purchaseRequest: null },
    biddingParticipants: [participant("pj"), participant("pf")],
    biddingLots: [{ number: 1, items: [{ quantity: 2, purchaseProcessItem: { customName: "Material azul", estimatedUnitValue: null, catalogItem: null, material: null } }],
      bids: [bid("latest", 5, "90071992547409.90"), bid("first", 1, "90071992547409.93"), bid("rejected", 6, "1.00", "Cancelado"), bid("pf", 2, "90071992547409.92", "Aceito", "pf")],
      results: [{ isCurrent: true, status: "Arrematado", participant: participant("pj"), unitValueDecimal: null, totalValueDecimal: new Decimal("90071992547409.90"), decidedAt: new Date("2026-11-03T15:00:00Z") }, { isCurrent: false, participant: participant("pf"), totalValueDecimal: new Decimal("1") }],
      eligibilityDecisions: [{ id: "old", participantId: "pj", status: "Inabilitado", reason: "Antiga", decidedAt: new Date("2026-11-01"), createdAt: new Date("2026-11-01") }, { id: "new", participantId: "pj", status: "Habilitado", reason: "Regularizado", decidedAt: new Date("2026-11-02"), createdAt: new Date("2026-11-02") }],
    }], biddingPhases: [], biddingActs: [],
  } as unknown as BiddingDetail;
}

test("CF11 reports preserve decimal cents, distinguish initial/latest offers and never revive superseded winners", () => {
  const bidding = fixture();
  const initial = buildBiddingReport(bidding, "classificacao");
  assert.deepEqual(initial.rows.map(row => [row[1], row[5]]), [["Pessoa física", "90071992547409.92"], ["Empresa; Comercial", "90071992547409.93"]]);
  assert.equal(buildBiddingReport(bidding, "lances-resumidos", { supplierId: "pj" }).rows[0][5], "90071992547409.90");
  assert.equal(buildBiddingReport(bidding, "lances").rows.length, 4);
  const winners = buildBiddingReport(bidding, "apuracao");
  assert.equal(winners.rows.length, 1);
  assert.equal(winners.rows[0][4], "90071992547409.90");
  assert.equal(buildBiddingReport(bidding, "apuracao", { supplierId: "pf" }).rows.length, 0);
  assert.equal(buildBiddingReport(bidding, "lances", { material: "inexistente" }).rows.length, 0);
});

test("CF11 eligibility uses the most recent decision and keeps undecided suppliers distinct", () => {
  assert.equal(buildBiddingReport(fixture(), "habilitacao").rows[0][2], "Habilitado");
  assert.equal(buildBiddingReport(fixture(), "habilitacao").rows[1][2], "Não decidida");
  assert.equal(buildBiddingReport(fixture(), "desclassificados").rows.length, 0);
});

test("CF11 report periods use inclusive Brazilian civil days and reject malformed/reversed dates", () => {
  assert.equal(biddingDateInPeriod(new Date("2026-11-04T02:59:59.999Z"), "2026-11-03", "2026-11-03"), true);
  assert.equal(biddingDateInPeriod(new Date("2026-11-04T03:00:00Z"), "2026-11-03", "2026-11-03"), false);
  assert.equal(biddingDateInPeriod(null, "2026-11-03"), false);
  assert.equal(biddingDateInPeriod(null), true);
  assert.ok(validateBiddingReportPeriod("2026-02-30", ""));
  assert.ok(validateBiddingReportPeriod("2026-11-04", "2026-11-03"));
  assert.equal(validateBiddingReportPeriod("2026-11-03", "2026-11-03"), null);
});

test("CF11 CSV escapes delimiters/quotes/newlines and neutralizes spreadsheet formulas", () => {
  const csv = biddingReportCsv({ columns: ["Nome"], rows: [['Fornecedor; "A"\nB'], [" =1+1"], ["@SUM(A1:A2)"]] });
  assert.ok(csv.startsWith("\uFEFF"));
  assert.ok(csv.includes('"Fornecedor; ""A""\nB"'));
  assert.ok(csv.includes('"\' =1+1"'));
  assert.ok(csv.includes('"\'@SUM(A1:A2)"'));
});

test("CF11 cancellation/suspension reasons are required by the server policy", () => {
  for (const status of [BIDDING_STATUS.SUSPENDED, BIDDING_STATUS.ANNULLED, BIDDING_STATUS.REVOKED, BIDDING_STATUS.INACTIVE]) {
    assert.throws(() => validateBiddingStatusReason(status, "  "));
    assert.equal(validateBiddingStatusReason(status, "  Fundamentação  "), "Fundamentação");
  }
  assert.throws(() => validateBiddingStatusReason(BIDDING_STATUS.OPEN, "x".repeat(4001)));
  assert.equal(validateBiddingStatusReason(BIDDING_STATUS.OPEN), "");
});
