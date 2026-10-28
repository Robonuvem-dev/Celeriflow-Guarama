import PDFDocument from "pdfkit";
import { z } from "zod";
import { and, eq } from "drizzle-orm";
import { db } from "@/db/client";
import { institutions } from "@/db/schema/administration";
import { healthTreatmentReportRevisions } from "@/db/schema/health-treatment";
import { runHealthTransaction } from "./health-transaction";
import type { AppContext } from "@/lib/platform/tenant-context";
import { treatmentReportForActor } from "./treatment-authorization-service";

const snapshotSchema = z.object({
  kind: z.string(), version: z.number(), diagnosis: z.string(), diagnosticCode: z.string().nullable(),
  clinicalHistory: z.string(), examinations: z.string(), treatmentJustification: z.string(),
  admissionAt: z.string().nullable(), plannedStart: z.string(), plannedEnd: z.string(), initialApac: z.boolean(),
  patientSnapshot: z.object({ fullName: z.string(), cpf: z.string().nullable(), cns: z.string().nullable(), birthDate: z.string().nullable(), gender: z.string().nullable(), motherName: z.string().nullable(), unitName: z.string(), cnes: z.string().nullable() }),
  professionalSnapshot: z.object({ name: z.string(), councilName: z.string().nullable(), councilNumber: z.string().nullable(), cns: z.string().nullable() }),
  procedures: z.array(z.object({ quantity: z.number(), role: z.string(), procedure: z.object({ code: z.string(), description: z.string() }), performerProfessional: z.object({ employee: z.object({ name: z.string() }) }).nullable() })),
});
const dateText = (date: Date | string) => new Date(date).toLocaleDateString("pt-BR", { timeZone: "UTC" });

export async function treatmentPatientDocument(context: AppContext, reportId: string, kind: "LAUDO" | "AUTORIZACAO", version?: number) {
  const { report, revision } = await runHealthTransaction(context, async tx => {
    const report = await treatmentReportForActor(tx, context, reportId);
    if (kind === "AUTORIZACAO" && (!report.authorization || report.authorization.status !== "ATIVA")) throw new Error("Documento de autorização exige numeração ativa, sem cancelamento.");
    const selectedVersion = version || (kind === "AUTORIZACAO" ? report.authorization!.reportVersion : report.version);
    if (kind === "AUTORIZACAO" && selectedVersion !== report.authorization!.reportVersion) throw new Error("A versão selecionada não corresponde à autorização.");
    const [revision] = await tx.select().from(healthTreatmentReportRevisions).where(and(eq(healthTreatmentReportRevisions.reportId, reportId), eq(healthTreatmentReportRevisions.version, selectedVersion))).limit(1);
    if (!revision) throw new Error("Versão do laudo não encontrada.");
    return { report, revision };
  });
  const snapshot = snapshotSchema.parse(revision.snapshot), [institution] = await (context.database ?? db).select().from(institutions).limit(1);
  const title = kind === "LAUDO" ? `Laudo para solicitação de ${snapshot.kind}` : `Autorização de ${snapshot.kind}`;
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: title, Subject: `${report.id} · versão ${snapshot.version}` } }), chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  const section = (label: string, text: string | null | undefined) => { doc.moveDown(0.3).fontSize(10).font("Helvetica-Bold").text(label).font("Helvetica").text(text || "Não informado"); };
  for (let copy = 1; copy <= (kind === "AUTORIZACAO" ? 2 : 1); copy++) {
    if (copy > 1) doc.addPage();
    doc.fontSize(14).text(institution?.name || "Saúde municipal").fontSize(10).text(institution?.cnpj || "").moveDown();
    doc.fontSize(15).text(title).fontSize(10).text(`Processo ${report.id} · versão ${snapshot.version}${kind === "AUTORIZACAO" ? ` · ${copy}ª via` : ""}`);
    section("Paciente", `${snapshot.patientSnapshot.fullName} · CPF ${snapshot.patientSnapshot.cpf || "Não informado"} · CNS ${snapshot.patientSnapshot.cns || "Não informado"}`);
    section("Dados pessoais", `Nascimento ${snapshot.patientSnapshot.birthDate ? dateText(snapshot.patientSnapshot.birthDate) : "Não informado"} · sexo ${snapshot.patientSnapshot.gender || "Não informado"} · mãe ${snapshot.patientSnapshot.motherName || "Não informada"}`);
    section("Unidade solicitante", `${snapshot.patientSnapshot.unitName} · CNES ${snapshot.patientSnapshot.cnes || "Não informado"}`);
    section("Profissional solicitante", `${snapshot.professionalSnapshot.name} · ${snapshot.professionalSnapshot.councilName || ""} ${snapshot.professionalSnapshot.councilNumber || ""} · CNS ${snapshot.professionalSnapshot.cns || "Não informado"}`);
    section("Diagnóstico", `${snapshot.diagnosis}${snapshot.diagnosticCode ? ` · ${snapshot.diagnosticCode}` : ""}`);
    section("História clínica", snapshot.clinicalHistory); section("Exames", snapshot.examinations); section("Justificativa do tratamento", snapshot.treatmentJustification);
    section("Período previsto", `${dateText(snapshot.plannedStart)} a ${dateText(snapshot.plannedEnd)}${snapshot.admissionAt ? ` · internação ${new Date(snapshot.admissionAt).toLocaleString("pt-BR")}` : ""}${snapshot.kind === "APAC" ? ` · ${snapshot.initialApac ? "Inicial" : "Continuidade"}` : ""}`);
    for (const item of snapshot.procedures) section(`${item.role === "PRIMARY" ? "Procedimento principal" : "Procedimento secundário"} · quantidade ${item.quantity}`, `${item.procedure.code} · ${item.procedure.description} · executor ${item.performerProfessional?.employee.name || "Não informado"}`);
    if (kind === "AUTORIZACAO" && report.authorization) {
      const authorization = report.authorization;
      section("Número autorizado", authorization.number);
      section("Órgão emissor", `${authorization.range.issuer.code} · ${authorization.range.issuer.name} · tipo ${authorization.range.issuer.typeCode}`);
      section("Autorização e validade", `${authorization.authorizedAt.toLocaleString("pt-BR")} · usuário ${authorization.authorizedByUsuarioId} · válida de ${dateText(authorization.validFrom)} a ${dateText(authorization.validUntil)}`);
    }
    section("Origem da versão", `${revision.createdAt.toLocaleString("pt-BR")} · usuário ${revision.actorUsuarioId} · ${revision.reason}`);
    doc.moveDown().fontSize(8).text(`Emissão ${new Date().toLocaleString("pt-BR")} · usuário ${context.user.id}`);
  }
  doc.end(); return finished;
}
