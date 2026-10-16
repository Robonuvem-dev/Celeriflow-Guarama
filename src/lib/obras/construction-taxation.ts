import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import { generateTaxGuide, type TaxActor } from "@/lib/tributacao";
import { constructionCaseWhere, type ConstructionAccess } from "./construction-policy";
import { calculateConstructionFee, confirmedConstructionBalance, demonstrationConstructionBarcode, type ConstructionFeeKind } from "./construction-tax-engine";

export const constructionTaxRuleSchema = z.object({ kind: z.enum(["PERMIT", "REANALYSIS", "HABITE_SE", "SUBDIVISION", "INSPECTION", "CORRECTION", "RENEWAL"]), taxId: z.string().min(1), startsAt: z.iso.date(), endsAt: z.union([z.literal(""), z.iso.date()]), fixedAmount: z.string().regex(/^\d{1,12}(\.\d{1,2})?$/), amountPerSquareMeter: z.string().regex(/^\d{1,10}(\.\d{1,4})?$/), legalBasis: z.string().trim().min(3).max(4000), guideInstructions: z.string().trim().min(3).max(4000), demonstration: z.boolean() }).refine((data) => !data.endsAt || data.endsAt >= data.startsAt, "Vigência final anterior à inicial.");
export const constructionFeeIssueSchema = z.object({ caseId: z.string().min(1), kind: z.enum(["PERMIT", "REANALYSIS", "HABITE_SE", "SUBDIVISION", "INSPECTION", "CORRECTION", "RENEWAL"]), documentRequestId: z.string().default(""), revision: z.number().int().nonnegative(), requestKey: z.uuid(), taxpayerId: z.string().min(1), realEstateId: z.string().min(1), dueDate: z.iso.date(), exemptionReason: z.string().trim().max(4000).default("") });

// Ciclo F5: um pedido documental persistido corresponde a uma cobrança própria;
// revisões técnicas permanecem REANALYSIS/INITIAL/revision e não são correções documentais.
export async function getConstructionDocumentFeeCycle(tx: Prisma.TransactionClient, caseId: string, documentRequestId: string) {
  if (!documentRequestId) throw new Error("Correção/renovação exige pedido documental para identificar o ciclo tributário.");
  const request = await tx.constructionDocumentRequest.findUnique({ where: { id: documentRequestId } });
  if (!request || request.caseId !== caseId || request.status !== "PENDING" || !["CORRECTION", "RENEWAL"].includes(request.type)) throw new Error("Pedido documental pendente indisponível para este ciclo tributário.");
  const source = await tx.constructionIssuedDocument.findFirst({ where: { id: request.sourceIssuedDocumentId, caseId, status: "PUBLISHED" }, select: { id: true, kind: true } });
  if (!source || (request.type === "RENEWAL" && source.kind !== "PERMIT")) throw new Error("Ciclo exige documento original publicado; renovação exige alvará.");
  return { kind: request.type as "CORRECTION" | "RENEWAL", cycleKey: `DOCUMENT_REQUEST:${request.id}`, documentRequestId: request.id, sourceIssuedDocumentId: source.id, revision: 0 };
}

