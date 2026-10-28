import { createHash } from "node:crypto";
import { and, desc, eq, inArray, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import { itbiTransactionTypes } from "@/db/schema/tax-itbi";
import { companies, realEstates, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { taxes } from "@/db/schema/taxation-core";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { processCitizenAccesses } from "@/db/schema/citizen-access";
import { processSubjects, processTypes } from "@/db/schema/processes";
import { portalTaxServiceRequests } from "@/db/schema/portal-services";
import { auditItbi, firstItbiRegistryEntry, insertItbiProcessDocument, insertItbiRegistryEntry, itbiJson, itbiRegistryPosition, latestItbiRegistryEntry, lockItbiKey, lockItbiRecord, readActiveItbiUser, readItbiDeclaration, readItbiMunicipalUnit, readItbiProperty, readItbiRegistryEntries, readValidItbiDocuments, requireItbiRecord, updateItbiDeclaration } from "@/db/repositories/tax-itbi/records";
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

type Db = DatabaseExecutor;
function requestHash(value: unknown): string {
  const canonical = (item: unknown): unknown => Array.isArray(item) ? item.map(canonical) : item && typeof item === "object" ? Object.fromEntries(Object.entries(item).sort(([a], [b]) => a.localeCompare(b)).map(([key, child]) => [key, canonical(child)])) : item;
  return createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex");
}
export const onlineItbiPolicySchema = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), expectedVersion: z.number().int().nonnegative(), active: z.boolean(), releaseMode: z.enum(["REVIEW", "AUTOMATIC"]), workerUsuarioId: z.string().min(1), processTypeId: z.string().min(1), subjectId: z.string().min(1), transactionTypeIds: z.array(z.string().min(1)).min(1).max(100), valuationRuleId: z.string().min(1), dueDays: z.number().int().min(1).max(365), legalBasis: z.string().trim().min(1).max(4000) });
async function authorize(db: Db, actor: TaxActor, scope: { governmentEntityId: string; budgetUnitId: string }) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(scope.budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await readItbiMunicipalUnit(db, scope)) throw new Error("Ente/UG não conciliados.");
}
export async function publishOnlineItbiPolicy(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof onlineItbiPolicySchema>) {
  const input = onlineItbiPolicySchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    const worker = await resolveTaxWorkerActor(tx, input.workerUsuarioId);
    if (!worker.allowedBudgetUnitIds.includes(input.budgetUnitId)) throw new Error("O operador de processamento deve ter acesso explícito à UG.");
    await lockItbiKey(tx, `ONLINE_ITBI_POLICY:${input.budgetUnitId}`);
    const previous = await latestItbiRegistryEntry(tx, "BUDGET_UNIT", input.budgetUnitId, "ONLINE_ITBI_POLICY");
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("Configuração alterada. Recarregue.");
    if (!(await tx.select({ id: processSubjects.id }).from(processSubjects).innerJoin(processTypes, eq(processTypes.id, processSubjects.processTypeId)).where(and(eq(processSubjects.id, input.subjectId), eq(processSubjects.processTypeId, input.processTypeId), eq(processSubjects.isActive, true), eq(processTypes.isActive, true))).limit(1)).length) throw new Error("Tipo e assunto do protocolo incompatíveis.");
    for (const id of new Set(input.transactionTypeIds)) {
      if (!(await tx.select({ id: itbiTransactionTypes.id }).from(itbiTransactionTypes).where(and(eq(itbiTransactionTypes.id, id), eq(itbiTransactionTypes.isActive, true))).limit(1)).length) throw new Error("Modalidade indisponível.");
      const origin = await firstItbiRegistryEntry(tx, itbiRegistryPosition("ITBI_TRANSACTION_TYPE", id, "PARAMETER_SCOPE"));
      const data = taxScopeSnapshot(origin?.data);
      if (data.governmentEntityId !== input.governmentEntityId || data.budgetUnitId !== input.budgetUnitId) throw new Error("Modalidades on-line devem ter origem conciliada nesta UG.");
    }
    const rule = requireItbiRecord(await firstItbiRegistryEntry(tx, and(eq(taxRegistryEntries.id, input.valuationRuleId), eq(taxRegistryEntries.category, "PROPERTY_VALUATION_RULE"))!));
    const ruleScope = taxScopeSnapshot(rule.data);
    const tax = requireItbiRecord((await tx.select().from(taxes).where(eq(taxes.id, rule.entityId)).limit(1))[0]);
    if (!tax.isActive || tax.name.toUpperCase() !== "ITBI" || ruleScope.governmentEntityId !== input.governmentEntityId || ruleScope.budgetUnitId !== input.budgetUnitId || ruleScope.year !== new Date().getUTCFullYear()) throw new Error("Selecione avaliação ITBI da origem e do exercício atual.");
    const entry = await insertItbiRegistryEntry(tx, { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "ONLINE_ITBI_POLICY", title: "ITBI on-line", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...input, previousId: previous?.id ?? null } });
    await auditItbi(tx, { action: "PUBLISH_ONLINE_ITBI_POLICY", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data } });
    return entry;
  }, { isolationLevel: "serializable" });
}

