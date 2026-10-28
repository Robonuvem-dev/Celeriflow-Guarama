import { sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import type { JsonValue } from "@/db/json";
import { Decimal } from "@/db/decimal";
import { databaseTimestamp } from "@/db/temporal";

type Event = { eventType: string; description: string };
type ProfileRaw = { id: string; code: string; name: string; description: string; criteria: JsonValue; priority: number; active: boolean; createdByUsuarioId: string; createdAt: string; updatedAt: string };
type PortfolioRaw = { id: string; name: string; status: string; items: { id: string; taxpayerId: string; sourceType: string; outstandingDecimal: string }[]; actions: { id: string; taxpayerId: string; actionType: string; channel: string; status: string; resultCode: string | null; scheduledAt: string; events: Event[] }[] };
type DebtRaw = { id: string; originalAmountDecimal: string; revisedAmountDecimal: string | null };
type QuotaRaw = { quotaNumber: number; originalDecimal: string; paidDecimal: string; balanceDecimal: string; status: string; dueDate: string };
type AgreementRaw = { id: string; agreementNumber: string; taxpayerId: string; status: string; totalAgreementDecimal: string; paidDecimal: string; balanceDecimal: string; rule: { legalReference: string }; debts: DebtRaw[]; quotas: QuotaRaw[]; events: Event[] };
type Rule = { id: string; name: string; legalReference: string; minInstallments: number; maxInstallments: number };
type BenefitRaw = { id: string; code: string; name: string; benefitType: string; legalReference: string; effectiveFrom: string; effectiveUntil: string | null; grants: { id: string }[] };
type GrantRaw = { id: string; taxpayerId: string; rule: { name: string }; originalAmountDecimal: string; creditDecimal: string; reductionDecimal: string; renunciationDecimal: string; finalAmountDecimal: string; status: string };
type Coupon = { id: string; couponNumber: string; taxpayerId: string };
type DrawRaw = { id: string; slug: string; name: string; status: string; scheduledAt: string; winnerCount: number; requiresPayment: boolean; officialActReference: string | null; coupons: Coupon[]; executions: { status: string; winners: { position: number; coupon: Coupon }[] }[] };
type CollectionSource = {
  profiles: (Omit<ProfileRaw, "createdAt" | "updatedAt"> & { createdAt: Date; updatedAt: Date })[];
  portfolios: (Omit<PortfolioRaw, "items" | "actions"> & { items: (Omit<PortfolioRaw["items"][number], "outstandingDecimal"> & { outstandingDecimal: Decimal })[]; actions: (Omit<PortfolioRaw["actions"][number], "scheduledAt"> & { scheduledAt: Date })[] })[];
  agreements: (Omit<AgreementRaw, "totalAgreementDecimal" | "paidDecimal" | "balanceDecimal" | "debts" | "quotas"> & { totalAgreementDecimal: Decimal; paidDecimal: Decimal; balanceDecimal: Decimal; debts: { id: string; originalAmountDecimal: Decimal; revisedAmountDecimal: Decimal | null }[]; quotas: { quotaNumber: number; originalDecimal: Decimal; paidDecimal: Decimal; balanceDecimal: Decimal; status: string; dueDate: Date }[] })[];
  rules: Rule[]; benefitRules: (Omit<BenefitRaw, "effectiveFrom" | "effectiveUntil"> & { effectiveFrom: Date; effectiveUntil: Date | null })[];
  benefitGrants: (Omit<GrantRaw, "originalAmountDecimal" | "creditDecimal" | "reductionDecimal" | "renunciationDecimal" | "finalAmountDecimal"> & { originalAmountDecimal: Decimal; creditDecimal: Decimal; reductionDecimal: Decimal; renunciationDecimal: Decimal; finalAmountDecimal: Decimal })[];
  draws: (Omit<DrawRaw, "scheduledAt"> & { scheduledAt: Date })[];
  guides: { id: string; guideNumber: string | null; status: string; assessment: { taxpayerId: string } }[];
  accesses: { taxpayerId: string }[];
};
export async function readCollectionPage(database: DatabaseExecutor, usuarioId: string): Promise<CollectionSource> {
  const [profiles, portfolios, agreements, rules, benefits, grants, draws, guides, accesses] = await Promise.all([
    database.execute<ProfileRaw>(sql`SELECT * FROM "TaxCollectionProfile" WHERE active=true ORDER BY priority DESC`),
    database.execute<PortfolioRaw>(sql`SELECT p.id,p.name,p.status,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',i.id,'taxpayerId',i."taxpayerId",'sourceType',i."sourceType",'outstandingDecimal',i."outstandingDecimal"::text)) FROM "TaxCollectionPortfolioItem" i WHERE i."portfolioId"=p.id),'[]'::jsonb) AS items,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',a.id,'taxpayerId',a."taxpayerId",'actionType',a."actionType",'channel',a.channel,'status',a.status,'resultCode',a."resultCode",'scheduledAt',a."scheduledAt",'events',COALESCE((SELECT jsonb_agg(jsonb_build_object('eventType',e."eventType",'description',e.description) ORDER BY e."createdAt" DESC) FROM (SELECT * FROM "TaxCollectionActionEvent" e WHERE e."actionId"=a.id ORDER BY e."createdAt" DESC LIMIT 5) e),'[]'::jsonb)) ORDER BY a."scheduledAt" DESC) FROM "TaxCollectionAction" a WHERE a."portfolioId"=p.id),'[]'::jsonb) AS actions
      FROM "TaxCollectionPortfolio" p ORDER BY p."createdAt" DESC LIMIT 100`),
    database.execute<AgreementRaw>(sql`SELECT a.id,a."agreementNumber",a."taxpayerId",a.status,a."totalAgreementDecimal"::text,a."paidDecimal"::text,a."balanceDecimal"::text,jsonb_build_object('legalReference',r."legalReference") AS rule,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',d.id,'originalAmountDecimal',d."originalAmountDecimal"::text,'revisedAmountDecimal',d."revisedAmountDecimal"::text)) FROM "TaxInstallmentDebt" d WHERE d."agreementId"=a.id),'[]'::jsonb) AS debts,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('quotaNumber',q."quotaNumber",'originalDecimal',q."originalDecimal"::text,'paidDecimal',q."paidDecimal"::text,'balanceDecimal',q."balanceDecimal"::text,'status',q.status,'dueDate',q."dueDate") ORDER BY q."quotaNumber" ASC) FROM "TaxInstallmentQuota" q WHERE q."agreementId"=a.id),'[]'::jsonb) AS quotas,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('eventType',e."eventType",'description',e.description) ORDER BY e."createdAt" DESC) FROM (SELECT * FROM "TaxInstallmentEvent" e WHERE e."agreementId"=a.id ORDER BY e."createdAt" DESC LIMIT 8) e),'[]'::jsonb) AS events
      FROM "TaxInstallmentAgreement" a JOIN "TaxInstallmentRule" r ON r.id=a."ruleId" ORDER BY a."createdAt" DESC LIMIT 100`),
    database.execute<Rule>(sql`SELECT id,name,"legalReference","minInstallments","maxInstallments" FROM "TaxInstallmentRule" WHERE active=true ORDER BY "effectiveFrom" DESC`),
    database.execute<BenefitRaw>(sql`SELECT r.id,r.code,r.name,r."benefitType",r."legalReference",r."effectiveFrom",r."effectiveUntil",COALESCE((SELECT jsonb_agg(jsonb_build_object('id',g.id)) FROM "TaxBenefitGrant" g WHERE g."ruleId"=r.id),'[]'::jsonb) AS grants FROM "TaxBenefitRule" r ORDER BY r."createdAt" DESC LIMIT 100`),
    database.execute<GrantRaw>(sql`SELECT g.id,g."taxpayerId",jsonb_build_object('name',r.name) AS rule,g."originalAmountDecimal"::text,g."creditDecimal"::text,g."reductionDecimal"::text,g."renunciationDecimal"::text,g."finalAmountDecimal"::text,g.status FROM "TaxBenefitGrant" g JOIN "TaxBenefitRule" r ON r.id=g."ruleId" ORDER BY g."grantedAt" DESC LIMIT 100`),
    database.execute<DrawRaw>(sql`SELECT d.id,d.slug,d.name,d.status,d."scheduledAt",d."winnerCount",d."requiresPayment",d."officialActReference",
      COALESCE((SELECT jsonb_agg(jsonb_build_object('id',c.id,'couponNumber',c."couponNumber",'taxpayerId',c."taxpayerId")) FROM "TaxPrizeCoupon" c WHERE c."drawId"=d.id),'[]'::jsonb) AS coupons,
      COALESCE((SELECT jsonb_agg(jsonb_build_object('status',e.status,'winners',COALESCE((SELECT jsonb_agg(jsonb_build_object('position',w.position,'coupon',jsonb_build_object('id',c.id,'couponNumber',c."couponNumber",'taxpayerId',c."taxpayerId"))) FROM "TaxPrizeWinner" w JOIN "TaxPrizeCoupon" c ON c.id=w."couponId" WHERE w."executionId"=e.id),'[]'::jsonb))) FROM "TaxPrizeExecution" e WHERE e."drawId"=d.id),'[]'::jsonb) AS executions
      FROM "TaxPrizeDraw" d ORDER BY d."scheduledAt" DESC LIMIT 100`),
    database.execute<CollectionSource["guides"][number]>(sql`SELECT g.id,g."guideNumber",g.status,jsonb_build_object('taxpayerId',a."taxpayerId") AS assessment FROM "TaxGuide" g JOIN "TaxAssessment" a ON a.id=g."assessmentId" WHERE g.status<>'Cancelada' ORDER BY g."createdAt" DESC LIMIT 100`),
    database.execute<{ taxpayerId: string }>(sql`SELECT "taxpayerId" FROM "TaxpayerPortalAccess" WHERE "usuarioId"=${usuarioId} AND status='ATIVO'`),
  ]);
  return {
    profiles: profiles.rows.map(row => ({ ...row, createdAt: databaseTimestamp(row.createdAt), updatedAt: databaseTimestamp(row.updatedAt) })),
    portfolios: portfolios.rows.map(row => ({ ...row, items: row.items.map(item => ({ ...item, outstandingDecimal: new Decimal(item.outstandingDecimal) })), actions: row.actions.map(action => ({ ...action, scheduledAt: databaseTimestamp(action.scheduledAt) })) })),
    agreements: agreements.rows.map(row => ({ ...row, totalAgreementDecimal: new Decimal(row.totalAgreementDecimal), paidDecimal: new Decimal(row.paidDecimal), balanceDecimal: new Decimal(row.balanceDecimal), debts: row.debts.map(debt => ({ ...debt, originalAmountDecimal: new Decimal(debt.originalAmountDecimal), revisedAmountDecimal: debt.revisedAmountDecimal === null ? null : new Decimal(debt.revisedAmountDecimal) })), quotas: row.quotas.map(quota => ({ ...quota, originalDecimal: new Decimal(quota.originalDecimal), paidDecimal: new Decimal(quota.paidDecimal), balanceDecimal: new Decimal(quota.balanceDecimal), dueDate: databaseTimestamp(quota.dueDate) })) })),
    rules: rules.rows, benefitRules: benefits.rows.map(row => ({ ...row, effectiveFrom: databaseTimestamp(row.effectiveFrom), effectiveUntil: row.effectiveUntil === null ? null : databaseTimestamp(row.effectiveUntil) })),
    benefitGrants: grants.rows.map(row => ({ ...row, originalAmountDecimal: new Decimal(row.originalAmountDecimal), creditDecimal: new Decimal(row.creditDecimal), reductionDecimal: new Decimal(row.reductionDecimal), renunciationDecimal: new Decimal(row.renunciationDecimal), finalAmountDecimal: new Decimal(row.finalAmountDecimal) })),
    draws: draws.rows.map(row => ({ ...row, scheduledAt: databaseTimestamp(row.scheduledAt) })), guides: guides.rows, accesses: accesses.rows,
  };
}
