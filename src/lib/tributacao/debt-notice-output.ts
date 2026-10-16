import PDFDocument from "pdfkit";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

function drawBankBarcode(doc: PDFKit.PDFDocument, code: string, amount: string) {
  if (!/^\d{44}$/.test(code) || code[0] === "8" || code[3] !== "9" || !new Prisma.Decimal(code.slice(9, 19)).div(100).eq(amount)) throw new Error("Código bancário incompatível com o boleto registrado.");
  const source = code.slice(0, 4) + code.slice(5); let weight = 2, sum = 0;
  for (let index = source.length - 1; index >= 0; index--) { sum += Number(source[index]) * weight; weight = weight === 9 ? 2 : weight + 1; }
  const remainder = 11 - sum % 11; const digit = remainder === 0 || remainder === 10 || remainder === 11 ? 1 : remainder;
  if (Number(code[4]) !== digit) throw new Error("Dígito verificador do boleto inválido.");
  const patterns = ["00110", "10001", "01001", "11000", "00101", "10100", "01100", "00011", "10010", "01010"];
  const widths: number[] = [1, 1, 1, 1];
  for (let offset = 0; offset < code.length; offset += 2) for (let index = 0; index < 5; index++) { widths.push(patterns[Number(code[offset])][index] === "1" ? 3 : 1); widths.push(patterns[Number(code[offset + 1])][index] === "1" ? 3 : 1); }
  widths.push(3, 1, 1); const unit = 480 / widths.reduce((sum, width) => sum + width, 0); let x = 48; const y = doc.y;
  widths.forEach((width, index) => { if (index % 2 === 0) doc.rect(x, y, width * unit, 36).fill("#000000"); x += width * unit; }); doc.y = y + 44;
}

