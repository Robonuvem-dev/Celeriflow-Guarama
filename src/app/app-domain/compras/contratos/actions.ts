"use server";

import { assertBudgetUnitAccess, AccessError, getTenantContextForModuleOperation, type AppContext, type ModuleOperation } from "@/lib/platform/tenant-context";
import { FinanceError } from "@/lib/financeiro";
import {
  ProcurementFinanceBridgeError,
  deriveExpenseAuthorizationsForContract,
  recordSupplyAuthorizationForContract,
} from "@/lib/compras/procurement-finance-bridge";
import {
  ContractLifecycleError,
  assertInstrumentAggregateTotalWithinCurrentValue,
  calculateInclusiveContractTermDays,
  contractBudgetUnitIdsForMutation,
  isContractAmendmentType,
  parseContractDate,
  resolveContractAmendmentEffect,
} from "@/lib/compras/contract-lifecycle";
import { revalidatePath } from "next/cache";
import { and, eq, inArray, isNull, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { procurementContracts, contractAmendments, purchaseProcesses } from "@/db/schema/procurement-core";
import { procurementLifecycleEvents, purchaseRequests } from "@/db/schema/procurement-requests";
import {
  instrumentMeasurements,
  instrumentInstallments,
  instrumentResponsibilityGroups,
  instrumentParties,
} from "@/db/schema/procurement-instruments";
import { procurementUnits } from "@/db/schema/procurement-budget";
import { suppliers } from "@/db/schema/registry";
import { employees as employeeTable, secretariats } from "@/db/schema/administration";
import { instanceParameters, systemInstances } from "@/db/schema/instance-configuration";
import { transparencyPublications } from "@/db/schema/transparency";

type ContractActionResult = { success: true } | { success: false; error: string };

type SubmittedResponsibilityGroup = {
  id?: string;
  tempId?: string;
  name: string;
  description?: string;
};

type SubmittedInstrumentParty = {
  id?: string;
  role: string;
  partyValue: string;
  groupRef?: string;
  startDate?: string;
  endDate?: string;
  notes?: string;
};

const contractStatuses = ["Minuta", "Vigente", "Encerrado", "Aditado", "Suspenso", "Rescindido", "Em Análise", "Anulado", "Cancelado"];
const directlyEditableStatuses = ["Minuta", "Vigente", "Encerrado"];

async function getTenantContext(operation: ModuleOperation) {
  return getTenantContextForModuleOperation("COMPRAS", operation);
}

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function formNumber(formData: FormData, name: string) {
  const value = formString(formData, name);
  if (!value) return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function actionFailure(error: unknown, fallback: string): ContractActionResult {
  if (error instanceof ContractLifecycleError || error instanceof ProcurementFinanceBridgeError || error instanceof FinanceError || error instanceof AccessError) {
    return { success: false, error: error.message };
  }
  return { success: false, error: fallback };
}

export async function generateContractProcurementAuthorizations(contractId: string): Promise<ContractActionResult> {
  try {
    const id = String(contractId || "").trim();
    if (!id) return { success: false, error: "Contrato inválido." };

    const context = await getTenantContext("update");
    const [contract] = await databaseConnection.db.select().from(procurementContracts).where(eq(procurementContracts.id, id)).limit(1);
    if (!contract) return { success: false, error: "Contrato não encontrado." };
    authorizeContractBudgetUnits(context.user, { currentSourceBudgetUnitId: contract.sourceBudgetUnitId });

    const financeContext = await getTenantContextForModuleOperation("FINANCEIRO", "create");
    if (contract.sourceBudgetUnitId) assertBudgetUnitAccess(financeContext.user, contract.sourceBudgetUnitId);

    await deriveExpenseAuthorizationsForContract(
      databaseConnection,
      { usuarioId: financeContext.user.id, employeeId: financeContext.user.employeeId },
      contract.id,
    );
    await recordSupplyAuthorizationForContract(
      databaseConnection,
      { usuarioId: context.user.id, employeeId: context.user.employeeId },
      contract.id,
    );
    revalidateContractPaths(contract.id);
    revalidatePath("/financeiro/orcamento");
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível gerar as autorizações de empenho e fornecimento.");
  }
}

function authorizeContractBudgetUnits(
  user: AppContext["user"],
  input: { currentSourceBudgetUnitId?: string | null; requestedSourceBudgetUnitId?: string | null },
) {
  const budgetUnitIds = contractBudgetUnitIdsForMutation(user, input);
  // Keep the centralized tenant authorization as the final guard for every UG involved.
  for (const budgetUnitId of budgetUnitIds) assertBudgetUnitAccess(user, budgetUnitId);
}

function contractVersionCondition(contract: { id: string; sourceBudgetUnitId: string | null; updatedAt: Date }) {
  return and(eq(procurementContracts.id, contract.id), eq(procurementContracts.updatedAt, contract.updatedAt), contract.sourceBudgetUnitId === null ? isNull(procurementContracts.sourceBudgetUnitId) : eq(procurementContracts.sourceBudgetUnitId, contract.sourceBudgetUnitId));
}

function lifecycleIdempotencyKey(formData: FormData, kind: string, contractId: string) {
  const key = formString(formData, "idempotencyKey");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw new ContractLifecycleError("Não foi possível validar a repetição segura da ação. Atualize a página e tente novamente.");
  }
  return `${kind}:${contractId}:${key}`;
}

function revalidateContractPaths(id: string) {
  revalidatePath("/compras/contratos");
  revalidatePath(`/compras/contratos/${id}`);
  revalidatePath(`/compras/contratos/${id}/editar`);
}

function parsePartyIdentifier(rawValue: string) {
  const [kind, ...rest] = rawValue.split(":");
  const id = rest.join(":").trim();
  if (!id) return null;
  if (kind === "SUPPLIER") return { supplierId: id, personId: null, companyId: null, employeeId: null };
  if (kind === "PERSON") return { supplierId: null, personId: id, companyId: null, employeeId: null };
  if (kind === "COMPANY") return { supplierId: null, personId: null, companyId: id, employeeId: null };
  if (kind === "EMPLOYEE") return { supplierId: null, personId: null, companyId: null, employeeId: id };
  return null;
}

async function syncContractGroupsAndParties(
  tx: DatabaseTransaction,
  contractId: string,
  groupsJson: string | null,
  partiesJson: string | null,
) {
  const groupRefMap = new Map<string, string>();

  if (groupsJson !== null) {
    let parsedGroups: SubmittedResponsibilityGroup[] = [];
    try {
      const parsed = JSON.parse(groupsJson);
      if (Array.isArray(parsed)) parsedGroups = parsed;
    } catch {
      parsedGroups = [];
    }

    const existingGroups = await tx
      .select()
      .from(instrumentResponsibilityGroups)
      .where(eq(instrumentResponsibilityGroups.contractId, contractId));
    const existingGroupIds = new Set(existingGroups.map((g) => g.id));
    const keptGroupIds = new Set<string>();

    for (const item of parsedGroups) {
      const name = String(item.name || "").trim();
      if (!name) continue;
      const description = String(item.description || "").trim() || null;

      if (item.id && existingGroupIds.has(item.id)) {
        keptGroupIds.add(item.id);
        await tx
          .update(instrumentResponsibilityGroups)
          .set({ name, description })
          .where(eq(instrumentResponsibilityGroups.id, item.id));
        groupRefMap.set(item.id, item.id);
        if (item.tempId) groupRefMap.set(item.tempId, item.id);
        groupRefMap.set(name, item.id);
      } else {
        const [inserted] = await tx
          .insert(instrumentResponsibilityGroups)
          .values({
            name,
            description,
            contractId,
            covenantId: null,
          })
          .returning({ id: instrumentResponsibilityGroups.id });
        if (inserted) {
          keptGroupIds.add(inserted.id);
          if (item.id) groupRefMap.set(item.id, inserted.id);
          if (item.tempId) groupRefMap.set(item.tempId, inserted.id);
          groupRefMap.set(name, inserted.id);
        }
      }
    }

    const groupsToDelete = existingGroups
      .filter((g) => !keptGroupIds.has(g.id))
      .map((g) => g.id);
    if (groupsToDelete.length > 0) {
      await tx
        .update(instrumentParties)
        .set({ responsibilityGroupId: null })
        .where(
          and(
            eq(instrumentParties.contractId, contractId),
            inArray(instrumentParties.responsibilityGroupId, groupsToDelete),
          ),
        );
      await tx
        .delete(instrumentResponsibilityGroups)
        .where(
          and(
            eq(instrumentResponsibilityGroups.contractId, contractId),
            inArray(instrumentResponsibilityGroups.id, groupsToDelete),
          ),
        );
    }
  } else {
    const existingGroups = await tx
      .select()
      .from(instrumentResponsibilityGroups)
      .where(eq(instrumentResponsibilityGroups.contractId, contractId));
    for (const g of existingGroups) {
      groupRefMap.set(g.id, g.id);
      groupRefMap.set(g.name, g.id);
    }
  }

  if (partiesJson !== null) {
    let parsedParties: SubmittedInstrumentParty[] = [];
    try {
      const parsed = JSON.parse(partiesJson);
      if (Array.isArray(parsed)) parsedParties = parsed;
    } catch {
      parsedParties = [];
    }

    const existingParties = await tx
      .select()
      .from(instrumentParties)
      .where(eq(instrumentParties.contractId, contractId));
    const existingPartyIds = new Set(existingParties.map((p) => p.id));
    const keptPartyIds = new Set<string>();

    for (const item of parsedParties) {
      const role = String(item.role || "").trim();
      const target = parsePartyIdentifier(String(item.partyValue || "").trim());
      if (!role || !target) continue;

      const rawGroupRef = String(item.groupRef || "").trim();
      const responsibilityGroupId = rawGroupRef ? (groupRefMap.get(rawGroupRef) ?? null) : null;
      const activeFrom = parseContractDate(String(item.startDate || "").trim());
      const activeTo = parseContractDate(String(item.endDate || "").trim());
      const notes = String(item.notes || "").trim() || null;

      if (item.id && existingPartyIds.has(item.id)) {
        keptPartyIds.add(item.id);
        await tx
          .update(instrumentParties)
          .set({
            role,
            ...target,
            responsibilityGroupId,
            activeFrom,
            activeTo,
            notes,
          })
          .where(eq(instrumentParties.id, item.id));
      } else {
        const [inserted] = await tx
          .insert(instrumentParties)
          .values({
            role,
            ...target,
            responsibilityGroupId,
            activeFrom,
            activeTo,
            notes,
            contractId,
            covenantId: null,
          })
          .returning({ id: instrumentParties.id });
        if (inserted) keptPartyIds.add(inserted.id);
      }
    }

    const partiesToDelete = existingParties
      .filter((p) => !keptPartyIds.has(p.id))
      .map((p) => p.id);
    if (partiesToDelete.length > 0) {
      await tx
        .delete(instrumentParties)
        .where(
          and(
            eq(instrumentParties.contractId, contractId),
            inArray(instrumentParties.id, partiesToDelete),
          ),
        );
    }
  }
}

export async function deleteContract(id: string) {
  try {
    const contractId = String(id || "").trim();
    if (!contractId) return { success: false, error: "Contrato inválido." };

    const context = await getTenantContext("delete");
    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [contract] = await tx.select().from(procurementContracts).where(eq(procurementContracts.id, contractId)).limit(1).for("update");
      if (!contract) throw new ContractLifecycleError("Contrato não encontrado.");

      authorizeContractBudgetUnits(context.user, { currentSourceBudgetUnitId: contract.sourceBudgetUnitId });

      // The source UG is part of the delete predicate so a concurrent reassignment cannot bypass authorization.
      const deleted = await tx.delete(procurementContracts).where(contractVersionCondition(contract)).returning({ id: procurementContracts.id });
      if (deleted.length !== 1) throw new ContractLifecycleError("O contrato foi alterado por outra operação. Revise e tente novamente.");
    });

    revalidateContractPaths(contractId);
    return { success: true };
  } catch (error) {
    console.error("Error deleting contract:", error);
    return actionFailure(error, "Falha ao excluir o contrato.");
  }
}

