import { createHash } from "node:crypto";
import { and, asc, desc, eq, ilike, inArray, ne, or } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { companies, documents, taxpayers } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { economicRegistrations } from "@/db/schema/taxation-core";
import { taxInvoices, nfseInvoiceData } from "@/db/schema/taxation-nfse";
import { dteMailboxes } from "@/db/schema/taxation-dte";
import { simplesImportBatches, simplesFiscalRecords, simplesOptionPeriods, simplesPaymentAllocations, simplesDivergences, simplesRegularizationEvents, simplesExclusionCases } from "@/db/schema/tax-collection-operations";
import { collectionJson as json, collectionRow, lockCollectionOperation, publishCollectionMessage } from "@/db/repositories/tax-collection-operations/shared";
import type { TaxActor } from "./index";
import { buildExclusionExport, calculateSimplesCrossCheck, classifySimplesDivergences, TributarioS5Error } from "./s5-engine";
import { updateEconomicRegistrationWithHistoryInTransaction } from "./economic-history";

const sources = new Set(["PGDAS", "DASN_DEFIS", "DAF607", "PERIODOS_OPCAO", "PARCELAMENTOS", "PGFN", "OUTROS", "PGDAS_RETIFICACAO"]);
const required = (value: string, label: string) => { const text = value.trim(); if (!text) throw new TributarioS5Error(`${label} é obrigatório.`); return text; };
const decimal = (value: unknown) => new Decimal(String(value ?? 0)).toDecimalPlaces(2);
function competenceDate(value: string) { const match = value.match(/^(0[1-9]|1[0-2])\/(\d{4})$/); if (!match) throw new TributarioS5Error("Competência deve estar no formato MM/AAAA."); return new Date(Date.UTC(Number(match[2]), Number(match[1]) - 1, 1, 12)); }

export type SimplesImportRow = { taxpayerId: string; competence?: string; recordType?: string; nationalRevenue?: number; declaredService?: number; taxableBase?: number; rate?: number; municipalIss?: number; confirmedPayment?: number; nationalDasTotal?: number; activityCode?: string; paymentCode?: string; isEstimate?: boolean; regime?: string; startDate?: string; endDate?: string; raw?: unknown };
type ImportInput = { sourceType: string; fileName: string; competence?: string; rows: SimplesImportRow[] };

