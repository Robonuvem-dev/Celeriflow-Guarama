import { randomUUID } from "node:crypto";
import { eq } from "drizzle-orm";
import { Decimal } from "../../src/db/decimal";
import { constructionCases, constructionCaseProperties, constructionConfigVersions } from "../../src/db/schema/construction-core";
import { constructionFees, constructionTaxRuleVersions } from "../../src/db/schema/construction-taxation";
import { taxpayers, realEstates } from "../../src/db/schema/registry";
import { taxes, taxAssessments, taxGuides } from "../../src/db/schema/taxation-core";
import { taxPayments } from "../../src/db/schema/tax-accounting";
import { createConstructionRequestsFixture } from "./construction-requests-fixture";

export async function createConstructionTaxationFixture(options: { freeRevisions?: number; revisionCount?: number; checkPropertyDebts?: boolean } = {}) {
  const f = await createConstructionRequestsFixture();
  const db = f.db;
  try {
    await db.insert(constructionConfigVersions).values({ id: "tax-config", version: 4, freeRevisions: options.freeRevisions ?? 1, correctionDays: 30, checkPropertyDebts: options.checkPropertyDebts ?? false, subjectIds: [], areaWeights: {}, instructions: "Configuração tributária", publishedBy: "manager-user" });
    await db.update(constructionCases).set({ configurationId: "tax-config", revisionCount: options.revisionCount ?? 0 }).where(eq(constructionCases.id, "case"));
    await db.insert(taxpayers).values({ id: "taxpayer", taxpayerType: "PF", personId: "person" });
    await db.insert(realEstates).values({ id: "property", municipalInsc: "TEST-TAX", taxpayerId: "taxpayer", landArea: 200 });
    await db.insert(constructionCaseProperties).values({ caseId: "case", realEstateId: "property", cadastralSnapshot: {} });
    await db.insert(taxes).values({ id: "tax", name: "Taxa sintética", taxType: "Taxa" });
    await db.insert(constructionTaxRuleVersions).values({ id: "rule", kind: "PERMIT", version: 1, taxId: "tax", startsAt: new Date("2020-01-01T00:00:00Z"), fixedAmount: new Decimal(10), amountPerSquareMeter: new Decimal(0), legalBasis: "Lei sintética", guideInstructions: "Não pagável", publishedBy: "manager-user" });
    async function fee(kind: string, input: { id?: string; caseId?: string; revision?: number; cycleKey?: string; amount?: string; exemptionReason?: string; assessmentId?: string } = {}) {
      const [record] = await db.insert(constructionFees).values({ id: input.id, caseId: input.caseId ?? "case", kind, revision: input.revision ?? 0, cycleKey: input.cycleKey ?? "INITIAL", requestKey: randomUUID(), ruleId: "rule", taxpayerId: "taxpayer", realEstateId: "property", amount: new Decimal(input.amount ?? "100"), calculationSnapshot: {}, exemptionReason: input.exemptionReason, assessmentId: input.assessmentId, createdBy: "manager-user" }).returning();
      return record;
    }
    async function assessment(id: string, input: { amount?: string; paid?: string; status?: string; guideStatus?: string; year?: number } = {}) {
      const amount = new Decimal(input.amount ?? "100"), paid = new Decimal(input.paid ?? "100");
      await db.insert(taxAssessments).values({ id, year: input.year ?? 2026, taxId: "tax", taxpayerId: "taxpayer", realEstateId: "property", originalValue: Number(amount), originalValueDecimal: amount, finalValueDecimal: amount, status: input.status ?? "Pago" });
      await db.insert(taxGuides).values({ id: `guide:${id}`, assessmentId: id, totalValue: Number(amount), totalValueDecimal: amount, dueDate: new Date("2026-12-31T00:00:00Z"), status: input.guideStatus ?? "Paga" });
      await db.insert(taxPayments).values({ id: `payment:${id}`, guideId: `guide:${id}`, amountPaid: Number(paid), amountPaidDecimal: paid, status: "Confirmado", paymentDate: new Date("2026-10-10T00:00:00Z"), paymentMethod: "Transferência" });
    }
    return { ...f, fee, assessment };
  } catch (error) { await f.close(); throw error; }
}
