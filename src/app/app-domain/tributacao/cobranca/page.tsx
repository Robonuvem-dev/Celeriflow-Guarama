import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { collectionDashboard } from "@/lib/tributacao/s8-service";
import CobrancaClient from "./CobrancaClient";
import { db } from "@/db/client";
import { listPageTaxpayers } from "@/db/repositories/taxation-pages/registry";
import { readCollectionPage } from "@/db/repositories/taxation-pages/collection";
export const dynamic = "force-dynamic";
export default async function CobrancaPage() {
  const context = await getTenantContextForModule("TRIBUTACAO"); const { user } = context; const database = context.database ?? db;
  const [
    taxpayers,
    { profiles, portfolios, agreements, rules, benefitRules, benefitGrants, draws, guides, accesses },
    ranking,
  ] = await Promise.all([
    listPageTaxpayers(database, { active: true, order: "created-asc", limit: 200 }),
    readCollectionPage(database, user.id),
    collectionDashboard(database),
  ]);
  const names = new Map(
    taxpayers.map((row) => [
      row.id,
      row.company?.corporateName ?? row.person?.fullName ?? row.id,
    ]),
  );
  return (
    <CobrancaClient
      data={{
        taxpayers: taxpayers.map((row) => ({
          id: row.id,
          name: names.get(row.id)!,
          document: row.company?.cnpj ?? row.person?.cpf ?? "",
        })),
        profiles,
        portfolios: portfolios.map((row) => ({
          id: row.id,
          name: row.name,
          status: row.status,
          items: row.items.map((item) => ({
            id: item.id,
            taxpayerId: item.taxpayerId,
            taxpayer: names.get(item.taxpayerId) ?? item.taxpayerId,
            source: item.sourceType,
            outstanding: Number(item.outstandingDecimal),
          })),
          actions: row.actions.map((action) => ({
            id: action.id,
            taxpayerId: action.taxpayerId,
            taxpayer: names.get(action.taxpayerId) ?? action.taxpayerId,
            type: action.actionType,
            channel: action.channel,
            status: action.status,
            result: action.resultCode,
            scheduledAt: action.scheduledAt.toISOString(),
            events: action.events.map(
              (e) => `${e.eventType}: ${e.description}`,
            ),
          })),
        })),
        agreements: agreements.map((row) => ({
          id: row.id,
          number: row.agreementNumber,
          taxpayer: names.get(row.taxpayerId) ?? row.taxpayerId,
          status: row.status,
          total: Number(row.totalAgreementDecimal),
          paid: Number(row.paidDecimal),
          balance: Number(row.balanceDecimal),
          legalReference: row.rule.legalReference,
          debts: row.debts.map((d) => ({
            id: d.id,
            amount: Number(d.revisedAmountDecimal ?? d.originalAmountDecimal),
          })),
          quotas: row.quotas.map((q) => ({
            number: q.quotaNumber,
            original: Number(q.originalDecimal),
            paid: Number(q.paidDecimal),
            balance: Number(q.balanceDecimal),
            status: q.status,
            dueDate: q.dueDate.toISOString(),
          })),
          events: row.events.map((e) => `${e.eventType}: ${e.description}`),
        })),
        rules: rules.map((r) => ({
          id: r.id,
          name: r.name,
          legalReference: r.legalReference,
          min: r.minInstallments,
          max: r.maxInstallments,
        })),
        benefitRules: benefitRules.map((r) => ({
          id: r.id,
          code: r.code,
          name: r.name,
          type: r.benefitType,
          legalReference: r.legalReference,
          from: r.effectiveFrom.toISOString(),
          until: r.effectiveUntil?.toISOString() ?? null,
          grants: r.grants.length,
        })),
        benefitGrants: benefitGrants.map((g) => ({
          id: g.id,
          taxpayer: names.get(g.taxpayerId) ?? g.taxpayerId,
          rule: g.rule.name,
          original: Number(g.originalAmountDecimal),
          credit: Number(g.creditDecimal),
          reduction: Number(g.reductionDecimal),
          renunciation: Number(g.renunciationDecimal),
          final: Number(g.finalAmountDecimal),
          status: g.status,
        })),
        draws: draws.map((d) => ({
          id: d.id,
          slug: d.slug,
          name: d.name,
          status: d.status,
          scheduledAt: d.scheduledAt.toISOString(),
          winnerCount: d.winnerCount,
          requiresPayment: d.requiresPayment,
          officialAct: d.officialActReference,
          coupons: d.coupons.map((c) => ({
            id: c.id,
            number: c.couponNumber,
            taxpayer: names.get(c.taxpayerId) ?? c.taxpayerId,
          })),
          winners: d.executions.flatMap((e) =>
            e.winners.map((w) => ({
              position: w.position,
              coupon: w.coupon.couponNumber,
              taxpayer: names.get(w.coupon.taxpayerId) ?? w.coupon.taxpayerId,
              status: e.status,
            })),
          ),
        })),
        guides: guides.map((g) => ({
          id: g.id,
          number: g.guideNumber ?? g.id,
          taxpayerId: g.assessment.taxpayerId,
          status: g.status,
        })),
        ranking: ranking.map((r) => ({
          ...r,
          taxpayer: names.get(r.taxpayerId) ?? r.taxpayerId,
        })),
        portalTaxpayerIds: accesses.map((a) => a.taxpayerId),
      }}
    />
  );
}
