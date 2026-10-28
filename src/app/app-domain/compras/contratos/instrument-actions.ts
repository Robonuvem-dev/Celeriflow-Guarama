"use server";

import { Decimal } from "@/db/decimal";
import { and, eq, inArray, isNull, ne, sql } from "drizzle-orm";
import { databaseConnection } from "@/db/client";
import { getPostgresError } from "@/db/errors";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { procurementContracts, purchaseProcessItems } from "@/db/schema/procurement-core";
import { instrumentResponsibilityGroups, instrumentParties, instrumentMeasurements, instrumentMeasurementItems, instrumentInstallments, procurementCovenants } from "@/db/schema/procurement-instruments";
import { procurementLifecycleEvents } from "@/db/schema/procurement-requests";
import { procurementCommitments, procurementSettlements } from "@/db/schema/procurement-finance";
import { suppliers, companies, documents } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { employees } from "@/db/schema/administration";
import { revalidatePath } from "next/cache";
import {
  AccessError,
  assertBudgetUnitAccess,
  getTenantContextForModuleOperation,
  type AppContext,
} from "@/lib/platform/tenant-context";
import {
  ContractLifecycleError,
  assertDateWithinInstrumentValidity,
  assertEditableMeasurementStatus,
  assertInstrumentAggregateTotalWithinCurrentValue,
  assertLifecycleDateRange,
  assertMeasurementCanBeAttested,
  assertMeasurementStatusTransition,
  assertOptionalQuantityAndUnit,
  assertPositiveSequence,
  contractBudgetUnitIdsForMutation,
  isInstrumentInstallmentStatus,
  isInstrumentKind,
  isInstrumentMeasurementStatus,
  isInstrumentPartyStatus,
  isInstrumentResponsibilityGroupStatus,
  optionalLifecycleText,
  parseInstrumentPartyReference,
  parseOptionalLifecycleDate,
  requiredLifecycleText,
  type InstrumentKind,
} from "@/lib/compras/contract-lifecycle";
import {
  ProcurementFinanceBridgeError,
  cancelInstrumentMeasurementLiquidationAuthorization,
  recordInstrumentMeasurementLiquidationAuthorization,
} from "@/lib/compras/procurement-finance-bridge";

export type InstrumentActionResult = { success: true } | { success: false; error: string };

type Transaction = DatabaseTransaction;
type InstrumentReference = { kind: InstrumentKind; id: string };
type AuthorizedInstrument =
  | {
    kind: "CONTRACT";
    id: string;
    status: string;
    sourceBudgetUnitId: string | null;
    processId: string;
    startDate: Date;
    endDate: Date;
    currentValue: Decimal;
    updatedAt: Date;
  }
  | {
    kind: "COVENANT";
    id: string;
    status: string;
    startDate: Date;
    endDate: Date;
    currentValue: Decimal;
    updatedAt: Date;
  };

const activeMeasurementStatuses = ["Rascunho", "Em análise", "Atestada"];

function formString(formData: FormData, name: string) {
  const value = formData.get(name);
  return typeof value === "string" ? value.trim() : "";
}

function formNumber(formData: FormData, name: string, label: string) {
  const value = formString(formData, name);
  if (!value) return null;
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number)) throw new ContractLifecycleError(`Informe ${label.toLocaleLowerCase("pt-BR")} válido.`);
  return number;
}

function formDecimal(formData: FormData, name: string, label: string, options: { required?: boolean; positive?: boolean } = {}) {
  const value = formString(formData, name);
  const required = options.required !== false;
  if (!value) {
    if (required) throw new ContractLifecycleError(`Informe ${label.toLocaleLowerCase("pt-BR")}.`);
    return null;
  }
  if (!/^\d{1,16}(?:[.,]\d{1,2})?$/.test(value)) {
    throw new ContractLifecycleError(`Informe ${label.toLocaleLowerCase("pt-BR")} com até duas casas decimais.`);
  }
  const number = Number(value.replace(",", "."));
  if (!Number.isFinite(number) || number < 0 || (options.positive && number === 0)) {
    throw new ContractLifecycleError(`Informe ${label.toLocaleLowerCase("pt-BR")} ${options.positive ? "maior que zero" : "maior ou igual a zero"}.`);
  }
  return new Decimal(value.replace(",", "."));
}

function actionFailure(error: unknown, fallback: string): InstrumentActionResult {
  if (error instanceof ContractLifecycleError || error instanceof ProcurementFinanceBridgeError || error instanceof AccessError) return { success: false, error: error.message };
  if (getPostgresError(error)?.code === "23505") {
    return { success: false, error: "Já existe um registro com os mesmos dados para este instrumento." };
  }
  console.error(fallback, error);
  return { success: false, error: fallback };
}

function referenceFromForm(formData: FormData): InstrumentReference {
  const kind = formString(formData, "instrumentType");
  const id = formString(formData, "instrumentId");
  if (!isInstrumentKind(kind) || !id) throw new ContractLifecycleError("Instrumento inválido.");
  return { kind, id };
}

function instrumentParentFields(reference: InstrumentReference) {
  return reference.kind === "CONTRACT"
    ? { contractId: reference.id, covenantId: null }
    : { contractId: null, covenantId: reference.id };
}

function instrumentParentCondition(table: typeof instrumentResponsibilityGroups | typeof instrumentParties | typeof instrumentMeasurements | typeof instrumentInstallments, reference: InstrumentReference) {
  return reference.kind === "CONTRACT"
    ? and(eq(table.contractId, reference.id), isNull(table.covenantId))
    : and(eq(table.covenantId, reference.id), isNull(table.contractId));
}

function assertChildBelongsToInstrument(reference: InstrumentReference, child: { contractId: string | null; covenantId: string | null }) {
  const belongsToContract = reference.kind === "CONTRACT" && child.contractId === reference.id && child.covenantId === null;
  const belongsToCovenant = reference.kind === "COVENANT" && child.covenantId === reference.id && child.contractId === null;
  if (!belongsToContract && !belongsToCovenant) throw new ContractLifecycleError("O registro não pertence ao instrumento informado.");
}

