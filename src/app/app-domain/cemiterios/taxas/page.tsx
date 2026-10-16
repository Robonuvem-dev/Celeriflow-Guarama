import Link from "next/link";
import { z } from "zod";
import { canPerformModuleOperation, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listCemeteryFeeEvents, listCemeteryFeeRules } from "@/lib/cemeteries/fees-service";
import { AdditionalFeeEventForm, FeeRuleForm, RetryFeeButton } from "./FeeForms";
import CemeteryLookup from "@/components/cemeteries/CemeteryLookup";

export const dynamic = "force-dynamic";
const statuses: Record<string, string> = { AGUARDANDO_CONFIGURACAO: "Aguardando configuração", AGUARDANDO_CONTRIBUINTE: "Aguardando responsável tributário", PENDENTE: "Pendente de emissão", FALHA_EMISSAO: "Falha na emissão", EMITIDA: "Emitida" };
const schema = z.object({ rulesPage: z.coerce.number().int().min(1).default(1), eventsPage: z.coerce.number().int().min(1).default(1), status: z.string().default(""), q: z.string().trim().max(120).default(""), cemeteryId: z.string().max(100).default("") });

export default async function CemeteryFeesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const parsed = schema.safeParse(await searchParams);
  if (!parsed.success) return <p className="p-6" role="alert">Filtros inválidos.</p>;
  const filters = parsed.data;
  const status = filters.status in statuses ? filters.status : "";
  const context = await getTenantContextForModule("CEMITERIOS");
  const { prisma } = context;
  const [rules, events, cemeteries, taxes] = await Promise.all([
    listCemeteryFeeRules(prisma, filters.rulesPage, filters), listCemeteryFeeEvents(prisma, filters.eventsPage, status, filters),
    prisma.taxCemetery.findMany({ select: { id: true, name: true }, orderBy: { name: "asc" } }),
    prisma.tax.findMany({ where: { isActive: true, taxType: "Taxa" }, select: { id: true, name: true }, orderBy: { name: "asc" } }),
  ]);
  const names = new Map(cemeteries.map(r => [r.id, r.name]));
  const href = (rulesPage: number, eventsPage: number) => `/cemiterios/taxas?${new URLSearchParams({ q: filters.q, cemeteryId: filters.cemeteryId, status, rulesPage: String(rulesPage), eventsPage: String(eventsPage) })}`;
  const pagination = (kind: "rulesPage" | "eventsPage", page: number, total: number) => <nav aria-label={`Paginação ${kind}`} className="flex flex-wrap gap-3 text-sm">
    {page > 1 && <Link href={href(kind === "rulesPage" ? page - 1 : rules.page, kind === "eventsPage" ? page - 1 : events.page)}>Anterior</Link>}
    <span>{total} registros · página {page} de {Math.max(1, Math.ceil(total / 20))} · 20 por página</span>
    {page * 20 < total && <Link href={href(kind === "rulesPage" ? page + 1 : rules.page, kind === "eventsPage" ? page + 1 : events.page)}>Próxima</Link>}
    <form method="get"><input type="hidden" name="q" value={filters.q} /><input type="hidden" name="cemeteryId" value={filters.cemeteryId} /><input type="hidden" name="status" value={status} /><input type="hidden" name={kind === "rulesPage" ? "eventsPage" : "rulesPage"} value={kind === "rulesPage" ? events.page : rules.page} /><label>Ir para página <input name={kind} type="number" min={1} max={Math.max(1, Math.ceil(total / 20))} defaultValue={page} className="w-16 rounded border p-1" /></label><button className="rounded border px-2">Ir</button></form>
  </nav>;
  const canCreate = canPerformModuleOperation(context.user, "CEMITERIOS", "create");
  return <main className="space-y-6 p-6"><header><h1 className="text-2xl font-semibold">Taxas cemiteriais por evento</h1><p>Regras publicadas, fatos geradores únicos e DAMs registrados na Tributação.</p></header>
    <form className="grid gap-3 rounded border p-4 md:grid-cols-3"><label className="grid gap-1">Buscar evento / descrição / origem<input name="q" defaultValue={filters.q} className="rounded border p-2" /></label><CemeteryLookup name="cemeteryId" kind="cemetery" label="Cemitério" defaultValue={filters.cemeteryId} /><label className="grid gap-1">Situação<select name="status" defaultValue={status} className="rounded border p-2"><option value="">Todas</option>{Object.entries(statuses).map(([code,label]) => <option key={code} value={code}>{label}</option>)}</select></label><button className="rounded border p-2">Filtrar</button></form>
    {canCreate && <section><h2 className="mb-3 font-semibold">Publicar regra</h2><FeeRuleForm taxes={taxes} cemeteries={cemeteries} /></section>}
    <section className="space-y-3"><h2 className="font-semibold">Versões publicadas · {rules.total}</h2><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Evento / versão", "Abrangência", "Fórmula", "Vigência", "Prazo", "Fundamento"].map(label => <th key={label} className="border-b p-2">{label}</th>)}</tr></thead><tbody>{rules.rows.map(r => <tr key={r.id}><td className="border-b p-2">{r.eventType} · v{r.version}<br />{r.label}</td><td className="border-b p-2">{r.cemeteryId ? names.get(r.cemeteryId) || r.cemeteryId : "Geral"}</td><td className="border-b p-2">{r.formula} · R$ {r.baseAmount.toFixed(2)}</td><td className="border-b p-2">{r.validFrom.toISOString().slice(0,10)} até {r.validUntil?.toISOString().slice(0,10) || "sem término"}</td><td className="border-b p-2">{r.dueDays} dias</td><td className="border-b p-2">{r.legalBasis}</td></tr>)}</tbody></table></div>{!rules.total && <p>Nenhuma regra no filtro.</p>}{pagination("rulesPage", rules.page, rules.total)}</section>
    {canCreate && <section><h2 className="mb-3 font-semibold">Evento adicional vinculado à origem</h2><AdditionalFeeEventForm /></section>}
    <section className="space-y-3"><h2 className="font-semibold">Eventos e guias · {events.total}</h2><p>Sem regra vigente, o fato aguarda configuração. Falhas financeiras podem ser reprocessadas sem duplicar cobranças.</p><div className="overflow-x-auto"><table className="w-full text-left text-sm"><thead><tr>{["Fato gerador", "Contribuinte", "Cálculo", "Situação", "Lançamento / DAM", "Ação"].map(label => <th key={label} className="border-b p-2">{label}</th>)}</tr></thead><tbody>{events.rows.map(e => <tr key={e.id}><td className="border-b p-2">{e.eventType}<br />{e.occurredAt.toISOString().slice(0,10)}<br />{e.sourceType}: {e.sourceId}</td><td className="border-b p-2">{e.guide?.assessment.taxpayer.person?.fullName ?? e.guide?.assessment.taxpayer.company?.corporateName ?? e.taxpayerId ?? "Responsável ausente"}</td><td className="border-b p-2">{e.amount ? `R$ ${e.amount.toFixed(2)}` : "Sem regra"}<br />Quantidade {e.quantity.toString()}<br />Vencimento {e.dueDate?.toISOString().slice(0,10) || "—"}</td><td className="border-b p-2">{statuses[e.status] || e.status}{e.lastError && <p className="max-w-sm text-red-700">{e.lastError}</p>}</td><td className="border-b p-2">{e.guide ? <><p>{e.guide.assessment.assessmentNumber}</p><Link className="underline" href={`/cemiterios/taxas/guias/${e.guide.id}`} target="_blank">{e.guide.guideNumber} · {e.guide.status} · Reimprimir</Link></> : "Nenhuma guia"}</td><td className="border-b p-2">{!e.assessmentId && canCreate && <RetryFeeButton eventKey={e.eventKey} />}</td></tr>)}</tbody></table></div>{!events.total && <p>Nenhum evento no filtro.</p>}{pagination("eventsPage", events.page, events.total)}</section>
  </main>;
}
