import { and, asc, desc, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import type { ItbiDeclarationRecord } from "@/lib/contracts/tax-itbi";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { itbiDeclarations } from "@/db/schema/tax-itbi";
import { processCitizenAccesses } from "@/db/schema/citizen-access";
import { auditItbi, firstItbiRegistryEntry, insertItbiProcessDocument, insertItbiRegistryEntry, itbiRegistryPosition, lockItbiRecord, readActiveItbiUser, readItbiDeclaration, readItbiMunicipalUnit, readItbiProcessDocuments, readItbiProcessGrant, readItbiRegistryEntries, readItbiUsers, readValidItbiDocuments, requireItbiRecord, updateItbiDeclaration } from "@/db/repositories/tax-itbi/records";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { linkItbiPropertyAttachments } from "./itbi-attachments";
import { attributeItbiHistory } from "./itbi-history";
import { requestItbiContestationInTransaction } from "./itbi-contestation";
import { applyItbiDataAdjustment, itbiDataAdjustmentSchema } from "./itbi-data-adjustment";
import { readItbiAdditionalForms } from "./itbi-additional-forms";

export async function requestPortalItbiContestation(connection: DatabaseConnection, usuarioId: string, input: Parameters<typeof requestItbiContestationInTransaction>[2]) {
  return withDatabaseTransaction(connection, async tx => {
    const { scope } = await assertPortalItbiAccess(tx, usuarioId, input.declarationId);
    const attachments = await readItbiRegistryEntries(tx, and(itbiRegistryPosition("ITBI_DECLARATION", input.declarationId, "ITBI_PROCESS_MESSAGE"), sql`${taxRegistryEntries.data}->'kind' = '"ATTACHMENT"'::jsonb`)!);
    const allowed = new Set(attachments.map(row => row.documentId));
    if (input.documentIds.some(id => !allowed.has(id))) throw new Error("Use os anexos comprobatórios enviados para este processo.");
    return requestItbiContestationInTransaction(tx, { usuarioId, employeeId: null, allowedBudgetUnitIds: [scope.budgetUnitId] }, input);
  }, { isolationLevel: "serializable", timeoutMs: 60000 });
}

type Db = DatabaseExecutor;
function origin(value: JsonValue) {
  const scope = taxScopeSnapshot(value);
  if (typeof scope.governmentEntityId !== "string" || typeof scope.budgetUnitId !== "string") throw new Error("Processo sem origem conciliada.");
  return { governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId };
}
async function internalAccess(db: Db, actor: TaxActor, declarationId: string) {
  const declaration = await readItbiDeclaration(db, declarationId);
  const scope = origin(declaration.calculationSnapshot);
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId)) throw new Error("Processo fora da UG autorizada.");
  if (!await readItbiMunicipalUnit(db, scope)) throw new Error("Ente/UG não conciliados.");
  return { declaration, scope };
}

export async function assertInternalItbiProcessAccess(db: Db, actor: TaxActor, declarationId: string) {
  return internalAccess(db, actor, declarationId);
}

export async function readInternalItbiChannel(db: Db, actor: TaxActor, declarationId: string) {
  const { declaration } = await internalAccess(db, actor, declarationId);
  return readChannel(db, declaration, false);
}

export async function readPortalItbiChannel(db: Db, usuarioId: string, declarationId: string) {
  const { declaration } = await assertPortalItbiAccess(db, usuarioId, declarationId);
  return readChannel(db, declaration, true);
}

