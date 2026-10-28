import { createHash } from "node:crypto";
import { Decimal } from "@/db/decimal";
import type { JsonObject } from "@/db/json";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { readCostReportMovement } from "@/db/repositories/finance/cost-overview";
import PDFDocument from "pdfkit";
import { readMunicipalCosts } from "./cost-overview";
import { assertCostScope, MunicipalCostError } from "./cost-ledger";
import type { CostActor } from "./cost-types";
import { costReportQuery, municipalCostFilters } from "./cost-query";
import type { z } from "zod";

type Report = { title: string; headers: string[]; rows: string[][]; hash: string };
export async function buildMunicipalCostReport(db: DatabaseConnection, actor: CostActor, input: z.infer<typeof costReportQuery>): Promise<Report> {
  const headers = ["Tipo", "Origem / nota", "Data despesa / apropriação", "Despesa BRL", "Apropriado BRL", "Saldo atual BRL", "Conteúdo / memória"];
  const rows: string[][] = [];
  let title: string;
  if (input.movementId) {
    const movement = await withDatabaseTransaction(db, async tx => {
      const movement = await readCostReportMovement(tx, input.movementId!);
      const recognitionYearId = movement && (movement.snapshot as JsonObject).recognitionFinancialYearId;
      if (!movement || (movement.source.financialYearId !== input.yearId && recognitionYearId !== input.yearId)) throw new MunicipalCostError("Nota de custo não pertence ao exercício de origem ou reconhecimento.");
      const origin = await assertCostScope(tx, actor, movement.source.financialYearId, movement.source.budgetUnitId);
      const selected = await assertCostScope(tx, actor, input.yearId, movement.source.budgetUnitId);
      if (origin.governmentEntityId !== selected.governmentEntityId) throw new MunicipalCostError("Nota e exercício divergem no ente.");
      return movement;
    }, { isolationLevel: "repeatable read" });
    const recognitionYearId = (movement.snapshot as JsonObject).recognitionFinancialYearId;
    title = `Nota de ${movement.kind === "REVERSAL" ? "estorno" : movement.kind === "RESTORATION" ? "desfazimento de estorno" : "apropriação"} — ${movement.id}${recognitionYearId && recognitionYearId !== movement.source.financialYearId ? ` — origem ${movement.source.financialYearId} / reconhecimento ${String(recognitionYearId)}` : ""}`;
    let memory = movement.snapshot as JsonObject;
    while (!Array.isArray(memory.definitions) && memory.previousSnapshot && typeof memory.previousSnapshot === "object" && !Array.isArray(memory.previousSnapshot)) memory = memory.previousSnapshot as JsonObject;
    for (const row of movement.allocations) {
      const definition = Array.isArray(memory.definitions) ? memory.definitions.find(entry => entry && typeof entry === "object" && !Array.isArray(entry) && entry.objectId === row.objectId && entry.itemId === row.itemId) as JsonObject | undefined : undefined;
      const object = definition?.object as JsonObject | undefined; const item = definition?.item as JsonObject | undefined;
      rows.push([movement.kind, movement.id, movement.date.toISOString().slice(0, 10), "", row.amount.toFixed(2), "", `${object?.code ?? row.object.code} — ${object?.description ?? row.object.description}; ${item?.identifier ?? row.item.identifier} — ${item?.description ?? row.item.description}`]);
    }
    rows.push(["ORIGEM", `${movement.source.sourceType}:${movement.source.sourceId}`, movement.source.expenseDate.toISOString().slice(0, 10), movement.source.amount.toFixed(2), "", "", `UG: ${movement.source.budgetUnitId}; responsável: ${movement.actorId}; motivo: ${movement.reason}`]);
    rows.push(["MEMÓRIA CONGELADA", movement.id, "", "", "", "", JSON.stringify(movement.snapshot)]);
  } else {
    const data = await readMunicipalCosts(db, actor, input.yearId, municipalCostFilters(input));
    title = `Despesas e apropriações de custos — ${data.year.year}`;
    rows.push(["FILTROS", input.yearId, "", "", "", "", `Despesa ${input.expenseFrom ?? "início"} a ${input.expenseUntil ?? "fim"}; apropriação ${input.appropriationFrom ?? "início"} a ${input.appropriationUntil ?? "fim"}; tipo ${input.sourceType ?? "todos"}; item ${input.itemId ?? "todos"}. Saldo atual considera toda a cadeia; apropriado no período considera o filtro de data.`]);
    for (const source of data.sources) {
      rows.push([source.sourceType, source.sourceId, source.expenseDate.slice(0, 10), source.netAmount, source.inPeriod, source.pending, `UG ${source.budgetUnitId}; situação ${source.status}; original ${source.amount} BRL; devoluções ${source.reduced} BRL; apropriado atual ${source.allocated} BRL`]);
      for (const reduction of source.reductions) rows.push(["DEVOLUÇÃO DA ORIGEM", reduction.id, reduction.date.slice(0, 10), `-${reduction.amount}`, "", "", `${reduction.reason}; memória ${JSON.stringify(reduction.snapshot)}`]);
    }
    for (const group of data.byType) rows.push([`TOTAL ${group.type}`, "", "", group.expense, group.allocated, group.pending, "Despesa ativa, apropriado no período e saldo atual"]);
    for (const correction of data.priorYearCorrections) rows.push([`CORREÇÃO DE EXERCÍCIO ANTERIOR ${correction.kind}`, correction.id, `${correction.expenseDate.slice(0, 10)} / ${correction.date.slice(0, 10)}`, correction.kind === "SOURCE_REDUCTION" ? correction.amount : "", correction.kind !== "SOURCE_REDUCTION" ? correction.amount : "", "", `Origem ${correction.originFinancialYearId}; reconhecimento ${correction.recognitionFinancialYearId}; UG ${correction.budgetUnitId}; ${correction.reason}. Movimento histórico identificado separadamente dos totais das origens do exercício.`]);
    const total = data.byType.reduce((sum, group) => ({ expense: sum.expense.plus(group.expense), allocated: sum.allocated.plus(group.allocated), pending: sum.pending.plus(group.pending) }), { expense: new Decimal(0), allocated: new Decimal(0), pending: new Decimal(0) });
    rows.push(["TOTAL GERAL", "", "", total.expense.toFixed(2), total.allocated.toFixed(2), total.pending.toFixed(2), ""]);
  }
  return { title, headers, rows, hash: createHash("sha256").update(JSON.stringify({ title, headers, rows })).digest("hex") };
}

