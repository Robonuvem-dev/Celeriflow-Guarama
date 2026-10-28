import Link from "next/link";
import { Search, Users } from "lucide-react";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { ErpStatusBadge, ErpTableContainer, ErpTableTd, ErpTableTh, ErpTableThead, ErpTableTr } from "@/components/app-ui/erp/ErpTable";
import { BulkTaxpayerUpdate } from "./BulkTaxpayerUpdate";
import { db } from "@/db/client";
import { readFiscalPeoplePage } from "@/db/repositories/taxation-pages/cadastral-details";

export const dynamic = "force-dynamic";
const PAGE_SIZE = 20;

export default async function PessoasFiscaisPage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = String(params.q ?? "").trim();
  const page = Math.max(1, Number(params.page) || 1);
  const context = await getTenantContextForModule("TRIBUTACAO");
  const { total, taxpayers } = await readFiscalPeoplePage(context.database ?? db, q, page);
  const query = new URLSearchParams(); if (q) query.set("q", q);
  const href = (target: number) => { const next = new URLSearchParams(query); next.set("page", String(target)); return `/tributacao/pessoas?${next}`; };

  return <div className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-hidden p-2 sm:p-2.5">
    <ErpPageTitle title="Pessoas e cadastro fiscal" icon={<Users className="size-4 text-emerald-600" />} action={<div className="flex items-center gap-2"><BulkTaxpayerUpdate query={q} total={total} /><Link href={`/tributacao/pessoas/relatorio?q=${encodeURIComponent(q)}`} className="inline-flex h-7 items-center rounded bg-emerald-700 px-2.5 text-[11px] font-semibold text-white">Exportar CSV</Link></div>} />
    <ErpListFrame toolbar={<form className="flex items-center gap-2"><label className="relative flex-1"><Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-slate-400" /><input name="q" defaultValue={q} placeholder="Buscar nome, CPF, CNPJ ou inscrição" className="h-8 w-full rounded border border-slate-200 bg-white pl-8 pr-2 text-xs" /></label><button className="h-8 rounded bg-emerald-700 px-3 text-xs font-semibold text-white">Buscar</button></form>} pagination={<ErpPagination page={page} total={total} pageSize={PAGE_SIZE} previousHref={href(page - 1)} nextHref={href(page + 1)} label="pessoas fiscais" />}>
      <ErpTableContainer><ErpTableThead><tr><ErpTableTh className="w-[32%]">Pessoa</ErpTableTh><ErpTableTh className="w-[17%]">Documento</ErpTableTh><ErpTableTh className="w-[16%]">Inscrição</ErpTableTh><ErpTableTh className="w-[12%]">Vínculos</ErpTableTh><ErpTableTh className="w-[12%]">Situação</ErpTableTh><ErpTableTh className="w-[11%] text-right">Ação</ErpTableTh></tr></ErpTableThead><tbody>{taxpayers.map((taxpayer) => { const name = taxpayer.company?.corporateName ?? taxpayer.person?.fullName ?? "Cadastro sem nome"; const document = taxpayer.company?.cnpj ?? taxpayer.person?.cpf ?? "—"; return <ErpTableTr key={taxpayer.id}><ErpTableTd className="truncate font-semibold" title={name}>{name}<span className="block text-[9px] font-normal text-slate-400">{taxpayer.taxpayerType === "PJ" ? "Pessoa jurídica" : "Pessoa física"} · {(taxpayer.company?.addresses.length ?? taxpayer.person?.addresses.length ?? 0)} endereço(s)</span></ErpTableTd><ErpTableTd className="tabular-nums">{document}</ErpTableTd><ErpTableTd>{taxpayer.municipalInsc ?? "Não informada"}</ErpTableTd><ErpTableTd>{taxpayer._count.economicRegistrations} empresa(s) · {taxpayer._count.realEstates} imóvel(is)</ErpTableTd><ErpTableTd><ErpStatusBadge variant={taxpayer.status === "Ativo" ? "success" : "neutral"}>{taxpayer.status}</ErpStatusBadge></ErpTableTd><ErpTableTd className="text-right"><Link href={`/tributacao/pessoas/${taxpayer.id}`} className="text-[10px] font-bold text-emerald-700 hover:underline">Abrir ficha</Link></ErpTableTd></ErpTableTr>; })}{!taxpayers.length && <tr><td colSpan={6} className="p-8 text-center text-xs text-slate-400">Nenhum contribuinte encontrado.</td></tr>}</tbody></ErpTableContainer>
    </ErpListFrame>
  </div>;
}
