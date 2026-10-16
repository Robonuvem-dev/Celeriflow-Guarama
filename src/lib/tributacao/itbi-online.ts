import { createHash } from "node:crypto";
import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { openExternalServiceProcess } from "@/lib/portal-cidadao/external-opening";
import { resolveTaxWorkerActor } from "./tax-worker-actor";
import { createItbiDeclarationInTransaction, analyzeItbiInTransaction, issueItbiDamInTransaction, generateItbiDocumentInTransaction } from "./s3-service";
import { assertPortalItbiAccess } from "./itbi-process-channel";
import { fiscalCatalogSchema } from "./configurable-cadastres";
import { linkItbiPropertyAttachments } from "./itbi-attachments";
import { requestItbiContestationInTransaction } from "./itbi-contestation";

type Db = PrismaClient | Prisma.TransactionClient;
function requestHash(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : item;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export const onlineItbiPolicySchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), active: z.boolean(), releaseMode: z.enum(["REVIEW", "AUTOMATIC"]), workerUsuarioId: z.string().min(1), processTypeId: z.string().min(1), subjectId: z.string().min(1), transactionTypeIds: z.array(z.string().min(1)).min(1).max(100), valuationRuleId: z.string().min(1), dueDays: z.number().int().min(1).max(365), legalBasis: z.string().trim().min(1).max(4000) });
async function authorize(db: Db, actor: TaxActor, scope: { governmentEntityId: string; budgetUnitId: string }) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await db.planningEntityUnit.findFirst({ where: { governmentEntityId: scope.governmentEntityId, budgetUnitId: scope.budgetUnitId } })) throw new Error("Ente/UG não conciliados.");
}
export async function publishOnlineItbiPolicy(db: PrismaClient, actor: TaxActor, raw: z.input<typeof onlineItbiPolicySchema>) {
  const input = onlineItbiPolicySchema.parse(raw);
  return db.$transaction(async tx => {
    await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    const worker = await resolveTaxWorkerActor(tx, input.workerUsuarioId);
    if (!worker.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("O operador de processamento deve ter acesso explícito à UG.");
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ONLINE_ITBI_POLICY:${input.budgetUnitId}`},0))::text`;
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "ONLINE_ITBI_POLICY" }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("Configuração alterada. Recarregue.");
    if (!await tx.subject.findFirst({ where: { id: input.subjectId, processTypeId: input.processTypeId, isActive: true, processType: { isActive: true } } })) throw new Error("Tipo e assunto do protocolo incompatíveis.");
    for (const id of new Set(input.transactionTypeIds)) {
      if (!await tx.itbiTransactionType.findFirst({ where: { id, isActive: true } })) throw new Error("Modalidade indisponível.");
      const origin = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_TRANSACTION_TYPE", entityId: id, category: "PARAMETER_SCOPE" } });
      const data = taxScopeSnapshot(origin?.data);
      if (data.governmentEntityId !== input.governmentEntityId || data.budgetUnitId !== input.budgetUnitId) throw new Error("Modalidades on-line devem ter origem conciliada nesta UG.");
    }
    const rule = await tx.taxRegistryEntry.findFirstOrThrow({ where: { id: input.valuationRuleId, category: "PROPERTY_VALUATION_RULE" } });
    const ruleScope = taxScopeSnapshot(rule.data);
    const tax = await tx.tax.findUniqueOrThrow({ where: { id: rule.entityId } });
    if (!tax.isActive || tax.name.toUpperCase() !== "ITBI" || ruleScope.governmentEntityId !== input.governmentEntityId || ruleScope.budgetUnitId !== input.budgetUnitId || ruleScope.year !== new Date().getUTCFullYear()) throw new Error("Selecione avaliação ITBI da origem e do exercício atual.");
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "ONLINE_ITBI_POLICY", title: "ITBI on-line", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...input, previousId: previous?.id ?? null } } });
    await tx.taxAuditLog.create({ data: { action: "PUBLISH_ONLINE_ITBI_POLICY", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data } as Prisma.InputJsonObject } });
    return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function configureItbiNotary(db: PrismaClient, actor: TaxActor, raw: { governmentEntityId: string; budgetUnitId: string; taxpayerId: string; name: string; usuarioIds: string[]; active: boolean; expectedVersion: number; reason: string }) {
  const input = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), taxpayerId: z.string().min(1), name: z.string().trim().min(1).max(240), usuarioIds: z.array(z.string().min(1)).min(1).max(100), active: z.boolean(), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  return db.$transaction(async tx => {
    await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    const key = `${input.budgetUnitId}:${input.taxpayerId}`;
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ITBI_NOTARY:${key}`},0))::text`;
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_NOTARY", entityId: key, category: "ITBI_NOTARY" }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("Tabelionato alterado. Recarregue.");
    if (!await tx.taxpayer.findFirst({ where: { id: input.taxpayerId, status: "Ativo" } })) throw new Error("Cadastre o tabelionato no cadastro único ativo.");
    if (await tx.usuario.count({ where: { id: { in: input.usuarioIds }, ativo: true, perfil: { ativo: true } } }) !== new Set(input.usuarioIds).size) throw new Error("Selecione contas ativas.");
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_NOTARY", entityId: key, category: "ITBI_NOTARY", title: input.name, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...input, previousId: previous?.id ?? null } } });
    await tx.taxAuditLog.create({ data: { action: "CONFIGURE_ITBI_NOTARY", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data } as Prisma.InputJsonObject } });
    return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

export async function readOnlineItbiEntitlements(db: Db, usuarioId: string) {
  if (!await db.usuario.findFirst({ where: { id: usuarioId, ativo: true, perfil: { ativo: true } } })) throw new Error("Conta indisponível.");
  // Read all versions before membership filtering, so a revoked user cannot recover an older grant.
  const entries = await db.taxRegistryEntry.findMany({ where: { entityType: "ITBI_NOTARY", category: "ITBI_NOTARY" }, orderBy: { version: "desc" } });
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  return [...latest.values()].filter(row => { const data = taxScopeSnapshot(row.data); return data.active === true && Array.isArray(data.usuarioIds) && data.usuarioIds.includes(usuarioId); });
}

async function onlineContext(db: Db, usuarioId: string, notaryId: string, expectedPolicyVersion?: number) {
  const notary = (await readOnlineItbiEntitlements(db, usuarioId)).find(row => row.entityId === notaryId);
  if (!notary) throw new Error("Tabelionato sem autorização vigente para a conta.");
  const notaryData = taxScopeSnapshot(notary.data);
  const entry = await db.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "BUDGET_UNIT", entityId: String(notaryData.budgetUnitId), category: "ONLINE_ITBI_POLICY" }, orderBy: { version: "desc" } });
  const policy = onlineItbiPolicySchema.parse(entry.data);
  if (!policy.active || policy.governmentEntityId !== notaryData.governmentEntityId || expectedPolicyVersion !== undefined && entry.version !== expectedPolicyVersion) throw new Error("Serviço indisponível ou configuração alterada.");
  await authorize(db, { usuarioId, employeeId: null, allowedBudgetUnitIds: [policy.budgetUnitId] }, policy);
  return { notary, notaryData, policyEntry: entry, policy };
}

