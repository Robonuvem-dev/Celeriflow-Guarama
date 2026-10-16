import PDFDocument from "pdfkit";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";
import { scopedPatient, getPatientRegistrationPolicy } from "@/lib/saude/patient-registration-service";
import { byteStream } from "@/lib/transparencia/export-files";

export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModuleOperation("SAUDE", "issueReports");
  const id = decodeURIComponent((await params).id), patient = await scopedPatient(context.prisma, context, id);
  const card = new URL(request.url).searchParams.get("kind") === "CARD";
  const policy = await getPatientRegistrationPolicy(context.prisma, patient.referenceUnitId);
  const institution = await context.prisma.institution.findFirst();
  const document = new PDFDocument({ size: "A4", margin: 40 }), chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => { document.on("data", chunk => chunks.push(Buffer.from(chunk))); document.on("end", () => resolve(Buffer.concat(chunks))); document.on("error", reject); });
  document.fontSize(14).text(institution?.name || "Saúde municipal").fontSize(9).text(institution?.cnpj || "").moveDown();
  document.fontSize(16).text(card ? policy.cardTitle : "Ficha cadastral do paciente").moveDown().fontSize(11);
  const p = patient.person;
  for (const [label, value] of Object.entries({ Nome: p.fullName, CPF: p.cpf, CNS: patient.cns, Nascimento: p.birthDate?.toLocaleDateString("pt-BR"), Sexo: p.gender, "Raça/cor": p.raceColor, Mãe: p.motherUnknown ? "Desconhecida" : p.motherName, Pai: p.fatherUnknown ? "Desconhecida" : p.fatherName, Telefone: p.phonePrimary, Celular: p.whatsapp, "E-mail": p.email, Ocupação: p.profession, Situação: patient.status })) document.text(`${label}: ${value || "Não informado"}`);
  if (!card) for (const address of p.addresses) document.moveDown().text(`${address.addressType || "Endereço"}: ${address.streetName || address.street?.name || ""}, ${address.number || ""} · ${address.neighborhood?.name || ""} · ${address.neighborhood?.city || ""}/${address.neighborhood?.state || ""} · CEP ${address.zipCode || ""}`);
  if (card && policy.cardFooter) document.moveDown().text(policy.cardFooter);
  document.moveDown().fontSize(8).text(`Emitido em ${new Date().toLocaleString("pt-BR")} · usuário ${context.user.id} · paciente ${patient.id}`);
  document.end(); const bytes = await finished;
  return new Response(byteStream(bytes), { headers: { "Content-Type": "application/pdf", "Content-Disposition": `attachment; filename="${card ? "cartao" : "ficha"}-${patient.id}.pdf"`, "Cache-Control": "no-store" } });
}
