import { createHash } from "node:crypto";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import type { JsonObject } from "@/db/json";
import { listControlPlans } from "@/db/repositories/internal-control/records";
import PDFDocument from "pdfkit";
import ExcelJS from "exceljs";
import { C7OperationError } from "./operations-service";
import { readControlNotice } from "./control-notifications";
import { readControlAudit } from "./control-audits";

type Actor = { usuarioId: string; allowedBudgetUnitIds?: string[] };
type Report = { title: string; headers: string[]; rows: string[][]; hash: string };

export async function buildControlReport(db: DatabaseConnection, actor: Actor, input: { planId: string; noticeId?: string; auditId?: string }): Promise<Report> {
  return withDatabaseTransaction(db, tx => buildControlReportInTransaction(tx, actor, input), { isolationLevel: "repeatable read" });
}

export async function buildControlReportInTransaction(tx: DatabaseTransaction, actor: Actor, input: { planId: string; noticeId?: string; auditId?: string }): Promise<Report> {
    const [plan] = await listControlPlans(tx, { planId: input.planId });
    if (!plan || (actor.allowedBudgetUnitIds && (!plan.budgetUnitId || !actor.allowedBudgetUnitIds.includes(plan.budgetUnitId)))) throw new C7OperationError("Plano fora das unidades gestoras autorizadas.");
    if (input.noticeId && input.auditId) throw new C7OperationError("Selecione uma notificação ou auditoria para impressão.");
    const visibleAuditIds = new Set(plan.events.filter(event => event.eventType === "AUDIT_SCHEDULED").flatMap(event => {
      const audit = readControlAudit(event.snapshot);
      return audit && [plan.ownerId, audit.auditorId, audit.recipientId].includes(actor.usuarioId) ? [event.id] : [];
    }));
    const auditEvent = input.auditId ? plan.events.find(event => event.id === input.auditId && visibleAuditIds.has(event.id)) : null;
    const audit = auditEvent ? readControlAudit(auditEvent.snapshot) : null;
    if (input.auditId && !audit) throw new C7OperationError("Auditoria indisponível para este usuário.");
    const notice = input.noticeId ? plan.events.find(event => event.id === input.noticeId && event.eventType === "CONTROL_NOTICE_SENT") : null;
    const data = notice ? readControlNotice(notice.snapshot) : null;
    if (input.noticeId && (!notice || !data || (data.recipientId !== actor.usuarioId && notice.actorId !== actor.usuarioId && plan.ownerId !== actor.usuarioId))) throw new C7OperationError("Notificação indisponível para este usuário.");
    const rows: string[][] = [
      ["Plano", plan.id, plan.title, plan.reference],
      ["Entidade / UG", plan.budgetUnitId ?? "", plan.budgetUnit?.planningEntityUnit?.governmentEntity.name ?? "Legado não conciliado", plan.budgetUnit?.name ?? ""],
      ["Situação", plan.status, "Prazo", plan.dueAt?.toISOString() ?? ""],
    ];
    if (!input.noticeId && !input.auditId) {
      rows.push(["Resumo", String(plan.findings.length), "Apontamentos resolvidos / pendentes", `${plan.findings.filter(finding => finding.status === "RESOLVIDO").length} / ${plan.findings.filter(finding => finding.status !== "RESOLVIDO").length}`]);
      for (const finding of plan.findings) rows.push(["Apontamento", finding.id, `${finding.title} · ${finding.status}`, `${finding.description}\nPrazo: ${finding.dueAt?.toISOString() ?? "não definido"}; responsável: ${finding.responsibleId ?? "não definido"}; GED: ${finding.evidenceDocumentId ?? "não vinculado"}`]);
    }
    for (const event of plan.events) {
      if (event.eventType.startsWith("CONTROL_REPORT_") && plan.ownerId !== actor.usuarioId) continue;
      const snapshot = event.snapshot as JsonObject;
      if (typeof snapshot.auditId === "string" && !visibleAuditIds.has(snapshot.auditId)) continue;
      if (event.eventType.startsWith("AUDIT_") && !visibleAuditIds.has(event.eventType === "AUDIT_SCHEDULED" ? event.id : String(snapshot.auditId))) continue;
      if (input.auditId && event.id !== input.auditId && snapshot.auditId !== input.auditId) continue;
      if (input.noticeId && event.id !== input.noticeId && snapshot.noticeId !== input.noticeId) continue;
      const printableSnapshot = event.eventType === "CONTROL_REPORT_FINALIZED" ? Object.fromEntries(Object.entries(snapshot).filter(([key]) => key !== "pdfBase64")) : snapshot;
      rows.push([event.eventType, event.id, `${event.createdAt.toISOString()} · usuário ${event.actorId}`, `${event.reason}\nMemória congelada: ${JSON.stringify(printableSnapshot)}`]);
    }
    const title = input.auditId ? `Auditoria, questionário, respostas e análise — ${audit!.title}` : input.noticeId ? `Notificação e respostas — ${data!.title}` : `Histórico de Controle Interno — ${plan.title}`;
    const headers = ["Tipo", "Identificador", "Referência", "Conteúdo / evidências"];
    const hash = createHash("sha256").update(JSON.stringify({ title, headers, rows })).digest("hex");
    return { title, headers, rows, hash };
}