async function onlineItbiForms(db: Db, scope: { governmentEntityId: string; budgetUnitId: string }) {
  const entries = await db.taxRegistryEntry.findMany({ where: { entityType: "FISCAL_CATALOG", category: "TYPED_FISCAL_CATALOG", AND: [{ data: { path: ["governmentEntityId"], equals: scope.governmentEntityId } }, { data: { path: ["budgetUnitId"], equals: scope.budgetUnitId } }, { data: { path: ["kind"], equals: "FORMULARIO_ITBI" } }] }, orderBy: { version: "desc" } });
  const latest = new Map<string, typeof entries[number]>();
  for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
  const forms = [...latest.values()].flatMap(entry => { const config = fiscalCatalogSchema.parse(entry.data); return config.active ? [{ id: entry.entityId, version: entry.version, name: config.name, fields: config.fields }] : []; });
  if (forms.length > 50) throw new Error("A configuração excede 50 formulários de ITBI ativos. Concilie os formulários municipais antes da inclusão on-line.");
  return forms;
}

export async function assertOnlineItbiDraftAccess(db: Db, usuarioId: string, input: { notaryId: string; requestKey: string; propertyId: string }) {
  z.uuid().parse(input.requestKey);
  const context = await onlineContext(db, usuarioId, input.notaryId);
  const profile = await db.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "REAL_ESTATE", entityId: input.propertyId, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
  const origin = taxScopeSnapshot(profile.data);
  if (origin.governmentEntityId !== context.policy.governmentEntityId || origin.budgetUnitId !== context.policy.budgetUnitId) throw new Error("Imóvel fora da origem autorizada do tabelionato.");
  if (await db.taxRegistryEntry.findFirst({ where: { entityType: "ONLINE_ITBI_REQUEST", entityId: `${usuarioId}:${input.requestKey}`, category: "ONLINE_ITBI_REQUEST" } })) throw new Error("Solicitação já protocolada. Envie novos anexos pelo processo.");
  return { governmentEntityId: context.policy.governmentEntityId, budgetUnitId: context.policy.budgetUnitId };
}

