import { z } from "zod";
import { and, eq, isNull, or } from "drizzle-orm";
import type { DatabaseTransaction } from "@/db/transaction";
import { taxpayers, companies, realEstates } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { citizenTaxpayerAccesses } from "@/db/schema/citizen-access";
import { portalTaxAssessments } from "@/db/schema/portal-fiscal";
import { generateTaxGuideInTransaction } from "@/lib/tributacao";
import { createOccasionalRequestInTransaction } from "@/lib/tributacao/s4-service";
import { createItbiDeclarationInTransaction } from "@/lib/tributacao/s3-service";
import { validateCpf, validateCnpj } from "@/lib/identifiers/brazilian-identifiers";
import type { DigitalService } from "./services-policy";

async function resolveTaxpayerDocument(tx: DatabaseTransaction, document: string) {
  const value = document.replace(/\D/g, "");
  if (!validateCpf(value).valid && !validateCnpj(value).valid) throw new Error("CPF/CNPJ da parte inválido.");
  const [taxpayer] = await tx.select({ id: taxpayers.id }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(and(eq(taxpayers.status, "Ativo"), or(and(eq(people.cpf, value), eq(people.status, "Ativo")), and(eq(companies.cnpj, value), eq(companies.status, "Ativo"))))).limit(1);
  if (!taxpayer) throw new Error("Uma das partes precisa de cadastro municipal ativo para conferência.");
  return taxpayer.id;
}

export async function executePortalTaxOpening(tx: DatabaseTransaction, actorId: string, taxpayerId: string, processId: string, definition: DigitalService, values: Record<string, string>) {
  if (definition.executor === "SOLICITACAO") return null;
  const requiredScope = ({ GUIA: "DAM", NFSE_AVULSA: "NFSE", ITBI: "ITBI" } as const)[definition.executor];
  const [grant] = await tx.select().from(citizenTaxpayerAccesses).where(and(eq(citizenTaxpayerAccesses.usuarioId, actorId), eq(citizenTaxpayerAccesses.taxpayerId, taxpayerId), eq(citizenTaxpayerAccesses.accessType, "TITULAR"), eq(citizenTaxpayerAccesses.status, "ATIVO"), isNull(citizenTaxpayerAccesses.revokedAt))).limit(1);
  if (!grant || !Array.isArray(grant.scopes) || !grant.scopes.includes(requiredScope)) throw new Error(`Executor exige autorização ${requiredScope} para o titular.`);
  const actor = { usuarioId: actorId, employeeId: null, allowedBudgetUnitIds: [definition.executorConfiguration.budgetUnitId] };
  if (definition.executor === "GUIA") {
    const dueDate = z.iso.date().parse(values.dueDate);
    if (!(await tx.select({ id: portalTaxAssessments.id }).from(portalTaxAssessments).where(and(eq(portalTaxAssessments.id, values.assessmentId), eq(portalTaxAssessments.taxpayerId, taxpayerId))).limit(1)).length) throw new Error("Lançamento não pertence ao contribuinte autorizado.");
    const guide = await generateTaxGuideInTransaction(tx, actor, { assessmentId: values.assessmentId, dueDate: new Date(`${dueDate}T12:00:00Z`) });
    return { type: "GUIA", id: guide.id, complete: true, message: `Guia ${guide.guideNumber} emitida na origem tributária.` };
  }
  if (definition.executor === "NFSE_AVULSA") {
    const takerTaxpayerId = values.takerDocument ? await resolveTaxpayerDocument(tx, values.takerDocument) : undefined;
    const request = await createOccasionalRequestInTransaction(tx, actor, { providerTaxpayerId: taxpayerId, takerTaxpayerId, serviceActivityId: definition.executorConfiguration.serviceActivityId, serviceDescription: values.serviceDescription, serviceValue: z.coerce.number().finite().positive().parse(values.serviceValue), deductions: z.coerce.number().finite().nonnegative().parse(values.deductions || "0"), paymentRequired: definition.executorConfiguration.paymentRequired });
    return { type: "NFSE_AVULSA", id: request.id, complete: false, message: `Solicitação ${request.requestNumber} encaminhada à análise fiscal.` };
  }
  if (!(await tx.select({ id: realEstates.id }).from(realEstates).where(and(eq(realEstates.id, values.realEstateId), eq(realEstates.taxpayerId, taxpayerId))).limit(1)).length) throw new Error("O transmitente precisa possuir vínculo com o imóvel informado.");
  const buyerInputs = z.array(z.object({ document: z.string(), sharePercent: z.number().finite().positive() }).strict()).min(1).max(50).parse(JSON.parse(values.buyers || "[]"));
  const buyers = await Promise.all(buyerInputs.map(async (buyer) => ({ taxpayerId: await resolveTaxpayerDocument(tx, buyer.document), sharePercent: buyer.sharePercent })));
  const declaration = await createItbiDeclarationInTransaction(tx, actor, { transactionTypeId: definition.executorConfiguration.transactionTypeId, realEstateId: values.realEstateId, processId, registryOffice: values.registryOffice, transmittedFractionPercent: z.coerce.number().finite().positive().max(100).parse(values.transmittedFractionPercent), declaredPropertyValue: z.coerce.number().finite().positive().parse(values.declaredPropertyValue), sellerTaxpayerId: taxpayerId, buyers, cadastralUpdateMode: definition.executorConfiguration.cadastralUpdateMode });
  return { type: "ITBI", id: declaration.id, complete: false, message: `Declaração ${declaration.declarationNumber} registrada para conferência fiscal.` };
}