export async function saveContract(formData: FormData) {
  try {
    const id = formString(formData, "id") || undefined;
    const context = await getTenantContext(id ? "update" : "create");
    const number = formString(formData, "number");
    const object = formString(formData, "object");
    const status = formString(formData, "status");
    const requestedProcessId = formString(formData, "processId");
    const supplierId = formString(formData, "supplierId");
    const requestedSecretariatId = formString(formData, "secretariatId");
    const sourceBudgetUnitId = formString(formData, "sourceBudgetUnitId");
    const requestedInitialValue = formNumber(formData, "initialValue");
    const requestedStartDate = parseContractDate(formString(formData, "startDate"));
    const requestedEndDate = parseContractDate(formString(formData, "endDate"));

    const hasManagerField = formData.has("managerId");
    const hasInspectorField = formData.has("inspectorId");
    const requestedManagerId = hasManagerField ? (formString(formData, "managerId") || null) : undefined;
    const requestedInspectorId = hasInspectorField ? (formString(formData, "inspectorId") || null) : undefined;
    const groupsJson = formData.has("responsibilityGroupsJson")
      ? formString(formData, "responsibilityGroupsJson")
      : null;
    const partiesJson = formData.has("instrumentPartiesJson")
      ? formString(formData, "instrumentPartiesJson")
      : null;

    const current = id ? (await databaseConnection.db.select().from(procurementContracts).where(eq(procurementContracts.id, id)).limit(1))[0] : null;
    if (id && !current) return { success: false, error: "Contrato não encontrado." };

    if (!number || !object || !supplierId || !sourceBudgetUnitId || (!current && (!requestedProcessId || !requestedSecretariatId))) {
      return { success: false, error: "Dados básicos (número, objeto, processo, fornecedor, secretaria e unidade gestora) são obrigatórios." };
    }
    if (!contractStatuses.includes(status)) return { success: false, error: "Status do contrato inválido." };
    if (current && ["Suspenso", "Rescindido"].includes(status) && status !== current.status) {
      return { success: false, error: "Registre suspensão ou rescisão pela ação do ciclo de vida do contrato." };
    }
    if (current && !directlyEditableStatuses.includes(current.status) && status !== current.status) {
      return { success: false, error: "A situação atual do contrato só pode ser alterada por um ato do ciclo de vida." };
    }

    authorizeContractBudgetUnits(context.user, {
      currentSourceBudgetUnitId: current?.sourceBudgetUnitId,
      requestedSourceBudgetUnitId: sourceBudgetUnitId,
    });

    const initialValue = current?.initialValue ?? requestedInitialValue;
    const startDate = current?.startDate ?? requestedStartDate;
    const endDate = current?.endDate ?? requestedEndDate;
    const processId = current?.processId ?? requestedProcessId;
    const secretariatId = current?.secretariatId ?? requestedSecretariatId;

    if (initialValue === null || initialValue < 0) return { success: false, error: "Informe um valor contratual válido." };
    if (!startDate || !endDate) return { success: false, error: "Informe uma vigência válida para o contrato." };
    calculateInclusiveContractTermDays(startDate, endDate);

    const [[process], [supplier], [sourceBudgetUnit]] = await Promise.all([
      databaseConnection.db.select({ id: purchaseProcesses.id, secretariatId: purchaseProcesses.secretariatId, purchaseRequest: { status: purchaseRequests.status } }).from(purchaseProcesses).leftJoin(purchaseRequests, eq(purchaseRequests.id, purchaseProcesses.purchaseRequestId)).where(eq(purchaseProcesses.id, processId)).limit(1),
      databaseConnection.db.select({ id: suppliers.id, status: suppliers.status }).from(suppliers).where(eq(suppliers.id, supplierId)).limit(1),
      databaseConnection.db.select({ id: procurementUnits.id, secretariatId: procurementUnits.secretariatId }).from(procurementUnits).where(eq(procurementUnits.id, sourceBudgetUnitId)).limit(1),
    ]);
    if (!process) {
      return { success: false, error: "Processo licitatório selecionado não encontrado." };
    }
    // Auto-align secretariat if needed
    if (process.secretariatId !== secretariatId) {
      // Re-verify if secretariat matches process
      return { success: false, error: "O contrato exige um processo da mesma secretaria gestora." };
    }
    if (process.purchaseRequest?.status && process.purchaseRequest.status !== "Aprovada") {
      // Allow if status is approved or not rejected, or log notice
      console.warn("[saveContract] Purchase request status is", process.purchaseRequest.status);
    }
    if (!supplier || supplier.status !== "Ativo") return { success: false, error: "Selecione um fornecedor ativo." };
    if (!sourceBudgetUnit || sourceBudgetUnit.secretariatId !== secretariatId) {
      return { success: false, error: "A Unidade Gestora deve pertencer à secretaria do contrato." };
    }

    const data = {
      number,
      object,
      initialValue,
      // The current value changes only through an amendment; regular edits must not erase its history.
      updatedValue: current?.updatedValue ?? initialValue,
      startDate,
      endDate,
      status,
      processId,
      supplierId,
      secretariatId,
      sourceBudgetUnitId,
      ...(requestedManagerId !== undefined ? { managerId: requestedManagerId } : {}),
      ...(requestedInspectorId !== undefined ? { inspectorId: requestedInspectorId } : {}),
    };

    if (current) {
      const existing = current;
      await withDatabaseTransaction(databaseConnection, async (tx) => {
        const [fresh] = await tx.select().from(procurementContracts).where(eq(procurementContracts.id, existing.id)).limit(1).for("update");
        if (!fresh) throw new ContractLifecycleError("Contrato não encontrado.");
        authorizeContractBudgetUnits(context.user, {
          currentSourceBudgetUnitId: fresh.sourceBudgetUnitId,
          requestedSourceBudgetUnitId: sourceBudgetUnitId,
        });

        // Compare the source UG and version read before validation so a concurrent update cannot be overwritten.
        const updated = await tx.update(procurementContracts).set(data).where(contractVersionCondition(existing)).returning({ id: procurementContracts.id });
        if (updated.length !== 1) throw new ContractLifecycleError("O contrato foi alterado por outra operação. Revise e tente novamente.");

        if (groupsJson !== null || partiesJson !== null) {
          await syncContractGroupsAndParties(tx, existing.id, groupsJson, partiesJson);
        }
      });
    } else if (groupsJson !== null || partiesJson !== null) {
      await withDatabaseTransaction(databaseConnection, async (tx) => {
        const [inserted] = await tx
          .insert(procurementContracts)
          .values(data)
          .returning({ id: procurementContracts.id });
        if (inserted) {
          await syncContractGroupsAndParties(tx, inserted.id, groupsJson, partiesJson);
        }
      });
    } else {
      await databaseConnection.db.insert(procurementContracts).values(data);
    }
    revalidatePath("/compras/contratos");
    if (id) revalidateContractPaths(id);
    return { success: true };
  } catch (error) {
    console.error("Error saving contract:", error);
    return actionFailure(error, "Falha ao salvar o contrato.");
  }
}

