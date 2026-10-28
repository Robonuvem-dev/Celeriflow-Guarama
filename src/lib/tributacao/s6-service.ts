import { createHash, randomUUID } from "node:crypto";
import { and, eq, inArray } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor, type DatabaseTransaction } from "@/db/transaction";
import { Decimal } from "@/db/decimal";
import { documents } from "@/db/schema/registry";
import { taxes, taxAssessments, taxGuides, taxInfractions } from "@/db/schema/taxation-core";
import { processes, processDocuments } from "@/db/schema/processes";
import { dteMailboxes } from "@/db/schema/taxation-dte";
import { desifInstitutions, desifAgencies, desifPgccPlans, desifPgccAccounts, desifCosifAccounts, desifPgccCosifLinks, desifSubtitles, desifTariffs, desifPackages, desifPackageItems, desifImportBatches, desifAssessments, desifTrialBalances, desifPackageMovements, desifFiscalCases, desifFiscalEvents } from "@/db/schema/tax-collection-operations";
import { collectionJson as json, collectionRow, lockCollectionOperation, publishCollectionMessage } from "@/db/repositories/tax-collection-operations/shared";
import { calculateDesifAssessment, calculatePackageMovement, calculateTrialBalance, canIssueDesifReceipt, TributarioS6Error } from "./s6-engine";

type Actor = { usuarioId: string; employeeId?: string | null };
type AssessmentRow = { agencyId: string; subtitleId: string; revenue: number; deduction?: number; rate?: number; credit?: number; debitAdjustment?: number };
type TrialRow = { agencyId: string; pgccAccountId: string; openingBalance: number; credits: number; debits: number; declaredClose: number; nature: "CREDORA" | "DEVEDORA" };
type PackageRow = { agencyId: string; packageId: string; accountHolders: number; collectedRevenue: number; rate: number };
export type DesifPayload = { assessments?: AssessmentRow[]; trialBalances?: TrialRow[]; packageMovements?: PackageRow[] };

function date(value: string) { const result = new Date(`${value}T12:00:00.000Z`); if (Number.isNaN(result.getTime())) throw new TributarioS6Error("Informe uma data válida."); return result; }
function competenceDate(value: string) { if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(value)) throw new TributarioS6Error("Competência deve estar no formato AAAA-MM."); return new Date(`${value}-01T12:00:00.000Z`); }
function digits(value: string) { return value.replace(/\D/g, ""); }

export async function createDesifInstitution(db: DatabaseConnection, input: { taxpayerId?: string; name: string; baseCnpj: string; validFrom: string }) {
  const baseCnpj = digits(input.baseCnpj).slice(0, 8);
  if (baseCnpj.length !== 8) throw new TributarioS6Error("Informe os oito dígitos do CNPJ base.");
  return withDatabaseTransaction(db, async tx => collectionRow(await tx.insert(desifInstitutions).values({ taxpayerId: input.taxpayerId || null, name: input.name.trim(), baseCnpj, validFrom: date(input.validFrom) }).onConflictDoUpdate({ target: desifInstitutions.baseCnpj, set: { taxpayerId: input.taxpayerId || null, name: input.name.trim(), status: "ATIVA" } }).returning()));
}

export async function createDesifAgency(db: DatabaseConnection, input: { institutionId: string; economicRegistrationId?: string; code: string; name: string; fullCnpj: string; municipalRegistration?: string; validFrom: string }) {
  const fullCnpj = digits(input.fullCnpj);
  if (fullCnpj.length !== 14) throw new TributarioS6Error("O CNPJ completo da agência deve ter 14 dígitos.");
  return withDatabaseTransaction(db, async tx => {
    const institution = (await tx.select().from(desifInstitutions).where(eq(desifInstitutions.id, input.institutionId)).limit(1))[0];
    if (!institution || !fullCnpj.startsWith(institution.baseCnpj)) throw new TributarioS6Error("A agência deve usar o mesmo CNPJ base da instituição.");
    return collectionRow(await tx.insert(desifAgencies).values({ institutionId: input.institutionId, economicRegistrationId: input.economicRegistrationId || null, code: input.code.trim(), name: input.name.trim(), fullCnpj, municipalRegistration: input.municipalRegistration || null, validFrom: date(input.validFrom) }).onConflictDoUpdate({ target: desifAgencies.fullCnpj, set: { economicRegistrationId: input.economicRegistrationId || null, name: input.name.trim(), municipalRegistration: input.municipalRegistration || null, status: "ATIVA" } }).returning());
  });
}