export async function previewOnlineItbiProperty(db: PrismaClient, usuarioId: string, raw: { notaryId: string; inscription: string }) {
  const input = z.object({ notaryId: z.string().min(1), inscription: z.string().trim().min(1).max(120) }).parse(raw);
  const { policy, policyEntry } = await onlineContext(db, usuarioId, input.notaryId);
  const property = await db.realEstate.findUniqueOrThrow({ where: { municipalInsc: input.inscription } });
  const profile = await db.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "REAL_ESTATE", entityId: property.id, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
  const data = taxScopeSnapshot(profile.data);
  if (data.governmentEntityId !== policy.governmentEntityId || data.budgetUnitId !== policy.budgetUnitId || ["Inativo", "Baixado", "Remembrado", "Desmembrado"].includes(property.status)) throw new Error("Imóvel indisponível nesta origem.");
  const types = await db.itbiTransactionType.findMany({ where: { id: { in: policy.transactionTypeIds }, isActive: true }, select: { id: true, name: true, rate: true } });
  const forms = await onlineItbiForms(db, policy);
  return { id: property.id, inscription: property.municipalInsc!, updatedAt: property.updatedAt.toISOString(), landArea: property.landArea, builtArea: property.builtArea, address: `${property.streetName ?? ""}, ${property.number ?? ""}`, latitude: typeof data.latitude === "number" ? data.latitude : null, longitude: typeof data.longitude === "number" ? data.longitude : null, policyVersion: policyEntry.version, releaseMode: policy.releaseMode, forms, types: types.map(row => ({ id: row.id, name: row.name, rate: row.rate.toString() })) };
}