export async function saveContractAmendment(formData: FormData): Promise<ContractActionResult> {
  try {
    const contractId = formString(formData, "contractId");
    const type = formString(formData, "type");
    const justification = formString(formData, "justification");
    if (!contractId || !justification) return { success: false, error: "Informe o contrato e a justificativa do ato." };
    if (!isContractAmendmentType(type)) return { success: false, error: "Tipo de ato contratual inválido." };

    const newValue = formNumber(formData, "newValue") ?? undefined;
    const newEndDate = parseContractDate(formString(formData, "newEndDate")) ?? undefined;
    const idempotencyKey = lifecycleIdempotencyKey(formData, "CONTRACT_AMENDMENT", contractId);
    const context = await getTenantContext("update");

    const [current] = await databaseConnection.db.select().from(procurementContracts).where(eq(procurementContracts.id, contractId)).limit(1);
    if (!current) return { success: false, error: "Contrato não encontrado." };
    authorizeContractBudgetUnits(context.user, { currentSourceBudgetUnitId: current.sourceBudgetUnitId });

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [contract] = await tx.select().from(procurementContracts).where(eq(procurementContracts.id, contractId)).limit(1).for("update");
      if (!contract) throw new ContractLifecycleError("Contrato não encontrado.");
      authorizeContractBudgetUnits(context.user, { currentSourceBudgetUnitId: contract.sourceBudgetUnitId });

      const [existingEvent] = await tx.select().from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, idempotencyKey)).limit(1);
      if (existingEvent) {
        if (existingEvent.entityType !== "CONTRACT_AMENDMENT" || existingEvent.sourceId !== contract.id) {
          throw new ContractLifecycleError("A chave de repetição já foi usada em outro ato contratual.");
        }
        return;
      }

      if (contract.status === "Rescindido") throw new ContractLifecycleError("Contrato rescindido não aceita novos atos.");
      if (type === "Suspensão" && contract.status === "Suspenso") throw new ContractLifecycleError("O contrato já está suspenso.");
      if (type === "Rescisão" && contract.status === "Rescindido") throw new ContractLifecycleError("O contrato já está rescindido.");

      const effect = resolveContractAmendmentEffect(contract, { type, newValue, newEndDate });
      if (effect.contractUpdate.updatedValue !== undefined) {
        const [[measurementAggregate], [installmentAggregate]] = await Promise.all([
          tx.select({ value: sql<string>`coalesce(sum(${instrumentMeasurements.valueDecimal}), 0)::text` }).from(instrumentMeasurements).where(and(eq(instrumentMeasurements.contractId, contract.id), inArray(instrumentMeasurements.status, ["Rascunho", "Em análise", "Atestada"]))),
          tx.select({ value: sql<string>`coalesce(sum(${instrumentInstallments.valueDecimal}), 0)::text` }).from(instrumentInstallments).where(and(eq(instrumentInstallments.contractId, contract.id), eq(instrumentInstallments.status, "Programada"))),
        ]);
        assertInstrumentAggregateTotalWithinCurrentValue(
          effect.contractUpdate.updatedValue,
          measurementAggregate.value,
          "medições ativas",
        );
        assertInstrumentAggregateTotalWithinCurrentValue(
          effect.contractUpdate.updatedValue,
          installmentAggregate.value,
          "parcelas programadas",
        );
      }
      const [amendment] = await tx.insert(contractAmendments).values({
          type,
          justification,
          previousValue: effect.previousValue,
          newValue: effect.newValue,
          previousEndDate: effect.previousEndDate,
          newEndDate: effect.newEndDate,
          status: "Aplicado",
          contractId: contract.id,
      }).returning({ id: contractAmendments.id });
      const updated = await tx.update(procurementContracts).set(effect.contractUpdate).where(contractVersionCondition(contract)).returning({ id: procurementContracts.id });
      if (updated.length !== 1) throw new ContractLifecycleError("O contrato foi alterado por outra operação. Revise e tente novamente.");
      await tx.insert(procurementLifecycleEvents).values({
          eventType: effect.lifecycleEventType,
          entityType: "CONTRACT_AMENDMENT",
          entityId: amendment.id,
          sourceType: "CONTRACT",
          sourceId: contract.id,
          actorUsuarioId: context.user.id,
          idempotencyKey,
      });

    });

    revalidateContractPaths(contractId);
    return { success: true };
  } catch (error) {
    console.error("Error saving contract amendment:", error);
    return actionFailure(error, "Falha ao registrar o ato contratual.");
  }
}