export async function configureItbiNotary(connection: DatabaseConnection, actor: TaxActor, raw: { governmentEntityId: string; budgetUnitId: string; taxpayerId: string; name: string; usuarioIds: string[]; active: boolean; expectedVersion: number; reason: string }) {
  const input = z.object({ governmentEntityId: z.string().min(1), budgetUnitId: z.string().min(1), taxpayerId: z.string().min(1), name: z.string().trim().min(1).max(240), usuarioIds: z.array(z.string().min(1)).min(1).max(100), active: z.boolean(), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(4000) }).parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await authorize(tx, actor, { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId });
    const key = `${input.budgetUnitId}:${input.taxpayerId}`;
    await lockItbiKey(tx, `ITBI_NOTARY:${key}`);
    const previous = await latestItbiRegistryEntry(tx, "ITBI_NOTARY", key, "ITBI_NOTARY");
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("Tabelionato alterado. Recarregue.");
    if (!(await tx.select({ id: taxpayers.id }).from(taxpayers).where(and(eq(taxpayers.id, input.taxpayerId), eq(taxpayers.status, "Ativo"))).limit(1)).length) throw new Error("Cadastre o tabelionato no cadastro único ativo.");
    for (const id of new Set(input.usuarioIds)) if (!await readActiveItbiUser(tx, id)) throw new Error("Selecione contas ativas.");
    const entry = await insertItbiRegistryEntry(tx, { entityType: "ITBI_NOTARY", entityId: key, category: "ITBI_NOTARY", title: input.name, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { ...input, previousId: previous?.id ?? null } });
    await auditItbi(tx, { action: "CONFIGURE_ITBI_NOTARY", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data } });
    return entry;
  }, { isolationLevel: "serializable" });
}

export async function readOnlineItbiEntitlements(db: Db, usuarioId: string) {
  if (!await readActiveItbiUser(db, usuarioId)) throw new Error("Conta indisponível.");
  // Read all versions before membership filtering, so a revoked user cannot recover an older grant.
  const entries = await readItbiRegistryEntries(db, and(eq(taxRegistryEntries.entityType, "ITBI_NOTARY"), eq(taxRegistryEntries.category, "ITBI_NOTARY"))!, [desc(taxRegistryEntries.version)]);
  const latest = new Map<string, typeof entries[number]>(); for (const row of entries) if (!latest.has(row.entityId)) latest.set(row.entityId, row);
  return [...latest.values()].filter(row => { const data = taxScopeSnapshot(row.data); return data.active === true && Array.isArray(data.usuarioIds) && data.usuarioIds.includes(usuarioId); });
}

async function onlineContext(db: Db, usuarioId: string, notaryId: string, expectedPolicyVersion?: number) {
  const notary = (await readOnlineItbiEntitlements(db, usuarioId)).find(row => row.entityId === notaryId);
  if (!notary) throw new Error("Tabelionato sem autorização vigente para a conta.");
  const notaryData = taxScopeSnapshot(notary.data);
  const entry = requireItbiRecord(await latestItbiRegistryEntry(db, "BUDGET_UNIT", String(notaryData.budgetUnitId), "ONLINE_ITBI_POLICY"));
  const policy = onlineItbiPolicySchema.parse(entry.data);
  if (!policy.active || policy.governmentEntityId !== notaryData.governmentEntityId || expectedPolicyVersion !== undefined && entry.version !== expectedPolicyVersion) throw new Error("Serviço indisponível ou configuração alterada.");
  await authorize(db, { usuarioId, employeeId: null, allowedBudgetUnitIds: [policy.budgetUnitId] }, policy);
  return { notary, notaryData, policyEntry: entry, policy };
}