export async function publishConstructionTaxRule(tx: Prisma.TransactionClient, actorId: string, input: unknown) {
  const data = constructionTaxRuleSchema.parse(input);
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext(${'construction-tax-rule:' + data.kind}))`;
  const tax = await tx.tax.findFirst({ where: { id: data.taxId, isActive: true, taxType: "Taxa" } });
  if (!tax) throw new Error("Selecione uma taxa ativa cadastrada na Tributação.");
  const latest = await tx.constructionTaxRuleVersion.findFirst({ where: { kind: data.kind }, orderBy: { version: "desc" } });
  // Versionamento imutável: a última publicação vigente prevalece; lançamentos preservam a versão aplicada.
  return tx.constructionTaxRuleVersion.create({ data: { ...data, startsAt: new Date(data.startsAt + "T00:00:00Z"), endsAt: data.endsAt ? new Date(data.endsAt + "T00:00:00Z") : null, version: (latest?.version || 0) + 1, publishedBy: actorId } });
}

export async function issueConstructionFee(db: PrismaClient, access: ConstructionAccess, actor: TaxActor, input: unknown) {
  const data = constructionFeeIssueSchema.parse(input);
  if (!access.administrator && !access.roles.includes("MANAGER")) throw new Error("Lançamento ou isenção exige gestor urbanístico.");
  return db.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${data.caseId} FOR UPDATE`;
    const record = await tx.constructionCase.findFirst({ where: { AND: [{ id: data.caseId }, constructionCaseWhere(access)] }, include: { configuration: true, properties: true, process: true } });
    if (!record) throw new Error("Solicitação indisponível no seu setor.");
    const cycle = ["CORRECTION", "RENEWAL"].includes(data.kind) ? await getConstructionDocumentFeeCycle(tx, record.id, data.documentRequestId) : null;
    if (cycle && cycle.kind !== data.kind) throw new Error("Finalidade da taxa não corresponde ao pedido documental.");
    if (!cycle && data.documentRequestId) throw new Error("Pedido documental é aplicável somente a correção/renovação.");
    const cycleKey = cycle?.cycleKey || "INITIAL";
    const keyMatch = await tx.constructionFee.findUnique({ where: { requestKey: data.requestKey } });
    if (keyMatch && (keyMatch.caseId !== data.caseId || keyMatch.kind !== data.kind || keyMatch.revision !== data.revision || keyMatch.cycleKey !== cycleKey)) throw new Error("Chave de lançamento pertence a outra operação.");
    const revision = data.kind === "REANALYSIS" ? data.revision : 0;
    const existing = await tx.constructionFee.findUnique({ where: { caseId_kind_cycleKey_revision: { caseId: data.caseId, kind: data.kind, cycleKey, revision } } });
    if (existing) return existing.id;
    if (data.kind === "REANALYSIS" && (revision <= record.configuration.freeRevisions || revision > record.revisionCount)) throw new Error("Reanálise não excede a franquia ou ainda não ocorreu.");
    if (data.kind !== "REANALYSIS" && data.revision !== 0) throw new Error("Informe revisão zero para a taxa selecionada.");
    if (["Arquivado", "Cancelado", "Rejeitado"].includes(record.process.status)) throw new Error("Processo encerrado indisponível para lançamento.");
    if (!record.properties.some((property) => property.realEstateId === data.realEstateId)) throw new Error("Imóvel deve estar vinculado à solicitação.");
    const taxpayer = await tx.taxpayer.findFirst({ where: { id: data.taxpayerId, status: "Ativo", OR: [{ personId: record.process.personId || "" }, { companyId: record.process.companyId || "" }] } });
    if (!taxpayer) throw new Error("Contribuinte ativo deve corresponder ao requerente cadastrado no processo.");
    const today = new Date(new Date().toISOString().slice(0, 10) + "T00:00:00Z");
    const rule = await tx.constructionTaxRuleVersion.findFirst({ where: { kind: data.kind, startsAt: { lte: today }, OR: [{ endsAt: null }, { endsAt: { gte: today } }], tax: { isActive: true } }, orderBy: { version: "desc" } });
    if (!rule) throw new Error(`Publique uma regra tributária vigente para ${data.kind}; não é permitido reaproveitar a taxa original ou presumir valor.`);
    const calculated = calculateConstructionFee(record.totalArea.toString(), rule.fixedAmount.toString(), rule.amountPerSquareMeter.toString());
    if (calculated.amount.isZero() && !data.exemptionReason) throw new Error("Taxa zero exige fundamento expresso de isenção.");
    const snapshot = { ...calculated.memory, kind: data.kind, revision, cycleKey, documentRequestId: cycle?.documentRequestId || null, sourceIssuedDocumentId: cycle?.sourceIssuedDocumentId || null, ruleId: rule.id, ruleVersion: rule.version, startsAt: rule.startsAt.toISOString().slice(0, 10), endsAt: rule.endsAt?.toISOString().slice(0, 10) || null, taxId: rule.taxId, legalBasis: rule.legalBasis, guideInstructions: rule.guideInstructions, demonstration: rule.demonstration, taxpayerId: taxpayer.id, realEstateId: data.realEstateId, processId: record.processId, exemptionReason: data.exemptionReason };
    const fee = await tx.constructionFee.create({ data: { caseId: record.id, kind: data.kind, revision, cycleKey, requestKey: data.requestKey, ruleId: rule.id, taxpayerId: taxpayer.id, realEstateId: data.realEstateId, amount: calculated.amount, calculationSnapshot: snapshot, exemptionReason: data.exemptionReason || null, createdBy: actor.usuarioId } });
    if (!data.exemptionReason) {
      const dueDate = new Date(data.dueDate + "T12:00:00Z");
      if (dueDate < today || dueDate.getUTCFullYear() !== today.getUTCFullYear()) throw new Error("Vencimento deve ser atual/futuro e pertencer ao exercício corrente.");
      const assessment = await tx.taxAssessment.create({ data: { year: today.getUTCFullYear(), assessmentNumber: `CIV-${fee.id}`, competence: today, originalValue: Number(calculated.amount), originalValueDecimal: calculated.amount, finalValueDecimal: calculated.amount, taxableBaseDecimal: record.totalArea.toDecimalPlaces(2), taxId: rule.taxId, taxpayerId: taxpayer.id, realEstateId: data.realEstateId, calculationSnapshot: snapshot, status: "Lançado" } });
      // Reutiliza a emissão transacional da Tributação sem abrir transação aninhada.
      const transactionalDb = { $transaction: async <T>(callback: (client: Prisma.TransactionClient) => Promise<T>) => callback(tx) } as unknown as PrismaClient;
      const guide = await generateTaxGuide(transactionalDb, actor, { assessmentId: assessment.id, dueDate });
      if (rule.demonstration) {
        const sequence = guide.guideNumber!.replace(/\D/g, "");
        const barcode = demonstrationConstructionBarcode(calculated.amount.toFixed(2), sequence);
        await tx.taxGuide.update({ where: { id: guide.id }, data: { barcode: barcode.barcode, calculationSnapshot: { ...snapshot, demonstrationBarcode: barcode } } });
      }
      await tx.constructionFee.update({ where: { id: fee.id }, data: { assessmentId: assessment.id } });
    }
    await tx.taxAuditLog.create({ data: { action: data.exemptionReason ? "CONSTRUCTION_FEE_EXEMPT" : "CONSTRUCTION_FEE_ISSUED", entityType: "ConstructionFee", entityId: fee.id, payload: snapshot, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId } });
    if (cycle) await tx.processEvent.create({ data: { processId: record.processId, eventType: data.exemptionReason ? "CONSTRUCTION_DOCUMENT_CHANGE_FEE_EXEMPT" : "CONSTRUCTION_DOCUMENT_CHANGE_FEE_ISSUED", description: `${data.kind}: ciclo ${cycle.documentRequestId} registrado com regra tributária própria.`, employeeId: actor.employeeId, metadata: JSON.stringify({ feeId: fee.id, ...cycle }) } });
    return fee.id;
  });
}