export async function renderControlReport(report: Report, format: "PDF" | "CSV" | "XLSX") {
  if (format === "CSV") {
    const quote = (value: string) => `"${(/^[\s]*[=+@-]/.test(value) ? "'" + value : value).replaceAll('"', '""')}"`;
    return { bytes: Buffer.from("\uFEFF" + [report.headers, ...report.rows, ["SHA-256 do conjunto", report.hash, "", ""]].map(row => row.map(quote).join(";")).join("\r\n"), "utf8"), contentType: "text/csv; charset=utf-8", extension: "csv" };
  }
  if (format === "XLSX") {
    const workbook = new ExcelJS.Workbook();
    const sheet = workbook.addWorksheet("Controle Interno");
    sheet.addRow(report.headers); report.rows.forEach(row => sheet.addRow(row));
    sheet.addRow(["SHA-256 do conjunto", report.hash]);
    sheet.getRow(1).font = { bold: true }; sheet.views = [{ state: "frozen", ySplit: 1 }];
    sheet.columns.forEach((column, index) => { column.width = index === 3 ? 90 : 30; column.alignment = { vertical: "top", wrapText: true }; });
    return { bytes: Buffer.from(await workbook.xlsx.writeBuffer()), contentType: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet", extension: "xlsx" };
  }
  const pdf = new PDFDocument({ size: "A4", margin: 40, bufferPages: true });
  const chunks: Buffer[] = [];
  const bytes = new Promise<Buffer>((resolve, reject) => { pdf.on("data", chunk => chunks.push(Buffer.from(chunk))); pdf.on("end", () => resolve(Buffer.concat(chunks))); pdf.on("error", reject); });
  pdf.fontSize(15).text(report.title); pdf.moveDown();
  pdf.fontSize(8).text(`SHA-256 do conjunto: ${report.hash}`); pdf.moveDown();
  for (const row of report.rows) {
    pdf.fontSize(10).text(`${row[0]} · ${row[1]}`);
    for (let column = 2; column < report.headers.length; column++) pdf.fontSize(9).text(`${report.headers[column]}: ${row[column] ?? ""}`);
    pdf.moveDown();
  }
  const range = pdf.bufferedPageRange();
  for (let page = range.start; page < range.start + range.count; page++) { pdf.switchToPage(page); pdf.fontSize(8).text(`${page - range.start + 1}/${range.count}`, 40, pdf.page.height - 25, { lineBreak: false }); }
  pdf.end();
  return { bytes: await bytes, contentType: "application/pdf", extension: "pdf" };
}
