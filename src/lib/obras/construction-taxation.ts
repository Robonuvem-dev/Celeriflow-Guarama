import { z } from "zod";
import { and, desc, eq, gte, isNull, lte, or, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { constructionCaseProperties, constructionConfigVersions } from "@/db/schema/construction-core";
import { constructionFees, constructionTaxRuleVersions } from "@/db/schema/construction-taxation";
import { taxes, taxAssessments, taxGuides } from "@/db/schema/taxation-core";
import { taxpayers } from "@/db/schema/registry";
import { taxAuditLogs } from "@/db/schema/taxation-audit";
import { processEvents } from "@/db/schema/processes";
import { findConstructionCaseForAccess } from "@/db/repositories/infrastructure/construction-access";
import { generateTaxGuideInTransaction, type TaxActor } from "@/lib/tributacao";
import type { ConstructionAccess } from "./construction-policy";
import { calculateConstructionFee, demonstrationConstructionBarcode } from "./construction-tax-engine";
import { getConstructionDocumentFeeCycle } from "./construction-taxation-gates";

export { assertConstructionDocumentChangeFeesSatisfied, assertConstructionFeesSatisfied, getConstructionDocumentFeeCycle, getConstructionPropertyDebts } from "./construction-taxation-gates";

export const constructionTaxRuleSchema = z.object({ kind: z.enum(["PERMIT", "REANALYSIS", "HABITE_SE", "SUBDIVISION", "INSPECTION", "CORRECTION", "RENEWAL"]), taxId: z.string().min(1), startsAt: z.iso.date(), endsAt: z.union([z.literal(""), z.iso.date()]), fixedAmount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/), amountPerSquareMeter: z.string().regex(/^\d{1,10}(\.\d{1,4})?$/), legalBasis: z.string().trim().min(3).max(4000), guideInstructions: z.string().trim().min(3).max(4000), demonstration: z.boolean() }).refine((data) => !data.endsAt || data.endsAt >= data.startsAt, "Vigência final anterior à inicial.");
export const constructionFeeIssueSchema = z.object({ caseId: z.string().min(1), kind: z.enum(["PERMIT", "REANALYSIS", "HABITE_SE", "SUBDIVISION", "INSPECTION", "CORRECTION", "RENEWAL"]), documentRequestId: z.string().default(""), revision: z.number().int().nonnegative(), requestKey: z.uuid(), taxpayerId: z.string().min(1), realEstateId: z.string().min(1), dueDate: z.iso.date(), exemptionReason: z.string().trim().max(4000).default("") });