export async function getConstructionPropertyDebts(tx: Prisma.TransactionClient, caseId: string) {
  const properties = await tx.constructionCaseProperty.findMany({ where: { caseId }, select: { realEstateId: true } });
  const assessments = await tx.taxAssessment.findMany({ where: { realEstateId: { in: properties.map((property) => property.realEstateId) }, status: { not: "Cancelado" } }, include: { guides: { where: { status: { not: "Cancelada" } }, include: { payments: { where: { status: "Confirmado" } } } } } });
  const debts = assessments.map((assessment) => ({ assessmentId: assessment.id, realEstateId: assessment.realEstateId!, year: assessment.year, balance: confirmedConstructionBalance(assessment.finalValueDecimal ?? assessment.originalValueDecimal ?? assessment.originalValue, assessment.guides.flatMap((guide) => guide.payments)).toFixed(2) })).filter((debt) => new Prisma.Decimal(debt.balance).greaterThan(0));
  const registry = await tx.taxRegistryEntry.findMany({ where: { entityType: "REAL_ESTATE", entityId: { in: properties.map((property) => property.realEstateId) }, category: "NON_TAX_PROPERTY_DEBT", status: { in: ["ATIVO", "PENDENTE"] } }, select: { id: true, entityId: true, data: true } });
  const nonTaxDebts = registry.map((entry) => {
    const data = entry.data && typeof entry.data === "object" && !Array.isArray(entry.data) ? entry.data as Record<string, Prisma.JsonValue> : {};
    const amount = new Prisma.Decimal(String(data.amount ?? 0));
    if (!amount.isFinite() || amount.lessThan(0)) throw new Error("Cadastro de débito não tributário contém valor inválido. Regularize na Tributação.");
    return { registryEntryId: entry.id, realEstateId: entry.entityId, balance: amount.toFixed(2) };
  }).filter((debt) => new Prisma.Decimal(debt.balance).greaterThan(0));
  const taxTotal = debts.reduce((sum, debt) => sum.plus(debt.balance), new Prisma.Decimal(0));
  const nonTaxTotal = nonTaxDebts.reduce((sum, debt) => sum.plus(debt.balance), new Prisma.Decimal(0));
  return { debts, nonTaxDebts, taxTotal: taxTotal.toFixed(2), nonTaxTotal: nonTaxTotal.toFixed(2), total: taxTotal.plus(nonTaxTotal).toFixed(2), checkedAt: new Date().toISOString() };
}