async function readChannel(db: Db, declaration: ItbiDeclarationRecord, external: boolean) {
  const entries = await readItbiRegistryEntries(db, itbiRegistryPosition("ITBI_DECLARATION", declaration.id, "ITBI_PROCESS_MESSAGE"), [asc(taxRegistryEntries.createdAt), asc(taxRegistryEntries.id)]);
  const users = await readItbiUsers(db, entries.flatMap(row => row.actorUsuarioId ? [row.actorUsuarioId] : []));
  const names = new Map(users.map(row => [row.id, row.nome]));
  const linkedIds = entries.flatMap(row => { const data = taxScopeSnapshot(row.data); return [...(row.documentId ? [row.documentId] : []), ...(Array.isArray(data.documentIds) ? data.documentIds.filter((id): id is string => typeof id === "string") : [])]; });
  const processLinks = external || !declaration.processId ? [] : await readItbiProcessDocuments(db, declaration.processId);
  const documents = await readValidItbiDocuments(db, [...new Set([...linkedIds, ...processLinks.flatMap(row => row.documentId ? [row.documentId] : [])])]);
  const scope = origin(declaration.calculationSnapshot);
  const definitions = await readItbiRegistryEntries(db, and(eq(taxRegistryEntries.entityType, "ITBI_DOCUMENT_MODEL"), eq(taxRegistryEntries.category, "ITBI_DOCUMENT_MODEL"), sql`${taxRegistryEntries.data}->'governmentEntityId' = ${JSON.stringify(scope.governmentEntityId)}::jsonb`, sql`${taxRegistryEntries.data}->'budgetUnitId' = ${JSON.stringify(scope.budgetUnitId)}::jsonb`)!, [desc(taxRegistryEntries.version)]);
  const latestModels = new Map<string, typeof definitions[number]>(); for (const row of definitions) if (!latestModels.has(row.entityId)) latestModels.set(row.entityId, row);
  const models = [...latestModels.values()].filter(row => { const data = taxScopeSnapshot(row.data); return data.active === true && (!external || data.allowPortal === true); }).map(row => ({ id: row.entityId, version: row.version, name: row.title }));
  const issuances = await readItbiRegistryEntries(db, and(eq(taxRegistryEntries.entityType, "ITBI_CONFIGURED_DOCUMENT"), eq(taxRegistryEntries.category, "ITBI_DOCUMENT_ISSUANCE"), sql`${taxRegistryEntries.data}->'declarationId' = ${JSON.stringify(declaration.id)}::jsonb`, external ? sql`${taxRegistryEntries.data}->'allowPortal' = 'true'::jsonb` : undefined)!, [desc(taxRegistryEntries.createdAt)]);
  return {
    declaration: { id: declaration.id, label: `${declaration.declarationNumber} · ${declaration.protocolNumber ?? ""}`, status: declaration.status, updatedAt: declaration.updatedAt.toISOString(), value: declaration.declaredPropertyValue.toFixed(2), base: declaration.taxableBase.toFixed(2), tax: declaration.taxAmount.toFixed(2) },
    messages: entries.map(row => {
      const data = taxScopeSnapshot(row.data);
      const adjustment = itbiDataAdjustmentSchema.safeParse(data.dataAdjustment);
      const proposal = adjustment.success ? `\n\nDados propostos: valor declarado R$ ${adjustment.data.declaredPropertyValue}; fração ${adjustment.data.transmittedFraction}%; cartório ${adjustment.data.registryOffice}.` : "";
      return { id: row.id, kind: String(data.kind), text: (typeof data.text === "string" ? data.text : "") + proposal, createdAt: row.createdAt.toISOString(), actor: names.get(row.actorUsuarioId ?? "") ?? "Operador", requestId: typeof data.requestId === "string" ? data.requestId : null, responseId: typeof data.responseId === "string" ? data.responseId : null, documentIds: Array.isArray(data.documentIds) ? data.documentIds.filter((id): id is string => typeof id === "string") : [], filename: typeof data.filename === "string" ? data.filename : null, documentId: row.documentId };
    }),
    documents,
    additionalForms: await readItbiAdditionalForms(db, declaration.id, scope),
    models,
    issuances: issuances.map(row => ({ id: row.id, title: row.title, createdAt: row.createdAt.toISOString() })),
  };
}

export async function assertPortalItbiAccess(db: Db, usuarioId: string, declarationId: string) {
  if (!await readActiveItbiUser(db, usuarioId)) throw new Error("Conta indisponível.");
  const declaration = await readItbiDeclaration(db, declarationId);
  if (!declaration.processId) throw new Error("ITBI sem processo vinculado.");
  const now = new Date();
  const grant = await readItbiProcessGrant(db, declaration.processId, usuarioId, now);
  if (!grant) throw new Error("Acesso explícito e vigente a este processo ITBI é obrigatório.");
  const scope = origin(declaration.calculationSnapshot);
  if (!await readItbiMunicipalUnit(db, scope)) throw new Error("Origem do processo não conciliada.");
  return { declaration, scope };
}