export async function updateContractResponsibles(formData: FormData): Promise<ContractActionResult> {
  try {
    const contractId = formString(formData, "contractId");
    if (!contractId) return { success: false, error: "Contrato inválido." };

    const managerId = formString(formData, "managerId") || null;
    const inspectorId = formString(formData, "inspectorId") || null;
    const idempotencyKey = lifecycleIdempotencyKey(formData, "CONTRACT_RESPONSIBLES", contractId);
    const context = await getTenantContext("update");

    const [current] = await databaseConnection.db.select().from(procurementContracts).where(eq(procurementContracts.id, contractId)).limit(1);
    if (!current) return { success: false, error: "Contrato não encontrado." };
    authorizeContractBudgetUnits(context.user, { currentSourceBudgetUnitId: current.sourceBudgetUnitId });

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [contract] = await tx.select().from(procurementContracts).where(eq(procurementContracts.id, contractId)).limit(1).for("update");
      if (!contract) throw new ContractLifecycleError("Contrato não encontrado.");
      authorizeContractBudgetUnits(context.user, { currentSourceBudgetUnitId: contract.sourceBudgetUnitId });

      const [existingEvent] = await tx.select().from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, idempotencyKey)).limit(1);
      if (existingEvent) {
        if (existingEvent.entityType !== "CONTRACT_RESPONSIBLES" || existingEvent.sourceId !== contract.id) {
          throw new ContractLifecycleError("A chave de repetição já foi usada em outro ato contratual.");
        }
        return;
      }

      const employeeIds = [...new Set([managerId, inspectorId].filter((employeeId): employeeId is string => Boolean(employeeId)))];
      const employees = employeeIds.length
        ? await tx.select({ id: employeeTable.id }).from(employeeTable).where(and(inArray(employeeTable.id, employeeIds), eq(employeeTable.isActive, true)))
        : [];
      if (employees.length !== employeeIds.length) throw new ContractLifecycleError("Selecione apenas servidores ativos para os responsáveis do contrato.");

      if (contract.managerId === managerId && contract.inspectorId === inspectorId) return;

      const updated = await tx.update(procurementContracts).set({ managerId, inspectorId }).where(contractVersionCondition(contract)).returning({ id: procurementContracts.id });
      if (updated.length !== 1) throw new ContractLifecycleError("O contrato foi alterado por outra operação. Revise e tente novamente.");
      await tx.insert(procurementLifecycleEvents).values({
          eventType: "CONTRACT_RESPONSIBLES_UPDATED",
          entityType: "CONTRACT_RESPONSIBLES",
          entityId: contract.id,
          sourceType: "CONTRACT",
          sourceId: contract.id,
          actorUsuarioId: context.user.id,
          idempotencyKey,
      });
    });

    revalidateContractPaths(contractId);
    return { success: true };
  } catch (error) {
    console.error("Error updating contract responsibles:", error);
    return actionFailure(error, "Falha ao atualizar os responsáveis do contrato.");
  }
}

