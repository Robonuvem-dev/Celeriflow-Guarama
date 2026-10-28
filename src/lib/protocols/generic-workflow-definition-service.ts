import "server-only";

import { and, asc, desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { instanceParameters } from "@/db/schema/instance-configuration";
import { departments } from "@/db/schema/administration";
import { documentClasses } from "@/db/schema/document-workflow";
import { processTypes, genericWorkflowDefinitions, genericWorkflowStages } from "@/db/schema/processes";
import { assertGenericWorkflowDefinitionCanPublish } from "./generic-workflow-policy";

type Db = DatabaseExecutor;

export const defaultGenericWorkflowTimeZone = "America/Sao_Paulo";

export async function getGenericWorkflowInstanceTimeZone(db: Db) {
  const [parameter] = await db.select({ valor: instanceParameters.valor }).from(instanceParameters).where(eq(instanceParameters.chave, "WORKFLOW_INSTANCE_TIME_ZONE")).orderBy(asc(instanceParameters.createdAt)).limit(1);
  const timeZone = typeof parameter?.valor === "string" ? parameter.valor : defaultGenericWorkflowTimeZone;
  try {
    new Intl.DateTimeFormat("en-US", { timeZone }).format();
  } catch {
    throw new Error("O fuso horario da instancia configurado para o fluxo e invalido.");
  }
  return timeZone;
}

export async function createGenericWorkflowDefinition(db: Db, processTypeId: string) {
  const [processType] = await db.select({ id: processTypes.id, genericWorkflowEnabled: processTypes.genericWorkflowEnabled }).from(processTypes).where(eq(processTypes.id, processTypeId)).limit(1);
  if (!processType?.genericWorkflowEnabled) throw new Error("Ative o fluxo generico apenas para um novo tipo de processo.");
  const [latest] = await db.select({ version: genericWorkflowDefinitions.version }).from(genericWorkflowDefinitions).where(eq(genericWorkflowDefinitions.processTypeId, processTypeId)).orderBy(desc(genericWorkflowDefinitions.version)).limit(1);
  const [created] = await db.insert(genericWorkflowDefinitions).values({ processTypeId, version: (latest?.version ?? 0) + 1 }).returning({ id: genericWorkflowDefinitions.id, version: genericWorkflowDefinitions.version });
  return created;
}

export async function addGenericWorkflowStage(db: Db, input: {
  definitionId: string;
  position: number;
  label: string;
  departmentId: string;
  slaCalendarDays: number;
  requiresSignedDocument: boolean;
  requiredDocumentClassId: string | null;
}) {
  if (!Number.isInteger(input.position) || input.position < 1 || !Number.isInteger(input.slaCalendarDays) || input.slaCalendarDays < 1) {
    throw new Error("Informe posicao e SLA em dias corridos validos.");
  }
  if (!input.label.trim()) throw new Error("Informe o nome da etapa.");
  if (input.requiresSignedDocument && !input.requiredDocumentClassId) throw new Error("Selecione a classe do documento obrigatorio.");
  const [definition, department, documentClass] = await Promise.all([
    db.select({ status: genericWorkflowDefinitions.status }).from(genericWorkflowDefinitions).where(eq(genericWorkflowDefinitions.id, input.definitionId)).limit(1).then(rows => rows[0]),
    db.select({ id: departments.id }).from(departments).where(and(eq(departments.id, input.departmentId), eq(departments.isActive, true))).limit(1).then(rows => rows[0]),
    input.requiredDocumentClassId ? db.select({ id: documentClasses.id }).from(documentClasses).where(and(eq(documentClasses.id, input.requiredDocumentClassId), eq(documentClasses.isActive, true))).limit(1).then(rows => rows[0]) : null,
  ]);
  if (definition?.status !== "DRAFT") throw new Error("Somente rascunhos podem receber etapas.");
  if (!department) throw new Error("O setor da etapa precisa estar ativo.");
  if (input.requiredDocumentClassId && !documentClass) throw new Error("A classe documental obrigatoria precisa estar ativa.");
  const [created] = await db.insert(genericWorkflowStages).values(input).returning();
  return created;
}

export async function publishGenericWorkflowDefinition(db: Db, definitionId: string, actorUsuarioId: string) {
  const [definition] = await db.select({ status: genericWorkflowDefinitions.status }).from(genericWorkflowDefinitions).where(eq(genericWorkflowDefinitions.id, definitionId)).limit(1);
  if (!definition) throw new Error("Versao de fluxo nao encontrada.");
  const stages = await db.select({ position: genericWorkflowStages.position, slaCalendarDays: genericWorkflowStages.slaCalendarDays, requiresSignedDocument: genericWorkflowStages.requiresSignedDocument, requiredDocumentClassId: genericWorkflowStages.requiredDocumentClassId }).from(genericWorkflowStages).where(eq(genericWorkflowStages.definitionId, definitionId));
  assertGenericWorkflowDefinitionCanPublish(definition.status, stages);
  const [published] = await db.update(genericWorkflowDefinitions).set({ status: "PUBLISHED", publishedAt: new Date(), publishedByUsuarioId: actorUsuarioId }).where(eq(genericWorkflowDefinitions.id, definitionId)).returning({ id: genericWorkflowDefinitions.id, version: genericWorkflowDefinitions.version });
  return published;
}
