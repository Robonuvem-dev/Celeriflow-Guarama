import { z } from "zod";
import PDFDocument from "pdfkit";
import { and, eq, sql } from "drizzle-orm";
import { db } from "@/db/client";
import { healthDatabaseConnection } from "./health-transaction";
import { createId } from "@/db/ids";
import { healthTimestamp } from "@/db/repositories/health/timestamp";
import { institutions, employees } from "@/db/schema/administration";
import { healthProfessionals, healthUnits } from "@/db/schema/health-workforce";
import { healthClinicalDocumentTemplates, healthClinicalDocumentOrders, healthClinicalDocuments, healthDiagnoses, healthExamRequests, healthReferrals, healthPerformedProcedures, healthClinicalEvolutions } from "@/db/schema/health-care";
import { healthPrescriptions, healthPrescriptionItems } from "@/db/schema/health-prescriptions";
import { healthSusProcedures, healthSusReferences } from "@/db/schema/health-catalogs";
import { healthTriages } from "@/db/schema/health-agenda";
import type { AppContext } from "@/lib/platform/tenant-context";
import { clinicalRecordForActor } from "./clinical-extension-service";
import { uploadProcessFile, deleteUploadedDocument } from "@/lib/platform/blob";
import { ingestGedDocument, requestDocumentSignaturesForActor } from "@/lib/documents/document-flow-service";

const kinds = ["ATTESTATION", "ATTENDANCE", "PRESCRIPTION", "COMPLETE_RECORD", "REFERRAL", "EXAM_REQUEST"] as const;
const kindNames = { ATTESTATION: "Atestado", ATTENDANCE: "Declaração de comparecimento", PRESCRIPTION: "Receituário", COMPLETE_RECORD: "Espelho do atendimento", REFERRAL: "Guia de encaminhamento", EXAM_REQUEST: "Requisição de exames" };
export async function saveClinicalDocumentTemplate(context: AppContext, raw: unknown) {
  const input = z.object({ code: z.string().trim().min(1), name: z.string().trim().min(1), kind: z.enum(kinds), bodyHtml: z.string().trim().min(1).max(30000) }).strict().parse(raw);
  const [template] = await (context.database ?? db).insert(healthClinicalDocumentTemplates).values(input).onConflictDoUpdate({ target: healthClinicalDocumentTemplates.code, set: input }).returning();
  return template;
}

const barcodePatterns: Record<string, string> = {
  "0":"nnnwwnwnn","1":"wnnwnnnnw","2":"nnwwnnnnw","3":"wnwwnnnnn","4":"nnnwwnnnw","5":"wnnwwnnnn","6":"nnwwwnnnn","7":"nnnwnnwnw","8":"wnnwnnwnn","9":"nnwwnnwnn",
  A:"wnnnnwnnw",B:"nnwnnwnnw",C:"wnwnnwnnn",D:"nnnnwwnnw",E:"wnnnwwnnn",F:"nnwnwwnnn",G:"nnnnnwwnw",H:"wnnnnwwnn",I:"nnwnnwwnn",J:"nnnnwwwnn",K:"wnnnnnnww",L:"nnwnnnnww",M:"wnwnnnnwn",N:"nnnnwnnww",O:"wnnnwnnwn",P:"nnwnwnnwn",Q:"nnnnnnwww",R:"wnnnnnwwn",S:"nnwnnnwwn",T:"nnnnwnwwn",U:"wwnnnnnnw",V:"nwwnnnnnw",W:"wwwnnnnnn",X:"nwnnwnnnw",Y:"wwnnwnnnn",Z:"nwwnwnnnn","-":"nwnnnnwnw",".":"wwnnnnwnn"," ":"nwwnnnwnn","$":"nwnwnwnnn","/":"nwnwnnnwn","+":"nwnnnwnwn","%":"nnnwnwnwn","*":"nwnnwnwnn",
};
function drawPrescriptionBarcode(document: PDFKit.PDFDocument, value: string) {
  const text = value.toUpperCase(), patterns = `*${text}*`.split("").map(character => barcodePatterns[character]);
  if (patterns.some(pattern => !pattern)) throw new Error("Identificador de receituário incompatível com o código de barras.");
  document.moveDown(); const y = document.y, width = document.page.width - 80, units = patterns.reduce((sum, pattern) => sum + [...pattern].reduce((n, item) => n + (item === "w" ? 3 : 1), 1), 0), scale = Math.min(1.2, width / units); let x = 40;
  for (const pattern of patterns) { for (let index = 0; index < pattern.length; index++) { const bar = (pattern[index] === "w" ? 3 : 1) * scale; if (index % 2 === 0) document.rect(x, y, bar, 40).fill("black"); x += bar; } x += scale; }
  document.y = y + 44; document.fontSize(8).text(text).fontSize(11);
}