// Ciclo F5: um pedido documental persistido corresponde a uma cobrança própria;
// revisões técnicas permanecem REANALYSIS/INITIAL/revision e não são correções documentais.
export async function publishConstructionTaxRule(tx: DatabaseTransaction, actorId: string, input: unknown) {
  const data = constructionTaxRuleSchema.parse(input);
  await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${'construction-tax-rule:' + data.kind}))`);
  const [tax] = await tx.select({ id: taxes.id }).from(taxes).where(and(eq(taxes.id, data.taxId), eq(taxes.isActive, true), eq(taxes.taxType, "Taxa"))).limit(1);
  if (!tax) throw new Error("Selecione uma taxa ativa cadastrada na Tributação.");
  const [latest] = await tx.select().from(constructionTaxRuleVersions).where(eq(constructionTaxRuleVersions.kind, data.kind)).orderBy(desc(constructionTaxRuleVersions.version)).limit(1);
  // Versionamento imutável: a última publicação vigente prevalece; lançamentos preservam a versão aplicada.
  const [rule] = await tx.insert(constructionTaxRuleVersions).values({ ...data, fixedAmount: new Decimal(data.fixedAmount), amountPerSquareMeter: new Decimal(data.amountPerSquareMeter), startsAt: new Date(data.startsAt + "T00:00:00Z"), endsAt: data.endsAt ? new Date(data.endsAt + "T00:00:00Z") : null, version: (latest?.version || 0) + 1, publishedBy: actorId }).returning();
  return rule;
}

export async function issueConstructionFee(db: DatabaseConnection, access: ConstructionAccess, actor: TaxActor, input: unknown) {
  const data = constructionFeeIssueSchema.parse(input);
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Lançamento ou isenção exige gestor urbanístico.");
  return withDatabaseTransaction(db, async (tx) => {
    await tx.execute(sql`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`);
    const record = await findConstructionCaseForAccess(tx, data.caseId, access);
    if (!record) throw new Error("Solicitação indisponível no seu setor.");
    const [configuration] = await tx.select({ freeRevisions: constructionConfigVersions.freeRevisions }).from(constructionConfigVersions).where(eq(constructionConfigVersions.id, record.configurationId)).limit(1);
    if (!configuration) throw new Error("Solicitação indisponível no seu setor.");
    const cycle = ["CORRECTION", "RENEWAL"].includes(data.kind) ? await getConstructionDocumentFeeCycle(tx, record.id, data.documentRequestId) : null;
    if (cycle && cycle.kind !== data.kind) throw new Error("Finalidade da taxa não corresponde ao pedido documental.");
    if (!cycle && data.documentRequestId) throw new Error("Pedido documental é aplicável somente a correção/renovação.");
    const cycleKey = cycle?.cycleKey || "INITIAL";
    const [keyMatch] = await tx.select().from(constructionFees).where(eq(constructionFees.requestKey, data.requestKey)).limit(1);
    if (keyMatch && (keyMatch.caseId !== data.caseId || keyMatch.kind !== data.kind || keyMatch.revision !== data.revision || keyMatch.cycleKey !== cycleKey)) throw new Error("Chave de lançamento pertence a outra operação.");
    const revision = data.kind === "REANALYSIS" ? data.revision : 0;
    const [existing] = await tx.select({ id: constructionFees.id }).from(constructionFees).where(and(eq(constructionFees.caseId, data.caseId), eq(constructionFees.kind, data.kind), eq(constructionFees.cycleKey, cycleKey), eq(constructionFees.revision, revision))).limit(1);
    if (existing) return existing.id;
    if (data.kind === "REANALYSIS" && (revision <= configuration.freeRevisions || revision > record.revisionCount)) throw new Error("Reanálise não excede a franquia ou ainda não ocorreu.");
    if (data.kind !== "REANALYSIS" && data.revision !== 0) throw new Error("Informe revisão zero para a taxa selecionada.");
    if (["Arquivado", "Cancelado", "Rejeitado"].includes(record.process.status)) throw new Error("Processo encerrado indisponível para lançamento.");
    const [property] = await tx.select({ id: constructionCaseProperties.id }).from(constructionCaseProperties).where(and(eq(constructionCaseProperties.caseId, record.id), eq(constructionCaseProperties.realEstateId, data.realEstateId))).limit(1);
    if (!property) throw new Error("Imóvel deve estar vinculado à solicitação.");
    const [taxpayer] = await tx.select({ id: taxpayers.id }).from(taxpayers).where(and(eq(taxpayers.id, data.taxpayerId), eq(taxpayers.status, "Ativo"), or(eq(taxpayers.personId, record.process.personId || ""), eq(taxpayers.companyId, record.process.companyId || "")))).limit(1);
    if (!taxpayer) throw new Error("Contribuinte ativo deve corresponder ao requerente cadastrado no processo.");
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const [ruleRow] = await tx.select({ rule: constructionTaxRuleVersions }).from(constructionTaxRuleVersions).innerJoin(taxes, eq(taxes.id, constructionTaxRuleVersions.taxId)).where(and(eq(constructionTaxRuleVersions.kind, data.kind), lte(constructionTaxRuleVersions.startsAt, today), or(isNull(constructionTaxRuleVersions.endsAt), gte(constructionTaxRuleVersions.endsAt, today)), eq(taxes.isActive, true))).orderBy(desc(constructionTaxRuleVersions.version)).limit(1);
    const rule = ruleRow?.rule;
    if (!rule) throw new Error(`Publique uma regra tributária vigente para ${data.kind}; não é permitido reaproveitar a taxa original ou presumir valor.`);
    const calculated = calculateConstructionFee(record.totalArea.toString(), rule.fixedAmount.toString(), rule.amountPerSquareMeter.toString());
    if (calculated.amount.isZero() && !data.exemptionReason) throw new Error("Taxa zero exige fundamento expresso de isenção.");
    const snapshot = { ...calculated.memory, kind: data.kind, revision, cycleKey, documentRequestId: cycle?.documentRequestId || null, sourceIssuedDocumentId: cycle?.sourceIssuedDocumentId || null, ruleId: rule.id, ruleVersion: rule.version, startsAt: rule.startsAt.toISOString().slice(0, 10), endsAt: rule.endsAt?.toISOString().slice(0, 10) || null, taxId: rule.taxId, legalBasis: rule.legalBasis, guideInstructions: rule.guideInstructions, demonstration: rule.demonstration, taxpayerId: taxpayer.id, realEstateId: data.realEstateId, processId: record.processId, exemptionReason: data.exemptionReason };
    const [fee] = await tx.insert(constructionFees).values({ caseId: record.id, kind: data.kind, revision, cycleKey, requestKey: data.requestKey, ruleId: rule.id, taxpayerId: taxpayer.id, realEstateId: data.realEstateId, amount: calculated.amount, calculationSnapshot: snapshot, exemptionReason: data.exemptionReason || null, createdBy: actor.usuarioId }).returning();
    if (!data.exemptionReason) {
      const dueDate = new Date(data.dueDate + "T12:00:00Z");
      if (dueDate < today || dueDate.getUTCFullYear() !== today.getUTCFullYear()) throw new Error("Vencimento deve ser atual/futuro e pertencer ao exercício corrente.");
      const [assessment] = await tx.insert(taxAssessments).values({ year: today.getUTCFullYear(), assessmentNumber: `CIV-${fee.id}`, competence: today, originalValue: Number(calculated.amount), originalValueDecimal: calculated.amount, finalValueDecimal: calculated.amount, taxableBaseDecimal: record.totalArea.toDecimalPlaces(2), taxId: rule.taxId, taxpayerId: taxpayer.id, realEstateId: data.realEstateId, calculationSnapshot: snapshot, status: "Lançado" }).returning();
      // Reutiliza a emissão transacional da Tributação sem abrir transação aninhada.
      const guide = await generateTaxGuideInTransaction(tx, actor, { assessmentId: assessment.id, dueDate });
      if (rule.demonstration) {
        const sequence = guide.guideNumber!.replace(/\D/g, "");
        const barcode = demonstrationConstructionBarcode(calculated.amount.toFixed(2), sequence);
        await tx.update(taxGuides).set({ barcode: barcode.barcode, calculationSnapshot: { ...snapshot, demonstrationBarcode: barcode } }).where(eq(taxGuides.id, guide.id));
      }
      await tx.update(constructionFees).set({ assessmentId: assessment.id }).where(eq(constructionFees.id, fee.id));
    }
    await tx.insert(taxAuditLogs).values({ action: data.exemptionReason ? "CONSTRUCTION_FEE_EXEMPT" : "CONSTRUCTION_FEE_ISSUED", entityType: "ConstructionFee", entityId: fee.id, payload: snapshot, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId });
    if (cycle) await tx.insert(processEvents).values({ processId: record.processId, eventType: data.exemptionReason ? "CONSTRUCTION_DOCUMENT_CHANGE_FEE_EXEMPT" : "CONSTRUCTION_DOCUMENT_CHANGE_FEE_ISSUED", description: `${data.kind}: ciclo ${cycle.documentRequestId} registrado com regra tributária própria.`, employeeId: actor.employeeId, metadata: JSON.stringify({ feeId: fee.id, ...cycle }) });
    return fee.id;
  });
}