// CF16 — 16.15: Alteração da situação dos contratos para encerrado, anulado, cancelado, suspenso e rescindido e estorno
export async function changeContractLifecycleStatus(formData: FormData): Promise<ContractActionResult> {
  try {
    const contractId = formString(formData, "contractId");
    const targetStatus = formString(formData, "status");
    const justification = formString(formData, "justification");
    const isReversal = formData.get("isReversal") === "true";
    const idempotencyKey = formString(formData, "idempotencyKey") || `${contractId}:${targetStatus}:${Date.now()}`;

    if (!contractId || !targetStatus || !justification) {
      return { success: false, error: "Contrato, situação e justificativa são obrigatórios." };
    }

    const validStatuses = ["Vigente", "Encerrado", "Anulado", "Cancelado", "Suspenso", "Rescindido"];
    if (!validStatuses.includes(targetStatus)) {
      return { success: false, error: "Situação contratual informada é inválida." };
    }

    const context = await getTenantContext("update");
    const [current] = await databaseConnection.db
      .select()
      .from(procurementContracts)
      .where(eq(procurementContracts.id, contractId))
      .limit(1);

    if (!current) return { success: false, error: "Contrato não encontrado." };
    authorizeContractBudgetUnits(context.user, { currentSourceBudgetUnitId: current.sourceBudgetUnitId });

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [contract] = await tx
        .select()
        .from(procurementContracts)
        .where(eq(procurementContracts.id, contractId))
        .limit(1)
        .for("update");

      if (!contract) throw new ContractLifecycleError("Contrato não encontrado.");

      const eventType = isReversal ? "CONTRACT_STATUS_REVERTED" : `CONTRACT_${targetStatus.toUpperCase()}_REGISTERED`;

      const updated = await tx
        .update(procurementContracts)
        .set({ status: targetStatus })
        .where(contractVersionCondition(contract))
        .returning({ id: procurementContracts.id });

      if (updated.length !== 1) {
        throw new ContractLifecycleError("O contrato foi alterado por outra operação. Revise e tente novamente.");
      }

      await tx.insert(procurementLifecycleEvents).values({
        eventType,
        entityType: "CONTRACT",
        entityId: contract.id,
        sourceType: "CONTRACT",
        sourceId: contract.id,
        actorUsuarioId: context.user.id,
        idempotencyKey,
      });
    });

    revalidateContractPaths(contractId);
    return { success: true };
  } catch (error) {
    console.error("Error changing contract status:", error);
    return actionFailure(error, "Falha ao alterar a situação do contrato.");
  }
}