export async function renderDebtNoticeOutput(db: PrismaClient, actor: TaxActor, input: { noticeId?: string; batchId?: string; format: "PDF" | "TXT" | "XML" }) {
  if (!input.noticeId && !input.batchId) throw new Error("Selecione uma notificação ou lote.");
  const entries = await db.taxRegistryEntry.findMany({ where: { entityType: "DEBT_NOTICE", category: "DEBT_NOTICE_ISSUANCE", ...(input.noticeId ? { entityId: input.noticeId } : { data: { path: ["batchId"], equals: input.batchId! } }) }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  if (!entries.length) throw new Error("Notificação não encontrada.");
  const cancellationEntries = await db.taxRegistryEntry.findMany({ where: { entityType: "DEBT_NOTICE", entityId: { in: entries.map(row => row.entityId) }, category: "DEBT_NOTICE_CANCELLATION" } }); const cancelled = new Set(cancellationEntries.map(row => row.entityId));
  for (const entry of entries) {
    const data = taxScopeSnapshot(entry.data);
    if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(String(data.budgetUnitId))) throw new Error("Notificação fora da UG autorizada.");
    if (!await db.planningEntityUnit.findFirst({ where: { governmentEntityId: String(data.governmentEntityId), budgetUnitId: String(data.budgetUnitId) } })) throw new Error("Origem da notificação não conciliada.");
  }
  const rows = entries.map(entry => ({ id: entry.entityId, data: taxScopeSnapshot(entry.data), cancelled: cancelled.has(entry.entityId) }));
  const esc = (value: unknown) => String(value ?? "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&apos;");
  if (input.format === "TXT") {
    const clean = (value: unknown) => String(value ?? "").replace(/[|\r\n]/g, " ");
    const text = ["ID|TIPO|EMISSAO|SITUACAO|CONTRIBUINTE|CPF_CNPJ|INSCRICAO|ENDERECO|SALDO", ...rows.map(row => { const target = taxScopeSnapshot(row.data.target); return [row.id, row.data.type, row.data.issuedAt, row.cancelled ? "CANCELADA" : "EMITIDA", target.taxpayer, target.document, target.inscription, target.address, target.balance].map(clean).join("|"); })].join("\r\n");
    return { bytes: new TextEncoder().encode(text), contentType: "text/plain; charset=utf-8", extension: "txt" };
  }
  if (input.format === "XML") {
    const xml = `<?xml version="1.0" encoding="UTF-8"?><notificacoes versao="1">${rows.map(row => { const target = taxScopeSnapshot(row.data.target); const debts = Array.isArray(target.debts) ? target.debts : []; return `<notificacao id="${esc(row.id)}" situacao="${row.cancelled ? "CANCELADA" : "EMITIDA"}"><tipo>${esc(row.data.type)}</tipo><emissao>${esc(row.data.issuedAt)}</emissao><contribuinte>${esc(target.taxpayer)}</contribuinte><documento>${esc(target.document)}</documento><inscricao>${esc(target.inscription)}</inscricao><endereco>${esc(target.address)}</endereco><saldo>${esc(target.balance)}</saldo><debitos>${debts.map(item => { const debt = taxScopeSnapshot(item); return `<debito id="${esc(debt.assessmentId)}"><tributo>${esc(debt.tax)}</tributo><exercicio>${esc(debt.year)}</exercicio><saldo>${esc(debt.balance)}</saldo></debito>`; }).join("")}</debitos></notificacao>`; }).join("")}</notificacoes>`;
    return { bytes: new TextEncoder().encode(xml), contentType: "application/xml; charset=utf-8", extension: "xml" };
  }
  const origin = rows[0].data;
  const unit = await db.planningEntityUnit.findFirstOrThrow({ where: { governmentEntityId: String(origin.governmentEntityId), budgetUnitId: String(origin.budgetUnitId) }, include: { governmentEntity: true, budgetUnit: true } });
  const payableGuides = new Set<string>();
  for (const row of rows.filter(row => row.data.includeBankSlip === true && !row.cancelled)) {
    const target = taxScopeSnapshot(row.data.target); const debts = Array.isArray(target.debts) ? target.debts : [];
    for (const item of debts) {
      const debt = taxScopeSnapshot(item); if (typeof debt.guideId !== "string") continue;
      const guide = await db.taxGuide.findFirst({ where: { id: debt.guideId, status: { notIn: ["Cancelada", "Paga"] }, dueDate: { gte: new Date() } }, include: { assessment: true, payments: { where: { status: "Confirmado" } } } });
      const bank = taxScopeSnapshot(taxScopeSnapshot(guide?.calculationSnapshot).bankRegistration);
      if (guide && !guide.payments.length && guide.barcode === debt.barcode && bank.status === "REGISTERED" && !["Cancelado", "Pago", "Extinto", "Suspenso"].includes(guide.assessment.status)) payableGuides.add(guide.id);
    }
  }
  const bytes = await new Promise<Uint8Array>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 48, info: { Title: "Notificações de débitos", Author: unit.governmentEntity.name } }); const chunks: Buffer[] = [];
    doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))); doc.on("error", reject);
    const text = (value: unknown, bold = false) => { if (doc.y > 720) doc.addPage(); doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).text(String(value ?? ""), { paragraphGap: 9 }); };
    try {
      for (const [index, row] of rows.entries()) {
        if (index) doc.addPage(); const target = taxScopeSnapshot(row.data.target); text(unit.governmentEntity.name, true); text(`UG ${unit.budgetUnit.code}`); text(row.data.title, true);
        if (row.cancelled) text("DOCUMENTO CANCELADO", true);
        text(`Destinatário: ${String(target.taxpayer)} · ${String(target.document)}\nInscrição: ${String(target.inscription)}\nEndereço: ${String(target.address)}`);
        text(row.data.body); text(`Saldo na emissão: R$ ${String(target.balance)}`, true);
        const debts = Array.isArray(target.debts) ? target.debts : [];
        for (const item of debts) { const debt = taxScopeSnapshot(item); text(`${String(debt.tax)} · ${String(debt.year)} · ${String(debt.assessmentNumber)}\nSaldo R$ ${String(debt.balance)} · Pagamentos R$ ${String(debt.paid)} · Compensações R$ ${String(debt.compensated)} · Vencimento ${String(debt.dueDate ?? "não conciliado")}`); }
        text(`Fundamento legal: ${String(row.data.legalBasis)}\nEmissão: ${String(row.data.issuedAt)}\nReferência: ${row.id}`);
        if (row.data.includeBankSlip === true && !row.cancelled) for (const item of debts) {
          const debt = taxScopeSnapshot(item);
          if (!payableGuides.has(String(debt.guideId))) { text(`DAM ${String(debt.guideNumber ?? "")}: consulte a situação atual para nova emissão do boleto.`); continue; }
          if (doc.y > 600) doc.addPage(); text(`Boleto registrado · DAM ${String(debt.guideNumber)} · R$ ${String(debt.guideAmount)}`, true); text(`Vencimento ${String(debt.dueDate)}`); drawBankBarcode(doc, String(debt.barcode), String(debt.guideAmount)); text(String(debt.barcode));
        }
      }
      doc.end();
    } catch (error) { doc.end(); reject(error); }
  });
  return { bytes, contentType: "application/pdf", extension: "pdf" };
}