function idempotencyKey(formData: FormData, action: string, reference: InstrumentReference) {
  const key = formString(formData, "idempotencyKey");
  if (!/^[A-Za-z0-9_-]{16,128}$/.test(key)) {
    throw new ContractLifecycleError("Não foi possível validar a repetição segura da ação. Atualize a página e tente novamente.");
  }
  return `${action}:${reference.kind}:${reference.id}:${key}`;
}

async function getAuthorizedInstrument(tx: Transaction, user: AppContext["user"], reference: InstrumentReference): Promise<AuthorizedInstrument> {
  if (reference.kind === "CONTRACT") {
    const [contract] = await tx.select().from(procurementContracts).where(eq(procurementContracts.id, reference.id)).limit(1).for("update");
    if (!contract) throw new ContractLifecycleError("Contrato não encontrado.");

    const budgetUnitIds = contractBudgetUnitIdsForMutation(user, { currentSourceBudgetUnitId: contract.sourceBudgetUnitId });
    for (const budgetUnitId of budgetUnitIds) assertBudgetUnitAccess(user, budgetUnitId);
    return { kind: "CONTRACT", ...contract, currentValue: new Decimal(contract.updatedValue) };
  }

  const [covenant] = await tx.select().from(procurementCovenants).where(eq(procurementCovenants.id, reference.id)).limit(1).for("update");
  if (!covenant) throw new ContractLifecycleError("Convênio não encontrado.");
  // Covenant has no source budget-unit field. Module authorization is the available ownership boundary.
  return { kind: "COVENANT", ...covenant, currentValue: new Decimal(covenant.totalValueDecimal) };
}

function assertInstrumentWritable(instrument: AuthorizedInstrument) {
  if (["Encerrado", "Rescindido"].includes(instrument.status)) {
    throw new ContractLifecycleError(`${instrument.kind === "CONTRACT" ? "Contrato" : "Convênio"} encerrado ou rescindido não aceita novas alterações de execução.`);
  }
}

async function isRepeatedAction(
  tx: Transaction,
  key: string,
  reference: InstrumentReference,
  entityType: string,
) {
  const [event] = await tx.select().from(procurementLifecycleEvents).where(eq(procurementLifecycleEvents.idempotencyKey, key)).limit(1);
  if (!event) return false;
  if (event.entityType !== entityType || event.sourceType !== reference.kind || event.sourceId !== reference.id) {
    throw new ContractLifecycleError("A chave de repetição já foi usada em outro ato do instrumento.");
  }
  return true;
}

async function recordInstrumentEvent(
  tx: Transaction,
  input: {
    eventType: string;
    entityType: string;
    entityId: string;
    reference: InstrumentReference;
    actorUsuarioId: string;
    idempotencyKey: string;
  },
) {
  await tx.insert(procurementLifecycleEvents).values({
      eventType: input.eventType,
      entityType: input.entityType,
      entityId: input.entityId,
      sourceType: input.reference.kind,
      sourceId: input.reference.id,
      actorUsuarioId: input.actorUsuarioId,
      idempotencyKey: input.idempotencyKey,
  });
}

function revalidateInstrumentPaths(reference: InstrumentReference) {
  const basePath = reference.kind === "CONTRACT" ? "/compras/contratos" : "/compras/convenios";
  revalidatePath(basePath);
  revalidatePath(`${basePath}/${reference.id}`);
  revalidatePath(`${basePath}/${reference.id}/editar`);
  revalidatePath(`${basePath}/${reference.id}/relatorio`);
}

async function lockInstrumentExecution(tx: Transaction, instrument: AuthorizedInstrument) {
  const now = new Date();
  const updated = instrument.kind === "CONTRACT"
    ? await tx.update(procurementContracts).set({ updatedAt: now }).where(and(eq(procurementContracts.id, instrument.id), eq(procurementContracts.updatedAt, instrument.updatedAt))).returning({ id: procurementContracts.id })
    : await tx.update(procurementCovenants).set({ updatedAt: now }).where(and(eq(procurementCovenants.id, instrument.id), eq(procurementCovenants.updatedAt, instrument.updatedAt))).returning({ id: procurementCovenants.id });
  if (updated.length !== 1) {
    throw new ContractLifecycleError("O instrumento foi alterado por outra operação. Atualize e tente novamente.");
  }
}

async function validateResponsibilityGroup(
  tx: Transaction,
  reference: InstrumentReference,
  responsibilityGroupId: string | null,
) {
  if (!responsibilityGroupId) return null;
  const [group] = await tx.select().from(instrumentResponsibilityGroups).where(eq(instrumentResponsibilityGroups.id, responsibilityGroupId)).limit(1);
  if (!group) throw new ContractLifecycleError("Grupo de responsabilidade não encontrado.");
  assertChildBelongsToInstrument(reference, group);
  if (group.status !== "Ativo") throw new ContractLifecycleError("Selecione um grupo de responsabilidade ativo.");
  return group.id;
}

async function validatePartyIdentity(tx: Transaction, value: string) {
  const identity = parseInstrumentPartyReference(value);
  if (identity.kind === "SUPPLIER") {
    const [supplier] = await tx.select({ id: suppliers.id, status: suppliers.status }).from(suppliers).where(eq(suppliers.id, identity.id)).limit(1);
    if (!supplier || supplier.status !== "Ativo") throw new ContractLifecycleError("Selecione um fornecedor ativo.");
    return { supplierId: supplier.id, personId: null, companyId: null, employeeId: null };
  }
  if (identity.kind === "PERSON") {
    const [person] = await tx.select({ id: people.id, status: people.status }).from(people).where(eq(people.id, identity.id)).limit(1);
    if (!person || person.status !== "Ativo") throw new ContractLifecycleError("Selecione uma pessoa ativa.");
    return { supplierId: null, personId: person.id, companyId: null, employeeId: null };
  }
  if (identity.kind === "COMPANY") {
    const [company] = await tx.select({ id: companies.id, status: companies.status }).from(companies).where(eq(companies.id, identity.id)).limit(1);
    if (!company || company.status !== "Ativo") throw new ContractLifecycleError("Selecione uma empresa ativa.");
    return { supplierId: null, personId: null, companyId: company.id, employeeId: null };
  }
  const [employee] = await tx.select({ id: employees.id, isActive: employees.isActive }).from(employees).where(eq(employees.id, identity.id)).limit(1);
  if (!employee || !employee.isActive) throw new ContractLifecycleError("Selecione um servidor ativo.");
  return { supplierId: null, personId: null, companyId: null, employeeId: employee.id };
}

