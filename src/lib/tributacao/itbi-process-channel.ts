import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { linkItbiPropertyAttachments } from "./itbi-attachments";
import { attributeItbiHistory } from "./itbi-history";
import { requestItbiContestationInTransaction } from "./itbi-contestation";
import { applyItbiDataAdjustment, itbiDataAdjustmentSchema } from "./itbi-data-adjustment";
import { readItbiAdditionalForms } from "./itbi-additional-forms";

export async function requestPortalItbiContestation(db: PrismaClient, usuarioId: string, input: Parameters<typeof requestItbiContestationInTransaction>[2]) {
  return db.$transaction(async tx => {
    const { scope } = await assertPortalItbiAccess(tx, usuarioId, input.declarationId);
    const attachments = await tx.taxRegistryEntry.findMany({ where: { entityType: "ITBI_DECLARATION", entityId: input.declarationId, category: "ITBI_PROCESS_MESSAGE", data: { path: ["kind"], equals: "ATTACHMENT" } }, select: { documentId: true } });
    const allowed = new Set(attachments.map(row => row.documentId));
    if (input.documentIds.some(id => !allowed.has(id))) throw new Error("Use os anexos comprobatórios enviados para este processo.");
    return requestItbiContestationInTransaction(tx, { usuarioId, employeeId: null, allowedBudgetUnitIds: [scope.budgetUnitId] }, input);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}

type Db = PrismaClient | Prisma.TransactionClient;
function origin(value: Prisma.JsonValue) {
  const scope = taxScopeSnapshot(value);
  if (typeof scope.governmentEntityId !== "string" || typeof scope.budgetUnitId !== "string") throw new Error("Processo sem origem conciliada.");
  return { governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId };
}
async function internalAccess(db: Db, actor: TaxActor, declarationId: string) {
  const declaration = await db.itbiDeclaration.findUniqueOrThrow({ where: { id: declarationId } });
  const scope = origin(declaration.calculationSnapshot);
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId)) throw new Error("Processo fora da UG autorizada.");
  if (!await db.planningEntityUnit.findFirst({ where: scope })) throw new Error("Ente/UG não conciliados.");
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

async function readChannel(db: Db, declaration: { id: string; processId: string | null; declarationNumber: string; protocolNumber: string | null; updatedAt: Date; status: string; declaredPropertyValue: Prisma.Decimal; taxableBase: Prisma.Decimal; taxAmount: Prisma.Decimal; calculationSnapshot: Prisma.JsonValue }, external: boolean) {
  const entries = await db.taxRegistryEntry.findMany({ where: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE" }, orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  const users = await db.usuario.findMany({ where: { id: { in: entries.flatMap(row => row.actorUsuarioId ? [row.actorUsuarioId] : []) } }, select: { id: true, nome: true } });
  const names = new Map(users.map(row => [row.id, row.nome]));
  const linkedIds = entries.flatMap(row => { const data = taxScopeSnapshot(row.data); return [...(row.documentId ? [row.documentId] : []), ...(Array.isArray(data.documentIds) ? data.documentIds.filter((id): id is string => typeof id === "string") : [])]; });
  const processLinks = external || !declaration.processId ? [] : await db.processDocument.findMany({ where: { processId: declaration.processId, documentId: { not: null } }, select: { documentId: true } });
  const documents = await db.document.findMany({ where: { status: "Válido", id: { in: [...new Set([...linkedIds, ...processLinks.flatMap(row => row.documentId ? [row.documentId] : [])])] } }, select: { id: true, title: true }, orderBy: { title: "asc" } });
  const scope = origin(declaration.calculationSnapshot);
  const definitions = await db.taxRegistryEntry.findMany({ where: { entityType: "ITBI_DOCUMENT_MODEL", category: "ITBI_DOCUMENT_MODEL", AND: [{ data: { path: ["governmentEntityId"], equals: scope.governmentEntityId } }, { data: { path: ["budgetUnitId"], equals: scope.budgetUnitId } }] }, orderBy: { version: "desc" } });
  const latestModels = new Map<string, typeof definitions[number]>(); for (const row of definitions) if (!latestModels.has(row.entityId)) latestModels.set(row.entityId, row);
  const models = [...latestModels.values()].filter(row => { const data = taxScopeSnapshot(row.data); return data.active === true && (!external || data.allowPortal === true); }).map(row => ({ id: row.entityId, version: row.version, name: row.title }));
  const issuances = await db.taxRegistryEntry.findMany({ where: { entityType: "ITBI_CONFIGURED_DOCUMENT", category: "ITBI_DOCUMENT_ISSUANCE", AND: [{ data: { path: ["declarationId"], equals: declaration.id } }, ...(external ? [{ data: { path: ["allowPortal"], equals: true } }] : [])] }, select: { id: true, title: true, createdAt: true }, orderBy: { createdAt: "desc" } });
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
    issuances: issuances.map(row => ({ ...row, createdAt: row.createdAt.toISOString() })),
  };
}

export async function assertPortalItbiAccess(db: Db, usuarioId: string, declarationId: string) {
  if (!await db.usuario.findFirst({ where: { id: usuarioId, ativo: true, perfil: { ativo: true } } })) throw new Error("Conta indisponível.");
  const declaration = await db.itbiDeclaration.findUniqueOrThrow({ where: { id: declarationId } });
  if (!declaration.processId) throw new Error("ITBI sem processo vinculado.");
  const now = new Date();
  const grant = await db.processCitizenAccess.findFirst({ where: { processId: declaration.processId, usuarioId, revokedAt: null, grantedAt: { lte: now }, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] } });
  if (!grant) throw new Error("Acesso explícito e vigente a este processo ITBI é obrigatório.");
  const scope = origin(declaration.calculationSnapshot);
  if (!await db.planningEntityUnit.findFirst({ where: scope })) throw new Error("Origem do processo não conciliada.");
  return { declaration, scope };
}

export async function grantItbiProcessAccess(db: PrismaClient, actor: TaxActor, raw: { declarationId: string; usuarioId: string; reason: string; expiresAt: string | null; revoke: boolean }) {
  const input = z.object({ declarationId: z.string().min(1), usuarioId: z.string().min(1), reason: z.string().trim().min(1).max(4000), expiresAt: z.iso.datetime().nullable(), revoke: z.boolean() }).parse(raw);
  return db.$transaction(async tx => {
    const { declaration, scope } = await internalAccess(tx, actor, input.declarationId);
    if (!declaration.processId) throw new Error("Declaração sem processo vinculado.");
    await tx.$queryRaw`SELECT id FROM "Process" WHERE id=${declaration.processId} FOR UPDATE`;
    const declarations = await tx.itbiDeclaration.findMany({ where: { processId: declaration.processId } });
    if (declarations.some(row => { const value = origin(row.calculationSnapshot); return value.governmentEntityId !== scope.governmentEntityId || value.budgetUnitId !== scope.budgetUnitId; })) throw new Error("Processo reúne origens diferentes; concilie os vínculos antes de conceder acesso.");
    if (!await tx.usuario.findFirst({ where: { id: input.usuarioId, ativo: true, perfil: { ativo: true } } })) throw new Error("Selecione uma conta ativa do tabelionato ou interessado.");
    const expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (!input.revoke && expiresAt && expiresAt <= new Date()) throw new Error("O prazo do acesso deve ser futuro.");
    const data = { grantedByUsuarioId: actor.usuarioId, reason: input.reason, grantedAt: new Date(), expiresAt, revokedAt: input.revoke ? new Date() : null };
    const grant = await tx.processCitizenAccess.upsert({ where: { processId_usuarioId: { processId: declaration.processId, usuarioId: input.usuarioId } }, create: { processId: declaration.processId, usuarioId: input.usuarioId, ...data }, update: data });
    await tx.taxAuditLog.create({ data: { action: input.revoke ? "REVOKE_ITBI_PROCESS_ACCESS" : "GRANT_ITBI_PROCESS_ACCESS", entityType: "ProcessCitizenAccess", entityId: grant.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...scope, declarationId: declaration.id, processId: declaration.processId, usuarioId: input.usuarioId, reason: input.reason, expiresAt: input.expiresAt } } });
    return grant;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

const messageSchema = z.object({ declarationId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), kind: z.enum(["MESSAGE", "REQUEST_ADJUSTMENT", "EXTERNAL_RESPONSE", "ACCEPT_ADJUSTMENT"]), text: z.string().trim().min(1).max(8000), requestId: z.string().nullable(), responseId: z.string().nullable(), documentIds: z.array(z.string().min(1)).max(50), dataAdjustment: itbiDataAdjustmentSchema.nullable().optional() });

export async function assertNoPendingItbiAdjustments(tx: Prisma.TransactionClient, declarationId: string) {
  const entries = await tx.taxRegistryEntry.findMany({ where: { entityType: "ITBI_DECLARATION", entityId: declarationId, category: "ITBI_PROCESS_MESSAGE" }, select: { id: true, data: true } });
  const accepted = new Set(entries.filter(entry => taxScopeSnapshot(entry.data).kind === "ACCEPT_ADJUSTMENT").map(entry => taxScopeSnapshot(entry.data).requestId));
  if (entries.some(entry => taxScopeSnapshot(entry.data).kind === "REQUEST_ADJUSTMENT" && !accepted.has(entry.id))) throw new Error("Readequação pendente: confira e aceite a resposta externa antes de aprovar o ITBI.");
}

export async function sendInternalItbiMessage(db: PrismaClient, actor: TaxActor, raw: z.input<typeof messageSchema>) {
  const input = messageSchema.parse(raw);
  if (input.kind === "EXTERNAL_RESPONSE") throw new Error("Resposta externa deve ser enviada pelo interessado autenticado.");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${input.declarationId} FOR UPDATE`;
    const { declaration, scope } = await internalAccess(tx, actor, input.declarationId);
    return appendMessage(tx, actor, input, declaration, scope, false);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function sendPortalItbiMessage(db: PrismaClient, usuarioId: string, raw: z.input<typeof messageSchema>) {
  const input = messageSchema.parse(raw);
  if (!["MESSAGE", "EXTERNAL_RESPONSE"].includes(input.kind)) throw new Error("Operação reservada à fiscalização.");
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${input.declarationId} FOR UPDATE`;
    const { declaration, scope } = await assertPortalItbiAccess(tx, usuarioId, input.declarationId);
    return appendMessage(tx, { usuarioId, employeeId: null, allowedBudgetUnitIds: [scope.budgetUnitId] }, input, declaration, scope, true);
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

async function appendMessage(tx: Prisma.TransactionClient, actor: TaxActor, input: z.infer<typeof messageSchema>, declaration: { id: string; processId: string | null; updatedAt: Date; status: string; assessmentId: string | null }, scope: { governmentEntityId: string; budgetUnitId: string }, external: boolean) {
  await attributeItbiHistory(tx, actor);
  if (declaration.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("Processo alterado. Recarregue antes de enviar.");
  if (["CANCELADA", "RETIFICADA", "INDEFERIDA"].includes(declaration.status)) throw new Error("Processo encerrado para novas mensagens.");
  if (input.kind === "REQUEST_ADJUSTMENT" && declaration.assessmentId) throw new Error("Solicite a readequação antes da constituição do crédito.");
  if (input.dataAdjustment && (!external || input.kind !== "EXTERNAL_RESPONSE" || declaration.assessmentId || !["RASCUNHO", "PROTOCOLADA", "EM_ANALISE"].includes(declaration.status))) throw new Error("Proposta de alteração deve integrar a resposta externa antes da constituição do crédito.");
  if (["EXTERNAL_RESPONSE", "ACCEPT_ADJUSTMENT"].includes(input.kind)) {
    const request = await tx.taxRegistryEntry.findFirst({ where: { id: input.requestId ?? "", entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE" } });
    if (!request || taxScopeSnapshot(request.data).kind !== "REQUEST_ADJUSTMENT") throw new Error("Exigência de readequação não encontrada neste processo.");
    if (await tx.taxRegistryEntry.count({ where: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE", AND: [{ data: { path: ["kind"], equals: "ACCEPT_ADJUSTMENT" } }, { data: { path: ["requestId"], equals: request.id } }] } })) throw new Error("A readequação já foi aceita.");
    if (input.kind === "ACCEPT_ADJUSTMENT") {
      const responses = await tx.taxRegistryEntry.findMany({ where: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE", AND: [{ data: { path: ["kind"], equals: "EXTERNAL_RESPONSE" } }, { data: { path: ["requestId"], equals: request.id } }] }, orderBy: [{ createdAt: "desc" }, { id: "desc" }] });
      if (!responses.length || responses[0].id !== input.responseId) throw new Error("Confira a resposta externa mais recente para aceitar a readequação.");
      const adjustment = taxScopeSnapshot(responses[0].data).dataAdjustment;
      if (adjustment) await applyItbiDataAdjustment(tx, actor, declaration.id, responses[0].id, adjustment);
    }
  } else if (input.requestId || input.responseId) throw new Error("Vínculo de resposta incompatível com a mensagem.");
  if (external && input.documentIds.length) {
    const uploads = await tx.taxRegistryEntry.findMany({ where: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE", data: { path: ["kind"], equals: "ATTACHMENT" } } });
    const available = new Set(uploads.map(row => taxScopeSnapshot(row.data).documentId));
    if (input.documentIds.some(id => !available.has(id))) throw new Error("Use os anexos enviados para este processo.");
  }
  if (!external && input.documentIds.length) {
    const links = declaration.processId ? await tx.processDocument.findMany({ where: { processId: declaration.processId, documentId: { in: input.documentIds } }, select: { documentId: true } }) : [];
    const entries = await tx.taxRegistryEntry.findMany({ where: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE" }, select: { documentId: true, data: true } });
    const available = new Set([...links.flatMap(row => row.documentId ? [row.documentId] : []), ...entries.flatMap(row => {
      const data = taxScopeSnapshot(row.data);
      return [...(row.documentId ? [row.documentId] : []), ...(Array.isArray(data.documentIds) ? data.documentIds.filter((id): id is string => typeof id === "string") : [])];
    })]);
    if (input.documentIds.some(id => !available.has(id))) throw new Error("Use documentos vinculados a este processo ITBI.");
  }
  await linkItbiPropertyAttachments(tx, actor, declaration.id, input.documentIds);
  if (declaration.processId) for (const documentId of new Set(input.documentIds)) {
    if (!await tx.processDocument.findFirst({ where: { processId: declaration.processId, documentId } })) await tx.processDocument.create({ data: { processId: declaration.processId, documentId, purpose: "Comunicação do processo ITBI", employeeId: actor.employeeId } });
  }
  const entry = await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE", title: input.kind, processId: declaration.processId, actorUsuarioId: actor.usuarioId, data: { ...scope, kind: input.kind, text: input.text, external, requestId: input.requestId, responseId: input.responseId, documentIds: input.documentIds, dataAdjustment: input.dataAdjustment ?? null } } });
  await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: { events: { create: { eventType: input.kind, description: input.text, actorUsuarioId: actor.usuarioId, payload: { messageId: entry.id, documentIds: input.documentIds } } } } });
  await tx.taxAuditLog.create({ data: { action: "SEND_ITBI_PROCESS_MESSAGE", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { ...scope, kind: input.kind, external, declarationId: declaration.id } } });
  return entry;
}