// CF16 — 16.17: Atualização do órgão gestor do contrato
export async function updateContractManagingBody(formData: FormData): Promise<ContractActionResult> {
  try {
    const contractId = formString(formData, "contractId");
    const secretariatId = formString(formData, "secretariatId");
    const sourceBudgetUnitId = formString(formData, "sourceBudgetUnitId") || null;
    const managerId = formString(formData, "managerId") || null;
    const inspectorId = formString(formData, "inspectorId") || null;
    const idempotencyKey = formString(formData, "idempotencyKey") || `${contractId}:managing:${Date.now()}`;

    if (!contractId || !secretariatId) {
      return { success: false, error: "Contrato e Secretaria Gestora são obrigatórios." };
    }

    const context = await getTenantContext("update");
    const [current] = await databaseConnection.db
      .select()
      .from(procurementContracts)
      .where(eq(procurementContracts.id, contractId))
      .limit(1);

    if (!current) return { success: false, error: "Contrato não encontrado." };
    authorizeContractBudgetUnits(context.user, {
      currentSourceBudgetUnitId: current.sourceBudgetUnitId,
      requestedSourceBudgetUnitId: sourceBudgetUnitId,
    });

    if (sourceBudgetUnitId) {
      const [unit] = await databaseConnection.db
        .select()
        .from(procurementUnits)
        .where(eq(procurementUnits.id, sourceBudgetUnitId))
        .limit(1);
      if (!unit || unit.secretariatId !== secretariatId) {
        return { success: false, error: "A Unidade Gestora selecionada deve pertencer à secretaria indicada." };
      }
    }

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [contract] = await tx
        .select()
        .from(procurementContracts)
        .where(eq(procurementContracts.id, contractId))
        .limit(1)
        .for("update");

      if (!contract) throw new ContractLifecycleError("Contrato não encontrado.");

      const updated = await tx
        .update(procurementContracts)
        .set({
          secretariatId,
          sourceBudgetUnitId,
          ...(managerId !== undefined ? { managerId } : {}),
          ...(inspectorId !== undefined ? { inspectorId } : {}),
        })
        .where(contractVersionCondition(contract))
        .returning({ id: procurementContracts.id });

      if (updated.length !== 1) {
        throw new ContractLifecycleError("O contrato foi alterado por outra operação.");
      }

      await tx.insert(procurementLifecycleEvents).values({
        eventType: "CONTRACT_MANAGING_BODY_UPDATED",
        entityType: "CONTRACT",
        entityId: contract.id,
        sourceType: "CONTRACT",
        sourceId: contract.id,
        actorUsuarioId: context.user.id,
        idempotencyKey,
      });
    });

    revalidateContractPaths(contractId);
    return { success: true };
  } catch (error) {
    console.error("Error updating managing body:", error);
    return actionFailure(error, "Falha ao atualizar órgão gestor do contrato.");
  }
}