async function importBatch(tx: DatabaseTransaction, actor: TaxActor, input: ImportInput) {
  const sourceType = required(input.sourceType, "Origem");
  if (!sources.has(sourceType)) throw new TributarioS5Error("Origem de importação não suportada.");
  if (!input.rows.length) throw new TributarioS5Error("O lote deve conter registros.");
  if (input.competence) competenceDate(input.competence);
  const normalized = { sourceType, fileName: required(input.fileName, "Nome do arquivo"), competence: input.competence || null, rows: input.rows };
  const checksum = createHash("sha256").update(JSON.stringify(normalized)).digest("hex");
  await lockCollectionOperation(tx, `SIMPLES-IMPORT:${checksum}`);
  const existing = (await tx.select().from(simplesImportBatches).where(eq(simplesImportBatches.checksum, checksum)).limit(1))[0];
  if (existing) return existing;
  const taxpayerIds = [...new Set(input.rows.map(row => row.taxpayerId))];
  const valid = await tx.select({ id: taxpayers.id }).from(taxpayers).where(and(inArray(taxpayers.id, taxpayerIds), eq(taxpayers.status, "Ativo")));
  const validIds = new Set(valid.map(row => row.id));
  const accepted = input.rows.filter(row => validIds.has(row.taxpayerId));
  const rejected = input.rows.length - accepted.length;
  const batch = collectionRow(await tx.insert(simplesImportBatches).values({ sourceType, fileName: normalized.fileName, checksum, competence: input.competence || null, totalRows: input.rows.length, acceptedRows: accepted.length, rejectedRows: rejected, status: rejected ? "PROCESSADO_COM_REJEICOES" : "PROCESSADO", payload: json(normalized), errorSummary: rejected ? { rejectedRows: rejected, reason: "Contribuinte não localizado ou inativo." } : undefined, createdByUsuarioId: actor.usuarioId }).returning());
  for (const row of accepted) {
    const competence = row.competence || input.competence || "";
    competenceDate(competence);
    await tx.insert(simplesFiscalRecords).values({ importBatchId: batch.id, taxpayerId: row.taxpayerId, competence, recordType: row.recordType || sourceType, nationalRevenueDecimal: decimal(row.nationalRevenue), declaredServiceDecimal: decimal(row.declaredService), taxableBaseDecimal: decimal(row.taxableBase ?? row.declaredService), rate: row.rate == null ? null : new Decimal(String(row.rate)), municipalIssDecimal: decimal(row.municipalIss), confirmedPaymentDecimal: decimal(row.confirmedPayment), activityCode: row.activityCode?.trim() || null, paymentCode: row.paymentCode?.trim() || null, isEstimate: Boolean(row.isEstimate), rawData: json(row.raw ?? row) });
    if (sourceType === "PERIODOS_OPCAO") {
      const startDate = row.startDate ? new Date(`${row.startDate}T12:00:00.000Z`) : competenceDate(competence);
      const endDate = row.endDate ? new Date(`${row.endDate}T12:00:00.000Z`) : null;
      const regime = row.regime || "Simples Nacional";
      await tx.insert(simplesOptionPeriods).values({ taxpayerId: row.taxpayerId, regime, startDate, endDate, sourceBatchId: batch.id }).onConflictDoUpdate({ target: [simplesOptionPeriods.taxpayerId, simplesOptionPeriods.regime, simplesOptionPeriods.startDate], set: { endDate, sourceBatchId: batch.id, status: "ATIVO" } });
      const registrations = await tx.select({ id: economicRegistrations.id }).from(economicRegistrations).where(eq(economicRegistrations.taxpayerId, row.taxpayerId)).orderBy(asc(economicRegistrations.id));
      for (const registration of registrations) await updateEconomicRegistrationWithHistoryInTransaction(tx, actor, registration.id, { taxRegime: regime });
    }
    if (sourceType === "DAF607") {
      const cross = calculateSimplesCrossCheck({ nfseService: 0, declaredService: 0, municipalIssDeclared: row.municipalIss ?? 0, daf607Confirmed: row.confirmedPayment ?? 0, nationalDasTotal: row.nationalDasTotal ?? row.nationalRevenue ?? 0 });
      await tx.insert(simplesPaymentAllocations).values({ importBatchId: batch.id, taxpayerId: row.taxpayerId, competence, revenueCode: row.paymentCode?.trim() || "ISS_SN", taxpayerRegime: row.regime || "SIMPLES_NACIONAL", nationalDasDecimal: cross.nationalDasTotal, municipalComponentDecimal: cross.municipalIssDeclared, confirmedDecimal: cross.daf607Confirmed, differenceDecimal: cross.paymentDifference });
    }
  }
  return batch;
}

export async function importSimplesBatch(db: DatabaseConnection, actor: TaxActor, input: ImportInput) {
  return withDatabaseTransaction(db, tx => importBatch(tx, actor, input), { timeoutMs: 20_000 });
}