export async function createDesifCatalog(db: DatabaseConnection, input: { institutionId: string; version: string; validFrom: string; pgccCode: string; pgccName: string; cosifCode: string; cosifName: string; subtitleCode: string; subtitleName: string; rate: number; tariffCode: string; tariffName: string; tariffAmount: number; packageCode: string; packageName: string }) {
  const validFrom = date(input.validFrom);
  return withDatabaseTransaction(db, async tx => {
    const plan = collectionRow(await tx.insert(desifPgccPlans).values({ institutionId: input.institutionId, version: input.version, validFrom }).onConflictDoUpdate({ target: [desifPgccPlans.institutionId, desifPgccPlans.version], set: { status: "ATIVO" } }).returning());
    const pgcc = collectionRow(await tx.insert(desifPgccAccounts).values({ planId: plan.id, code: input.pgccCode, name: input.pgccName, desifTaxCode: "ISS-BANCARIO", serviceItem: "15.01" }).onConflictDoUpdate({ target: [desifPgccAccounts.planId, desifPgccAccounts.code], set: { name: input.pgccName, active: true } }).returning());
    const cosif = collectionRow(await tx.insert(desifCosifAccounts).values({ code: input.cosifCode, name: input.cosifName, level: 4, nature: "CREDORA", validFrom }).onConflictDoUpdate({ target: [desifCosifAccounts.code, desifCosifAccounts.validFrom], set: { name: input.cosifName, active: true } }).returning());
    await tx.insert(desifPgccCosifLinks).values({ pgccAccountId: pgcc.id, cosifAccountId: cosif.id, validFrom }).onConflictDoUpdate({ target: [desifPgccCosifLinks.pgccAccountId, desifPgccCosifLinks.cosifAccountId, desifPgccCosifLinks.validFrom], set: { validUntil: null } });
    const subtitle = collectionRow(await tx.insert(desifSubtitles).values({ pgccAccountId: pgcc.id, code: input.subtitleCode, name: input.subtitleName, serviceItem: "15.01", taxRate: new Decimal(input.rate), validFrom }).onConflictDoUpdate({ target: [desifSubtitles.pgccAccountId, desifSubtitles.code, desifSubtitles.validFrom], set: { name: input.subtitleName, taxRate: new Decimal(input.rate), active: true } }).returning());
    const tariff = collectionRow(await tx.insert(desifTariffs).values({ institutionId: input.institutionId, code: input.tariffCode, name: input.tariffName, amountDecimal: new Decimal(input.tariffAmount), validFrom }).onConflictDoUpdate({ target: [desifTariffs.institutionId, desifTariffs.code, desifTariffs.validFrom], set: { name: input.tariffName, amountDecimal: new Decimal(input.tariffAmount), active: true } }).returning());
    const pack = collectionRow(await tx.insert(desifPackages).values({ institutionId: input.institutionId, code: input.packageCode, name: input.packageName, validFrom }).onConflictDoUpdate({ target: [desifPackages.institutionId, desifPackages.code, desifPackages.validFrom], set: { name: input.packageName, active: true } }).returning());
    await tx.insert(desifPackageItems).values({ packageId: pack.id, tariffId: tariff.id, quantity: 1 }).onConflictDoUpdate({ target: [desifPackageItems.packageId, desifPackageItems.tariffId], set: { quantity: 1 } });
    return { plan, pgcc, cosif, subtitle, tariff, package: pack };
  });
}

export async function receiveDesifImport(db: DatabaseConnection, actor: Actor, input: { institutionId: string; agencyId?: string; competence: string; moduleType: string; fileName: string; abrasfVersion: string; signaturePolicy?: "NAO_CONFIGURADA" | "ASSINATURA_INTERNA"; payload: DesifPayload }) {
  competenceDate(input.competence);
  const raw = JSON.stringify(input.payload);
  const checksum = createHash("sha256").update(`${input.institutionId}:${input.competence}:${input.fileName}:${raw}`).digest("hex");
  return withDatabaseTransaction(db, async tx => {
    const institution = (await tx.select().from(desifInstitutions).where(eq(desifInstitutions.id, input.institutionId)).limit(1))[0];
    if (!institution) throw new TributarioS6Error("Instituição financeira não encontrada.");
    if (input.agencyId) {
      const agency = (await tx.select().from(desifAgencies).where(eq(desifAgencies.id, input.agencyId)).limit(1))[0];
      if (!agency || agency.institutionId !== institution.id) throw new TributarioS6Error("A agência informada não pertence à instituição.");
    }
    await lockCollectionOperation(tx, `DESIF-IMPORT:${checksum}`);
    const existing = (await tx.select().from(desifImportBatches).where(eq(desifImportBatches.checksum, checksum)).limit(1))[0];
    if (existing) return existing;
    return collectionRow(await tx.insert(desifImportBatches).values({ institutionId: institution.id, agencyId: input.agencyId || null, competence: input.competence, moduleType: input.moduleType, fileName: input.fileName, checksum, abrasfVersion: input.abrasfVersion, signaturePolicy: input.signaturePolicy ?? "NAO_CONFIGURADA", signatureStatus: input.signaturePolicy === "ASSINATURA_INTERNA" ? "PENDENTE" : "NAO_VERIFICADA", payload: json(input.payload), createdByUsuarioId: actor.usuarioId }).returning());
  });
}

