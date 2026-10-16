import PDFDocument from "pdfkit";
import type { AppContext } from "@/lib/platform/tenant-context";
import { z } from "zod";
import { certificateReport, reportInput } from "./report-service";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";

function csvCell(value: unknown) {
  const text = String(value ?? "");
  const safe = /^[=+@\-\t\r]/.test(text) ? `'${text}` : text;
  return `"${safe.replaceAll('"', '""')}"`;
}

export async function exportCertificateReport(context: AppContext, raw: unknown, options: unknown) {
  const input = reportInput.parse(raw);
  const { kind, format } = z.object({ kind: z.enum(["atestados", "absenteismo"]).default("atestados"), format: z.enum(["csv", "pdf"]).default("csv") }).parse(options);
  // Uses the exact same UG/clinical/report authorization as screen queries; never trusts caller datasets.
  const report = await certificateReport(context, { ...input, page: undefined });
  const rows: unknown[][] = kind === "absenteismo"
    ? [["Servidor", "Atestados", "Horas planejadas", "Horas aceitas", "Indice (%)", "Dias corridos"], ...report.statistics.map((r) => [r.name, r.certificateCount, r.plannedMinutes / 60, r.absentMinutes / 60, r.index, r.acceptedCalendarDays])]
    : [["Protocolo", "Servidor", "Matricula", "Emitente", "Motivo", "Inicio (ISO)", "Fim (ISO)", "Situacao", "Regime histórico", "Local histórico", "Centro custo histórico", "CIDs", "Fonte funcional"], ...report.records.map((r) => [r.protocolNumber, r.employee.name, r.employee.registration, r.issuer.fullName, r.reason.name, r.startsAt.toISOString(), r.endsAt.toISOString(), r.status, r.regimeName, r.localName, r.costCenterName, r.cidCodes.join(", "), r.functionalPeriodId || "Não documentada"])];
  let content: Buffer;
  if (format === "csv") content = Buffer.from(`\uFEFF${rows.map((row) => row.map(csvCell).join(";")).join("\r\n")}`, "utf8");
  else {
    const document = new PDFDocument({ size: "A4", margin: 36, info: { Title: "Relatório ocupacional restrito" } });
    const chunks: Buffer[] = [];
    const complete = new Promise<Buffer>((resolve, reject) => { document.on("data", (chunk: Buffer) => chunks.push(chunk)); document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
    document.fontSize(16).text(kind === "atestados" ? "Atestados ocupacionais" : "Absenteísmo ocupacional");
    document.fontSize(9).text(`UG: ${input.budgetUnitId} | ${input.from.toISOString()} a ${input.until.toISOString()} (fim exclusivo)`);
    document.text("Intervalos unidos e intersectados com turnos planejados e períodos funcionais autorizados. Não representa desconto nem pagamento em folha.");
    if (report.missingHistoricalSourceCount) document.text(`${report.missingHistoricalSourceCount} atestado(s) sem fonte histórica: preservados na consulta e excluídos das horas aceitas.`);
    if (report.unverifiedPlannedShiftCount) document.text(`${report.unverifiedPlannedShiftCount} turno(s) sem cobertura histórica integral. Apuração incompleta: somente partes comprovadas integram as horas.`);
    for (const row of rows.slice(1)) {
      const heading = rows[0];
      document.moveDown();
      row.forEach((value, i) => document.fontSize(9).text(`${heading[i]}: ${value == null ? "Não documentado/indisponível" : String(value)}`, { lineGap: 2 }));
    }
    document.end();
    content = await complete;
  }
  // Identifiers only. No CID, diagnosis, names, filters or document bytes enter general audit logs.
  await writeAuditEvent(context.prisma, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: format === "pdf" ? "SST_REPORT_PDF" : "SST_REPORT_CSV", targetId: input.budgetUnitId });
  return { content, contentType: format === "pdf" ? "application/pdf" : "text/csv; charset=utf-8", filename: `sst-${kind}.${format}` };
}
