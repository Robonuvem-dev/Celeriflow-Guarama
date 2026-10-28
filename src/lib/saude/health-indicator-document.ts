import PDFDocument from "pdfkit";
import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { healthCareIndicators, healthIndicatorKeys } from "./health-indicator-service";
import { followupCsvCell } from "./followup-presentation";
import { asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db/client";
import { healthUnits } from "@/db/schema/health-workforce";
import { institutions } from "@/db/schema/administration";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";

export async function healthIndicatorDocument(context: AppContext, raw: unknown) {
  const input = z.object({ period: z.string(), unitId: z.string().default(""), elderlyAge: z.coerce.number().default(60), childMonths: z.coerce.number().default(24), indicator: z.enum(healthIndicatorKeys).default("GESTATION"), status: z.enum(["ALL", "NO_RECORD", "RECORDED"]).default("NO_RECORD"), formato: z.enum(["csv", "pdf"]) }).strict().parse(raw);
  const dataset = await healthCareIndicators(context, { period: input.period, unitId: input.unitId, elderlyAge: input.elderlyAge, childMonths: input.childMonths });
  const indicator = dataset.indicators.find(metric => metric.key === input.indicator)!;
  const people = indicator.people.filter(person => input.status === "ALL" || person.status === input.status);
  const database = context.database ?? db;
  const units = await database.select({ name: healthUnits.name, cnes: healthUnits.cnes }).from(healthUnits).where(input.unitId ? eq(healthUnits.id, input.unitId) : context.user.hasHealthAccessScope ? inArray(healthUnits.id, context.user.allowedHealthUnitIds || []) : undefined).orderBy(asc(healthUnits.name));
  const unitLabel = units.map(unit => `${unit.name}${unit.cnes ? ` · CNES ${unit.cnes}` : ""}`).join("; ") || "Nenhuma unidade no escopo";
  const statusLabel = input.status === "ALL" ? "Toda a população do indicador" : input.status === "RECORDED" ? "Com registro no recorte" : "Sem registro no recorte";
  let bytes: Buffer;
  if (input.formato === "csv") {
    const header = ["Linha", "Indicador", "Período", "Numerador", "Denominador", "Percentual", "Paciente ID", "Nome", "Unidade ID", "Telefone", "Endereço", "Horário preferido", "Situação", "Origens", "Definição da população e cálculo", "Unidades do recorte"];
    const definition = `${indicator.population} ${indicator.definition}`;
    const summary = ["RESUMO", indicator.name, dataset.period, indicator.numerator, indicator.denominator, indicator.percentage, "", "", "", "", "", "", statusLabel, "", definition, unitLabel];
    const rows = people.map(person => ["PACIENTE", indicator.name, dataset.period, indicator.numerator, indicator.denominator, indicator.percentage, person.patientId, person.name, person.unitId, person.phone, person.address, person.contactHours, person.status === "RECORDED" ? "Com registro no recorte" : "Sem registro no recorte", person.evidence.map(entry => `${entry.type}:${entry.id} · ${entry.date} · ${entry.href}`).join("; "), definition, unitLabel]);
    bytes = Buffer.from(`\uFEFF${[header, summary, ...rows].map(row => row.map(followupCsvCell).join(";")).join("\r\n")}\r\n`, "utf8");
  } else {
    const [institution] = await database.select({ name: institutions.name, cnpj: institutions.cnpj }).from(institutions).limit(1);
    const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: indicator.name } }), chunks: Buffer[] = [];
    const finished = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
    doc.fontSize(14).text(institution?.name || "Saúde municipal").fontSize(10).text(institution?.cnpj || "").text(`Unidades: ${unitLabel}`).moveDown().fontSize(15).text(indicator.name).fontSize(10);
    doc.text(`Período ${dataset.period} · ${indicator.numerator}/${indicator.denominator} · ${indicator.percentage !== null ? `${indicator.percentage}%` : "Sem população elegível"}`).text(indicator.population).text(indicator.definition).moveDown();
    doc.text(`Lista selecionada: ${statusLabel} · ${people.length} pessoas`);
    for (const person of people) {
      doc.moveDown().font("Helvetica-Bold").text(person.name).font("Helvetica").text(`${person.status === "RECORDED" ? "Com registro no recorte" : "Sem registro no recorte"} · paciente ${person.patientId} · unidade ${person.unitId || "Não informada"}`).text(`Telefone: ${person.phone || "Não informado"} · contato preferido ${person.contactHours || "Não informado"}`).text(`Endereço: ${person.address || "Não informado"}`);
      for (const entry of person.evidence) doc.fontSize(8).text(`${entry.type}:${entry.id} · ${new Date(entry.date).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${entry.href}`).fontSize(10);
    }
    doc.moveDown().fontSize(8).text(`Emissão ${new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · usuário ${context.user.id}`); doc.end(); bytes = await finished;
  }
  await insertAuditEvent(database, { actorUsuarioId: context.user.id, eventType: auditEventTypes.reportIssued, targetType: "HEALTH_CARE_INDICATOR", targetId: `${input.period}:${input.indicator}` });
  return { bytes, contentType: input.formato === "csv" ? "text/csv; charset=utf-8" : "application/pdf", filename: `indicador-${input.indicator.toLowerCase()}-${input.period}.${input.formato}` };
}