export async function validateDesifImport(db: DatabaseConnection, actor: Actor, batchId: string) {
  return withDatabaseTransaction(db, async tx => {
    const batch = (await tx.select().from(desifImportBatches).where(eq(desifImportBatches.id, batchId)).for("update"))[0];
    if (!batch || batch.status === "PROCESSADO") throw new TributarioS6Error("Importação indisponível para validação.");
    const payload = batch.payload as DesifPayload;
    const issues: string[] = [];
    if (!batch.abrasfVersion.trim()) issues.push("Versão do leiaute não informada.");
    if (!(payload.assessments?.length || payload.trialBalances?.length || payload.packageMovements?.length)) issues.push("Arquivo sem registros reconhecidos.");
    const agencyIds = [...new Set([...(payload.assessments ?? []).map(row => row.agencyId), ...(payload.trialBalances ?? []).map(row => row.agencyId), ...(payload.packageMovements ?? []).map(row => row.agencyId)])];
    const agencies = agencyIds.length ? await tx.select().from(desifAgencies).where(inArray(desifAgencies.id, agencyIds)) : [];
    if (agencies.some(row => row.institutionId !== batch.institutionId) || agencies.length !== agencyIds.length) issues.push("Há agência inexistente ou vinculada a outra instituição.");
    const subtitleIds = [...new Set((payload.assessments ?? []).map(row => row.subtitleId))];
    const subtitles = subtitleIds.length ? await tx.select({ id: desifSubtitles.id }).from(desifSubtitles).where(and(inArray(desifSubtitles.id, subtitleIds), eq(desifSubtitles.active, true))) : [];
    if (subtitleIds.length !== subtitles.length) issues.push("Há subtítulo inexistente ou inativo.");
    const accountIds = [...new Set((payload.trialBalances ?? []).map(row => row.pgccAccountId))];
    const accounts = accountIds.length ? await tx.select({ id: desifPgccAccounts.id }).from(desifPgccAccounts).where(and(inArray(desifPgccAccounts.id, accountIds), eq(desifPgccAccounts.active, true))) : [];
    if (accountIds.length !== accounts.length) issues.push("Há conta PGCC inexistente ou inativa.");
    const packageIds = [...new Set((payload.packageMovements ?? []).map(row => row.packageId))];
    const packages = packageIds.length ? await tx.select({ id: desifPackages.id }).from(desifPackages).where(and(inArray(desifPackages.id, packageIds), eq(desifPackages.active, true))) : [];
    if (packageIds.length !== packages.length) issues.push("Há pacote inexistente ou inativo.");
    for (const row of payload.assessments ?? []) {
      try { calculateDesifAssessment({ revenue: row.revenue, deduction: row.deduction, rate: row.rate ?? 0, credit: row.credit, debitAdjustment: row.debitAdjustment }); }
      catch (error) { issues.push(error instanceof Error ? error.message : "Apuração inválida."); }
    }
    return collectionRow(await tx.update(desifImportBatches).set({ status: issues.length ? "INCONSISTENTE" : "VALIDADO", inconsistencies: json(issues), validationSummary: { records: (payload.assessments?.length ?? 0) + (payload.trialBalances?.length ?? 0) + (payload.packageMovements?.length ?? 0), issues: issues.length, validatedBy: actor.usuarioId }, validatedAt: new Date(), signatureStatus: batch.signaturePolicy === "ASSINATURA_INTERNA" ? "ASSINADA_INTERNAMENTE" : "NAO_VERIFICADA" }).where(eq(desifImportBatches.id, batch.id)).returning());
  });
}