async function validatePurchaseProcessItem(
  tx: Transaction,
  instrument: AuthorizedInstrument,
  purchaseProcessItemId: string | null,
) {
  if (!purchaseProcessItemId) return null;
  if (instrument.kind !== "CONTRACT") {
    throw new ContractLifecycleError("Itens de processo só podem ser vinculados a medições de contrato.");
  }
  const [item] = await tx.select({ id: purchaseProcessItems.id, purchaseProcessId: purchaseProcessItems.purchaseProcessId }).from(purchaseProcessItems).where(eq(purchaseProcessItems.id, purchaseProcessItemId)).limit(1);
  if (!item || item.purchaseProcessId !== instrument.processId) {
    throw new ContractLifecycleError("O item informado não pertence ao processo do contrato.");
  }
  return item.id;
}

export async function saveInstrumentResponsibilityGroup(formData: FormData): Promise<InstrumentActionResult> {
  try {
    const reference = referenceFromForm(formData);
    const groupId = formString(formData, "groupId") || null;
    const name = requiredLifecycleText(formString(formData, "name"), "o nome do grupo", 160);
    const description = optionalLifecycleText(formString(formData, "description"), "a descrição", 1_000);
    const status = formString(formData, "status") || "Ativo";
    if (!isInstrumentResponsibilityGroupStatus(status)) return { success: false, error: "Situação do grupo inválida." };
    const key = idempotencyKey(formData, "INSTRUMENT_GROUP", reference);
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const instrument = await getAuthorizedInstrument(tx, context.user, reference);
      assertInstrumentWritable(instrument);
      if (await isRepeatedAction(tx, key, reference, "INSTRUMENT_RESPONSIBILITY_GROUP")) return;

      const parent = instrumentParentFields(reference);
      const [duplicate] = await tx.select({ id: instrumentResponsibilityGroups.id }).from(instrumentResponsibilityGroups).where(and(instrumentParentCondition(instrumentResponsibilityGroups, reference), eq(instrumentResponsibilityGroups.name, name), groupId ? ne(instrumentResponsibilityGroups.id, groupId) : undefined)).limit(1);
      if (duplicate) throw new ContractLifecycleError("Já existe um grupo com esse nome neste instrumento.");

      if (groupId) {
        const [existing] = await tx.select().from(instrumentResponsibilityGroups).where(eq(instrumentResponsibilityGroups.id, groupId)).limit(1);
        if (!existing) throw new ContractLifecycleError("Grupo de responsabilidade não encontrado.");
        assertChildBelongsToInstrument(reference, existing);
        const updated = await tx.update(instrumentResponsibilityGroups).set({ name, description, status }).where(and(eq(instrumentResponsibilityGroups.id, existing.id), eq(instrumentResponsibilityGroups.updatedAt, existing.updatedAt), instrumentParentCondition(instrumentResponsibilityGroups, reference))).returning({ id: instrumentResponsibilityGroups.id });
        if (updated.length !== 1) throw new ContractLifecycleError("O grupo foi alterado por outra operação. Atualize e tente novamente.");
        await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_RESPONSIBILITY_GROUP_UPDATED", entityType: "INSTRUMENT_RESPONSIBILITY_GROUP", entityId: existing.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
        return;
      }

      const [created] = await tx.insert(instrumentResponsibilityGroups).values({ ...parent, name, description, status }).returning({ id: instrumentResponsibilityGroups.id });
      await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_RESPONSIBILITY_GROUP_CREATED", entityType: "INSTRUMENT_RESPONSIBILITY_GROUP", entityId: created.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
    });

    revalidateInstrumentPaths(reference);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível salvar o grupo de responsabilidade.");
  }
}

export async function deleteInstrumentResponsibilityGroup(formData: FormData): Promise<InstrumentActionResult> {
  try {
    const reference = referenceFromForm(formData);
    const groupId = requiredLifecycleText(formString(formData, "groupId"), "o grupo de responsabilidade", 200);
    const key = idempotencyKey(formData, "INSTRUMENT_GROUP_DELETE", reference);
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const instrument = await getAuthorizedInstrument(tx, context.user, reference);
      assertInstrumentWritable(instrument);
      if (await isRepeatedAction(tx, key, reference, "INSTRUMENT_RESPONSIBILITY_GROUP")) return;

      const [group] = await tx.select().from(instrumentResponsibilityGroups).where(eq(instrumentResponsibilityGroups.id, groupId)).limit(1);
      if (!group) throw new ContractLifecycleError("Grupo de responsabilidade não encontrado.");
      assertChildBelongsToInstrument(reference, group);
      const [member] = await tx.select({ id: instrumentParties.id }).from(instrumentParties).where(eq(instrumentParties.responsibilityGroupId, group.id)).limit(1);
      if (member) throw new ContractLifecycleError("Remova ou reclassifique os membros do grupo antes de excluí-lo.");

      const deleted = await tx.delete(instrumentResponsibilityGroups).where(and(eq(instrumentResponsibilityGroups.id, group.id), eq(instrumentResponsibilityGroups.updatedAt, group.updatedAt), instrumentParentCondition(instrumentResponsibilityGroups, reference))).returning({ id: instrumentResponsibilityGroups.id });
      if (deleted.length !== 1) throw new ContractLifecycleError("O grupo foi alterado por outra operação. Atualize e tente novamente.");
      await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_RESPONSIBILITY_GROUP_DELETED", entityType: "INSTRUMENT_RESPONSIBILITY_GROUP", entityId: group.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
    });

    revalidateInstrumentPaths(reference);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível excluir o grupo de responsabilidade.");
  }
}