async function onlineItbiForms(db: Db, scope: { governmentEntityId: string; budgetUnitId: string }) {
  const entries = await readItbiRegistryEntries(db, and(eq(taxRegistryEntries.entityType, "FISCAL_CATALOG"), eq(taxRegistryEntries.category, "TYPED_FISCAL_CATALOG"), sql`${taxRegistryEntries.data}->'governmentEntityId' = ${JSON.stringify(scope.governmentEntityId)}::jsonb`, sql`${taxRegistryEntries.data}->'budgetUnitId' = ${JSON.stringify(scope.budgetUnitId)}::jsonb`, sql`${taxRegistryEntries.data}->'kind' = '"FORMULARIO_ITBI"'::jsonb`)!, [desc(taxRegistryEntries.version)]);
  const latest = new Map<string, typeof entries[number]>();
  for (const entry of entries) if (!latest.has(entry.entityId)) latest.set(entry.entityId, entry);
  const forms = [...latest.values()].flatMap(entry => { const config = fiscalCatalogSchema.parse(entry.data); return config.active ? [{ id: entry.entityId, version: entry.version, name: config.name, fields: config.fields }] : []; });
  if (forms.length > 50) throw new Error("A configuração excede 50 formulários de ITBI ativos. Concilie os formulários municipais antes da inclusão on-line.");
  return forms;
}

export async function assertOnlineItbiDraftAccess(db: Db, usuarioId: string, input: { notaryId: string; requestKey: string; propertyId: string }) {
  z.uuid().parse(input.requestKey);
  const context = await onlineContext(db, usuarioId, input.notaryId);
  const profile = requireItbiRecord(await latestItbiRegistryEntry(db, "REAL_ESTATE", input.propertyId, "PROPERTY_PROFILE"));
  const origin = taxScopeSnapshot(profile.data);
  if (origin.governmentEntityId !== context.policy.governmentEntityId || origin.budgetUnitId !== context.policy.budgetUnitId) throw new Error("Imóvel fora da origem autorizada do tabelionato.");
  if (await firstItbiRegistryEntry(db, itbiRegistryPosition("ONLINE_ITBI_REQUEST", `${usuarioId}:${input.requestKey}`, "ONLINE_ITBI_REQUEST"))) throw new Error("Solicitação já protocolada. Envie novos anexos pelo processo.");
  return { governmentEntityId: context.policy.governmentEntityId, budgetUnitId: context.policy.budgetUnitId };
}

export async function previewOnlineItbiProperty(db: DatabaseExecutor, usuarioId: string, raw: { notaryId: string; inscription: string }) {
  const input = z.object({ notaryId: z.string().min(1), inscription: z.string().trim().min(1).max(120) }).parse(raw);
  const { policy, policyEntry } = await onlineContext(db, usuarioId, input.notaryId);
  const property = requireItbiRecord((await db.select().from(realEstates).where(eq(realEstates.municipalInsc, input.inscription)).limit(1))[0]);
  const profile = requireItbiRecord(await latestItbiRegistryEntry(db, "REAL_ESTATE", property.id, "PROPERTY_PROFILE"));
  const data = taxScopeSnapshot(profile.data);
  if (data.governmentEntityId !== policy.governmentEntityId || data.budgetUnitId !== policy.budgetUnitId || ["Inativo", "Baixado", "Remembrado", "Desmembrado"].includes(property.status)) throw new Error("Imóvel indisponível nesta origem.");
  const types = await db.select({ id: itbiTransactionTypes.id, name: itbiTransactionTypes.name, rate: itbiTransactionTypes.rate }).from(itbiTransactionTypes).where(and(inArray(itbiTransactionTypes.id, policy.transactionTypeIds), eq(itbiTransactionTypes.isActive, true)));
  const forms = await onlineItbiForms(db, policy);
  return { id: property.id, inscription: property.municipalInsc!, updatedAt: property.updatedAt.toISOString(), landArea: property.landArea, builtArea: property.builtArea, address: `${property.streetName ?? ""}, ${property.number ?? ""}`, latitude: typeof data.latitude === "number" ? data.latitude : null, longitude: typeof data.longitude === "number" ? data.longitude : null, policyVersion: policyEntry.version, releaseMode: policy.releaseMode, forms, types: types.map(row => ({ id: row.id, name: row.name, rate: row.rate.toString() })) };
}

