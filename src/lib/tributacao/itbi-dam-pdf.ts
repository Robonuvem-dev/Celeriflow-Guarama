import { and, eq, ne } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction } from "@/db/transaction";
import { taxGuides } from "@/db/schema/taxation-core";
import { taxPayments } from "@/db/schema/tax-accounting";
import { readItbiAssessment, readItbiMunicipalUnit, readItbiTaxpayers, requireItbiRecord } from "@/db/repositories/tax-itbi/records";
import type { TaxActor } from "./index";
import { assertInternalItbiProcessAccess, assertPortalItbiAccess } from "./itbi-process-channel";
import { taxScopeSnapshot } from "./scope";
import { serviceReportPdf } from "@/lib/portal-cidadao/report";

export async function renderItbiDamPdf(connection: DatabaseConnection, auth: { actor: TaxActor } | { usuarioId: string }, declarationId: string) {
  const lines = await withDatabaseTransaction(connection, async tx => {
    const { declaration, scope } = "actor" in auth ? await assertInternalItbiProcessAccess(tx, auth.actor, declarationId) : await assertPortalItbiAccess(tx, auth.usuarioId, declarationId);
    if (!declaration.assessmentId || !declaration.guideId || !["APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new Error("O ITBI não possui guia vigente para consulta.");
    const guideRow = requireItbiRecord((await tx.select().from(taxGuides).where(and(eq(taxGuides.id, declaration.guideId), eq(taxGuides.assessmentId, declaration.assessmentId), ne(taxGuides.status, "Cancelada"))).limit(1))[0]);
    const assessment = await readItbiAssessment(tx, guideRow.assessmentId);
    const taxpayer = requireItbiRecord((await readItbiTaxpayers(tx, [assessment.taxpayerId]))[0]);
    const guide = { ...guideRow, assessment: { ...assessment, taxpayer } };
    const origin = taxScopeSnapshot(guide.assessment.calculationSnapshot);
    if (origin.governmentEntityId !== scope.governmentEntityId || origin.budgetUnitId !== scope.budgetUnitId || ["Cancelado", "Extinto", "Suspenso"].includes(guide.assessment.status)) throw new Error("Guia sem origem ou exigibilidade conciliada.");
    if (!guide.totalValueDecimal) throw new Error("Guia sem valor Decimal conciliado.");
    const binding = requireItbiRecord(await readItbiMunicipalUnit(tx, scope));
    const payments = await tx.select({ amountPaidDecimal: taxPayments.amountPaidDecimal }).from(taxPayments).where(and(eq(taxPayments.guideId, guide.id), eq(taxPayments.status, "Confirmado")));
    if (payments.some(row => !row.amountPaidDecimal)) throw new Error("Recebimento sem valor Decimal conciliado.");
    const paid = payments.reduce((sum, row) => sum.plus(row.amountPaidDecimal!), new Decimal(0));
    const snapshot = taxScopeSnapshot(guide.calculationSnapshot); const bank = taxScopeSnapshot(snapshot.bankRegistration);
    const debtor = guide.assessment.taxpayer;
    const registered = guide.status !== "Paga" && paid.eq(0) && bank.status === "REGISTERED" && typeof bank.registrationId === "string" && guide.barcode && /^\d{44}$/.test(guide.barcode);
    return [binding.governmentEntity.name, `UG ${binding.budgetUnit.code}`, `ITBI: ${declaration.declarationNumber}`, `Protocolo: ${declaration.protocolNumber ?? ""}`, `DAM: ${guide.guideNumber ?? guide.id}`, `Lançamento: ${guide.assessment.assessmentNumber ?? guide.assessmentId}`, `Devedor: ${debtor.company?.corporateName ?? debtor.person?.fullName ?? debtor.id}`, `CPF/CNPJ: ${debtor.company?.cnpj ?? debtor.person?.cpf ?? ""}`, `Valor da guia: R$ ${guide.totalValueDecimal.toFixed(2)}`, `Pagamentos confirmados nesta guia: R$ ${paid.toFixed(2)}`, `Vencimento: ${guide.dueDate.toLocaleDateString("pt-BR", { timeZone: "UTC" })}`, `Situação: ${guide.status}`, ...(snapshot.paymentMode === "RECTIFICATION" ? ["Guia retificadora: diferença apurada com preservação dos pagamentos anteriores."] : []), registered ? `Código bancário registrado: ${guide.barcode}` : "Consulte a arrecadação municipal para os meios de pagamento disponíveis para esta guia.", "A consulta reproduz a guia registrada e não confirma a quitação do ITBI."];
  }, { isolationLevel: "repeatable read" });
  return serviceReportPdf("Documento de arrecadação municipal - ITBI", lines);
}