export async function saveInstrumentParty(formData: FormData): Promise<InstrumentActionResult> {
  try {
    const reference = referenceFromForm(formData);
    const partyId = formString(formData, "partyId") || null;
    const role = requiredLifecycleText(formString(formData, "role"), "o papel da parte", 120);
    const status = formString(formData, "status") || "Ativo";
    if (!isInstrumentPartyStatus(status)) return { success: false, error: "Situação da parte inválida." };
    const activeFrom = parseOptionalLifecycleDate(formString(formData, "activeFrom"), "Data inicial da parte");
    const activeTo = parseOptionalLifecycleDate(formString(formData, "activeTo"), "Data final da parte");
    assertLifecycleDateRange(activeFrom, activeTo, "data inicial da parte", "A data final da parte");
    const notes = optionalLifecycleText(formString(formData, "notes"), "as observações", 2_000);
    const key = idempotencyKey(formData, "INSTRUMENT_PARTY", reference);
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const instrument = await getAuthorizedInstrument(tx, context.user, reference);
      assertInstrumentWritable(instrument);
      if (await isRepeatedAction(tx, key, reference, "INSTRUMENT_PARTY")) return;

      const [identity, responsibilityGroupId] = await Promise.all([
        validatePartyIdentity(tx, formString(formData, "partyReference")),
        validateResponsibilityGroup(tx, reference, formString(formData, "responsibilityGroupId") || null),
      ]);
      const data = { role, ...identity, responsibilityGroupId, status, activeFrom, activeTo, notes };
      const parent = instrumentParentFields(reference);

      if (partyId) {
        const [existing] = await tx.select().from(instrumentParties).where(eq(instrumentParties.id, partyId)).limit(1);
        if (!existing) throw new ContractLifecycleError("Parte do instrumento não encontrada.");
        assertChildBelongsToInstrument(reference, existing);
        const updated = await tx.update(instrumentParties).set(data).where(and(eq(instrumentParties.id, existing.id), eq(instrumentParties.updatedAt, existing.updatedAt), instrumentParentCondition(instrumentParties, reference))).returning({ id: instrumentParties.id });
        if (updated.length !== 1) throw new ContractLifecycleError("A parte foi alterada por outra operação. Atualize e tente novamente.");
        await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_PARTY_UPDATED", entityType: "INSTRUMENT_PARTY", entityId: existing.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
        return;
      }

      const [created] = await tx.insert(instrumentParties).values({ ...parent, ...data }).returning({ id: instrumentParties.id });
      await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_PARTY_CREATED", entityType: "INSTRUMENT_PARTY", entityId: created.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
    });

    revalidateInstrumentPaths(reference);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível salvar a parte do instrumento.");
  }
}

export async function deleteInstrumentParty(formData: FormData): Promise<InstrumentActionResult> {
  try {
    const reference = referenceFromForm(formData);
    const partyId = requiredLifecycleText(formString(formData, "partyId"), "a parte do instrumento", 200);
    const key = idempotencyKey(formData, "INSTRUMENT_PARTY_DELETE", reference);
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const instrument = await getAuthorizedInstrument(tx, context.user, reference);
      assertInstrumentWritable(instrument);
      if (await isRepeatedAction(tx, key, reference, "INSTRUMENT_PARTY")) return;

      const [party] = await tx.select().from(instrumentParties).where(eq(instrumentParties.id, partyId)).limit(1);
      if (!party) throw new ContractLifecycleError("Parte do instrumento não encontrada.");
      assertChildBelongsToInstrument(reference, party);

      const deleted = await tx.delete(instrumentParties).where(and(eq(instrumentParties.id, party.id), eq(instrumentParties.updatedAt, party.updatedAt), instrumentParentCondition(instrumentParties, reference))).returning({ id: instrumentParties.id });
      if (deleted.length !== 1) throw new ContractLifecycleError("A parte foi alterada por outra operação. Atualize e tente novamente.");
      await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_PARTY_DELETED", entityType: "INSTRUMENT_PARTY", entityId: party.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
    });

    revalidateInstrumentPaths(reference);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível excluir a parte do instrumento.");
  }
}

function measurementInput(formData: FormData) {
  const number = assertPositiveSequence(formNumber(formData, "number", "Número da medição"), "O número da medição");
  const description = optionalLifecycleText(formString(formData, "description"), "a descrição", 1_000);
  const periodStart = parseOptionalLifecycleDate(formString(formData, "periodStart"), "Data inicial do período");
  const periodEnd = parseOptionalLifecycleDate(formString(formData, "periodEnd"), "Data final do período");
  assertLifecycleDateRange(periodStart, periodEnd, "data inicial do período", "A data final do período");
  const measuredAt = parseOptionalLifecycleDate(formString(formData, "measuredAt"), "Data da medição");
  if (!measuredAt) throw new ContractLifecycleError("Informe a data da medição.");
  const { quantity, unit } = assertOptionalQuantityAndUnit(formNumber(formData, "quantity", "Quantidade"), formString(formData, "unit"), "A medição");
  const valueDecimal = formDecimal(formData, "valueDecimal", "o valor da medição");
  if (!valueDecimal) throw new ContractLifecycleError("Informe o valor da medição.");
  const status = formString(formData, "status") || "Rascunho";
  if (!isInstrumentMeasurementStatus(status)) throw new ContractLifecycleError("Situação da medição inválida.");
  const documentId = formString(formData, "documentId") || null;
  return { number, description, periodStart, periodEnd, measuredAt, quantity, unit, valueDecimal, status, documentId };
}