const partySchema = z.object({ document: z.string().transform(value => value.replace(/\D/g, "")).refine(value => value.length === 11 || value.length === 14, "Informe CPF ou CNPJ."), sharePercent: z.number().finite().positive().max(100) });
const submissionSchema = z.object({ requestKey: z.uuid(), notaryId: z.string().min(1), expectedPolicyVersion: z.number().int().positive(), propertyId: z.string().min(1), expectedPropertyUpdatedAt: z.iso.datetime(), transactionTypeId: z.string().min(1), declaredValue: z.number().finite().positive(), fractionPercent: z.number().finite().positive().max(100), sellers: z.array(partySchema).min(1).max(100), buyers: z.array(partySchema).min(1).max(100), debtorDocument: z.string().min(1), requestContestation: z.boolean(), contestationReason: z.string().max(8000), description: z.string().trim().min(1).max(4000), attachmentIds: z.array(z.string().min(1)).max(20).default([]), forms: z.array(z.object({ catalogId: z.string().min(1), expectedVersion: z.number().int().positive(), values: z.record(z.string(), z.union([z.string().max(4000), z.boolean(), z.null()])) })).max(50).default([]) });
export async function submitOnlineItbi(db: PrismaClient, usuarioId: string, raw: z.input<typeof submissionSchema>) {
  const input = submissionSchema.parse(raw);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ONLINE_ITBI_REQUEST:${usuarioId}:${input.requestKey}`},0))::text`;
    const prior = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ONLINE_ITBI_REQUEST", entityId: `${usuarioId}:${input.requestKey}`, category: "ONLINE_ITBI_REQUEST" } });
    if (prior) {
      const data = taxScopeSnapshot(prior.data);
      if (data.requestHash !== requestHash(input)) throw new Error("Chave de solicitação já usada com outros dados.");
      await assertPortalItbiAccess(tx, usuarioId, String(data.declarationId));
      return { declarationId: String(data.declarationId), processId: prior.processId! };
    }
    const context = await onlineContext(tx, usuarioId, input.notaryId, input.expectedPolicyVersion);
    const forms = await onlineItbiForms(tx, context.policy);
    if (new Set(input.forms.map(form => form.catalogId)).size !== input.forms.length || forms.length !== input.forms.length || forms.some(form => !input.forms.some(submitted => submitted.catalogId === form.id && submitted.expectedVersion === form.version))) throw new Error("Os formulários do ITBI foram alterados. Consulte novamente o imóvel e preencha os campos municipais.");
    for (const form of [...forms].sort((a, b) => a.id.localeCompare(b.id))) await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`FISCAL_CATALOG_ID:${form.id}`},0))::text`;
    const worker = await resolveTaxWorkerActor(tx, context.policy.workerUsuarioId);
    const prepared = await tx.taxRegistryEntry.findMany({ where: { entityType: "ONLINE_ITBI_DRAFT", entityId: `${usuarioId}:${input.requestKey}`, category: "ONLINE_ITBI_DRAFT_ATTACHMENT", documentId: { in: input.attachmentIds } } });
    if (new Set(input.attachmentIds).size !== input.attachmentIds.length || prepared.length !== input.attachmentIds.length || prepared.some(entry => { const data = taxScopeSnapshot(entry.data); return entry.actorUsuarioId !== usuarioId || data.notaryId !== input.notaryId || data.propertyId !== input.propertyId || data.governmentEntityId !== context.policy.governmentEntityId || data.budgetUnitId !== context.policy.budgetUnitId; })) throw new Error("Use somente os anexos enviados nesta solicitação de ITBI.");
    if (await tx.document.count({ where: { id: { in: input.attachmentIds }, status: "Válido" } }) !== input.attachmentIds.length) throw new Error("Um dos anexos preparados está indisponível no GED.");
    if (!worker.allowedBudgetUnitIds.includes(context.policy.budgetUnitId)) throw new Error("Operador de processamento fora da UG.");
    if (!context.policy.transactionTypeIds.includes(input.transactionTypeId)) throw new Error("Modalidade não liberada para ITBI on-line.");
    await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${input.propertyId} FOR UPDATE`;
    const property = await tx.realEstate.findUniqueOrThrow({ where: { id: input.propertyId } });
    const profile = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "REAL_ESTATE", entityId: property.id, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
    const origin = taxScopeSnapshot(profile.data);
    if (property.updatedAt.toISOString() !== input.expectedPropertyUpdatedAt || origin.governmentEntityId !== context.policy.governmentEntityId || origin.budgetUnitId !== context.policy.budgetUnitId || ["Inativo", "Baixado", "Remembrado", "Desmembrado"].includes(property.status)) throw new Error("Cadastro imobiliário alterado ou indisponível. Consulte novamente.");
    const resolveParty = async (party: z.infer<typeof partySchema>) => { const row = await tx.taxpayer.findFirst({ where: { status: "Ativo", OR: [{ person: { cpf: party.document } }, { company: { cnpj: party.document } }] } }); if (!row) throw new Error("Uma das partes não possui CPF/CNPJ ativo no cadastro único municipal."); return { taxpayerId: row.id, sharePercent: party.sharePercent }; };
    const sellers: Awaited<ReturnType<typeof resolveParty>>[] = []; for (const party of input.sellers) sellers.push(await resolveParty(party));
    const buyers: Awaited<ReturnType<typeof resolveParty>>[] = []; for (const party of input.buyers) buyers.push(await resolveParty(party));
    const debtorDocument = input.debtorDocument.replace(/\D/g, "");
    const debtor = [...input.sellers.map((row, index) => ({ document: row.document, taxpayerId: sellers[index].taxpayerId })), ...input.buyers.map((row, index) => ({ document: row.document, taxpayerId: buyers[index].taxpayerId }))].find(row => row.document === debtorDocument);
    if (!debtor) throw new Error("Informe o CPF/CNPJ do devedor entre as partes da transmissão.");
    const interested = await tx.taxpayer.findUniqueOrThrow({ where: { id: buyers[0].taxpayerId }, select: { personId: true, companyId: true } });
    const process = await openExternalServiceProcess(tx, { actorId: usuarioId, processTypeId: context.policy.processTypeId, subjectId: context.policy.subjectId, personId: interested.personId, companyId: interested.companyId, description: input.description, purpose: "ITBI_ONLINE" });
    const dueDate = new Date(); dueDate.setUTCDate(dueDate.getUTCDate() + context.policy.dueDays);
    const declaration = await createItbiDeclarationInTransaction(tx, { usuarioId, employeeId: null, allowedBudgetUnitIds: [context.policy.budgetUnitId] }, { transactionTypeId: input.transactionTypeId, realEstateId: property.id, processId: process.id, registryOffice: context.notary.title, transmittedFractionPercent: input.fractionPercent, declaredPropertyValue: input.declaredValue, sellerTaxpayerId: sellers[0].taxpayerId, sellers, buyers, debtorTaxpayerId: debtor.taxpayerId, cadastralUpdateMode: "AUTO_ON_PAYMENT", dueDate: dueDate.toISOString().slice(0, 10), valuationRuleId: context.policy.valuationRuleId, forms: input.forms.map(form => ({ catalogId: form.catalogId, values: form.values, documentIds: [] })) });
    const declarationScope = taxScopeSnapshot(declaration.calculationSnapshot);
    if (declarationScope.budgetUnitId !== context.policy.budgetUnitId || declarationScope.governmentEntityId !== context.policy.governmentEntityId) throw new Error("Origem arrecadadora do ITBI diverge da configuração on-line.");
    if (declarationScope.requiresDebtClearance === true && declaration.blockingTaxDebt.gt(0)) throw new Error("O imóvel possui débitos impeditivos conforme a modalidade de transmissão.");
    await tx.processCitizenAccess.create({ data: { processId: process.id, usuarioId, grantedByUsuarioId: context.policy.workerUsuarioId, reason: "Acesso do autor à solicitação de ITBI on-line." } });
    await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: { status: "PROTOCOLADA", calculationSnapshot: { ...declarationScope, channel: "ONLINE", notaryId: context.notary.entityId, onlinePolicyId: context.policyEntry.id }, events: { create: { eventType: "DECLARACAO_ONLINE_PROTOCOLADA", description: input.description, actorUsuarioId: usuarioId } } } });
    await tx.taxServiceRequest.create({ data: { serviceType: "ITBI", status: "EM_ANALISE_INTERNA", taxpayerId: buyers[0].taxpayerId, processId: process.id, notes: declaration.declarationNumber } });
    const calculatedPropertyValue = new Prisma.Decimal(String(declarationScope.propertyValue));
    const externalActor = { usuarioId, employeeId: null, allowedBudgetUnitIds: [context.policy.budgetUnitId] };
    for (const attachment of prepared) {
      const documentId = attachment.documentId!; const data = taxScopeSnapshot(attachment.data);
      await tx.processDocument.create({ data: { processId: process.id, documentId, purpose: "Anexo apresentado na inclusão on-line de ITBI" } });
      await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE", title: attachment.title, actorUsuarioId: usuarioId, processId: process.id, documentId, data: { governmentEntityId: context.policy.governmentEntityId, budgetUnitId: context.policy.budgetUnitId, kind: "ATTACHMENT", external: true, usuarioId, documentId, filename: attachment.title, url: data.url ?? null, draftAttachmentId: attachment.id } } });
    }
    await linkItbiPropertyAttachments(tx, externalActor, declaration.id, input.attachmentIds);
    if (input.requestContestation) {
      if (!calculatedPropertyValue.gt(input.declaredValue) || !input.contestationReason.trim()) throw new Error("Impugnação inicial exige avaliação municipal superior ao declarado e justificativa.");
      if (!input.attachmentIds.length) throw new Error("Anexe ao menos um documento comprobatório para solicitar a impugnação na inclusão.");
      const current = await tx.itbiDeclaration.findUniqueOrThrow({ where: { id: declaration.id } });
      await requestItbiContestationInTransaction(tx, externalActor, { declarationId: declaration.id, expectedUpdatedAt: current.updatedAt.toISOString(), reason: input.contestationReason.trim(), documentIds: input.attachmentIds, proposedPropertyValue: declaration.declaredPropertyValue.toFixed(2) });
    } else if (context.policy.releaseMode === "AUTOMATIC") {
      await analyzeItbiInTransaction(tx, worker, { declarationId: declaration.id, approved: true, notes: context.policy.legalBasis });
      await issueItbiDamInTransaction(tx, worker, declaration.id);
      await generateItbiDocumentInTransaction(tx, worker, declaration.id);
    }
    await tx.taxRegistryEntry.create({ data: { entityType: "ONLINE_ITBI_REQUEST", entityId: `${usuarioId}:${input.requestKey}`, category: "ONLINE_ITBI_REQUEST", title: declaration.declarationNumber, processId: process.id, actorUsuarioId: usuarioId, data: { governmentEntityId: context.policy.governmentEntityId, budgetUnitId: context.policy.budgetUnitId, declarationId: declaration.id, policyId: context.policyEntry.id, requestHash: requestHash(input), request: input } } });
    await tx.taxAuditLog.create({ data: { action: "SUBMIT_ONLINE_ITBI", entityType: "ItbiDeclaration", entityId: declaration.id, authorUsuarioId: usuarioId, payload: { policyId: context.policyEntry.id, notaryVersionId: context.notary.id, processId: process.id, releaseMode: context.policy.releaseMode, requestContestation: input.requestContestation } } });
    return { declarationId: declaration.id, processId: process.id };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 120000 });
}