async function processDivergences(tx: DatabaseTransaction, actor: TaxActor, competence: string) {
  competenceDate(competence);
  await lockCollectionOperation(tx, `SIMPLES-MALHA:${competence}`);
  const [records, invoices, opted, registrations] = await Promise.all([
    tx.select().from(simplesFiscalRecords).where(and(eq(simplesFiscalRecords.competence, competence), eq(simplesFiscalRecords.status, "VALIDO"))).orderBy(desc(simplesFiscalRecords.createdAt)),
    tx.select({ id: taxInvoices.id, providerId: taxInvoices.providerId, serviceValueDecimal: taxInvoices.serviceValueDecimal, serviceValue: taxInvoices.serviceValue }).from(taxInvoices).where(and(eq(taxInvoices.competence, competence), eq(taxInvoices.status, "Emitida"))),
    tx.select().from(simplesOptionPeriods).where(eq(simplesOptionPeriods.status, "ATIVO")),
    tx.select().from(economicRegistrations).where(or(ilike(economicRegistrations.taxRegime, "%Simples%"), ilike(economicRegistrations.taxRegime, "%SIMEI%"))),
  ]);
  const fiscal = invoices.length ? await tx.select().from(nfseInvoiceData).where(inArray(nfseInvoiceData.invoiceId, invoices.map(row => row.id))) : [];
  const fiscalMap = new Map(fiscal.map(row => [row.invoiceId, row]));
  const newest = new Map<string, typeof records[number]>();
  for (const record of records) { const key = `${record.taxpayerId}:${record.recordType}`; if (!newest.has(key)) newest.set(key, record); }
  const taxpayerIds = new Set([...records.map(row => row.taxpayerId), ...invoices.map(row => row.providerId), ...opted.map(row => row.taxpayerId), ...registrations.map(row => row.taxpayerId)]);
  const activeTypes = new Map<string, Set<string>>();
  let processed = 0;
  for (const taxpayerId of taxpayerIds) {
    const declaration = ["PGDAS_RETIFICACAO", "PGDAS", "DASN_DEFIS"].map(type => newest.get(`${taxpayerId}:${type}`)).find(Boolean);
    const payment = newest.get(`${taxpayerId}:DAF607`);
    const taxpayerInvoices = invoices.filter(row => row.providerId === taxpayerId);
    const nfseService = taxpayerInvoices.reduce((sum, row) => sum.plus(row.serviceValueDecimal ?? row.serviceValue), new Decimal(0));
    const cross = calculateSimplesCrossCheck({ nfseService, declaredService: declaration?.declaredServiceDecimal ?? new Decimal(0), municipalIssDeclared: declaration?.municipalIssDecimal ?? new Decimal(0), daf607Confirmed: payment?.confirmedPaymentDecimal ?? new Decimal(0), nationalDasTotal: payment?.nationalRevenueDecimal ?? 0 });
    const expectedRate = taxpayerInvoices.length ? taxpayerInvoices.map(row => fiscalMap.get(row.id)?.rate).find(Boolean) : null;
    const types = classifySimplesDivergences({ expected: opted.some(row => row.taxpayerId === taxpayerId) || registrations.some(row => row.taxpayerId === taxpayerId), nfseService: Number(cross.nfseService), declaredService: Number(cross.declaredService), revenueDifference: Number(cross.revenueDifference), municipalIssDeclared: Number(cross.municipalIssDeclared), paymentDifference: Number(cross.paymentDifference), declaredRate: declaration?.rate ? Number(declaration.rate) : null, expectedRate: expectedRate ? Number(expectedRate) : null, activityCode: declaration?.activityCode, isEstimate: declaration?.isEstimate });
    activeTypes.set(taxpayerId, new Set(types));
    for (const divergenceType of types) {
      const predicate = and(eq(simplesDivergences.taxpayerId, taxpayerId), eq(simplesDivergences.competence, competence), eq(simplesDivergences.divergenceType, divergenceType));
      const existing = (await tx.select({ id: simplesDivergences.id }).from(simplesDivergences).where(predicate).limit(1))[0];
      const values = { nfseServiceDecimal: cross.nfseService, declaredServiceDecimal: cross.declaredService, revenueDifferenceDecimal: cross.revenueDifference, municipalIssDecimal: cross.municipalIssDeclared, confirmedPaymentDecimal: cross.daf607Confirmed, paymentDifferenceDecimal: cross.paymentDifference, details: json({ paymentBasis: cross.paymentBasis, nationalDasTotal: cross.nationalDasTotal.toFixed(2), activityCode: declaration?.activityCode ?? null, declaredRate: declaration?.rate?.toString() ?? null, expectedRate: expectedRate?.toString() ?? null }) };
      const divergence = existing
        ? collectionRow(await tx.update(simplesDivergences).set({ ...values, status: "ABERTA", resolvedAt: null, lastProcessedAt: new Date() }).where(eq(simplesDivergences.id, existing.id)).returning())
        : collectionRow(await tx.insert(simplesDivergences).values({ ...values, taxpayerId, competence, divergenceType }).returning());
      await tx.insert(simplesRegularizationEvents).values({ divergenceId: divergence.id, eventType: existing ? "REPROCESSADA" : "IDENTIFICADA", description: existing ? `Malha reprocessada para ${competence}.` : `Malha ${divergenceType} processada para ${competence}.`, actorUsuarioId: actor.usuarioId });
      processed++;
    }
  }
  const existing = await tx.select().from(simplesDivergences).where(and(eq(simplesDivergences.competence, competence), ne(simplesDivergences.status, "RESOLVIDA")));
  for (const divergence of existing) if (!activeTypes.get(divergence.taxpayerId)?.has(divergence.divergenceType)) {
    await tx.update(simplesDivergences).set({ status: "RESOLVIDA", resolvedAt: new Date(), lastProcessedAt: new Date() }).where(eq(simplesDivergences.id, divergence.id));
    await tx.insert(simplesRegularizationEvents).values({ divergenceId: divergence.id, eventType: "RESOLVIDA", description: "Divergência não foi reproduzida no reprocessamento.", actorUsuarioId: actor.usuarioId });
  }
  return { processed, taxpayers: taxpayerIds.size };
}