function assertMeasurementDatesWithinInstrumentValidity(
  data: ReturnType<typeof measurementInput>,
  instrument: AuthorizedInstrument,
) {
  assertDateWithinInstrumentValidity(data.measuredAt, instrument.startDate, instrument.endDate, "A data da medição");
  if (data.periodStart) assertDateWithinInstrumentValidity(data.periodStart, instrument.startDate, instrument.endDate, "A data inicial do período");
  if (data.periodEnd) assertDateWithinInstrumentValidity(data.periodEnd, instrument.startDate, instrument.endDate, "A data final do período");
}

async function validateMeasurementDocument(tx: Transaction, documentId: string | null, currentDocumentId: string | null = null) {
  if (!documentId || documentId === currentDocumentId) return documentId;
  const [document] = await tx.select({ id: documents.id }).from(documents).where(and(eq(documents.id, documentId), eq(documents.status, "Válido"), ne(documents.documentType, "Modelo"))).limit(1);
  if (!document) throw new ContractLifecycleError("Selecione um documento GED válido.");
  return document.id;
}

async function assertMeasurementAggregateWithinInstrumentValue(
  tx: Transaction,
  reference: InstrumentReference,
  instrument: AuthorizedInstrument,
  measurementId: string | null,
  data: ReturnType<typeof measurementInput>,
) {
  const [aggregate] = await tx.select({ value: sql<string>`coalesce(sum(${instrumentMeasurements.valueDecimal}), 0)::text` }).from(instrumentMeasurements).where(and(instrumentParentCondition(instrumentMeasurements, reference), measurementId ? ne(instrumentMeasurements.id, measurementId) : undefined, inArray(instrumentMeasurements.status, activeMeasurementStatuses)));
  const total = new Decimal(aggregate.value).plus(
    activeMeasurementStatuses.includes(data.status) ? data.valueDecimal : 0,
  );
  assertInstrumentAggregateTotalWithinCurrentValue(instrument.currentValue, total, "medições ativas");
}

async function assertAttestedMeasurementCancellationIsFinanciallySafe(
  tx: Transaction,
  reference: InstrumentReference,
  measurementId: string,
) {
  const [settlement] = await tx.select({ id: procurementSettlements.id }).from(procurementSettlements).innerJoin(procurementCommitments, eq(procurementCommitments.id, procurementSettlements.commitmentId)).where(and(
    eq(procurementSettlements.documentRef, `AL-MED-${measurementId}`),
    reference.kind === "CONTRACT" ? eq(procurementCommitments.contractId, reference.id) : eq(procurementCommitments.covenantId, reference.id),
    sql`(${procurementSettlements.status} <> 'Cancelado' OR EXISTS (SELECT 1 FROM "Payment" p WHERE p."settlementId" = ${procurementSettlements.id} AND p.status <> 'Cancelado'))`,
  )).limit(1);
  if (settlement) {
    throw new ContractLifecycleError("A medição atestada possui liquidação financeira ativa e não pode ser cancelada.");
  }
}

function cancellationDescription(description: string | null, reason: string) {
  const entry = `Cancelamento: ${reason}`;
  const value = description ? `${description}\n\n${entry}` : entry;
  if (value.length > 1_000) {
    throw new ContractLifecycleError("A descrição existente não comporta a justificativa do cancelamento.");
  }
  return value;
}

