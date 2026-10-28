import PDFDocument from "pdfkit";
import { db } from "@/db/client";
import { readVaccinationDocumentHeader } from "@/db/repositories/health-vaccination/cards";
import type { HealthVaccinationContext } from "@/lib/contracts/health-vaccination";
import { getVaccinationCard } from "./vaccination-registry-service";
export const vaccinationStatusNames: Record<string, string> = { UP_TO_DATE: "Em dia", NOT_DUE: "Ainda não exigível", OUT_OF_RANGE: "Fora da faixa etária atual", CONTRAINDICATED: "Contraindicação vigente", MISSING_PREVIOUS: "Dose anterior pendente", DUE: "Pendente" };
export async function vaccinationPatientDocument(context: HealthVaccinationContext, patientId: string, kind: "CARD" | "CERTIFICATE") {
  const card = await getVaccinationCard(context, patientId);
  if (kind === "CERTIFICATE" && (!card.configured || card.birthDateMissing)) throw new Error("Configure o calendário vigente e complete o nascimento para calcular a regularidade vacinal.");
  const { institution, unit } = await readVaccinationDocumentHeader(context.database ?? db, card.patient.referenceUnitId);
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: kind === "CARD" ? "Carteira de vacinação" : "Certidão de regularidade vacinal", Subject: `${card.patient.person.fullName} · ${card.patient.id}` } }), chunks: Buffer[] = [];
  const completed = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.fontSize(15).text(institution?.name || "Saúde municipal").fontSize(9).text(institution?.cnpj || "").text(unit?.name || "Rede municipal de saúde").moveDown();
  doc.fontSize(16).text(kind === "CARD" ? "Carteira de vacinação" : "Certidão de regularidade vacinal").moveDown().fontSize(11);
  doc.text(`Paciente: ${card.patient.person.fullName}`).text(`CNS: ${card.patient.cns || "Não informado"} · CPF: ${card.patient.person.cpf || "Não informado"}`).text(`Nascimento: ${card.patient.person.birthDate?.toLocaleDateString("pt-BR", { timeZone: "UTC" }) || "Não informado"}`).text(`Referência: ${card.at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}`).moveDown();
  if (kind === "CERTIFICATE") doc.font("Helvetica-Bold").text(card.regular ? "Situação: REGULAR — sem doses obrigatórias exigíveis pendentes na data de referência." : "Situação: COM PENDÊNCIAS — doses obrigatórias exigíveis listadas abaixo.").font("Helvetica").text("Cálculo conforme calendário municipal cadastrado, contraindicações vigentes e aplicações/resgates identificados nesta carteira.").moveDown();
  doc.font("Helvetica-Bold").text("Calendário e situação individual").font("Helvetica");
  if (!card.configured) doc.text("Calendário vigente não cadastrado.");
  if (card.birthDateMissing) doc.text("Nascimento pendente de complementação cadastral.");
  for (const row of card.rows) doc.fontSize(10).text(`${row.vaccineName} · dose ${row.doseNumber} · ${row.strategy} · ${vaccinationStatusNames[row.status]}`).fontSize(8).text(`Exigibilidade: ${row.dueAt.toLocaleDateString("pt-BR")} · regra ${row.code} v${row.version}${row.scheduledFor ? ` · aprazamento ${row.scheduledFor.toLocaleDateString("pt-BR")}` : ""}`).moveDown(0.4);
  const contraindications = card.events.filter(event => event.kind === "CONTRAINDICATION" && (!event.revokedAt || event.revokedAt > card.at) && (!event.until || event.until > card.at));
  if (contraindications.length) { doc.moveDown().fontSize(11).font("Helvetica-Bold").text("Contraindicações registradas").font("Helvetica"); for (const event of contraindications) doc.fontSize(9).text(`${event.vaccine.name} · ${event.reason} · avaliação ${event.professional.employee.name || event.professional.id}${event.until ? ` · até ${event.until.toLocaleDateString("pt-BR")}` : " · vigente sem término informado"}`); }
  if (kind === "CARD") {
    doc.moveDown().fontSize(11).font("Helvetica-Bold").text("Aplicações realizadas").font("Helvetica");
    for (const record of card.records) doc.fontSize(9).text(`${record.date.toLocaleString("pt-BR")} · ${record.vaccine.name} · dose ${record.doseNumber} · lote ${record.lotNumber || "Não informado"} · ${record.strategy || "Não informada"}`).text(`${record.unit.name} · profissional ${record.professional.employee.name || record.professional.id}${record.indicationEvent ? ` · indicação ${record.indicationEvent.professional.employee.name || record.indicationEvent.professional.id}` : ""}`).moveDown(0.3);
    doc.moveDown().fontSize(11).font("Helvetica-Bold").text("Resgates históricos e aprazamentos").font("Helvetica");
    for (const event of card.events.filter(event => ["RESCUE", "SCHEDULED", "INDICATION"].includes(event.kind))) doc.fontSize(9).text(`${event.occurredAt.toLocaleDateString("pt-BR")} · ${event.vaccine.name} · dose ${event.doseNumber} · ${event.kind === "RESCUE" ? "Resgate histórico" : event.kind === "SCHEDULED" ? "Aprazamento" : "Indicação"}${event.revokedAt ? " · encerrado/revogado" : ""}`).text(`${event.reason}${event.sourceReference ? ` · fonte ${event.sourceReference}` : ""}${event.scheduledFor ? ` · data ${event.scheduledFor.toLocaleDateString("pt-BR")}` : ""}`).moveDown(0.3);
  }
  doc.moveDown().fontSize(8).text(`Calendário: ${card.rules.map(rule => `${rule.code}/v${rule.version}`).join(", ") || "Não configurado"}`).text(`Paciente ${card.patient.id} · emissão ${new Date().toLocaleString("pt-BR")} · usuário ${context.user.id}`);
  doc.end(); return completed;
}