export async function processSimplesDivergences(db: DatabaseConnection, actor: TaxActor, competence: string) {
  return withDatabaseTransaction(db, tx => processDivergences(tx, actor, competence));
}

export async function communicateSimplesDivergence(db: DatabaseConnection, actor: TaxActor, divergenceId: string) {
  return withDatabaseTransaction(db, async tx => {
    const divergence = (await tx.select().from(simplesDivergences).where(eq(simplesDivergences.id, divergenceId)).for("update"))[0];
    if (!divergence || divergence.status === "RESOLVIDA") throw new TributarioS5Error("Divergência não está disponível para comunicação.");
    const mailbox = (await tx.select().from(dteMailboxes).where(and(eq(dteMailboxes.taxpayerId, divergence.taxpayerId), eq(dteMailboxes.status, "ATIVA"))).limit(1))[0];
    if (!mailbox) throw new TributarioS5Error("Contribuinte sem caixa DTE ativa; configure-a na revisão final ou envie por canal formal externo.");
    const message = await publishCollectionMessage(tx, { mailboxId: mailbox.id, categoryCode: "AUTORREGULARIZACAO_SN", categoryName: "Autorregularização do Simples Nacional", deadlineDays: 15, subject: `Autorregularização ${divergence.competence}`, body: `Foi identificada a divergência ${divergence.divergenceType}. Revise a declaração e apresente retificação pelos canais municipais.`, key: `SN-DIVERGENCIA:${divergence.id}`, actorUsuarioId: actor.usuarioId, description: "Comunicação de autorregularização disponibilizada no DTE." });
    await tx.update(simplesDivergences).set({ status: "COMUNICADA", dteMessageId: message.id }).where(eq(simplesDivergences.id, divergence.id));
    await tx.insert(simplesRegularizationEvents).values({ divergenceId: divergence.id, eventType: "COMUNICADA", description: "Comunicação registrada no DTE.", actorUsuarioId: actor.usuarioId, payload: { dteMessageId: message.id } });
    return message;
  });
}

export async function rectifySimplesDivergence(db: DatabaseConnection, actor: TaxActor, input: { divergenceId: string; declaredService: number; municipalIss: number; rate: number; activityCode: string }) {
  return withDatabaseTransaction(db, async tx => {
    const candidate = (await tx.select({ competence: simplesDivergences.competence }).from(simplesDivergences).where(eq(simplesDivergences.id, input.divergenceId)).limit(1))[0];
    if (!candidate) throw new TributarioS5Error("Divergência indisponível para retificação.");
    // Same order as reprocessing: competence advisory before any divergence row.
    await lockCollectionOperation(tx, `SIMPLES-MALHA:${candidate.competence}`);
    const divergence = (await tx.select().from(simplesDivergences).where(eq(simplesDivergences.id, input.divergenceId)).for("update"))[0];
    if (!divergence || divergence.status === "RESOLVIDA") throw new TributarioS5Error("Divergência indisponível para retificação.");
    const batch = await importBatch(tx, actor, { sourceType: "PGDAS_RETIFICACAO", fileName: `retificacao-${divergence.id}.json`, competence: divergence.competence, rows: [{ taxpayerId: divergence.taxpayerId, competence: divergence.competence, recordType: "PGDAS_RETIFICACAO", declaredService: input.declaredService, taxableBase: input.declaredService, municipalIss: input.municipalIss, rate: input.rate, activityCode: input.activityCode, raw: { source: "AUTORREGULARIZACAO_INTERNA", divergenceId: divergence.id } }] });
    await tx.update(simplesDivergences).set({ status: "RETIFICADA" }).where(eq(simplesDivergences.id, divergence.id));
    await tx.insert(simplesRegularizationEvents).values({ divergenceId: divergence.id, eventType: "RETIFICADA", description: "Retificação interna protocolada; aguardando reprocessamento.", actorUsuarioId: actor.usuarioId, payload: { batchId: batch.id } });
    await processDivergences(tx, actor, divergence.competence);
    return batch;
  });
}