export async function saveInstrumentMeasurement(formData: FormData): Promise<InstrumentActionResult> {
  try {
    const reference = referenceFromForm(formData);
    const measurementId = formString(formData, "measurementId") || null;
    const requestedStatus = formString(formData, "status") || "Rascunho";
    const requestedData = measurementId && requestedStatus === "Cancelada" ? null : measurementInput(formData);
    if (!measurementId && requestedData!.status !== "Rascunho") return { success: false, error: "Uma nova medição deve iniciar como rascunho." };
    const key = idempotencyKey(formData, "INSTRUMENT_MEASUREMENT", reference);
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const mutateMeasurement = async () => {
      const instrument = await getAuthorizedInstrument(tx, context.user, reference);
      assertInstrumentWritable(instrument);
      if (await isRepeatedAction(tx, key, reference, "INSTRUMENT_MEASUREMENT")) return;

      const parent = instrumentParentFields(reference);
      if (measurementId) {
        const [existing] = await tx.select().from(instrumentMeasurements).where(eq(instrumentMeasurements.id, measurementId)).limit(1);
        if (!existing) throw new ContractLifecycleError("Medição não encontrada.");
        assertChildBelongsToInstrument(reference, existing);
        assertMeasurementStatusTransition(existing.status, requestedStatus);
        const isCancellation = requestedStatus === "Cancelada";
        if (existing.status === "Cancelada") throw new ContractLifecycleError("Uma medição cancelada não aceita novas alterações.");
        if (existing.status === "Atestada" && !isCancellation) {
          throw new ContractLifecycleError("Uma medição atestada só pode ser cancelada para preservar sua evidência.");
        }

        const data = isCancellation
          ? {
            number: existing.number,
            description: cancellationDescription(
              existing.description,
              requiredLifecycleText(formString(formData, "cancellationReason"), "a justificativa do cancelamento", 700),
            ),
            periodStart: existing.periodStart,
            periodEnd: existing.periodEnd,
            measuredAt: existing.measuredAt,
            quantity: existing.quantity,
            unit: existing.unit,
            valueDecimal: existing.valueDecimal,
            status: "Cancelada",
            documentId: existing.documentId,
          }
          : {
            ...requestedData!,
            documentId: await validateMeasurementDocument(tx, requestedData!.documentId, existing.documentId),
          };

        if (isCancellation && existing.status === "Atestada") {
          await assertAttestedMeasurementCancellationIsFinanciallySafe(tx, reference, existing.id);
        }
        if (!isCancellation) {
          const [duplicate] = await tx.select({ id: instrumentMeasurements.id }).from(instrumentMeasurements).where(and(instrumentParentCondition(instrumentMeasurements, reference), eq(instrumentMeasurements.number, data.number), ne(instrumentMeasurements.id, existing.id))).limit(1);
          if (duplicate) throw new ContractLifecycleError("Já existe uma medição com esse número neste instrumento.");
          assertMeasurementDatesWithinInstrumentValidity(data, instrument);
          if (data.status === "Atestada") {
            const items = await tx.select({ valueDecimal: instrumentMeasurementItems.valueDecimal }).from(instrumentMeasurementItems).where(eq(instrumentMeasurementItems.measurementId, existing.id));
            assertMeasurementCanBeAttested({
              quantity: data.quantity,
              unit: data.unit,
              value: data.valueDecimal,
              itemCount: items.length,
              itemValueTotal: items.reduce((total, item) => total.plus(item.valueDecimal), new Decimal(0)),
            });
          }
          await lockInstrumentExecution(tx, instrument);
          await assertMeasurementAggregateWithinInstrumentValue(tx, reference, instrument, existing.id, data);
        }
        const updated = await tx.update(instrumentMeasurements).set(data).where(and(eq(instrumentMeasurements.id, existing.id), eq(instrumentMeasurements.updatedAt, existing.updatedAt), instrumentParentCondition(instrumentMeasurements, reference))).returning({ id: instrumentMeasurements.id });
        if (updated.length !== 1) throw new ContractLifecycleError("A medição foi alterada por outra operação. Atualize e tente novamente.");
        await recordInstrumentEvent(tx, { eventType: isCancellation ? "INSTRUMENT_MEASUREMENT_CANCELLED" : "INSTRUMENT_MEASUREMENT_UPDATED", entityType: "INSTRUMENT_MEASUREMENT", entityId: existing.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
        return;
      }

      const data = {
        ...requestedData!,
        documentId: await validateMeasurementDocument(tx, requestedData!.documentId),
      };
      const [duplicate] = await tx.select({ id: instrumentMeasurements.id }).from(instrumentMeasurements).where(and(instrumentParentCondition(instrumentMeasurements, reference), eq(instrumentMeasurements.number, data.number))).limit(1);
      if (duplicate) throw new ContractLifecycleError("Já existe uma medição com esse número neste instrumento.");
      assertMeasurementDatesWithinInstrumentValidity(data, instrument);
      await lockInstrumentExecution(tx, instrument);
      await assertMeasurementAggregateWithinInstrumentValue(tx, reference, instrument, null, data);
      const [created] = await tx.insert(instrumentMeasurements).values({ ...parent, ...data }).returning({ id: instrumentMeasurements.id });
      await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_MEASUREMENT_CREATED", entityType: "INSTRUMENT_MEASUREMENT", entityId: created.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
      };
      await mutateMeasurement();
      // Replay also validates the append-only AL evidence, on this same transaction.
      if (measurementId) {
        if (requestedStatus === "Cancelada") {
          await cancelInstrumentMeasurementLiquidationAuthorization(
            tx,
            { usuarioId: context.user.id, employeeId: context.user.employeeId },
            measurementId,
          );
        } else {
          await recordInstrumentMeasurementLiquidationAuthorization(
            tx,
            { usuarioId: context.user.id, employeeId: context.user.employeeId },
            measurementId,
          );
        }
      }
    });

    revalidateInstrumentPaths(reference);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível salvar a medição.");
  }
}

export async function deleteInstrumentMeasurement(formData: FormData): Promise<InstrumentActionResult> {
  try {
    const reference = referenceFromForm(formData);
    const measurementId = requiredLifecycleText(formString(formData, "measurementId"), "a medição", 200);
    const key = idempotencyKey(formData, "INSTRUMENT_MEASUREMENT_DELETE", reference);
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const instrument = await getAuthorizedInstrument(tx, context.user, reference);
      assertInstrumentWritable(instrument);
      if (await isRepeatedAction(tx, key, reference, "INSTRUMENT_MEASUREMENT")) return;

      const [measurement] = await tx.select().from(instrumentMeasurements).where(eq(instrumentMeasurements.id, measurementId)).limit(1);
      if (!measurement) throw new ContractLifecycleError("Medição não encontrada.");
      assertChildBelongsToInstrument(reference, measurement);
      if (measurement.status !== "Rascunho") throw new ContractLifecycleError("Somente medições em rascunho podem ser excluídas. Cancele os demais registros para preservar o histórico.");
      const [item] = await tx.select({ id: instrumentMeasurementItems.id }).from(instrumentMeasurementItems).where(eq(instrumentMeasurementItems.measurementId, measurement.id)).limit(1);
      if (item) throw new ContractLifecycleError("Exclua os itens da medição antes de excluir o cabeçalho.");

      const deleted = await tx.delete(instrumentMeasurements).where(and(eq(instrumentMeasurements.id, measurement.id), eq(instrumentMeasurements.updatedAt, measurement.updatedAt), instrumentParentCondition(instrumentMeasurements, reference))).returning({ id: instrumentMeasurements.id });
      if (deleted.length !== 1) throw new ContractLifecycleError("A medição foi alterada por outra operação. Atualize e tente novamente.");
      await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_MEASUREMENT_DELETED", entityType: "INSTRUMENT_MEASUREMENT", entityId: measurement.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
    });

    revalidateInstrumentPaths(reference);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível excluir a medição.");
  }
}

function measurementItemInput(formData: FormData) {
  const description = requiredLifecycleText(formString(formData, "description"), "a descrição do item", 1_000);
  const quantity = formNumber(formData, "quantity", "Quantidade do item");
  if (quantity === null || quantity <= 0) throw new ContractLifecycleError("Informe uma quantidade do item maior que zero.");
  const unit = requiredLifecycleText(formString(formData, "unit"), "a unidade do item", 40);
  const unitValueDecimal = formDecimal(formData, "unitValueDecimal", "o valor unitário", { required: false });
  const valueDecimal = formDecimal(formData, "valueDecimal", "o valor do item");
  if (!valueDecimal) throw new ContractLifecycleError("Informe o valor do item.");
  return { description, quantity, unit, unitValueDecimal, valueDecimal };
}

