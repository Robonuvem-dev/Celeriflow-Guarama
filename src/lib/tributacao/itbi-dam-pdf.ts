import { Prisma, type PrismaClient } from "@prisma/client";
import type { TaxActor } from "./index";
import { assertInternalItbiProcessAccess, assertPortalItbiAccess } from "./itbi-process-channel";
import { taxScopeSnapshot } from "./scope";
import { serviceReportPdf } from "@/lib/portal-cidadao/report";

export async function renderItbiDamPdf(db: PrismaClient, auth: { actor: TaxActor } | { usuarioId: string }, declarationId: string) {
  const lines = await db.$transaction(async tx => {
    const { declaration, scope } = "actor" in auth ? await assertInternalItbiProcessAccess(tx, auth.actor, declarationId) : await assertPortalItbiAccess(tx, auth.usuarioId, declarationId);
    if (!declaration.assessmentId || !declaration.guideId || !["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new Error("O ITBI não possui guia vigente para consulta.");
    const guide = await tx.taxGuide.findFirstOrThrow({ where: { id: declaration.guideId, assessmentId: declaration.assessmentId, status: { not: "Cancelada" } }, include: { assessment: { include: { taxpayer: { include: { person: true, company: true } } } } } });
    const origin = taxScopeSnapshot(guide.assessment.calculationSnapshot);
    if (origin.governmentEntityId !== scope.governmentEntityId || origin.budgetUnitId !== scope.budgetUnitId || ["Cancelado", "Extinto", "Suspenso"].includes(guide.assessment.status)) throw new Error("Guia sem origem ou exigibilidade conciliada.");
    if (!guide.totalValueDecimal) throw new Error("Guia sem valor Decimal conciliado.");
    const binding = await tx.planningEntityUnit.findFirstOrThrow({ where: scope, include: { governmentEntity: true, budgetUnit: true } });
    const payments = await tx.taxPayment.findMany({ where: { guideId: guide.id, status: "Confirmado" }, select: { amountPaidDecimal: true } });
    if (payments.some(row => !row.amountPaidDecimal)) throw new Error("Recebimento sem valor Decimal conciliado.");
    const paid = payments.reduce((sum, row) => sum.plus(row.amountPaidDecimal!), new Prisma.Decimal(0));
    const snapshot = taxScopeSnapshot(guide.calculationSnapshot); const bank = taxScopeSnapshot(snapshot.bankRegistration);
    const debtor = guide.assessment.taxpayer;
    const registered = guide.status !== "Paga" && paid.eq(0) && bank.status === "REGISTERED" && typeof bank.registrationId === "string" && guide.barcode && /^\d{44}$/.test(guide.barcode);
    return [binding.governmentEntity.name, `UG ${binding.budgetUnit.code}`, `ITBI: ${declaration.declarationNumber}`, `Protocolo: ${declaration.protocolNumber ?? ""}`, `DAM: ${guide.guideNumber ?? guide.id}`, `Lançamento: ${guide.assessment.assessmentNumber ?? guide.assessmentId}`, `Devedor: ${debtor.company?.corporateName ?? debtor.person?.fullName ?? debtor.id}`, `CPF/CNPJ: ${debtor.company?.cnpj ?? debtor.person?.cpf ?? ""}`, `Valor da guia: R$ ${guide.totalValueDecimal.toFixed(2)}`, `Pagamentos confirmados nesta guia: R$ ${paid.toFixed(2)}`, `Vencimento: ${guide.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`, `Situação: ${guide.status}`, ...(snapshot.paymentMode === "RECTIFICATION" ? ["Guia retificadora: diferença apurada com preservação dos pagamentos anteriores."] : []), registered ? `Código bancário registrado: ${guide.barcode}` : "Consulte a arrecadação municipal para os meios de pagamento disponíveis para esta guia.", "A consulta reproduz a guia registrada e não confirma a quitação do ITBI."];
  }, { isolationLevel: Prisma.TransactionIsolationLevel.RepeatableRead });
  return serviceReportPdf("Documento de arrecadação municipal - ITBI", lines);
}