export async function grantItbiProcessAccess(connection: DatabaseConnection, actor: TaxActor, raw: { declarationId: string; usuarioId: string; reason: string; expiresAt: string | null; revoke: boolean }) {
  const input = z.object({ declarationId: z.string().min(1), usuarioId: z.string().min(1), reason: z.string().trim().min(1).max(4000), expiresAt: z.iso.datetime().nullable(), revoke: z.boolean() }).parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    const { declaration, scope } = await internalAccess(tx, actor, input.declarationId);
    if (!declaration.processId) throw new Error("Declaração sem processo vinculado.");
    await lockItbiRecord(tx, "Process", declaration.processId);
    const declarations = await tx.select().from(itbiDeclarations).where(eq(itbiDeclarations.processId, declaration.processId));
    if (declarations.some(row => { const value = origin(row.calculationSnapshot); return value.governmentEntityId !== scope.governmentEntityId || value.budgetUnitId !== scope.budgetUnitId; })) throw new Error("Processo reúne origens diferentes; concilie os vínculos antes de conceder acesso.");
    if (!await readActiveItbiUser(tx, input.usuarioId)) throw new Error("Selecione uma conta ativa do tabelionato ou interessado.");
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (!input.revoke && expiresAt && expiresAt <= new Date()) throw new Error("O prazo do acesso deve ser futuro.");
    const data = { grantedByUsuarioId: actor.usuarioId, reason: input.reason, grantedAt: new Date(), expiresAt, revokedAt: input.revoke ? new Date() : null };
    const grant = requireItbiRecord((await tx.insert(processCitizenAccesses).values({ processId: declaration.processId, usuarioId: input.usuarioId, ...data }).onConflictDoUpdate({ target: [processCitizenAccesses.processId, processCitizenAccesses.usuarioId], set: data }).returning())[0]);
    await auditItbi(tx, { action: input.revoke ? "REVOKE_ITBI_PROCESS_ACCESS" : "GRANT_ITBI_PROCESS_ACCESS", entityType: "ProcessCitizenAccess", entityId: grant.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...scope, declarationId: declaration.id, processId: declaration.processId, usuarioId: input.usuarioId, reason: input.reason, expiresAt: input.expiresAt } });
    return grant;
  }, { isolationLevel: "serializable" });
}

const messageSchema = z.object({ declarationId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), kind: z.enum(["MESSAGE", "REQUEST_ADJUSTMENT", "EXTERNAL_RESPONSE", "ACCEPT_ADJUSTMENT"]), text: z.string().trim().min(1).max(8000), requestId: z.string().nullable(), responseId: z.string().nullable(), documentIds: z.array(z.string().min(1)).max(50), dataAdjustment: itbiDataAdjustmentSchema.nullable().optional() });

export async function assertNoPendingItbiAdjustments(tx: DatabaseExecutor, declarationId: string) {
  const entries = await readItbiRegistryEntries(tx, itbiRegistryPosition("ITBI_DECLARATION", declarationId, "ITBI_PROCESS_MESSAGE"));
  const accepted = new Set(entries.filter(entry => taxScopeSnapshot(entry.data).kind === "ACCEPT_ADJUSTMENT").map(entry => taxScopeSnapshot(entry.data).requestId));
  if (entries.some(entry => taxScopeSnapshot(entry.data).kind === "REQUEST_ADJUSTMENT" && !accepted.has(entry.id))) throw new Error("Readequação pendente: confira e aceite a resposta externa antes de aprovar o ITBI.");
}

export async function sendInternalItbiMessage(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof messageSchema>) {
  const input = messageSchema.parse(raw);
  if (input.kind === "EXTERNAL_RESPONSE") throw new Error("Resposta externa deve ser enviada pelo interessado autenticado.");
  return withDatabaseTransaction(connection, async tx => {
    await lockItbiRecord(tx, "ItbiDeclaration", input.declarationId);
    const { declaration, scope } = await internalAccess(tx, actor, input.declarationId);
    return appendMessage(tx, actor, input, declaration, scope, false);
  }, { isolationLevel: "serializable" });
}

export async function sendPortalItbiMessage(connection: DatabaseConnection, usuarioId: string, raw: z.input<typeof messageSchema>) {
  const input = messageSchema.parse(raw);
  if (!["MESSAGE", "EXTERNAL_RESPONSE"].includes(input.kind)) throw new Error("Operação reservada à fiscalização.");
  return withDatabaseTransaction(connection, async tx => {
    await lockItbiRecord(tx, "ItbiDeclaration", input.declarationId);
    const { declaration, scope } = await assertPortalItbiAccess(tx, usuarioId, input.declarationId);
    return appendMessage(tx, { usuarioId, employeeId: null, allowedBudgetUnitIds: [scope.budgetUnitId] }, input, declaration, scope, true);
  }, { isolationLevel: "serializable" });
}