async function measurementForItem(
  tx: Transaction,
  reference: InstrumentReference,
  measurementId: string,
) {
  const [measurement] = await tx.select().from(instrumentMeasurements).where(eq(instrumentMeasurements.id, measurementId)).limit(1);
  if (!measurement) throw new ContractLifecycleError("Medição não encontrada.");
  assertChildBelongsToInstrument(reference, measurement);
  assertEditableMeasurementStatus(measurement.status);
  return measurement;
}

export async function saveInstrumentMeasurementItem(formData: FormData): Promise<InstrumentActionResult> {
  try {
    const reference = referenceFromForm(formData);
    const measurementId = requiredLifecycleText(formString(formData, "measurementId"), "a medição", 200);
    const itemId = formString(formData, "measurementItemId") || null;
    const data = measurementItemInput(formData);
    const key = idempotencyKey(formData, "INSTRUMENT_MEASUREMENT_ITEM", reference);
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const instrument = await getAuthorizedInstrument(tx, context.user, reference);
      assertInstrumentWritable(instrument);
      if (await isRepeatedAction(tx, key, reference, "INSTRUMENT_MEASUREMENT_ITEM")) return;
      await measurementForItem(tx, reference, measurementId);
      const purchaseProcessItemId = await validatePurchaseProcessItem(tx, instrument, formString(formData, "purchaseProcessItemId") || null);

      if (itemId) {
        const [existing] = await tx.select().from(instrumentMeasurementItems).where(eq(instrumentMeasurementItems.id, itemId)).limit(1);
        if (!existing || existing.measurementId !== measurementId) throw new ContractLifecycleError("Item de medição não encontrado.");
        if (existing.purchaseReceiptItemId) throw new ContractLifecycleError("Item vinculado a recebimento material só pode ser consultado neste módulo.");
        const updated = await tx.update(instrumentMeasurementItems).set({ ...data, purchaseProcessItemId }).where(and(eq(instrumentMeasurementItems.id, existing.id), eq(instrumentMeasurementItems.measurementId, measurementId), eq(instrumentMeasurementItems.updatedAt, existing.updatedAt))).returning({ id: instrumentMeasurementItems.id });
        if (updated.length !== 1) throw new ContractLifecycleError("O item foi alterado por outra operação. Atualize e tente novamente.");
        await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_MEASUREMENT_ITEM_UPDATED", entityType: "INSTRUMENT_MEASUREMENT_ITEM", entityId: existing.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
        return;
      }

      const [created] = await tx.insert(instrumentMeasurementItems).values({ measurementId, ...data, purchaseProcessItemId }).returning({ id: instrumentMeasurementItems.id });
      await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_MEASUREMENT_ITEM_CREATED", entityType: "INSTRUMENT_MEASUREMENT_ITEM", entityId: created.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
    });

    revalidateInstrumentPaths(reference);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível salvar o item da medição.");
  }
}

export async function deleteInstrumentMeasurementItem(formData: FormData): Promise<InstrumentActionResult> {
  try {
    const reference = referenceFromForm(formData);
    const measurementId = requiredLifecycleText(formString(formData, "measurementId"), "a medição", 200);
    const itemId = requiredLifecycleText(formString(formData, "measurementItemId"), "o item da medição", 200);
    const key = idempotencyKey(formData, "INSTRUMENT_MEASUREMENT_ITEM_DELETE", reference);
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const instrument = await getAuthorizedInstrument(tx, context.user, reference);
      assertInstrumentWritable(instrument);
      if (await isRepeatedAction(tx, key, reference, "INSTRUMENT_MEASUREMENT_ITEM")) return;
      await measurementForItem(tx, reference, measurementId);

      const [item] = await tx.select().from(instrumentMeasurementItems).where(eq(instrumentMeasurementItems.id, itemId)).limit(1);
      if (!item || item.measurementId !== measurementId) throw new ContractLifecycleError("Item de medição não encontrado.");
      if (item.purchaseReceiptItemId) throw new ContractLifecycleError("Item vinculado a recebimento material só pode ser consultado neste módulo.");
      const deleted = await tx.delete(instrumentMeasurementItems).where(and(eq(instrumentMeasurementItems.id, item.id), eq(instrumentMeasurementItems.measurementId, measurementId), eq(instrumentMeasurementItems.updatedAt, item.updatedAt))).returning({ id: instrumentMeasurementItems.id });
      if (deleted.length !== 1) throw new ContractLifecycleError("O item foi alterado por outra operação. Atualize e tente novamente.");
      await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_MEASUREMENT_ITEM_DELETED", entityType: "INSTRUMENT_MEASUREMENT_ITEM", entityId: item.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
    });

    revalidateInstrumentPaths(reference);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível excluir o item da medição.");
  }
}

function installmentInput(formData: FormData) {
  const number = assertPositiveSequence(formNumber(formData, "number", "Número da parcela"), "O número da parcela");
  const dueDate = parseOptionalLifecycleDate(formString(formData, "dueDate"), "Data prevista de vencimento");
  if (!dueDate) throw new ContractLifecycleError("Informe a data prevista de vencimento.");
  const periodStart = parseOptionalLifecycleDate(formString(formData, "periodStart"), "Data inicial do período");
  const periodEnd = parseOptionalLifecycleDate(formString(formData, "periodEnd"), "Data final do período");
  assertLifecycleDateRange(periodStart, periodEnd, "data inicial do período", "A data final do período");
  const { quantity, unit } = assertOptionalQuantityAndUnit(formNumber(formData, "quantity", "Quantidade"), formString(formData, "unit"), "A parcela");
  const valueDecimal = formDecimal(formData, "valueDecimal", "o valor da parcela", { positive: true });
  if (!valueDecimal) throw new ContractLifecycleError("Informe o valor da parcela.");
  const status = formString(formData, "status") || "Programada";
  if (!isInstrumentInstallmentStatus(status)) throw new ContractLifecycleError("Situação da parcela inválida.");
  return { number, dueDate, periodStart, periodEnd, quantity, unit, valueDecimal, status };
}

