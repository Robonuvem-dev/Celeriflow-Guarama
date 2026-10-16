import PDFDocument from "pdfkit";
import { assertHealthUnitAccess, type AppContext } from "@/lib/platform/tenant-context";
const states: Record<string, string> = { OPEN: "Aberto", ANALYSIS: "Em análise", APPROVED: "Aprovado", DENIED: "Negado", CANCELLED: "Cancelado", ARCHIVED: "Arquivado" };
export async function pharmacyJudicialStatement(context: AppContext, caseId: string) {
  const current = await context.prisma.healthPharmacyJudicialCase.findUniqueOrThrow({ where: { id: caseId }, include: { patient: { include: { person: true } }, lawyer: { include: { person: true } }, process: true, purchaseRequest: true, items: { include: { medicine: true, dispensations: { include: { stock: true } } } }, events: { orderBy: { createdAt: "asc" } }, documents: { include: { document: { select: { title: true } } } } } });
  assertHealthUnitAccess(context.user, current.unitId);
  const [institution, unit] = await Promise.all([context.prisma.institution.findFirst(), context.prisma.healthUnit.findUniqueOrThrow({ where: { id: current.unitId }, select: { name: true } })]);
  const doc = new PDFDocument({ size: "A4", margin: 40, info: { Title: "Extrato do processo judicial farmacêutico", Subject: `${current.caseNumber} · versão ${current.version}` } }), chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => { doc.on("data", chunk => chunks.push(Buffer.from(chunk))); doc.on("end", () => resolve(Buffer.concat(chunks))); doc.on("error", reject); });
  doc.fontSize(15).text(institution?.name || "Saúde municipal").fontSize(10).text(institution?.cnpj || "").text(unit.name).moveDown();
  doc.fontSize(16).text("Extrato do processo judicial farmacêutico").moveDown().fontSize(11);
  doc.text(`Processo: ${current.caseNumber} · versão ${current.version} · ${states[current.status]}`);
  doc.text(`Paciente: ${current.patient.person.fullName} · CNS ${current.patient.cns || "Não informado"}`);
  doc.text(`Advogado: ${current.lawyer.person.fullName} · OAB ${current.lawyer.registration}/${current.lawyer.registrationState}`);
  doc.text(`Abertura: ${current.openedAt.toLocaleDateString("pt-BR")} · validade: ${current.validUntil.toLocaleDateString("pt-BR")}`);
  doc.text(`Protocolo: ${current.process?.protocolNumber || "Não vinculado"} · pedido de compra: ${current.purchaseRequest?.number || "Não vinculado"}`).text(current.reason).moveDown();
  for (const item of current.items) {
    const delivered = item.dispensations.filter(dispensation => dispensation.status === "ACTIVE").reduce((sum, dispensation) => sum + dispensation.quantity, 0);
    doc.font("Helvetica-Bold").text(item.medicine.name).font("Helvetica").text(`Quantidade: ${item.quantity} · entregue: ${delivered} · saldo: ${item.quantity - delivered}`).text(`Posologia: ${item.dosage}`);
    for (const dispensation of item.dispensations) doc.fontSize(9).text(`${dispensation.date.toLocaleString("pt-BR")} · quantidade ${dispensation.quantity} · lote ${dispensation.stock?.batchNumber || "Não informado"} · ${dispensation.status === "ACTIVE" ? "Ativa" : "Cancelada"} · registro ${dispensation.id}`);
    doc.fontSize(11).moveDown();
  }
  doc.font("Helvetica-Bold").text("Fases e decisões").font("Helvetica");
  for (const event of current.events) doc.fontSize(9).text(`${event.createdAt.toLocaleString("pt-BR")} · ${states[event.toStatus]} · ${event.reason} · usuário ${event.actorUsuarioId}`);
  doc.moveDown().text("Digitalizações vinculadas:"); for (const link of current.documents) doc.text(`${link.document.title} · documento ${link.documentId}`);
  doc.moveDown().fontSize(8).text(`Origem ${current.id} · emissão ${new Date().toLocaleString("pt-BR")} · usuário ${context.user.id}`);
  doc.end(); return finished;
}