export async function assertConstructionFeesSatisfied(tx: Prisma.TransactionClient, caseId: string, kind: ConstructionFeeKind | string, documentRequestId = "") {
  await tx.$queryRaw`SELECT "id" FROM "ConstructionCase" WHERE "id"=${caseId} FOR UPDATE`;
  const cycle = ["CORRECTION", "RENEWAL"].includes(kind) ? await getConstructionDocumentFeeCycle(tx, caseId, documentRequestId) : null;
  if (cycle && cycle.kind !== kind) throw new Error("Finalidade da taxa não corresponde ao pedido documental.");
  if (!cycle && documentRequestId) throw new Error("Utilize o gate de correção/renovação para o pedido documental.");
  // Compatível com os locks da baixa/cancelamento tributário: a guia não muda entre o gate e a emissão.
  await tx.$queryRaw`SELECT g."id" FROM "TaxGuide" g JOIN "TaxAssessment" a ON a."id"=g."assessmentId" JOIN "ConstructionFee" f ON f."assessmentId"=a."id" WHERE f."caseId"=${caseId} ORDER BY g."id" FOR UPDATE OF g, a`;
  const record = await tx.constructionCase.findUniqueOrThrow({
    where: { id: caseId },
    select: {
      revisionCount: true,
      configuration: { select: { freeRevisions: true, checkPropertyDebts: true } },
      fees: {
        select: {
          kind: true, revision: true, cycleKey: true, amount: true, exemptionReason: true,
          assessment: {
            select: {
              status: true, finalValueDecimal: true, originalValueDecimal: true, originalValue: true,
              guides: { select: { status: true, totalValueDecimal: true, totalValue: true, payments: { where: { status: "Confirmado" }, select: { amountPaidDecimal: true, amountPaid: true } } } },
            },
          },
        },
      },
    },
  });
  const required = kind === "REANALYSIS" ? [] : [{ kind, revision: 0, cycleKey: cycle?.cycleKey || "INITIAL" }];
  for (let revision = record.configuration.freeRevisions + 1; revision <= record.revisionCount; revision++) required.push({ kind: "REANALYSIS", revision, cycleKey: "INITIAL" });
  for (const item of required) {
    const fee = record.fees.find((fee) => fee.kind === item.kind && fee.revision === item.revision && fee.cycleKey === item.cycleKey);
    if (!fee) throw new Error(`Taxa ${item.kind} (revisão ${item.revision}) precisa ser lançada ou formalmente isenta.`);
    if (fee.exemptionReason) continue;
    const assessment = fee.assessment;
    const guides = assessment?.guides.filter((guide) => guide.status !== "Cancelada") || [];
    const constituted = assessment?.finalValueDecimal ?? assessment?.originalValueDecimal ?? assessment?.originalValue ?? fee.amount;
    const requiredTotal = Prisma.Decimal.max(fee.amount, constituted, ...guides.map((guide) => guide.totalValueDecimal ?? guide.totalValue ?? fee.amount));
    if (!assessment || assessment.status === "Cancelado" || !guides.length || !confirmedConstructionBalance(requiredTotal, guides.flatMap((guide) => guide.payments)).isZero()) throw new Error(`Taxa ${item.kind} (revisão ${item.revision}) exige guia válida integralmente paga ou isenção fundamentada.`);
  }
  const propertyDebts = kind === "HABITE_SE" && record.configuration.checkPropertyDebts ? await getConstructionPropertyDebts(tx, caseId) : null;
  if (propertyDebts && new Prisma.Decimal(propertyDebts.total).greaterThan(0)) throw new Error(`Imóveis possuem R$ ${propertyDebts.total} em débitos. Regularize na Tributação antes da emissão.`);
  return { checkedAt: new Date().toISOString(), required, propertyDebts, cycle };
}

// F5 chama este gate quando issueConstructionDocument recebe documentRequestId,
// inclusive correção de viabilidade: nunca substituir por PERMIT/revisão zero.
export async function assertConstructionDocumentChangeFeesSatisfied(tx: Prisma.TransactionClient, caseId: string, documentRequestId: string) {
  const cycle = await getConstructionDocumentFeeCycle(tx, caseId, documentRequestId);
  return assertConstructionFeesSatisfied(tx, caseId, cycle.kind, documentRequestId);
}