function assertInstallmentDueDateWithinInstrumentValidity(
  data: ReturnType<typeof installmentInput>,
  instrument: AuthorizedInstrument,
) {
  assertDateWithinInstrumentValidity(data.dueDate, instrument.startDate, instrument.endDate, "A data prevista de vencimento");
}

async function assertInstallmentAggregateWithinInstrumentValue(
  tx: Transaction,
  reference: InstrumentReference,
  instrument: AuthorizedInstrument,
  installmentId: string | null,
  data: ReturnType<typeof installmentInput>,
) {
  const [aggregate] = await tx.select({ value: sql<string>`coalesce(sum(${instrumentInstallments.valueDecimal}), 0)::text` }).from(instrumentInstallments).where(and(instrumentParentCondition(instrumentInstallments, reference), installmentId ? ne(instrumentInstallments.id, installmentId) : undefined, eq(instrumentInstallments.status, "Programada")));
  const total = new Decimal(aggregate.value).plus(
    data.status === "Programada" ? data.valueDecimal : 0,
  );
  assertInstrumentAggregateTotalWithinCurrentValue(instrument.currentValue, total, "parcelas programadas");
}

export async function saveInstrumentInstallment(formData: FormData): Promise<InstrumentActionResult> {
  try {
    const reference = referenceFromForm(formData);
    const installmentId = formString(formData, "installmentId") || null;
    const data = installmentInput(formData);
    if (!installmentId && data.status !== "Programada") return { success: false, error: "Uma nova parcela deve iniciar como programada." };
    const key = idempotencyKey(formData, "INSTRUMENT_INSTALLMENT", reference);
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const instrument = await getAuthorizedInstrument(tx, context.user, reference);
      assertInstrumentWritable(instrument);
      if (await isRepeatedAction(tx, key, reference, "INSTRUMENT_INSTALLMENT")) return;

      const parent = instrumentParentFields(reference);
      const [duplicate] = await tx.select({ id: instrumentInstallments.id }).from(instrumentInstallments).where(and(instrumentParentCondition(instrumentInstallments, reference), eq(instrumentInstallments.number, data.number), installmentId ? ne(instrumentInstallments.id, installmentId) : undefined)).limit(1);
      if (duplicate) throw new ContractLifecycleError("Já existe uma parcela com esse número neste instrumento.");
      assertInstallmentDueDateWithinInstrumentValidity(data, instrument);
      await lockInstrumentExecution(tx, instrument);

      if (installmentId) {
        const [existing] = await tx.select().from(instrumentInstallments).where(eq(instrumentInstallments.id, installmentId)).limit(1);
        if (!existing) throw new ContractLifecycleError("Parcela não encontrada.");
        assertChildBelongsToInstrument(reference, existing);
        if (existing.paymentId) throw new ContractLifecycleError("Uma parcela vinculada a pagamento real só pode ser consultada neste módulo.");
        await assertInstallmentAggregateWithinInstrumentValue(tx, reference, instrument, existing.id, data);
        const updated = await tx.update(instrumentInstallments).set(data).where(and(eq(instrumentInstallments.id, existing.id), eq(instrumentInstallments.updatedAt, existing.updatedAt), instrumentParentCondition(instrumentInstallments, reference))).returning({ id: instrumentInstallments.id });
        if (updated.length !== 1) throw new ContractLifecycleError("A parcela foi alterada por outra operação. Atualize e tente novamente.");
        await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_INSTALLMENT_UPDATED", entityType: "INSTRUMENT_INSTALLMENT", entityId: existing.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
        return;
      }

      await assertInstallmentAggregateWithinInstrumentValue(tx, reference, instrument, null, data);
      const [created] = await tx.insert(instrumentInstallments).values({ ...parent, ...data }).returning({ id: instrumentInstallments.id });
      await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_INSTALLMENT_CREATED", entityType: "INSTRUMENT_INSTALLMENT", entityId: created.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
    });

    revalidateInstrumentPaths(reference);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível salvar a parcela programada.");
  }
}

export async function deleteInstrumentInstallment(formData: FormData): Promise<InstrumentActionResult> {
  try {
    const reference = referenceFromForm(formData);
    const installmentId = requiredLifecycleText(formString(formData, "installmentId"), "a parcela", 200);
    const key = idempotencyKey(formData, "INSTRUMENT_INSTALLMENT_DELETE", reference);
    const context = await getTenantContextForModuleOperation("COMPRAS", "update");

    await withDatabaseTransaction(databaseConnection, async (tx) => {
      const instrument = await getAuthorizedInstrument(tx, context.user, reference);
      assertInstrumentWritable(instrument);
      if (await isRepeatedAction(tx, key, reference, "INSTRUMENT_INSTALLMENT")) return;

      const [installment] = await tx.select().from(instrumentInstallments).where(eq(instrumentInstallments.id, installmentId)).limit(1);
      if (!installment) throw new ContractLifecycleError("Parcela não encontrada.");
      assertChildBelongsToInstrument(reference, installment);
      if (installment.paymentId) throw new ContractLifecycleError("Uma parcela vinculada a pagamento real não pode ser excluída neste módulo.");

      const deleted = await tx.delete(instrumentInstallments).where(and(eq(instrumentInstallments.id, installment.id), eq(instrumentInstallments.updatedAt, installment.updatedAt), instrumentParentCondition(instrumentInstallments, reference))).returning({ id: instrumentInstallments.id });
      if (deleted.length !== 1) throw new ContractLifecycleError("A parcela foi alterada por outra operação. Atualize e tente novamente.");
      await recordInstrumentEvent(tx, { eventType: "INSTRUMENT_INSTALLMENT_DELETED", entityType: "INSTRUMENT_INSTALLMENT", entityId: installment.id, reference, actorUsuarioId: context.user.id, idempotencyKey: key });
    });

    revalidateInstrumentPaths(reference);
    return { success: true };
  } catch (error) {
    return actionFailure(error, "Não foi possível excluir a parcela programada.");
  }
}