export async function renderMunicipalCostReport(report: Report, format: "PDF" | "CSV") {
  if (format === "CSV") {
    const quote = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    return { bytes: Buffer.from("\uFEFF" + [report.headers, ...report.rows, ["SHA-256", report.hash]].map(row => row.map(quote).join(";")).join("\r\n")), contentType: "text/csv; charset=utf-8", extension: "csv" };
  }
  const pdf = new PDFDocument({ size: "A4", margin: 40, bufferPages: true }); const chunks: Buffer[] = [];
  const bytes = new Promise<Buffer>((resolve, reject) => { pdf.on("data", chunk => chunks.push(Buffer.from(chunk))); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  pdf.fontSize(14).text(report.title); pdf.fontSize(8).text(`SHA-256 do conjunto: ${report.hash}`); pdf.moveDown();
  for (const row of report.rows) { pdf.fontSize(10).text(`${row[0]} · ${row[1]}`); for (let column = 2; column < report.headers.length; column++) if (row[column]) pdf.fontSize(9).text(`${report.headers[column]}: ${row[column]}`); pdf.moveDown(); }
  const range = pdf.bufferedPageRange(); for (let page = range.start; page < range.start + range.count; page++) { pdf.switchToPage(page); pdf.fontSize(8).text(`${page - range.start + 1}/${range.count}`, 40, pdf.page.height - 25, { lineBreak: false }); } pdf.end();
  return { bytes: await bytes, contentType: "application/pdf", extension: "pdf" };
}