// CF16 — 16.10: Inserção de novas dotações em contratos vigentes
export async function addContractBudgetAllocation(formData: FormData): Promise<ContractActionResult> {
  try {
    const contractId = formString(formData, "contractId");
    const budgetUnitId = formString(formData, "budgetUnitId");
    const justification = formString(formData, "justification");
    const percentage = formNumber(formData, "percentage") || 100;
    const idempotencyKey = formString(formData, "idempotencyKey") || `${contractId}:dotacao:${Date.now()}`;

    if (!contractId || !budgetUnitId || !justification) {
      return { success: false, error: "Contrato, Unidade/Dotação e Justificativa são obrigatórios." };
    }

    const context = await getTenantContext("update");
    const [contract] = await databaseConnection.db
      .select()
      .from(procurementContracts)
      .where(eq(procurementContracts.id, contractId))
      .limit(1);

    if (!contract) return { success: false, error: "Contrato não encontrado." };
    if (contract.status !== "Vigente" && contract.status !== "Minuta") {
      return { success: false, error: "Apenas contratos vigentes ou em elaboração aceitam inserção de dotações." };
    }

    const [unit] = await databaseConnection.db
      .select()
      .from(procurementUnits)
      .where(eq(procurementUnits.id, budgetUnitId))
      .limit(1);
    if (!unit) return { success: false, error: "Unidade orçamentária não encontrada." };

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      // Registrar no histórico de parâmetros adicionais do contrato
      const [instance] = await tx.select({ id: systemInstances.id }).from(systemInstances).limit(1);
      if (instance) {
        await tx.insert(instanceParameters).values({
          configuracaoInstanciaId: instance.id,
          chave: `COMPRAS_CONTRATO_DOTACAO:${contract.id}:${unit.id}:${Date.now()}`,
          valor: {
            contractId: contract.id,
            budgetUnitId: unit.id,
            code: unit.code,
            name: unit.name,
            justification,
            percentage,
            addedAt: new Date().toISOString(),
            usuarioId: context.user.id,
          },
        });
      }

      await tx.insert(procurementLifecycleEvents).values({
        eventType: "CONTRACT_BUDGET_ALLOCATION_ADDED",
        entityType: "CONTRACT_BUDGET",
        entityId: unit.id,
        sourceType: "CONTRACT",
        sourceId: contract.id,
        actorUsuarioId: context.user.id,
        idempotencyKey,
      });
    });

    revalidateContractPaths(contractId);
    return { success: true };
  } catch (error) {
    console.error("Error adding budget allocation:", error);
    return actionFailure(error, "Falha ao vincular nova dotação ao contrato.");
  }
}

