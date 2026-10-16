import PDFDocument from "pdfkit";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { TaxActor } from "./index";
import { assertInternalItbiProcessAccess, assertPortalItbiAccess } from "./itbi-process-channel";
import { taxScopeSnapshot, taxAssessmentCompensatedValue } from "./scope";
import { readItbiAdditionalForms } from "./itbi-additional-forms";

/** Reads the current municipal record in one consistent snapshot, including reversals. */
export async function renderItbiProcessPdf(db: PrismaClient, auth: { actor: TaxActor } | { usuarioId: string }, declarationId: string, kind: "PROCESS" | "SETTLEMENT") {
  const snapshot = await db.$transaction(async tx => {
    const access = "actor" in auth ? await assertInternalItbiProcessAccess(tx, auth.actor, declarationId) : await assertPortalItbiAccess(tx, auth.usuarioId, declarationId);
    const selected = access.declaration;
    const declarations = await tx.itbiDeclaration.findMany({ where: selected.processId ? { processId: selected.processId } : { id: selected.id }, include: { transactionType: true, parties: true, events: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] } }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
    for (const row of declarations) {
      const scope = taxScopeSnapshot(row.calculationSnapshot);
      if (scope.governmentEntityId !== access.scope.governmentEntityId || scope.budgetUnitId !== access.scope.budgetUnitId) throw new Error("O processo reúne origens diferentes; concilie os vínculos antes de emitir o documento agregado.");
    }
    const unit = await tx.planningEntityUnit.findFirstOrThrow({ where: access.scope, include: { governmentEntity: true, budgetUnit: true } });
    const taxpayers = await tx.taxpayer.findMany({ where: { id: { in: [...new Set(declarations.flatMap(row => row.parties.map(party => party.taxpayerId)))] } }, select: { id: true, person: { select: { fullName: true, cpf: true } }, company: { select: { corporateName: true, cnpj: true } } } });
    const names = new Map(taxpayers.map(row => [row.id, { name: row.company?.corporateName ?? row.person?.fullName ?? row.id, document: row.company?.cnpj ?? row.person?.cpf ?? "" }]));
    const properties = await tx.realEstate.findMany({ where: { id: { in: declarations.map(row => row.realEstateId) } }, select: { id: true, municipalInsc: true, streetName: true, number: true, landArea: true, builtArea: true } });
    const users = await tx.usuario.findMany({ where: { id: { in: declarations.flatMap(row => row.events.flatMap(event => event.actorUsuarioId ? [event.actorUsuarioId] : [])) } }, select: { id: true, nome: true } });
    const actors = new Map(users.map(row => [row.id, row.nome]));
    const rows = [];
    for (const row of declarations) {
      if (kind === "SETTLEMENT" && row.status === "RETIFICADA") continue;
      const treatmentEntry = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_DECLARATION", entityId: row.id, category: "ITBI_FISCAL_TREATMENT" }, orderBy: { version: "desc" } });
      const treatment = taxScopeSnapshot(treatmentEntry?.data);
      const assessment = row.assessmentId ? await tx.taxAssessment.findUniqueOrThrow({ where: { id: row.assessmentId } }) : null;
      if (assessment) { const origin = taxScopeSnapshot(assessment.calculationSnapshot); if (origin.governmentEntityId !== access.scope.governmentEntityId || origin.budgetUnitId !== access.scope.budgetUnitId) throw new Error("Crédito e processo ITBI possuem origens divergentes."); }
      const payments = row.assessmentId ? await tx.taxPayment.findMany({ where: { guide: { assessmentId: row.assessmentId }, status: "Confirmado" }, select: { id: true, paymentDate: true, amountPaidDecimal: true }, orderBy: [{ paymentDate: "asc" }, { id: "asc" }] }) : [];
      if (payments.some(payment => !payment.amountPaidDecimal)) throw new Error("Arrecadação sem valor Decimal conciliado.");
      const paid = payments.reduce((sum, payment) => sum.plus(payment.amountPaidDecimal!), new Prisma.Decimal(0));
      const compensated = row.assessmentId ? await taxAssessmentCompensatedValue(tx, row.assessmentId) : new Prisma.Decimal(0);
      const total = assessment?.finalValueDecimal;
      const valid = ["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(row.status) && assessment && !["Cancelado", "Extinto", "Suspenso"].includes(assessment.status) && total && total.gt(0);
      if (kind === "SETTLEMENT" && (!valid || paid.lt(total!))) throw new Error(`A declaração ${row.declarationNumber} exige aprovação e pagamento integral conciliado para emitir quitação.`);
      rows.push({ declaration: row, property: properties.find(property => property.id === row.realEstateId), parties: row.parties.map(party => ({ ...party, taxpayer: names.get(party.taxpayerId) })), paid, compensated, total: total ?? new Prisma.Decimal(0), treatment: typeof treatment.treatment === "string" ? treatment.treatment : null, treatmentLegalBasis: typeof treatment.legalBasis === "string" ? treatment.legalBasis : null, treatmentReason: typeof treatment.reason === "string" ? treatment.reason : null, payments, events: row.events.map(event => ({ ...event, actor: actors.get(event.actorUsuarioId ?? "") ?? "Operador" })) });
    }
    if (!rows.length) throw new Error("O processo não possui declaração vigente para este documento.");
    const additionalForms = new Map<string, Awaited<ReturnType<typeof readItbiAdditionalForms>>>();
    if (kind === "PROCESS") for (const row of declarations) additionalForms.set(row.id, await readItbiAdditionalForms(tx, row.id, access.scope));
    return { entity: unit.governmentEntity.name, unit: unit.budgetUnit.code, process: selected.protocolNumber ?? selected.processId ?? selected.declarationNumber, rows, additionalForms, issuedAt: new Date() };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead, timeout: 60000 });

  return new Promise<Uint8Array>((resolve, reject) => {
    const doc = new PDFDocument({ size: "A4", margin: 42, info: { Title: kind === "SETTLEMENT" ? "Comprovante de quitação de ITBI" : "Processo de transmissão ITBI", Author: snapshot.entity } });
    const chunks: Buffer[] = []; doc.on("data", (chunk: Buffer) => chunks.push(chunk)); doc.on("end", () => resolve(new Uint8Array(Buffer.concat(chunks)))); doc.on("error", reject);
    const text = (value: string, bold = false) => { if (doc.y > 735) doc.addPage(); doc.font(bold ? "Helvetica-Bold" : "Helvetica").fontSize(10).text(value, { paragraphGap: 6 }); };
    const money = (value: Prisma.Decimal) => `R$ ${value.toFixed(2)}`;
    text(snapshot.entity, true); text(`UG ${snapshot.unit} · Protocolo ${snapshot.process}`);
    text(kind === "SETTLEMENT" ? "COMPROVANTE DE QUITAÇÃO DO ITBI" : "PROCESSO DE TRANSMISSÃO — ITBI", true);
    text(`Emitido em ${snapshot.issuedAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}. Posição consultada no cadastro municipal.`);
    for (const [index, row] of snapshot.rows.entries()) {
      if (index) doc.addPage();
      const declaration = row.declaration;
      text(`${index + 1}. ${declaration.declarationNumber} · ${declaration.status}`, true);
      text(`Imóvel ${row.property?.municipalInsc ?? declaration.realEstateId} · ${row.property?.streetName ?? ""}, ${row.property?.number ?? ""}`);
      text(`Terreno: ${row.property?.landArea ?? "—"} m² · Área edificada: ${row.property?.builtArea ?? "—"} m²`);
      text(`Modalidade: ${declaration.transactionType.name} · Fração transmitida: ${declaration.transmittedFraction.toString()}%`);
      text(`Declarado: ${money(declaration.declaredPropertyValue)} · Base: ${money(declaration.taxableBase)} · Alíquota: ${declaration.appliedRate.toString()}% · ITBI: ${money(declaration.taxAmount)}`);
      text(`Crédito: ${money(row.total)} · Pagamentos confirmados: ${money(row.paid)} · Compensações: ${money(row.compensated)}`);
      if (row.treatment) {
        text(`Tratamento fiscal: ${row.treatment}`, true);
        text(`Fundamento legal: ${row.treatmentLegalBasis ?? ""}\nDecisão: ${row.treatmentReason ?? ""}`);
        if (declaration.status === "NAO_TRIBUTAVEL") text("Valor a recolher nesta transmissão: R$ 0,00. O cálculo teórico permanece preservado; esta decisão não constitui pagamento nem transferência de titularidade.");
      }
      text("Partes da transmissão", true);
      for (const party of row.parties) text(`${party.role}: ${party.taxpayer?.name ?? party.taxpayerId} · ${party.taxpayer?.document ?? ""} · Participação: ${party.participationPercent?.toString() ?? "—"}%`);
      text("Pagamentos confirmados", true);
      for (const payment of row.payments) text(`${payment.paymentDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })} · ${money(payment.amountPaidDecimal!)} · Referência ${payment.id}`);
      if (kind === "PROCESS") {
        for (const form of snapshot.additionalForms.get(declaration.id) ?? []) {
          text(`${form.title} · posição ${form.version} · formulário v${form.catalogVersion}`, true);
          for (const field of form.fields) text(`${field.label}: ${field.value}`);
        }
        text("Histórico do processo", true);
        for (const event of row.events) text(`${event.createdAt.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })} · ${event.actor} · ${event.eventType}\n${event.description}`);
      }
    }
    text("Documento municipal relativo à situação tributária na data de emissão. A transmissão fiscal não substitui o registro civil da propriedade. Pagamentos estornados não integram esta posição.");
    doc.end();
  });
}