async function appendMessage(tx: DatabaseTransaction, actor: TaxActor, input: z.infer<typeof messageSchema>, declaration: { id: string; processId: string | null; updatedAt: Date; status: string; assessmentId: string | null }, scope: { governmentEntityId: string; budgetUnitId: string }, external: boolean) {
  await attributeItbiHistory(tx, actor);
  if (declaration.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("Processo alterado. Recarregue antes de enviar.");
  if (["CANCELADA", "RETIFICADA", "INDEFERIDA"].includes(declaration.status)) throw new Error("Processo encerrado para novas mensagens.");
  if (input.kind === "REQUEST_ADJUSTMENT" && declaration.assessmentId) throw new Error("Solicite a readequação antes da constituição do crédito.");
  if (input.dataAdjustment && (!external || input.kind !== "EXTERNAL_RESPONSE" || declaration.assessmentId || !["RASCUNHO", "PROTOCOLADA", "EM_ANALISE"].includes(declaration.status))) throw new Error("Proposta de alteração deve integrar a resposta externa antes da constituição do crédito.");
  if (["EXTERNAL_RESPONSE", "ACCEPT_ADJUSTMENT"].includes(input.kind)) {
    const request = await firstItbiRegistryEntry(tx, and(eq(taxRegistryEntries.id, input.requestId ?? ""), itbiRegistryPosition("ITBI_DECLARATION", declaration.id, "ITBI_PROCESS_MESSAGE"))!);
    if (!request || taxScopeSnapshot(request.data).kind !== "REQUEST_ADJUSTMENT") throw new Error("Exigência de readequação não encontrada neste processo.");
    if (await firstItbiRegistryEntry(tx, and(itbiRegistryPosition("ITBI_DECLARATION", declaration.id, "ITBI_PROCESS_MESSAGE"), sql`${taxRegistryEntries.data}->'kind' = '"ACCEPT_ADJUSTMENT"'::jsonb`, sql`${taxRegistryEntries.data}->'requestId' = ${JSON.stringify(request.id)}::jsonb`)!)) throw new Error("A readequação já foi aceita.");
    if (input.kind === "ACCEPT_ADJUSTMENT") {
      const responses = await readItbiRegistryEntries(tx, and(itbiRegistryPosition("ITBI_DECLARATION", declaration.id, "ITBI_PROCESS_MESSAGE"), sql`${taxRegistryEntries.data}->'kind' = '"EXTERNAL_RESPONSE"'::jsonb`, sql`${taxRegistryEntries.data}->'requestId' = ${JSON.stringify(request.id)}::jsonb`)!, [desc(taxRegistryEntries.createdAt), desc(taxRegistryEntries.id)]);
      if (!responses.length || responses[0].id !== input.responseId) throw new Error("Confira a resposta externa mais recente para aceitar a readequação.");
      const adjustment = taxScopeSnapshot(responses[0].data).dataAdjustment;
      if (adjustment) await applyItbiDataAdjustment(tx, actor, declaration.id, responses[0].id, adjustment);
    }
  } else if (input.requestId || input.responseId) throw new Error("Vínculo de resposta incompatível com a mensagem.");
  if (external && input.documentIds.length) {
    const uploads = await readItbiRegistryEntries(tx, and(itbiRegistryPosition("ITBI_DECLARATION", declaration.id, "ITBI_PROCESS_MESSAGE"), sql`${taxRegistryEntries.data}->'kind' = '"ATTACHMENT"'::jsonb`)!);
    const available = new Set(uploads.map(row => taxScopeSnapshot(row.data).documentId));
    if (input.documentIds.some(id => !available.has(id))) throw new Error("Use os anexos enviados para este processo.");
  }
  if (!external && input.documentIds.length) {
    const links = declaration.processId ? await readItbiProcessDocuments(tx, declaration.processId, input.documentIds) : [];
    const entries = await readItbiRegistryEntries(tx, itbiRegistryPosition("ITBI_DECLARATION", declaration.id, "ITBI_PROCESS_MESSAGE"));
    const available = new Set([...links.flatMap(row => row.documentId ? [row.documentId] : []), ...entries.flatMap(row => {
      const data = taxScopeSnapshot(row.data);
      return [...(row.documentId ? [row.documentId] : []), ...(Array.isArray(data.documentIds) ? data.documentIds.filter((id): id is string => typeof id === "string") : [])];
    })]);
    if (input.documentIds.some(id => !available.has(id))) throw new Error("Use documentos vinculados a este processo ITBI.");
  }
  await linkItbiPropertyAttachments(tx, actor, declaration.id, input.documentIds);
  if (declaration.processId) for (const documentId of new Set(input.documentIds)) {
    if (!(await readItbiProcessDocuments(tx, declaration.processId, [documentId])).length) await insertItbiProcessDocument(tx, { processId: declaration.processId, documentId, purpose: "Comunicação do processo ITBI", employeeId: actor.employeeId });
  }
  const entry = await insertItbiRegistryEntry(tx, { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE", title: input.kind, processId: declaration.processId, actorUsuarioId: actor.usuarioId, data: { ...scope, kind: input.kind, text: input.text, external, requestId: input.requestId, responseId: input.responseId, documentIds: input.documentIds, dataAdjustment: input.dataAdjustment ?? null } });
  await updateItbiDeclaration(tx, declaration.id, {}, { eventType: input.kind, description: input.text, actorUsuarioId: actor.usuarioId, payload: { messageId: entry.id, documentIds: input.documentIds } });
  await auditItbi(tx, { action: "SEND_ITBI_PROCESS_MESSAGE", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...scope, kind: input.kind, external, declarationId: declaration.id } });
  return entry;
}