export async function prepareSimplesExclusion(db: DatabaseConnection, actor: TaxActor, input: { taxpayerId: string; competence: string; reason: string; calendarRevenue: number; legalLimit: number }) {
  competenceDate(input.competence);
  return withDatabaseTransaction(db, async tx => {
    const taxpayer = (await tx.select({ id: taxpayers.id, cnpj: companies.cnpj, cpf: people.cpf }).from(taxpayers).leftJoin(companies, eq(companies.id, taxpayers.companyId)).leftJoin(people, eq(people.id, taxpayers.personId)).where(eq(taxpayers.id, input.taxpayerId)).limit(1))[0];
    if (!taxpayer) throw new TributarioS5Error("Contribuinte não encontrado.");
    const exportContent = buildExclusionExport({ taxpayerDocument: taxpayer.cnpj ?? taxpayer.cpf ?? "", competence: input.competence, reason: required(input.reason, "Motivo"), calendarRevenue: decimal(input.calendarRevenue).toFixed(2), legalLimit: decimal(input.legalLimit).toFixed(2) });
    const item = collectionRow(await tx.insert(simplesExclusionCases).values({ taxpayerId: taxpayer.id, competence: input.competence, reason: input.reason.trim(), calendarRevenueDecimal: decimal(input.calendarRevenue), legalLimitDecimal: decimal(input.legalLimit), exportContent, createdByUsuarioId: actor.usuarioId }).returning());
    const document = collectionRow(await tx.insert(documents).values({ title: `Preparação de exclusão do Simples ${input.competence}`, documentType: "SIMPLES_NACIONAL_EXCLUSAO", fileUrl: `/tributacao/simples-nacional/exclusoes/${item.id}/documento`, status: "Válido", publicLabel: "Preparação interna para análise", notes: "Não representa exclusão efetivada na Receita Federal." }).returning());
    return collectionRow(await tx.update(simplesExclusionCases).set({ documentId: document.id, status: "DOCUMENTO_GERADO" }).where(eq(simplesExclusionCases.id, item.id)).returning());
  });
}

export async function communicateSimplesExclusion(db: DatabaseConnection, actor: TaxActor, id: string) {
  return withDatabaseTransaction(db, async tx => {
    const item = (await tx.select().from(simplesExclusionCases).where(eq(simplesExclusionCases.id, id)).for("update"))[0];
    if (!item?.documentId) throw new TributarioS5Error("Gere o documento antes da comunicação.");
    const mailbox = (await tx.select().from(dteMailboxes).where(and(eq(dteMailboxes.taxpayerId, item.taxpayerId), eq(dteMailboxes.status, "ATIVA"))).limit(1))[0];
    if (!mailbox) throw new TributarioS5Error("Contribuinte sem caixa DTE ativa.");
    const message = await publishCollectionMessage(tx, { mailboxId: mailbox.id, categoryCode: "SIMPLES_EXCLUSAO", categoryName: "Preparação para exclusão do Simples", deadlineDays: 30, subject: "Comunicação municipal sobre o Simples Nacional", body: `${item.reason}. Esta comunicação registra preparação municipal e não afirma exclusão efetivada na RFB.`, documentId: item.documentId, key: `SN-EXCLUSAO:${item.id}`, actorUsuarioId: actor.usuarioId, description: "Comunicação de preparação para exclusão disponibilizada." });
    return collectionRow(await tx.update(simplesExclusionCases).set({ status: "COMUNICADA", dteMessageId: message.id }).where(eq(simplesExclusionCases.id, item.id)).returning());
  });
}
