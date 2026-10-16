import PDFDocument from "pdfkit";
import { z } from "zod";
import type { AppContext } from "@/lib/platform/tenant-context";
import { tfdRequestForActor } from "./tfd-clinical-service";

const snapshotSchema = z.object({
  version: z.number(), diagnosis: z.string(), diagnosticCode: z.string().nullable(),
  clinicalHistory: z.string(), examinations: z.string(), treatment: z.string(),
  localTreatmentUnavailableReason: z.string(), transportType: z.string(), transportJustification: z.string(),
  companionRequired: z.boolean(), companionJustification: z.string().nullable(),
  patientSnapshot: z.object({ fullName: z.string(), cpf: z.string().nullable(), cns: z.string().nullable(), birthDate: z.string().nullable(), originUnitName: z.string().optional(), destination: z.string() }),
  professionalSnapshot: z.object({ name: z.string(), councilName: z.string().nullable(), councilNumber: z.string().nullable() }),
});

export async function tfdPatientDocument(context: AppContext, requestId: string, kind: "LAUDO" | "PEDIDO", version?: number) {
  const data = await context.prisma.$transaction(async tx => {
    const request = await tfdRequestForActor(tx, context, requestId);
    if (!request.clinicalReport) throw new Error("Laudo TFD ainda não incluído.");
    if (kind === "PEDIDO" && request.status !== "AUTORIZADA") throw new Error("A impressão do pedido exige tratamento autorizado e não cancelado.");
    const selectedVersion = version || request.clinicalReport.version;
    if (kind === "PEDIDO" && selectedVersion !== request.clinicalReport.version) throw new Error("O pedido deve corresponder à versão autorizada atual.");
    const revision = await tx.healthTfdReportRevision.findUniqueOrThrow({ where: { reportId_version: { reportId: request.clinicalReport.id, version: selectedVersion } } });
    const [supplements, events, benefits] = await Promise.all([
      tx.healthTfdReportSupplement.findMany({ where: { reportId: request.clinicalReport.id, reportVersion: selectedVersion }, orderBy: { createdAt: "asc" } }),
      tx.healthTfdRequestEvent.findMany({ where: { requestId }, orderBy: { createdAt: "asc" } }),
      tx.healthTfdBenefit.findMany({ where: { requestId }, orderBy: { createdAt: "asc" } }),
    ]);
    return { request, revision, supplements, events, benefits };
  });
  const snapshot = snapshotSchema.parse(data.revision.snapshot);
  const institution = await context.prisma.institution.findFirst();
  const title = kind === "LAUDO" ? "Laudo de Tratamento Fora do Domicílio" : "Pedido autorizado de Tratamento Fora do Domicílio";
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: title, Subject: `${requestId} · versão ${snapshot.version}` } });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const section = (label: string, text: string | null | undefined) => { doc.moveDown(0.4).font("Helvetica-Bold").fontSize(10).text(label).font("Helvetica").text(text || "Não informado"); };
  doc.fontSize(14).text(institution?.name || "Saúde municipal").fontSize(10).text(institution?.cnpj || "").moveDown();
  doc.fontSize(15).text(title).fontSize(10).text(`Processo ${requestId} · versão ${snapshot.version}`).text(`Situação atual: ${data.request.status}`);
  section("Paciente", `${snapshot.patientSnapshot.fullName} · CPF ${snapshot.patientSnapshot.cpf || "Não informado"} · CNS ${snapshot.patientSnapshot.cns || "Não informado"}`);
  section("Nascimento", snapshot.patientSnapshot.birthDate ? new Date(snapshot.patientSnapshot.birthDate).toLocaleDateString("pt-BR", { timeZone: "UTC" }) : null);
  section("Unidade solicitante / destino", `${snapshot.patientSnapshot.originUnitName || "Não informada"} → ${snapshot.patientSnapshot.destination}`);
  section("Profissional solicitante", `${snapshot.professionalSnapshot.name} · ${snapshot.professionalSnapshot.councilName || "Conselho não informado"} ${snapshot.professionalSnapshot.councilNumber || ""}`);
  section("Diagnóstico", `${snapshot.diagnosis}${snapshot.diagnosticCode ? ` · ${snapshot.diagnosticCode}` : ""}`);
  section("História clínica", snapshot.clinicalHistory); section("Exames realizados", snapshot.examinations);
  section("Tratamento proposto", snapshot.treatment); section("Indisponibilidade do tratamento local", snapshot.localTreatmentUnavailableReason);
  section("Transporte necessário", `${snapshot.transportType} · ${snapshot.transportJustification}`);
  section("Acompanhante", snapshot.companionRequired ? `Necessário · ${snapshot.companionJustification}` : "Não indicado neste laudo");
  for (const supplement of data.supplements) section(`Complemento · ${supplement.createdAt.toLocaleString("pt-BR")} · usuário ${supplement.actorUsuarioId}`, supplement.narrative);
  if (kind === "PEDIDO") {
    const authorization = data.events.filter(event => event.eventType === "AUTORIZACAO" && event.reportVersion === snapshot.version).at(-1);
    section("Autorização", authorization ? `${authorization.createdAt.toLocaleString("pt-BR")} · usuário ${authorization.actorUsuarioId}` : "Autorização sem evento histórico");
    for (const benefit of data.benefits) section(`Benefício · ${benefit.kind} · ${benefit.status}`, `${benefit.description} · quantidade ${benefit.quantity}${benefit.unitValue !== null ? ` · valor unitário R$ ${benefit.unitValue.toFixed(2)}` : ""}${benefit.deliveryReceipt ? ` · comprovante ${benefit.deliveryReceipt}` : ""}`);
  }
  section("Histórico de trâmites", data.events.map(event => `${event.createdAt.toLocaleString("pt-BR")} · ${event.eventType} · ${event.fromStatus || "—"} → ${event.toStatus} · usuário ${event.actorUsuarioId} · ${event.reason}`).join("\n"));
  doc.moveDown().fontSize(8).text(`Versão registrada em ${data.revision.createdAt.toLocaleString("pt-BR")} por ${data.revision.actorUsuarioId}. Emissão ${new Date().toLocaleString("pt-BR")} por ${context.user.id}.`);
  doc.end();
  return finished;
}
