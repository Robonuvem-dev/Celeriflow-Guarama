"use server";

import { revalidatePath } from "next/cache";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { addGenericWorkflowStage, createGenericWorkflowDefinition, publishGenericWorkflowDefinition } from "@/lib/protocols/generic-workflow-definition-service";
import { and, count, eq } from "drizzle-orm";
import { db, databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import { processTypes, processSubjects, processes, processWorkflowStages, genericWorkflowDefinitions, genericWorkflowStages } from "@/db/schema/processes";

async function requireConfigurationAccess() {
  return getTenantContextForSystemAdministration();
}

function optionalId(formData: FormData, name: string) {
  return String(formData.get(name) || "") || null;
}

export async function saveProcessType(formData: FormData): Promise<void> {
  const id = optionalId(formData, "id");
  await requireConfigurationAccess();
  const name = String(formData.get("name") || "").trim();
  if (!name) throw new Error("Informe o nome do Tipo de Processo.");

  const genericWorkflowEnabled = formData.get("genericWorkflowEnabled") === "on";
  const data = {
    name,
    description: String(formData.get("description") || "").trim() || null,
    initialDepartmentId: optionalId(formData, "initialDepartmentId"),
    defaultSlaDays: Number(formData.get("defaultSlaDays") || "") || null,
    defaultPriority: optionalId(formData, "defaultPriority"),
    requiresInterested: formData.get("requiresInterested") === "on",
    allowsInternalOpening: formData.get("allowsInternalOpening") === "on",
    genericWorkflowEnabled,
    isActive: formData.get("isActive") === "on",
  };

  if (id) {
    const [existing] = await db.select({ genericWorkflowEnabled: processTypes.genericWorkflowEnabled }).from(processTypes).where(eq(processTypes.id, id)).limit(1);
    if (!existing) throw new Error("Tipo de Processo nao encontrado.");
    const [{ total }] = await db.select({ total: count() }).from(processes).where(eq(processes.processTypeId, id));
    if (genericWorkflowEnabled && !existing.genericWorkflowEnabled && total > 0) {
      throw new Error("O fluxo generico so pode ser ativado em novos tipos, sem processos existentes.");
    }
    await db.update(processTypes).set(data).where(eq(processTypes.id, id));
  }
  else await db.insert(processTypes).values(data);
  revalidatePath("/configuracoes/processos");
}

export async function saveSubject(formData: FormData): Promise<void> {
  const id = optionalId(formData, "id");
  await requireConfigurationAccess();
  const name = String(formData.get("name") || "").trim();
  const processTypeId = String(formData.get("processTypeId") || "");
  if (!name || !processTypeId) throw new Error("Informe o Assunto e o Tipo de Processo.");

  const existing = id ? (await db.select().from(processSubjects).where(eq(processSubjects.id, id)).limit(1))[0] : null;
  if (id && !existing) throw new Error("Assunto nao encontrado.");
  const data = {
    name,
    description: String(formData.get("description") || "").trim() || null,
    processTypeId,
    initialDepartmentId: formData.has("initialDepartmentId") ? optionalId(formData, "initialDepartmentId") : existing?.initialDepartmentId ?? null,
    slaDays: formData.has("slaDays") ? Number(formData.get("slaDays") || "") || null : existing?.slaDays ?? null,
    defaultPriority: formData.has("defaultPriority") ? optionalId(formData, "defaultPriority") : existing?.defaultPriority ?? null,
    requiresInterested: formData.has("requiresInterested") ? formData.get("requiresInterested") === "on" : existing?.requiresInterested ?? false,
    allowsInternalOpening: formData.has("allowsInternalOpening") ? formData.get("allowsInternalOpening") === "on" : existing?.allowsInternalOpening ?? true,
    isActive: formData.has("isActive") ? formData.get("isActive") === "on" : existing?.isActive ?? true,
  };

  if (id) await db.update(processSubjects).set(data).where(eq(processSubjects.id, id));
  else await db.insert(processSubjects).values(data);
  revalidatePath("/configuracoes/processos");
}

export async function saveProcessWorkflowStage(formData: FormData): Promise<void> {
  const id = optionalId(formData, "id");
  await requireConfigurationAccess();
  const processTypeId = String(formData.get("processTypeId") || "");
  const subjectId = optionalId(formData, "subjectId");
  const departmentId = String(formData.get("departmentId") || "");
  const position = Number(formData.get("position") || "");
  const slaDays = Number(formData.get("slaDays") || "") || null;
  if (!processTypeId || !departmentId || !Number.isInteger(position) || position < 1) {
    throw new Error("Informe tipo, setor e uma ordem de etapa valida.");
  }
  if (subjectId) {
    const [subject] = await db.select({ id: processSubjects.id }).from(processSubjects).where(and(eq(processSubjects.id, subjectId), eq(processSubjects.processTypeId, processTypeId))).limit(1);
    if (!subject) throw new Error("O Assunto selecionado nao pertence ao Tipo de Processo.");
  }
  const data = {
    processTypeId,
    subjectId,
    departmentId,
    position,
    slaDays,
    label: String(formData.get("label") || "").trim() || null,
    isActive: formData.get("isActive") === "on",
  };
  if (id) {
    const [stage] = await db.update(processWorkflowStages).set(data).where(eq(processWorkflowStages.id, id)).returning({ id: processWorkflowStages.id });
    if (!stage) throw new Error("Etapa nao encontrada.");
  } else await db.insert(processWorkflowStages).values(data);
  revalidatePath("/configuracoes/processos");
}

export async function deleteProcessWorkflowStage(formData: FormData): Promise<void> {
  await requireConfigurationAccess();
  const id = String(formData.get("id") || "");
  if (!id) throw new Error("Etapa nao informada.");
  const [stage] = await db.delete(processWorkflowStages).where(eq(processWorkflowStages.id, id)).returning({ id: processWorkflowStages.id });
  if (!stage) throw new Error("Etapa nao encontrada.");
  revalidatePath("/configuracoes/processos");
}

export async function createGenericWorkflowDefinitionAction(formData: FormData): Promise<void> {
  await requireConfigurationAccess();
  const processTypeId = String(formData.get("processTypeId") || "");
  if (!processTypeId) throw new Error("Selecione um Tipo de Processo opt-in.");
  await withDatabaseTransaction(databaseConnection, (tx) => createGenericWorkflowDefinition(tx, processTypeId), { timeoutMs: 5_000 });
  revalidatePath("/configuracoes/processos");
}

export async function addGenericWorkflowStageAction(formData: FormData): Promise<void> {
  await requireConfigurationAccess();
  const definitionId = String(formData.get("definitionId") || "");
  const position = Number(formData.get("position") || "");
  const slaCalendarDays = Number(formData.get("slaCalendarDays") || "");
  await withDatabaseTransaction(databaseConnection, (tx) => addGenericWorkflowStage(tx, {
    definitionId,
    position,
    label: String(formData.get("label") || "").trim(),
    departmentId: String(formData.get("departmentId") || ""),
    slaCalendarDays,
    requiresSignedDocument: formData.get("requiresSignedDocument") === "on",
    requiredDocumentClassId: optionalId(formData, "requiredDocumentClassId"),
  }), { timeoutMs: 5_000 });
  revalidatePath("/configuracoes/processos");
}

export async function deleteGenericWorkflowStageAction(formData: FormData): Promise<void> {
  await requireConfigurationAccess();
  const id = String(formData.get("id") || "");
  const [stage] = await db.select({ status: genericWorkflowDefinitions.status }).from(genericWorkflowStages).innerJoin(genericWorkflowDefinitions, eq(genericWorkflowDefinitions.id, genericWorkflowStages.definitionId)).where(eq(genericWorkflowStages.id, id)).limit(1);
  if (!stage || stage.status !== "DRAFT") throw new Error("Somente etapas de rascunho podem ser excluidas.");
  await db.delete(genericWorkflowStages).where(eq(genericWorkflowStages.id, id));
  revalidatePath("/configuracoes/processos");
}

export async function publishGenericWorkflowDefinitionAction(formData: FormData): Promise<void> {
  await requireConfigurationAccess();
  const definitionId = String(formData.get("definitionId") || "");
  const context = await getTenantContextForSystemAdministration();
  await withDatabaseTransaction(databaseConnection, (tx) => publishGenericWorkflowDefinition(tx, definitionId, context.user.id), { timeoutMs: 5_000 });
  revalidatePath("/configuracoes/processos");
}
