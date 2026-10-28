"use server";

import { databaseConnection, db } from "@/db/client";
import { findFinanceCommitment } from "@/db/repositories/finance/budget-execution";
import { findFinanceSettlement } from "@/db/repositories/finance/settlements";
import { hasFinanceProcurementEvent, listFinanceSettlementOrigins } from "@/db/repositories/finance/procurement-origins";
import { FinanceError, cancelSettlement as cancelOfficialSettlement, createSettlement as createOfficialSettlement } from "@/lib/financeiro";
import {
  ProcurementFinanceBridgeError,
  cancelSettlementAfterInstrumentMeasurementCancellation,
  cancelSettlementAfterPurchaseReceiptCancellation,
  createSettlementFromInstrumentMeasurementAuthorization,
  createSettlementFromPurchaseReceiptAuthorization,
  procurementFinanceEventTypes,
} from "@/lib/compras/procurement-finance-bridge";
import { assertBudgetUnitAccess, getTenantContextForModuleOperation, isSystemAdministrator, type AppContext } from "@/lib/platform/tenant-context";
import { revalidatePath } from "next/cache";
import { MunicipalCostError } from "@/lib/financeiro/cost-ledger";

type ActionResult = { error?: string };
const message = (error: unknown) => error instanceof FinanceError || error instanceof ProcurementFinanceBridgeError || error instanceof MunicipalCostError ? error.message : "Não foi possível concluir a liquidação.";

async function assertCommitmentAccess(context: AppContext, commitmentId: string) {
  const commitment = await findFinanceCommitment(db, commitmentId);
  if (!commitment) throw new FinanceError("Empenho não encontrado.");
  assertBudgetUnitAccess(context.user, commitment.appropriation.budgetUnitId);
  return commitment;
}

async function procurementSourceForSettlement(
  commitment: { contractId: string | null; covenantId: string | null },
  documentId: string,
  cancellation = false,
) {
  const { receipts, measurements } = await listFinanceSettlementOrigins(db, commitment, documentId, cancellation);
  if (receipts.length + measurements.length !== 1) {
    throw new ProcurementFinanceBridgeError(
      cancellation
        ? "A liquidação só pode ser anulada após o cancelamento inequívoco do recebimento ou da medição de origem."
        : "A liquidação exige um recebimento aprovado ou uma medição atestada vinculada ao documento GED e ao empenho.",
    );
  }
  if (receipts.length === 1) return { kind: "PURCHASE_RECEIPT" as const, id: receipts[0].id };
  return { kind: "INSTRUMENT_MEASUREMENT" as const, id: measurements[0].id };
}

function revalidateContractExecution(contractId?: string | null) {
  if (!contractId) return;
  revalidatePath("/compras/contratos");
  revalidatePath(`/compras/contratos/${contractId}`);
}

export async function createSettlement(data: {
  date: Date;
  value: number;
  documentRef: string;
  fiscalDocumentNumber?: string;
  fiscalDocumentSeries?: string;
  fiscalDocumentIssueDate?: Date;
  fiscalDocumentAccessKey?: string;
  documentId?: string;
  commitmentId: string;
  authorId: string;
  notes: string;
  serviceCode?: string;
  retentionRuleIds?: string[];
}): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    const commitment = await assertCommitmentAccess(context, data.commitmentId);
    const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
    const fromProcurement = await hasFinanceProcurementEvent(
      db,
      procurementFinanceEventTypes.commitmentCreated,
      "COMMITMENT",
      commitment.id,
    );
    if (fromProcurement) {
      if (!data.documentId) throw new ProcurementFinanceBridgeError("Selecione o documento GED que comprova a AL de Compras.");
      const source = await procurementSourceForSettlement(commitment, data.documentId);
      if (source.kind === "PURCHASE_RECEIPT") {
        await createSettlementFromPurchaseReceiptAuthorization(databaseConnection, actor, {
          purchaseReceiptId: source.id,
          commitmentId: commitment.id,
          date: data.date,
          value: data.value,
          authorId: data.authorId,
          documentRef: data.documentRef,
          fiscalDocumentNumber: data.fiscalDocumentNumber,
          fiscalDocumentSeries: data.fiscalDocumentSeries,
          fiscalDocumentIssueDate: data.fiscalDocumentIssueDate,
          fiscalDocumentAccessKey: data.fiscalDocumentAccessKey,
          notes: data.notes,
          serviceCode: data.serviceCode,
          retentionRuleIds: data.retentionRuleIds,
        });
      } else {
        await createSettlementFromInstrumentMeasurementAuthorization(databaseConnection, actor, {
          measurementId: source.id,
          commitmentId: commitment.id,
          documentId: data.documentId,
          authorId: data.authorId,
          date: data.date,
          value: data.value,
          documentRef: data.documentRef,
          fiscalDocumentNumber: data.fiscalDocumentNumber,
          fiscalDocumentSeries: data.fiscalDocumentSeries,
          fiscalDocumentIssueDate: data.fiscalDocumentIssueDate,
          fiscalDocumentAccessKey: data.fiscalDocumentAccessKey,
          notes: data.notes,
          serviceCode: data.serviceCode,
          retentionRuleIds: data.retentionRuleIds,
        });
      }
    } else {
      await createOfficialSettlement(databaseConnection, actor, data);
    }
    revalidatePath("/financeiro/liquidacoes");
    revalidatePath("/financeiro/empenhos");
    revalidateContractExecution(commitment.contractId);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function cancelSettlement(id: string): Promise<ActionResult> {
  try {
    const context = await getTenantContextForModuleOperation("FINANCEIRO", "delete");
    const settlement = await findFinanceSettlement(db, id);
    if (!settlement) throw new FinanceError("Liquidação não encontrada.");
    const commitment = await assertCommitmentAccess(context, settlement.commitmentId);
    const fromProcurement = await hasFinanceProcurementEvent(
      db,
      procurementFinanceEventTypes.settlementCreated,
      "SETTLEMENT",
      settlement.id,
    );
    const actor = { usuarioId: context.user.id, employeeId: context.user.employeeId, allowedBudgetUnitIds: isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds };
    if (fromProcurement) {
      if (!settlement.documentId) throw new ProcurementFinanceBridgeError("A liquidação vinculada à AL não possui o documento GED de origem.");
      const source = await procurementSourceForSettlement(commitment, settlement.documentId, true);
      if (source.kind === "PURCHASE_RECEIPT") {
        await cancelSettlementAfterPurchaseReceiptCancellation(databaseConnection, actor, {
          purchaseReceiptId: source.id,
          settlementId: settlement.id,
        });
      } else {
        await cancelSettlementAfterInstrumentMeasurementCancellation(databaseConnection, actor, {
          measurementId: source.id,
          settlementId: settlement.id,
        });
      }
    } else {
      await cancelOfficialSettlement(databaseConnection, actor, id);
    }
    revalidatePath("/financeiro/liquidacoes");
    revalidatePath("/financeiro/empenhos");
    revalidateContractExecution(commitment.contractId);
    return {};
  } catch (error) {
    return { error: message(error) };
  }
}

export async function updateSettlement(_id: string, _data: { date: Date; value: number; documentRef: string; fiscalDocumentNumber?: string; fiscalDocumentSeries?: string; fiscalDocumentIssueDate?: Date; fiscalDocumentAccessKey?: string; documentId?: string; commitmentId: string; authorId: string; notes: string; serviceCode?: string; retentionRuleIds?: string[] }): Promise<ActionResult> {
  void _id;
  void _data;
  return { error: "Liquidações não podem ser editadas. Cancele o registro e realize uma nova liquidação." };
}