function formattedText(document: PDFKit.PDFDocument, html: string) {
  const paragraphs = html.replace(/<script[\s\S]*?<\/script>/gi, "").replace(/<style[\s\S]*?<\/style>/gi, "").replace(/<br\s*\/?\s*>/gi, "\n").replace(/<\/(?:p|div|h[1-6]|li)>/gi, "\n").split("\n");
  for (const paragraph of paragraphs) {
    const bold = /<(?:strong|b|h[1-6])\b/i.test(paragraph), italic = /<(?:em|i)\b/i.test(paragraph), underline = /<u\b/i.test(paragraph);
    const text = paragraph.replace(/<[^>]+>/g, "").replaceAll("&nbsp;", " ").replaceAll("&amp;", "&").replaceAll("&lt;", "<").replaceAll("&gt;", ">");
    if (text.trim()) document.font(bold ? italic ? "Helvetica-BoldOblique" : "Helvetica-Bold" : italic ? "Helvetica-Oblique" : "Helvetica").text(text, { underline }).moveDown(0.3);
  }
  document.font("Helvetica");
}

export async function issueClinicalDocument(context: AppContext, raw: unknown) {
  const input = z.object({ medicalRecordId: z.string().min(1), kind: z.enum(kinds), templateId: z.string().nullable(), absenceDays: z.number().int().min(1).max(365).nullable(), justification: z.string().trim().max(4000), prescriptionId: z.string().nullable(), referralId: z.string().nullable(), requestSignature: z.boolean().default(false) }).strict().parse(raw);
  const database = context.database ?? db, connection = healthDatabaseConnection(context);
  const { record } = await clinicalRecordForActor(database, context, input.medicalRecordId, false);
  if (input.kind === "ATTESTATION" && (!input.absenceDays || !input.justification)) throw new Error("Atestado exige dias e justificativa clínica.");
  const [institutionRows, professionalRows, unitRows, diagnoses, prescriptionRows, itemRows, examRequests, referrals, procedureRows, evolutions, triageRows, vaccinationResult, templateRows] = await Promise.all([
    database.select().from(institutions).limit(1),
    database.select({ professional: healthProfessionals, employee: { name: employees.name } }).from(healthProfessionals).innerJoin(employees, eq(employees.id, healthProfessionals.employeeId)).where(eq(healthProfessionals.id, record.professionalId)).limit(1),
    database.select({ name: healthUnits.name }).from(healthUnits).where(eq(healthUnits.id, record.unitId)).limit(1),
    database.select({ cidReference: { code: healthSusReferences.code, description: healthSusReferences.description } }).from(healthDiagnoses).innerJoin(healthSusReferences, eq(healthSusReferences.id, healthDiagnoses.cidReferenceId)).where(eq(healthDiagnoses.medicalRecordId, record.id)),
    database.select().from(healthPrescriptions).where(eq(healthPrescriptions.medicalRecordId, record.id)),
    database.select({ item: healthPrescriptionItems }).from(healthPrescriptionItems).innerJoin(healthPrescriptions, eq(healthPrescriptions.id, healthPrescriptionItems.prescriptionId)).where(eq(healthPrescriptions.medicalRecordId, record.id)),
    database.select().from(healthExamRequests).where(eq(healthExamRequests.medicalRecordId, record.id)),
    database.select().from(healthReferrals).where(eq(healthReferrals.medicalRecordId, record.id)),
    database.select({ quantity: healthPerformedProcedures.quantity, procedure: { code: healthSusProcedures.code, description: healthSusProcedures.description } }).from(healthPerformedProcedures).innerJoin(healthSusProcedures, eq(healthSusProcedures.id, healthPerformedProcedures.procedureId)).where(eq(healthPerformedProcedures.medicalRecordId, record.id)),
    database.select({ createdAt: healthClinicalEvolutions.createdAt, content: healthClinicalEvolutions.content }).from(healthClinicalEvolutions).where(eq(healthClinicalEvolutions.medicalRecordId, record.id)),
    record.appointmentId ? database.select().from(healthTriages).where(eq(healthTriages.appointmentId, record.appointmentId)).limit(1) : [],
    database.execute<{ id: string; date: string; doseNumber: number; lotNumber: string | null; professionalId: string; vaccineName: string; professionalName: string }>(sql`SELECT v.id, v.date, v."doseNumber", v."lotNumber", v."professionalId", x.name AS "vaccineName", e.name AS "professionalName" FROM "VaccinationRecord" v JOIN "Vaccine" x ON x.id=v."vaccineId" JOIN "HealthProfessional" p ON p.id=v."professionalId" JOIN "Employee" e ON e.id=p."employeeId" WHERE v."medicalRecordId"=${record.id} OR v."appointmentId"=${record.appointmentId}`),
    input.templateId ? database.select().from(healthClinicalDocumentTemplates).where(and(eq(healthClinicalDocumentTemplates.id, input.templateId), eq(healthClinicalDocumentTemplates.kind, input.kind), eq(healthClinicalDocumentTemplates.isActive, true))).limit(1) : [],
  ]);
  const institution = institutionRows[0], professionalRow = professionalRows[0], unit = unitRows[0], template = templateRows[0];
  if (!professionalRow || !unit) throw new Error("Profissional ou unidade do atendimento não encontrado.");
  if (input.templateId && !template) throw new Error("Modelo documental ativo não encontrado para este tipo.");
  const professional = { ...professionalRow.professional, employee: professionalRow.employee };
  const vaccinations = vaccinationResult.rows.map(row => ({ ...row, date: healthTimestamp(row.date), vaccine: { name: row.vaccineName }, professional: { employee: { name: row.professionalName } } }));
  const prescriptions = prescriptionRows.map(prescription => ({ ...prescription, items: itemRows.filter(row => row.item.prescriptionId === prescription.id).map(row => row.item) }));
  const full = { ...record, unit, diagnoses, prescriptions, examRequests, referrals, procedures: procedureRows, evolutions, vaccinations, appointment: record.appointment ? { ...record.appointment, triage: triageRows[0], vaccinations } : null };
  if (input.kind === "REFERRAL" && (!input.referralId || !full.referrals.some(row => row.id === input.referralId))) throw new Error("Selecione um encaminhamento especializado deste atendimento.");
  if (input.kind === "EXAM_REQUEST" && !full.examRequests.length) throw new Error("Este atendimento não possui requisições de exames.");
  if (input.kind === "PRESCRIPTION" && !full.prescriptions.some(row => (!input.prescriptionId || row.id === input.prescriptionId) && row.items.length > 0)) throw new Error("Selecione um receituário com itens deste atendimento.");
  const order = { id: createId() };
  const document = new PDFDocument({ size: "A4", margin: 40 }), chunks: Buffer[] = [];
  const ready = new Promise<Buffer>((resolve, reject) => { document.on("data", chunk => chunks.push(Buffer.from(chunk))); document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
  document.fontSize(15).text(institution?.name || "Saúde municipal").fontSize(9).text(institution?.cnpj || "").text(full.unit.name).moveDown().fontSize(16).text(template?.name || kindNames[input.kind]).moveDown().fontSize(11);
  document.text(`Paciente: ${record.patient.person.fullName}`).text(`CNS: ${record.patient.cns || "Não informado"}`).text(`Atendimento: ${record.date.toLocaleString("pt-BR")}`).text(`Profissional: ${professional.employee.name} · ${professional.councilName || ""} ${professional.councilNumber || ""}`).moveDown();
  if (template) formattedText(document, template.bodyHtml.replaceAll("{paciente}", record.patient.person.fullName).replaceAll("{profissional}", professional.employee.name).replaceAll("{unidade}", full.unit.name).replaceAll("{data}", record.date.toLocaleDateString("pt-BR")).replaceAll("{dias}", String(input.absenceDays || "")).replaceAll("{justificativa}", input.justification));
  if (input.kind === "ATTESTATION") document.text(`Afastamento: ${input.absenceDays} dia(s).`).text(input.justification);
  if (input.kind === "ATTENDANCE") document.text(`Compareceu para atendimento nesta unidade em ${record.date.toLocaleString("pt-BR")}.`);
  if (input.kind === "PRESCRIPTION") {
    const prescriptions = input.prescriptionId ? full.prescriptions.filter(prescription => prescription.id === input.prescriptionId) : full.prescriptions;
    if (!prescriptions.length) throw new Error("Selecione receituário deste atendimento.");
    for (const prescription of prescriptions) {
      document.moveDown().font("Helvetica-Bold").text(`${prescription.prescriptionType} · ${prescription.manualGroup || "Receituário"}`).font("Helvetica");
      if (prescription.validUntil) document.text(`Receita válida até ${prescription.validUntil.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" })}`);
      for (const item of prescription.items) document.text(`${item.medicineName} · ${item.presentation || ""}`).text(`Posologia: ${[item.dose, item.route, item.frequency, item.duration].filter(Boolean).join(" · ")} · quantidade ${item.quantity ?? "Não informada"} · uso ${item.usageType}${item.treatmentDays ? ` · ${item.treatmentDays} dias` : ""}`).text(item.instructions || "").moveDown(0.5);
      drawPrescriptionBarcode(document, prescription.barcode || prescription.id);
    }
  }
  if (input.kind === "REFERRAL") for (const referral of full.referrals.filter(row => !input.referralId || row.id === input.referralId)) document.text(`Destino: ${referral.specialty} · prioridade ${referral.priority}`).text(referral.reason).text(referral.observation || "").moveDown();
  if (input.kind === "EXAM_REQUEST") for (const exam of full.examRequests) document.text(`${exam.examName} · ${exam.priority}`).text(exam.indication || exam.reason || "").moveDown();
  if (input.kind === "COMPLETE_RECORD") {
    const triage = full.appointment?.triage;
    if (triage) document.text(`Triagem: ${triage.chiefComplaint} · ${triage.riskClassification} · PA ${triage.bloodPressure || ""} · temperatura ${triage.temperature ?? ""} · peso ${triage.weight ?? ""} · altura ${triage.height ?? ""}`).moveDown();
    for (const [label, value] of Object.entries({ Queixa: full.chiefComplaint, Anamnese: full.anamnesis, Avaliação: full.assessment, Evolução: full.evolution, Conduta: full.conduct, Observações: full.observations, Desfecho: full.outcome })) document.text(`${label}: ${value || "Não informado"}`).moveDown(0.4);
    for (const diagnosis of full.diagnoses) document.text(`CID ${diagnosis.cidReference.code} · ${diagnosis.cidReference.description}`);
    for (const evolution of full.evolutions) document.text(`${evolution.createdAt.toLocaleString("pt-BR")}: ${evolution.content}`);
    for (const procedure of full.procedures) document.text(`Procedimento ${procedure.procedure.code} · ${procedure.procedure.description} · ${procedure.quantity}`);
    const vaccinations = [...new Map([...full.vaccinations, ...(full.appointment?.vaccinations || [])].map(vaccination => [vaccination.id, vaccination])).values()];
    for (const vaccination of vaccinations) document.text(`Vacinação: ${vaccination.vaccine.name} · dose ${vaccination.doseNumber} · ${vaccination.date.toLocaleString("pt-BR")} · lote ${vaccination.lotNumber || "Não informado"} · profissional ${vaccination.professional.employee.name || vaccination.professionalId}`);
  }
  document.moveDown().fontSize(8).text(`Origem: ${record.id} · emissão ${order.id} · usuário ${context.user.id} · ${new Date().toLocaleString("pt-BR")}`); document.end();
  const bytes = await ready, file = new File([new Uint8Array(bytes)], `${input.kind.toLowerCase()}-${order.id}.pdf`, { type: "application/pdf" });
  const blob = await uploadProcessFile(file);
  let committed = false;
  try {
    const issued = await ingestGedDocument(connection, { title: `${kindNames[input.kind]} · ${record.patient.person.fullName}`, documentType: kindNames[input.kind], documentClassCode: "SAUDE_DOCUMENTO_PADRAO", fileUrl: blob.url, content: bytes, actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => { await clinicalRecordForActor(tx, context, record.id, false); await tx.insert(healthClinicalDocuments).values({ medicalRecordId: record.id, documentId, kind: input.kind, addedByUsuarioId: context.user.id }); await tx.insert(healthClinicalDocumentOrders).values({ id: order.id, medicalRecordId: record.id, kind: input.kind, templateId: input.templateId, data: input, actorUsuarioId: context.user.id, documentId }); } });
    committed = true;
    if (input.requestSignature) await requestDocumentSignaturesForActor(connection, context.user.id, issued.documentId, [context.user.id]);
    return { documentId: issued.documentId, orderId: order.id };
  } catch (error) { if (!committed) await deleteUploadedDocument(blob).catch(() => {}); throw error; }
}