const partySchema = z.object({ document: z.string().transform(value => value.replace(/\D/g, "")).refine(value => value.length === 11 || value.length === 14, "Informe CPF ou CNPJ."), sharePercent: z.number().finite().positive().max(100) });
const submissionSchema = z.object({ requestKey: z.uuid(), notaryId: z.string().min(1), expectedPolicyVersion: z.number().int().positive(), propertyId: z.string().min(1), expectedPropertyUpdatedAt: z.iso.datetime(), transactionTypeId: z.string().min(1), declaredValue: z.number().finite().positive(), fractionPercent: z.number().finite().positive().max(100), sellers: z.array(partySchema).min(1).max(100), buyers: z.array(partySchema).min(1).max(100), debtorDocument: z.string().min(1), requestContestation: z.boolean(), contestationReason: z.string().max(8000), description: z.string().trim().min(1).max(4000), attachmentIds: z.array(z.string().min(1)).max(20).default([]), forms: z.array(z.object({ catalogId: z.string().min(1), expectedVersion: z.number().int().positive(), values: z.record(z.string(), z.union([z.string().max(4000), z.boolean(), z.null()])) })).max(50).default([]) });
export async function submitOnlineItbi(connection: DatabaseConnection, usuarioId: string, raw: z.input<typeof submissionSchema>) {
  const input = submissionSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await lockItbiKey(tx, `ONLINE_ITBI_REQUEST:${usuarioId}:${input.requestKey}`);
    const prior = await firstItbiRegistryEntry(tx, itbiRegistryPosition("ONLINE_ITBI_REQUEST", `${usuarioId}:${input.requestKey}`, "ONLINE_ITBI_REQUEST"));
    if (prior) {
      const data = taxScopeSnapshot(prior.data);
      if (data.requestHash !== requestHash(input)) throw new Error("Chave de solicitação já usada com outros dados.");
      await assertPortalItbiAccess(tx, usuarioId, String(data.declarationId));
      return { declarationId: String(data.declarationId), processId: prior.processId! };
    }
    const context = await onlineContext(tx, usuarioId, input.notaryId, input.expectedPolicyVersion);
    const forms = await onlineItbiForms(tx, context.policy);
    if (new Set(input.forms.map(form => form.catalogId)).size !== input.forms.length || forms.length !== input.forms.length || forms.some(form => !input.forms.some(submitted => submitted.catalogId === form.id && submitted.expectedVersion === form.version))) throw new Error("Os formulários do ITBI foram alterados. Consulte novamente o imóvel e preencha os campos municipais.");
    for (const form of [...forms].sort((a, b) => a.id.localeCompare(b.id))) await lockItbiKey(tx, `FISCAL_CATALOG_ID:${form.id}`);
    const worker = await resolveTaxWorkerActor(tx, context.policy.workerUsuarioId);
    const prepared = await readItbiRegistryEntries(tx, and(itbiRegistryPosition("ONLINE_ITBI_DRAFT", `${usuarioId}:${input.requestKey}`, "ONLINE_ITBI_DRAFT_ATTACHMENT"), inArray(taxRegistryEntries.documentId, input.attachmentIds))!);
    if (new Set(input.attachmentIds).size !== input.attachmentIds.length || prepared.length !== input.attachmentIds.length || prepared.some(entry => { const data = taxScopeSnapshot(entry.data); return entry.actorUsuarioId !== usuarioId || data.notaryId !== input.notaryId || data.propertyId !== input.propertyId || data.governmentEntityId !== context.policy.governmentEntityId || data.budgetUnitId !== context.policy.budgetUnitId; })) throw new Error("Use somente os anexos enviados nesta solicitação de ITBI.");
    if ((await readValidItbiDocuments(tx, input.attachmentIds)).length !== input.attachmentIds.length) throw new Error("Um dos anexos preparados está indisponível no GED.");
    if (!worker.allowedBudgetUnitIds.includes(context.policy.budgetUnitId)) throw new Error("Operador de processamento fora da UG.");
    if (!context.policy.transactionTypeIds.includes(input.transactionTypeId)) throw new Error("Modalidade não liberada para ITBI on-line.");
    await lockItbiRecord(tx, "RealEstate", input.propertyId);
    const property = await readItbiProperty(tx, input.propertyId);
    const profile = requireItbiRecord(await latestItbiRegistryEntry(tx, "REAL_ESTATE", property.id, "PROPERTY_PROFILE"));
    const origin = taxScopeSnapshot(profile.data);
    if (property.updatedAt.toISOString() !== input.expectedPropertyUpdatedAt || origin.governmentEntityId !== context.policy.governmentEntityId || origin.budgetUnitId !== context.policy.budgetUnitId || ["Inativo", "Baixado", "Remembrado", "Desmembrado"].includes(property.status)) throw new Error("Cadastro imobiliário alterado ou indisponível. Consulte novamente.");
    const resolveParty = async (party: z.infer<typeof partySchema>) => { const row = (await tx.select({ id: taxpayers.id }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(and(eq(taxpayers.status, "Ativo"), or(eq(people.cpf, party.document), eq(companies.cnpj, party.document)))).limit(1))[0]; if (!row) throw new Error("Uma das partes não possui CPF/CNPJ ativo no cadastro único municipal."); return { taxpayerId: row.id, sharePercent: party.sharePercent }; };
    const sellers: Awaited<ReturnType<typeof resolveParty>>[] = []; for (const party of input.sellers) sellers.push(await resolveParty(party));
    const buyers: Awaited<ReturnType<typeof resolveParty>>[] = []; for (const party of input.buyers) buyers.push(await resolveParty(party));
    const debtorDocument = input.debtorDocument.replace(/\D/g, "");
    const debtor = [...input.sellers.map((row, index) => ({ document: row.document, taxpayerId: sellers[index].taxpayerId })), ...input.buyers.map((row, index) => ({ document: row.document, taxpayerId: buyers[index].taxpayerId }))].find(row => row.document === debtorDocument);
    if (!debtor) throw new Error("Informe o CPF/CNPJ do devedor entre as partes da transmissão.");
    const interested = requireItbiRecord((await tx.select({ personId: taxpayers.personId, companyId: taxpayers.companyId }).from(taxpayers).where(eq(taxpayers.id, buyers[0].taxpayerId)).limit(1))[0]);
    const process = await openExternalServiceProcess(tx, { actorId: usuarioId, processTypeId: context.policy.processTypeId, subjectId: context.policy.subjectId, personId: interested.personId, companyId: interested.companyId, description: input.description, purpose: "ITBI_ONLINE" });
    const dueDate = new Date(); dueDate.setUTCDate(dueDate.getUTCDate() + context.policy.dueDays);
    const declaration = await createItbiDeclarationInTransaction(tx, { usuarioId, employeeId: null, allowedBudgetUnitIds: [context.policy.budgetUnitId] }, { transactionTypeId: input.transactionTypeId, realEstateId: property.id, processId: process.id, registryOffice: context.notary.title, transmittedFractionPercent: input.fractionPercent, declaredPropertyValue: input.declaredValue, sellerTaxpayerId: sellers[0].taxpayerId, sellers, buyers, debtorTaxpayerId: debtor.taxpayerId, cadastralUpdateMode: "AUTO_ON_PAYMENT", dueDate: dueDate.toISOString().slice(0, 10), valuationRuleId: context.policy.valuationRuleId, forms: input.forms.map(form => ({ catalogId: form.catalogId, values: form.values, documentIds: [] })) });
    const declarationScope = taxScopeSnapshot(declaration.calculationSnapshot);
    if (declarationScope.budgetUnitId !== context.policy.budgetUnitId || declarationScope.governmentEntityId !== context.policy.governmentEntityId) throw new Error("Origem arrecadadora do ITBI diverge da configuração on-line.");
    if (declarationScope.requiresDebtClearance === true && declaration.blockingTaxDebt.gt(0)) throw new Error("O imóvel possui débitos impeditivos conforme a modalidade de transmissão.");
    await tx.insert(processCitizenAccesses).values({ processId: process.id, usuarioId, grantedByUsuarioId: context.policy.workerUsuarioId, reason: "Acesso do autor à solicitação de ITBI on-line." });
    await updateItbiDeclaration(tx, declaration.id, { status: "PROTOCOLADA", calculationSnapshot: itbiJson({ ...declarationScope, channel: "ONLINE", notaryId: context.notary.entityId, onlinePolicyId: context.policyEntry.id }) }, { eventType: "DECLARACAO_ONLINE_PROTOCOLADA", description: input.description, actorUsuarioId: usuarioId });
    await tx.insert(portalTaxServiceRequests).values({ serviceType: "ITBI", status: "EM_ANALISE_INTERNA", taxpayerId: buyers[0].taxpayerId, processId: process.id, notes: declaration.declarationNumber });
    const calculatedPropertyValue = new Decimal(String(declarationScope.propertyValue));
    const externalActor = { usuarioId, employeeId: null, allowedBudgetUnitIds: [context.policy.budgetUnitId] };
    for (const attachment of prepared) {
      const documentId = attachment.documentId!; const data = taxScopeSnapshot(attachment.data);
      await insertItbiProcessDocument(tx, { processId: process.id, documentId, purpose: "Anexo apresentado na inclusão on-line de ITBI" });
      await insertItbiRegistryEntry(tx, { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_PROCESS_MESSAGE", title: attachment.title, actorUsuarioId: usuarioId, processId: process.id, documentId, data: { governmentEntityId: context.policy.governmentEntityId, budgetUnitId: context.policy.budgetUnitId, kind: "ATTACHMENT", external: true, usuarioId, documentId, filename: attachment.title, url: data.url ?? null, draftAttachmentId: attachment.id } });
    }
    await linkItbiPropertyAttachments(tx, externalActor, declaration.id, input.attachmentIds);
    if (input.requestContestation) {
      if (!calculatedPropertyValue.gt(input.declaredValue) || !input.contestationReason.trim()) throw new Error("Impugnação inicial exige avaliação municipal superior ao declarado e justificativa.");
      if (!input.attachmentIds.length) throw new Error("Anexe ao menos um documento comprobatório para solicitar a impugnação na inclusão.");
      const current = await readItbiDeclaration(tx, declaration.id);
      await requestItbiContestationInTransaction(tx, externalActor, { declarationId: declaration.id, expectedUpdatedAt: current.updatedAt.toISOString(), reason: input.contestationReason.trim(), documentIds: input.attachmentIds, proposedPropertyValue: declaration.declaredPropertyValue.toFixed(2) });
    } else if (context.policy.releaseMode === "AUTOMATIC") {
      await analyzeItbiInTransaction(tx, worker, { declarationId: declaration.id, approved: true, notes: context.policy.legalBasis });
      await issueItbiDamInTransaction(tx, worker, declaration.id);
      await generateItbiDocumentInTransaction(tx, worker, declaration.id);
    }
    await insertItbiRegistryEntry(tx, { entityType: "ONLINE_ITBI_REQUEST", entityId: `${usuarioId}:${input.requestKey}`, category: "ONLINE_ITBI_REQUEST", title: declaration.declarationNumber, processId: process.id, actorUsuarioId: usuarioId, data: { governmentEntityId: context.policy.governmentEntityId, budgetUnitId: context.policy.budgetUnitId, declarationId: declaration.id, policyId: context.policyEntry.id, requestHash: requestHash(input), request: input } });
    await auditItbi(tx, { action: "SUBMIT_ONLINE_ITBI", entityType: "ItbiDeclaration", entityId: declaration.id, authorUsuarioId: usuarioId, payload: { policyId: context.policyEntry.id, notaryVersionId: context.notary.id, processId: process.id, releaseMode: context.policy.releaseMode, requestContestation: input.requestContestation } });
    return { declarationId: declaration.id, processId: process.id };
  }, { isolationLevel: "serializable", timeoutMs: 120000 });
}
