import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import type { Prisma } from "@prisma/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { constructionCaseWhere } from "@/lib/obras/construction-policy";
import ConstructionIntegrationsClient from "./ConstructionIntegrationsClient";

export default async function IntegrationsPage({ searchParams }: { searchParams: Promise<{ q?: string; period?: string; kind?: string; receipt?: string; page?: string }> }) {
  const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context);
  if (!access.administrator && !access.roles.includes("MANAGER")) notFound();
  const query = await searchParams;
  const q = (query.q || "").trim().slice(0, 100);
  const period = /^\d{4}-(0[1-9]|1[0-2])$/.test(query.period || "") ? query.period! : "";
  const kind = query.kind === "initial" || query.kind === "rectification" ? query.kind : "all";
  const receipt = query.receipt === "with" || query.receipt === "without" ? query.receipt : "all";
  const scope: Prisma.ConstructionFederalExportWhereInput = access.administrator ? {} : { scope: access.departmentId || "", items: { every: { case: constructionCaseWhere(access) } } };
  const where: Prisma.ConstructionFederalExportWhereInput = { AND: [scope, ...(q ? [{ OR: [{ id: { contains: q, mode: "insensitive" as const } }, { hashSha256: { contains: q, mode: "insensitive" as const } }, { reason: { contains: q, mode: "insensitive" as const } }, { items: { some: { case: { process: { protocolNumber: { contains: q, mode: "insensitive" as const } } } } } }] }] : [])], ...(period ? { period } : {}), ...(kind === "initial" ? { rectifiesId: null } : kind === "rectification" ? { rectifiesId: { not: null } } : {}), ...(receipt === "with" ? { receipts: { some: {} } } : receipt === "without" ? { receipts: { none: {} } } : {}) };
  const total = await context.prisma.constructionFederalExport.count({ where });
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const [cases, batches, rectificationOptions] = await Promise.all([
    context.prisma.constructionCase.findMany({ where: constructionCaseWhere(access), select: { id: true, process: { select: { protocolNumber: true } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }] }),
    context.prisma.constructionFederalExport.findMany({ where, include: { receipts: { orderBy: { createdAt: "desc" } } }, orderBy: [{ createdAt: "desc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 }),
    context.prisma.constructionFederalExport.findMany({ where: access.administrator ? { scope: "GLOBAL" } : scope, select: { id: true, scope: true, period: true, version: true }, distinct: ["scope", "period"], orderBy: [{ scope: "asc" }, { period: "desc" }, { version: "desc" }] }),
  ]);
  const href = (target: number) => `?${new URLSearchParams({ q, period, kind, receipt, page: String(target) })}`;
  return <PageFrame className="space-y-4 p-4">
    <Link href="/obras/construcao-civil" className="text-sm underline">Construção Civil</Link>
    <h1 className="text-xl font-semibold">Integrações e lotes de alvarás / início</h1>
    <p className="rounded border bg-amber-50 p-3 text-sm text-amber-950">Ambiente demonstrativo — MUNICIPAL_DEMO_JSON_V1. Leiaute federal e canal de transmissão ainda não homologados. O lote é um snapshot municipal imutável. Recibo manual registra evidência declarada pelo gestor; não comprova aceite oficial automatizado.</p>
    <form className="flex flex-wrap gap-2 rounded border p-3">
      <input name="q" aria-label="Buscar lote, hash, motivo ou protocolo" placeholder="Lote, hash, motivo ou protocolo" defaultValue={q} className="min-w-0 flex-1 rounded border p-2 text-sm" />
      <label className="text-sm">Competência <input name="period" type="month" defaultValue={period} className="rounded border p-2" /></label>
      <select name="kind" aria-label="Tipo de lote" defaultValue={kind} className="rounded border p-2 text-sm"><option value="all">Todos os tipos</option><option value="initial">Originais</option><option value="rectification">Retificações</option></select>
      <select name="receipt" aria-label="Registro de recibo" defaultValue={receipt} className="rounded border p-2 text-sm"><option value="all">Todos os recibos</option><option value="with">Com recibo</option><option value="without">Sem recibo</option></select>
      <button className="rounded border px-3 text-sm">Filtrar histórico</button><Link href="/obras/construcao-civil/integracoes" className="self-center text-sm underline">Limpar</Link>
    </form>
    <ConstructionIntegrationsClient cases={cases.map((item) => ({ id: item.id, protocol: item.process.protocolNumber }))} rectificationOptions={rectificationOptions} batches={batches.map((row) => ({ id: row.id, period: row.period, version: row.version, hash: row.hashSha256, rectifiesId: row.rectifiesId, createdAt: row.createdAt.toISOString(), receipts: row.receipts.map((receipt) => ({ id: receipt.id, protocol: receipt.protocol, destination: receipt.destination, submittedAt: receipt.submittedAt.toISOString(), evidenceHash: receipt.evidenceHash })) }))} />
    {!batches.length && <p className="text-sm">Nenhum lote corresponde aos filtros.</p>}
    <ErpPagination page={page} total={total} pageSize={20} previousHref={href(page - 1)} nextHref={href(page + 1)} label="lotes" jumpTo={{ pathname: "/obras/construcao-civil/integracoes", values: { q, period, kind, receipt } }} />
  </PageFrame>;
}
