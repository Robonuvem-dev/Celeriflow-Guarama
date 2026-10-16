import Link from "next/link";
import { notFound } from "next/navigation";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import { constructionFeeKinds, confirmedConstructionBalance } from "@/lib/obras/construction-tax-engine";
import { getConstructionPropertyDebts } from "@/lib/obras/construction-taxation";
import ConstructionTaxClient from "./ConstructionTaxClient";

export default async function ConstructionTaxPage({ searchParams }: { searchParams: Promise<{ caseId?: string; page?: string }> }) {
  const params = await searchParams;
  const context = await getTenantContextForModule("OBRAS");
  const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.length) notFound();
  const page = Math.max(1, Number.parseInt(params.page || "1", 10) || 1);
  const where = { AND: [constructionCaseWhere(access), ...(params.caseId ? [{ id: params.caseId }] : [])] };
  const [records, taxes, rules, total] = await Promise.all([
    context.prisma.constructionCase.findMany({ where, orderBy: { createdAt: "desc" }, take: 20, skip: (page - 1) * 20, include: { configuration: true, process: { include: { person: { include: { taxpayerInfo: true } }, company: { include: { taxpayerInfo: true } } } }, properties: { include: { realEstate: true } }, fees: { include: { assessment: { include: { guides: { include: { payments: { where: { status: "Confirmado" } } } } } } } } } }),
    context.prisma.tax.findMany({ where: { isActive: true, taxType: "Taxa" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
    context.prisma.constructionTaxRuleVersion.findMany({ orderBy: { publishedAt: "desc" }, take: 30, include: { tax: true } }),
    context.prisma.constructionCase.count({ where }),
  ]);
  const documentRequests = await context.prisma.constructionDocumentRequest.findMany({ where: { caseId: { in: records.map((record) => record.id) }, status: "PENDING", type: { in: ["CORRECTION", "RENEWAL"] } }, select: { id: true, caseId: true, type: true, sourceIssuedDocumentId: true } });
  const debts = params.caseId && records.length ? await context.prisma.$transaction((tx) => getConstructionPropertyDebts(tx, records[0].id)) : null;
  return <main className="space-y-4 p-4">
    <h1 className="text-xl font-semibold">Construção Civil — Taxas e débitos</h1>
    <Link href="/obras/construcao-civil" className="underline">Solicitações</Link>
    <ConstructionTaxClient taxes={taxes} canManage={access.administrator || access.roles.includes("MANAGER")} cases={records.map((record) => { const taxpayer = record.process.person?.taxpayerInfo || record.process.company?.taxpayerInfo; return { id: record.id, name: record.process.protocolNumber, revision: record.revisionCount, documentRequests: documentRequests.filter((request) => request.caseId === record.id).map((request) => ({ id: request.id, name: `${request.type} — ${request.id} — original ${request.sourceIssuedDocumentId}` })), taxpayer: taxpayer?.status === "Ativo" ? { id: taxpayer.id, name: record.process.person?.fullName || record.process.company?.corporateName || taxpayer.id } : null, properties: record.properties.map((property) => ({ id: property.realEstateId, name: property.realEstate.municipalInsc || property.realEstateId })) }; })} />
    {debts && <section className="rounded border p-4"><h2 className="font-semibold">Consulta atual de débitos dos imóveis</h2><p>Total: R$ {debts.total} • Tributários: R$ {debts.taxTotal} • Não tributários: R$ {debts.nonTaxTotal} • {debts.checkedAt}</p>{debts.debts.map((debt) => <p key={debt.assessmentId}>{debt.realEstateId} / {debt.year}: R$ {debt.balance}</p>)}{debts.nonTaxDebts.map((debt) => <p key={debt.registryEntryId}>{debt.realEstateId} / não tributário: R$ {debt.balance}</p>)}</section>}
    <section className="space-y-3"><h2 className="font-semibold">Lançamentos reais vinculados</h2>{records.map((record) => <article key={record.id} className="rounded border p-4"><Link className="underline" href={`/obras/construcao-civil/taxas?caseId=${record.id}`}>{record.process.protocolNumber} — consultar débitos</Link><p>Franquia: {record.configuration.freeRevisions} • Revisões: {record.revisionCount}</p>{record.fees.map((fee) => <div key={fee.id} className="mt-2 border-t pt-2"><p>{constructionFeeKinds[fee.kind as keyof typeof constructionFeeKinds]} / revisão {fee.revision} • R$ {fee.amount.toFixed(2)}</p>{fee.exemptionReason ? <p>Isenta: {fee.exemptionReason}</p> : fee.assessment?.guides.filter((guide) => guide.status !== "Cancelada").map((guide) => <p key={guide.id}><Link className="underline" href={`/obras/construcao-civil/taxas/guias/${guide.id}`}>{guide.guideNumber} — {guide.status}</Link> • Saldo R$ {confirmedConstructionBalance(guide.totalValueDecimal ?? guide.totalValue, guide.payments).toFixed(2)}</p>)}</div>)}</article>)}</section>
    <nav className="flex gap-4">{page > 1 && <Link href={`?page=${page - 1}`}>Anterior</Link>}{page * 20 < total && <Link href={`?page=${page + 1}`}>Próxima</Link>}</nav>
    <section className="rounded border p-4"><h2 className="font-semibold">Histórico de regras publicadas</h2>{rules.map((rule) => <p key={rule.id}>{rule.kind} v{rule.version} — {rule.tax.name} — {rule.startsAt.toISOString().slice(0, 10)} a {rule.endsAt?.toISOString().slice(0, 10) || "sem fim"} — fixo R$ {rule.fixedAmount.toFixed(2)} + R$ {rule.amountPerSquareMeter.toFixed(4)}/m² — {rule.demonstration ? "DEMONSTRATIVO" : "DAM interno"}</p>)}</section>
  </main>;
}
