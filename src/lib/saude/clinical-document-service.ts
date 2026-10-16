import { z } from "zod";
import PDFDocument from "pdfkit";
import type { AppContext } from "@/lib/platform/tenant-context";
import { clinicalRecordForActor } from "./clinical-extension-service";
import { uploadProcessFile, deleteUploadedDocument } from "@/lib/platform/blob";
import { ingestGedDocument, requestDocumentSignaturesForActor } from "@/lib/documents/document-flow-service";

const kinds = ["ATTESTATION", "ATTENDANCE", "PRESCRIPTION", "COMPLETE_RECORD", "REFERRAL", "EXAM_REQUEST"] as const;
const kindNames = { ATTESTATION: "Atestado", ATTENDANCE: "Declaração de comparecimento", PRESCRIPTION: "Receituário", COMPLETE_RECORD: "Espelho do atendimento", REFERRAL: "Guia de encaminhamento", EXAM_REQUEST: "Requisição de exames" };
export async function saveClinicalDocumentTemplate(context: AppContext, raw: unknown) {
  const input = z.object({ code: z.string().trim().min(1), name: z.string().trim().min(1), kind: z.enum(kinds), bodyHtml: z.string().trim().min(1).max(30000) }).strict().parse(raw);
  return context.prisma.healthClinicalDocumentTemplate.upsert({ where: { code: input.code }, create: input, update: input });
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
  const { record } = await clinicalRecordForActor(context.prisma, context, input.medicalRecordId, false);
  if (input.kind === "ATTESTATION" && (!input.absenceDays || !input.justification)) throw new Error("Atestado exige dias e justificativa clínica.");
  const [institution, professional, full, template] = await Promise.all([
    context.prisma.institution.findFirst(), context.prisma.healthProfessional.findUniqueOrThrow({ where: { id: record.professionalId }, include: { employee: true } }),
    context.prisma.medicalRecord.findUniqueOrThrow({ where: { id: record.id }, include: { diagnoses: { include: { cidReference: true } }, prescriptions: { include: { items: true } }, examRequests: true, referrals: true, procedures: { include: { procedure: true } }, evolutions: true, unit: true, vaccinations: { include: { vaccine: true, professional: { include: { employee: true } } } }, appointment: { include: { triage: true, vaccinations: { include: { vaccine: true, professional: { include: { employee: true } } } } } } } }),
    input.templateId ? context.prisma.healthClinicalDocumentTemplate.findFirstOrThrow({ where: { id: input.templateId, kind: input.kind, isActive: true } }) : null,
  ]);
  if (input.kind === "REFERRAL" && (!input.referralId || !full.referrals.some(row => row.id === input.referralId))) throw new Error("Selecione um encaminhamento especializado deste atendimento.");
  if (input.kind === "EXAM_REQUEST" && !full.examRequests.length) throw new Error("Este atendimento não possui requisições de exames.");
  if (input.kind === "PRESCRIPTION" && !full.prescriptions.some(row => (!input.prescriptionId || row.id === input.prescriptionId) && row.items.length > 0)) throw new Error("Selecione um receituário com itens deste atendimento.");
  const order = await context.prisma.healthClinicalDocumentOrder.create({ data: { medicalRecordId: record.id, kind: input.kind, templateId: input.templateId, data: input, actorUsuarioId: context.user.id } });
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
    const issued = await ingestGedDocument(context.prisma, { title: `${kindNames[input.kind]} · ${record.patient.person.fullName}`, documentType: kindNames[input.kind], documentClassCode: "SAUDE_DOCUMENTO_PADRAO", fileUrl: blob.url, content: bytes, actorUsuarioId: context.user.id, afterCreate: async (tx, documentId) => { await tx.healthClinicalDocument.create({ data: { medicalRecordId: record.id, documentId, kind: input.kind, addedByUsuarioId: context.user.id } }); await tx.healthClinicalDocumentOrder.update({ where: { id: order.id }, data: { documentId } }); } });
    committed = true;
    if (input.requestSignature) await requestDocumentSignaturesForActor(context.prisma, context.user.id, issued.documentId, [context.user.id]);
    return { documentId: issued.documentId, orderId: order.id };
  } catch (error) { if (!committed) await deleteUploadedDocument(blob).catch(() => {}); throw error; }
}