export async function processDesifImport(db: DatabaseConnection, actor: Actor, batchId: string) {
  return withDatabaseTransaction(db, async tx => {
    const batch = (await tx.select().from(desifImportBatches).where(eq(desifImportBatches.id, batchId)).for("update"))[0];
    if (!batch || batch.status !== "VALIDADO") throw new TributarioS6Error("Somente arquivo validado e sem inconsistências pode ser processado.");
    const payload = batch.payload as DesifPayload;
    for (const row of payload.assessments ?? []) {
      const subtitle = (await tx.select().from(desifSubtitles).where(eq(desifSubtitles.id, row.subtitleId)).limit(1))[0];
      if (!subtitle) throw new TributarioS6Error("Subtítulo da apuração não encontrado.");
      const calculation = calculateDesifAssessment({ revenue: row.revenue, deduction: row.deduction, rate: row.rate ?? Number(subtitle.taxRate), credit: row.credit, debitAdjustment: row.debitAdjustment });
      await tx.insert(desifAssessments).values({ importBatchId: batch.id, agencyId: row.agencyId, subtitleId: row.subtitleId, competence: batch.competence, revenueDecimal: calculation.revenue, deductionDecimal: calculation.deduction, taxableBaseDecimal: calculation.taxableBase, rate: calculation.rate, grossTaxDecimal: calculation.grossTax, creditDecimal: calculation.credit, debitAdjustmentDecimal: calculation.debitAdjustment, taxDueDecimal: calculation.taxDue, calculationSnapshot: json({ formula: "(receita - dedução) × alíquota + débito - crédito", ...Object.fromEntries(Object.entries(calculation).map(([key, value]) => [key, value.toFixed(2)])), packageDifferenceIncluded: false }) });
    }
    for (const row of payload.trialBalances ?? []) {
      const result = calculateTrialBalance(row);
      await tx.insert(desifTrialBalances).values({ importBatchId: batch.id, agencyId: row.agencyId, pgccAccountId: row.pgccAccountId, competence: batch.competence, openingBalanceDecimal: result.openingBalance, creditsDecimal: result.credits, debitsDecimal: result.debits, calculatedCloseDecimal: result.calculatedClose, declaredCloseDecimal: result.declaredClose, differenceDecimal: result.difference, inconsistency: result.consistent ? null : `Saldo declarado diverge em R$ ${result.difference.toFixed(2)}.` });
    }
    for (const row of payload.packageMovements ?? []) {
      const items = await tx.select({ quantity: desifPackageItems.quantity, amount: desifTariffs.amountDecimal }).from(desifPackages).innerJoin(desifPackageItems, eq(desifPackageItems.packageId, desifPackages.id)).innerJoin(desifTariffs, eq(desifTariffs.id, desifPackageItems.tariffId)).where(eq(desifPackages.id, row.packageId));
      if (!items.length) throw new TributarioS6Error("Pacote sem tarifa vigente.");
      const tariffTotal = items.reduce((sum, item) => sum.plus(item.amount.mul(item.quantity)), new Decimal(0));
      const result = calculatePackageMovement({ accountHolders: row.accountHolders, tariffAmount: tariffTotal, collectedRevenue: row.collectedRevenue, rate: row.rate });
      await tx.insert(desifPackageMovements).values({ importBatchId: batch.id, agencyId: row.agencyId, packageId: row.packageId, competence: batch.competence, accountHolderQuantity: row.accountHolders, potentialRevenueDecimal: result.potentialRevenue, collectedRevenueDecimal: result.collectedRevenue, differenceDecimal: result.difference, assessmentImpactDecimal: result.assessmentImpact, details: { policy: "CONFRONTO_INDEPENDENTE_SEM_DUPLA_CONTAGEM_COSIF", tariffTotal: tariffTotal.toFixed(2), rate: row.rate } });
    }
    return collectionRow(await tx.update(desifImportBatches).set({ status: "PROCESSADO", processedAt: new Date(), receiptNumber: `DESIF-${batch.competence.replace("-", "")}-${randomUUID().slice(0, 8).toUpperCase()}`, validationSummary: { processedBy: actor.usuarioId, receiptIssuedAfterProcessing: true } }).where(eq(desifImportBatches.id, batch.id)).returning());
  });
}