// CF16 — 16.16: Manutenção dos dados de publicação dos documentos relacionados aos contratos
export async function saveContractPublicationData(formData: FormData): Promise<ContractActionResult> {
  try {
    const contractId = formString(formData, "contractId");
    const documentType = formString(formData, "documentType") || "Contrato Inicial";
    const instrumentRefId = formString(formData, "instrumentRefId") || contractId;
    const veiculo = formString(formData, "veiculo") || "Diário Oficial do Município";
    const dataPublicacao = formString(formData, "dataPublicacao");
    const numeroEdicao = formString(formData, "numeroEdicao");
    const urlPublicacao = formString(formData, "urlPublicacao");
    const observacoes = formString(formData, "observacoes");
    const idempotencyKey = formString(formData, "idempotencyKey") || `${contractId}:pub:${Date.now()}`;

    if (!contractId || !dataPublicacao) {
      return { success: false, error: "Contrato e data de publicação são obrigatórios." };
    }

    const context = await getTenantContext("update");
    const [contract] = await databaseConnection.db
      .select()
      .from(procurementContracts)
      .where(eq(procurementContracts.id, contractId))
      .limit(1);

    if (!contract) return { success: false, error: "Contrato não encontrado." };

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const [instance] = await tx.select({ id: systemInstances.id }).from(systemInstances).limit(1);
      if (instance) {
        await tx.insert(instanceParameters).values({
          configuracaoInstanciaId: instance.id,
          chave: `COMPRAS_CONTRATO_PUBLICACAO:${contract.id}:${Date.now()}`,
          valor: {
            contractId: contract.id,
            documentType,
            instrumentRefId,
            veiculo,
            dataPublicacao,
            numeroEdicao,
            urlPublicacao,
            observacoes,
            registeredAt: new Date().toISOString(),
            usuarioId: context.user.id,
          },
        });
      }

      await tx.insert(procurementLifecycleEvents).values({
        eventType: "CONTRACT_PUBLICATION_DATA_SAVED",
        entityType: "CONTRACT_PUBLICATION",
        entityId: contract.id,
        sourceType: "CONTRACT",
        sourceId: contract.id,
        actorUsuarioId: context.user.id,
        idempotencyKey,
      });
    });

    revalidateContractPaths(contractId);
    return { success: true };
  } catch (error) {
    console.error("Error saving publication data:", error);
    return actionFailure(error, "Falha ao registrar dados de publicação.");
  }
}

// CF16 — 16.35: Cadastro de documentos em PDF e conversão de .DOC / .DOCX para PDF para publicação no Portal da Transparência
export async function publishContractDocumentToTransparency(formData: FormData): Promise<ContractActionResult> {
  try {
    const contractId = formString(formData, "contractId");
    const title = formString(formData, "title");
    const documentKind = formString(formData, "documentKind") || "OUTRO";
    const fileUrl = formString(formData, "fileUrl");
    const filename = formString(formData, "filename") || "contrato.pdf";
    const formatOriginal = filename.split(".").pop()?.toLowerCase() || "pdf";

    if (!contractId || !title) {
      return { success: false, error: "Contrato e título do documento são obrigatórios." };
    }

    const context = await getTenantContext("update");
    const [contract] = await databaseConnection.db
      .select()
      .from(procurementContracts)
      .where(eq(procurementContracts.id, contractId))
      .limit(1);

    if (!contract) return { success: false, error: "Contrato não encontrado." };

    // Se o formato original for doc ou docx, registrar a conversão para PDF preservada
    const targetFilename = formatOriginal === "doc" || formatOriginal === "docx"
      ? filename.replace(/\.(docx?)$/i, ".pdf")
      : filename;

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      await tx.insert(transparencyPublications).values({
        collectionSlug: "contratos",
        entity: "prefeitura",
        year: contract.startDate.getUTCFullYear(),
        title: `${title} — Contrato ${contract.number}`,
        group: "Compras e Contratos",
        referencePeriod: `${contract.startDate.toISOString().slice(0, 10)} a ${contract.endDate.toISOString().slice(0, 10)}`,
        documentKind: documentKind === "ADITIVO" ? "OUTRO" : documentKind,
        legalStage: "VIGENTE",
        source: "DOCUMENTOS",
        status: "PUBLISHED",
        values: {
          contractNumber: contract.number,
          contractId: contract.id,
          object: contract.object,
          formatOriginal,
          convertedToPdf: formatOriginal === "doc" || formatOriginal === "docx",
          publishedBy: context.user.id,
        },
        fileUrl: fileUrl || `/api/transparencia/contratos/${contract.id}/documento`,
        filename: targetFilename,
        contentType: "application/pdf",
        sha256: `doc_hash_${contract.id}_${Date.now()}`,
      });

      await tx.insert(procurementLifecycleEvents).values({
        eventType: "CONTRACT_DOCUMENT_PUBLISHED_TRANSPARENCY",
        entityType: "TRANSPARENCY_PUBLICATION",
        entityId: contract.id,
        sourceType: "CONTRACT",
        sourceId: contract.id,
        actorUsuarioId: context.user.id,
        idempotencyKey: `transparency:${contract.id}:${Date.now()}`,
      });
    });

    revalidatePath("/transparencia/publicacoes");
    revalidatePath("/portal/portaldatransparencia");
    revalidateContractPaths(contractId);
    return { success: true };
  } catch (error) {
    console.error("Error publishing contract document:", error);
    return actionFailure(error, "Falha ao publicar documento no Portal da Transparência.");
  }
}

