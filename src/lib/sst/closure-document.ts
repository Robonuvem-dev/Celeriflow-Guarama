import "server-only";
import { randomUUID } from "node:crypto";
import PDFDocument from "pdfkit";
import type { AppContext } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/platform/audit-evidence";
import { insertAuditEvent as writeAuditEvent } from "@/db/repositories/platform/audit";
import { sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { sstContextConnection } from "./database";
import { closureInput } from "./closure-policy";
import { functionalSstReport, pppReport, portalPppReport } from "./closure-service";
import { hashSource } from "./esocial-contract";

type DocumentInput = { budgetUnitId: string; employeeId?: string; from: string; until: string };
const maximumRows = 5000;
function assertBound(total: number) {
  if (total > maximumRows) throw new Error("Relatório excede 5.000 registros; divida o período para emitir sem truncamento.");
}
export async function emitClosureDocument(context: AppContext, kind: "PPP" | "FUNCTIONAL", input: DocumentInput, portal = false, connection: DatabaseConnection = sstContextConnection(context)) {
  if (portal && kind !== "PPP") throw new Error("Portal não disponibiliza relatório clínico integral.");
  const employeeId = portal ? context.user.employeeId : input.employeeId;
  const parsed = closureInput.parse({ ...input, employeeId });
  let snapshot: Record<string, unknown>;
  if (kind === "FUNCTIONAL") {
    const first = await functionalSstReport(context, input);
    assertBound(first.total);
    const records = [...first.records];
    for (let page = 2; page <= Math.ceil(first.total / 20); page++) {
      const next = await functionalSstReport(context, input, page);
      if (next.total !== first.total || next.authorizedDisciplines.join(",") !== first.authorizedDisciplines.join(",")) throw new Error("Fontes ou autorizações alteradas durante emissão; consulte novamente.");
      records.push(...next.records);
    }
    if (records.length !== first.total || new Set(records.map((row) => `${row.source}:${row.id}`)).size !== first.total) throw new Error("Fontes alteradas durante paginação; consulte novamente.");
    snapshot = { kind, input: first.input, history: first.history, records, total: first.total, authorizedDisciplines: first.authorizedDisciplines, omittedDisciplines: first.omittedDisciplines, complete: false, limitations: first.limitations };
  } else {
    const load = (page: number) => portal ? portalPppReport(context, input, page) : pppReport(context, input, page);
    const first = await load(1);
    assertBound(first.total); assertBound(first.historyTotal);
    const periods = [...first.periods], exposures = [...first.exposures], accidents = [...first.accidents];
    for (let page = 2; page <= Math.ceil(Math.max(first.total, first.historyTotal) / 20); page++) {
      const next = await load(page);
      if (next.total !== first.total || next.historyTotal !== first.historyTotal) throw new Error("Histórico alterado durante emissão; consulte novamente.");
      // Each independently normalized pager can repeat its last page; retain
      // stable IDs when combining the complete, authorized emission.
      for (const period of next.periods) if (!periods.some((value) => value.id === period.id)) periods.push(period);
      for (const exposure of next.exposures) if (!exposures.some((value) => value.programGroupId === exposure.programGroupId && value.functionalPeriodId === exposure.functionalPeriodId && value.startsAt.getTime() === exposure.startsAt.getTime())) exposures.push(exposure);
      for (const accident of next.accidents) if (!accidents.some((value) => value.id === accident.id)) accidents.push(accident);
    }
    if (periods.length !== first.historyTotal || accidents.length !== first.total) throw new Error("Histórico alterado durante paginação; consulte novamente.");
    snapshot = { kind, input: first.input, periods, exposures, accidents, total: first.total, historyTotal: first.historyTotal, missingHistory: first.missingHistory, missingLtcat: first.missingLtcat, complete: false, limitations: first.limitations };
  }
  const id = randomUUID(), issuedAt = new Date(), contentHash = hashSource(snapshot);
  const pdf = await renderClosurePdf({ id, kind, issuedAt, actor: context.user.name, contentHash, snapshot });
  // Stored separately from public GED validation: protected clinical snapshots
  // must not acquire a generic public download URL or signature claim.
  await withDatabaseTransaction(connection, async (tx) => {
    await tx.execute(sql`INSERT INTO "SstClosureEmission" (id,"budgetUnitId","employeeId",kind,"startsAt","endsAt",snapshot,"contentHash","createdById","createdAt") VALUES (${id},${parsed.budgetUnitId},${parsed.employeeId},${kind},${parsed.from},${parsed.until},${JSON.stringify(snapshot)}::jsonb,${contentHash},${context.user.id},${issuedAt})`);
    await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "SST_CLOSURE_REPORT", targetId: id });
  });
  return { id, pdf };
}

async function renderClosurePdf(input: { id: string; kind: string; issuedAt: Date; actor: string; contentHash: string; snapshot: Record<string, unknown> }) {
  const doc = new PDFDocument({ size: "A4", margin: 45, bufferPages: true });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.fontSize(16).text(input.kind === "PPP" ? "SST — Histórico preparatório PPP" : "SST — Prontuário funcional consolidado");
  doc.moveDown().fontSize(10).text(`Emissão: ${input.id}\nData: ${input.issuedAt.toISOString()}\nResponsável pela emissão: ${input.actor}\nDocumento não assinado; sem homologação externa.`);
  doc.moveDown().fontSize(8).text(`Hash do conteúdo (SHA-256 canônico): ${input.contentHash}`);
  const labels: Record<string, string> = { input: "Identificação e intervalo solicitado", periods: "História funcional canônica RH", exposures: "Riscos / GHE / LTCAT por período", accidents: "Comunicações de acidente", missingHistory: "Períodos sem história funcional", missingLtcat: "Períodos sem LTCAT aplicável — risco desconhecido", history: "História funcional / laudos ambientais", records: "Fontes ocupacionais consolidadas", limitations: "Limitações e pendências" };
  for (const [key, label] of Object.entries(labels)) {
    if (!(key in input.snapshot)) continue;
    doc.moveDown().fontSize(12).text(label);
    const value = input.snapshot[key];
    const entries = Array.isArray(value) ? value : [value];
    if (!entries.length) doc.fontSize(9).text("Nenhum registro localizado nesta fonte/período. Não comprova ausência de risco ou completude histórica.");
    for (const entry of entries) doc.moveDown(0.5).fontSize(9).text(typeof entry === "string" ? entry : JSON.stringify(entry, null, 2));
  }
  doc.end();
  return finished;
}