async function readAssessment(db: DatabaseExecutor, assessmentId: string) {
  const result = (await db.select({ row: desifAssessments, agency: desifAgencies, institution: desifInstitutions }).from(desifAssessments).innerJoin(desifAgencies, eq(desifAgencies.id, desifAssessments.agencyId)).innerJoin(desifInstitutions, eq(desifInstitutions.id, desifAgencies.institutionId)).where(eq(desifAssessments.id, assessmentId)).limit(1))[0];
  if (!result) throw new TributarioS6Error("Apuração não encontrada.");
  return { ...result.row, agency: { ...result.agency, institution: result.institution } };
}

async function issueGuide(tx: DatabaseTransaction, assessmentId: string) {
  await tx.select({ id: desifAssessments.id }).from(desifAssessments).where(eq(desifAssessments.id, assessmentId)).for("update");
  const row = await readAssessment(tx, assessmentId);
  if (row.guideId) return (await tx.select().from(taxGuides).where(eq(taxGuides.id, row.guideId)).limit(1))[0] ?? null;
  const taxpayerId = row.agency.institution.taxpayerId;
  if (!taxpayerId) throw new TributarioS6Error("Vincule a instituição a um contribuinte antes de gerar a guia.");
  await lockCollectionOperation(tx, "DESIF-TAX:ISS Bancário");
  let tax = (await tx.select().from(taxes).where(eq(taxes.name, "ISS Bancário")).limit(1))[0];
  if (!tax) tax = collectionRow(await tx.insert(taxes).values({ name: "ISS Bancário", taxType: "Imposto" }).returning());
  const competence = competenceDate(row.competence);
  const taxAssessment = collectionRow(await tx.insert(taxAssessments).values({ year: Number(row.competence.slice(0, 4)), competence, originalValue: Number(row.taxDueDecimal), originalValueDecimal: row.taxDueDecimal, taxableBaseDecimal: row.taxableBaseDecimal, rate: row.rate, finalValueDecimal: row.taxDueDecimal, calculationSnapshot: row.calculationSnapshot, taxId: tax.id, taxpayerId, economicRegistrationId: row.agency.economicRegistrationId, status: "Lançado" }).returning());
  const dueDate = new Date(); dueDate.setUTCDate(dueDate.getUTCDate() + 30);
  const guide = collectionRow(await tx.insert(taxGuides).values({ guideNumber: `DAM-DESIF-${randomUUID().slice(0, 10).toUpperCase()}`, totalValue: Number(row.taxDueDecimal), totalValueDecimal: row.taxDueDecimal, dueDate, assessmentId: taxAssessment.id, calculationSnapshot: row.calculationSnapshot }).returning());
  const document = collectionRow(await tx.insert(documents).values({ title: `DAM ISS Bancário ${row.competence}`, documentType: "DAM_DESIF", fileUrl: `/tributacao/iss-bancario/guias/${guide.id}`, status: "Válido", publicLabel: "Guia municipal de ISS Bancário" }).returning());
  await tx.update(taxGuides).set({ documentId: document.id }).where(eq(taxGuides.id, guide.id));
  await tx.update(desifAssessments).set({ taxAssessmentId: taxAssessment.id, guideId: guide.id, status: "GUIA_EMITIDA" }).where(eq(desifAssessments.id, row.id));
  return guide;
}

export async function issueDesifGuide(db: DatabaseConnection, assessmentId: string) {
  return withDatabaseTransaction(db, tx => issueGuide(tx, assessmentId));
}

export async function openDesifFiscalCase(db: DatabaseConnection, actor: Actor, input: { assessmentId: string; findingType: "OMISSAO" | "DIFERENCA" | "SEM_MOVIMENTO"; processId?: string }) {
  return withDatabaseTransaction(db, async tx => {
    await tx.select({ id: desifAssessments.id }).from(desifAssessments).where(eq(desifAssessments.id, input.assessmentId)).for("update");
    let assessment = await readAssessment(tx, input.assessmentId);
    if (!assessment.guideId && assessment.agency.institution.taxpayerId) { await issueGuide(tx, assessment.id); assessment = await readAssessment(tx, assessment.id); }
    if (input.processId && !(await tx.select({ id: processes.id }).from(processes).where(eq(processes.id, input.processId)).limit(1))[0]) throw new TributarioS6Error("Processo informado não existe.");
    const item = collectionRow(await tx.insert(desifFiscalCases).values({ institutionId: assessment.agency.institutionId, agencyId: assessment.agencyId, assessmentId: assessment.id, competence: assessment.competence, findingType: input.findingType, findingDescription: `Fiscalização bancária originada da apuração ${assessment.competence}: ${input.findingType}.`, processId: input.processId || null, guideId: assessment.guideId, serviceOrderNumber: `OS-DESIF-${randomUUID().slice(0, 8).toUpperCase()}`, createdByUsuarioId: actor.usuarioId }).returning());
    await tx.insert(desifFiscalEvents).values({ fiscalCaseId: item.id, eventType: "ABERTA", description: "Ordem de serviço de fiscalização bancária aberta.", actorUsuarioId: actor.usuarioId });
    const tiaf = collectionRow(await tx.insert(documents).values({ title: `TIAF ISS Bancário ${assessment.competence}`, documentType: "TIAF_DESIF", fileUrl: `/tributacao/iss-bancario/fiscalizacoes/${item.id}/tiaf`, status: "Válido", publicLabel: "Termo interno de início da ação fiscal" }).returning());
    const map = collectionRow(await tx.insert(documents).values({ title: `Mapa de apuração bancária ${assessment.competence}`, documentType: "MAPA_DESIF", fileUrl: `/tributacao/iss-bancario/fiscalizacoes/${item.id}/mapa`, status: "Válido", publicLabel: "Mapa de apuração do ISS Bancário" }).returning());
    if (input.processId) await tx.insert(processDocuments).values([{ processId: input.processId, documentId: tiaf.id, purpose: "TIAF da fiscalização bancária" }, { processId: input.processId, documentId: map.id, purpose: "Mapa de apuração da fiscalização bancária" }]);
    let infractionId: string | null = null;
    const taxpayerId = assessment.agency.institution.taxpayerId;
    if (taxpayerId) infractionId = collectionRow(await tx.insert(taxInfractions).values({ infractionType: `ISS Bancário — ${input.findingType}`, penaltyValue: Number(assessment.taxDueDecimal), penaltyValueDecimal: assessment.taxDueDecimal, defenseDeadline: new Date(Date.now() + 30 * 86400000), taxpayerId }).returning()).id;
    const result = collectionRow(await tx.update(desifFiscalCases).set({ tiafDocumentId: tiaf.id, mapDocumentId: map.id, infractionId }).where(eq(desifFiscalCases.id, item.id)).returning());
    await tx.insert(desifFiscalEvents).values({ fiscalCaseId: item.id, eventType: "DOCUMENTADA", description: "TIAF, mapa e auto vinculados à ação fiscal.", actorUsuarioId: actor.usuarioId });
    return result;
  });
}

export async function communicateDesifFiscalCase(db: DatabaseConnection, actor: Actor, id: string) {
  return withDatabaseTransaction(db, async tx => {
    const item = (await tx.select().from(desifFiscalCases).where(eq(desifFiscalCases.id, id)).for("update"))[0];
    const institution = item ? (await tx.select().from(desifInstitutions).where(eq(desifInstitutions.id, item.institutionId)).limit(1))[0] : undefined;
    if (!item || !institution?.taxpayerId) throw new TributarioS6Error("Instituição sem contribuinte vinculado.");
    const mailbox = (await tx.select().from(dteMailboxes).where(and(eq(dteMailboxes.taxpayerId, institution.taxpayerId), eq(dteMailboxes.status, "ATIVA"))).limit(1))[0];
    if (!mailbox) throw new TributarioS6Error("Contribuinte sem caixa DTE ativa.");
    const message = await publishCollectionMessage(tx, { mailboxId: mailbox.id, categoryCode: "FISCALIZACAO_DESIF", categoryName: "Fiscalização ISS Bancário / DES-IF", deadlineDays: 15, subject: `Fiscalização bancária ${item.competence}`, body: item.findingDescription, processId: item.processId, documentId: item.tiafDocumentId, key: `DESIF-FISCAL:${item.id}`, actorUsuarioId: actor.usuarioId, description: "Comunicação de fiscalização disponibilizada no DTE." });
    const result = collectionRow(await tx.update(desifFiscalCases).set({ dteMessageId: message.id, status: "COMUNICADA" }).where(eq(desifFiscalCases.id, id)).returning());
    await tx.insert(desifFiscalEvents).values({ fiscalCaseId: id, eventType: "COMUNICADA_DTE", description: "Comunicação disponibilizada no DTE; aviso externo não equivale à ciência.", actorUsuarioId: actor.usuarioId });
    return result;
  });
}

export function assertDesifReceipt(batch: { status: string; processedAt: Date | null; receiptNumber: string | null }) {
  if (!canIssueDesifReceipt(batch.status, batch.processedAt) || !batch.receiptNumber) throw new TributarioS6Error("O recibo só existe após validação e processamento pelo CeleriFlow.");
}
