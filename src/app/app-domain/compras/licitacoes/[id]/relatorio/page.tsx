import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { loadBiddingReport } from "@/db/repositories/procurement/bidding-reports";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { BIDDING_REPORTS, buildBiddingReport, isBiddingReportKind, validateBiddingReportPeriod } from "@/lib/compras/bidding-reports";
import { PrintInstrumentReportButton } from "../../../contratos/PrintInstrumentReportButton";

export default async function BiddingReportPage({ params, searchParams }: {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const context = await getTenantContextForModule("COMPRAS");
  const { id } = await params;
  const search = await searchParams;
  const value = (key: string) => typeof search[key] === "string" ? search[key] as string : "";
  const kindValue = value("report") || "resumo";
  if (!isBiddingReportKind(kindValue)) notFound();
  const bidding = await loadBiddingReport(context.database ?? db, id);
  if (!bidding) notFound();
  const filters = { supplierId: value("supplierId"), material: value("material"), start: value("start"), end: value("end"), order: value("order") };
  const error = validateBiddingReportPeriod(filters.start, filters.end);
  const table = error ? null : buildBiddingReport(bidding, kindValue, filters);
  const csv = new URLSearchParams({ report: kindValue, ...filters });
  return <main className="space-y-4 p-4 print:p-0">
    <div className="flex flex-wrap items-center gap-2 print:hidden">
      <Link href={`/compras/licitacoes/${id}`} className="underline">Voltar à licitação</Link>
      {!error && <><PrintInstrumentReportButton /><a href={`/compras/licitacoes/${id}/relatorio/csv?${csv}`} className="underline">Exportar CSV</a></>}
    </div>
    <h1 className="text-xl font-semibold">{BIDDING_REPORTS[kindValue]} — {bidding.number}</h1>
    <p>{bidding.modality} · Processo {bidding.process.number} · {bidding.status}</p>
    <p>{bidding.process.object}</p>
    <form className="flex flex-wrap items-end gap-3 print:hidden">
      <label>Relatório<select name="report" defaultValue={kindValue} className="block rounded border p-2">{Object.entries(BIDDING_REPORTS).map(([key, title]) => <option key={key} value={key}>{title}</option>)}</select></label>
      <label>Fornecedor<select name="supplierId" defaultValue={filters.supplierId} className="block rounded border p-2"><option value="">Todos</option>{bidding.biddingParticipants.map(participant => <option key={participant.id} value={participant.supplierId}>{participant.supplier.company?.corporateName || participant.supplier.company?.tradeName || participant.supplier.person?.fullName || participant.displayCode}</option>)}</select></label>
      <label>Material do lote<input name="material" defaultValue={filters.material} className="block rounded border p-2" /></label>
      <label>Data inicial<input type="date" name="start" defaultValue={filters.start} className="block rounded border p-2" /></label>
      <label>Data final<input type="date" name="end" defaultValue={filters.end} className="block rounded border p-2" /></label>
      <label>Ordenação<select name="order" defaultValue={filters.order} className="block rounded border p-2"><option value="">Por lote</option><option value="fornecedor">Por fornecedor</option></select></label>
      <button className="rounded border px-3 py-2">Emitir relatório</button>
      <Link href={`/compras/licitacoes/${id}/relatorio`} className="underline">Limpar</Link>
    </form>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <p className="text-sm">Valores monetários em reais. Datas no horário de Brasília. Os mapas exibem decisões registradas; empates não são resolvidos pela impressão. O filtro de material seleciona lotes; datas filtram a ocorrência do lance, decisão, início da fase ou ato, conforme o relatório.</p>
    {table && <div className="overflow-x-auto print:overflow-visible"><table className="w-full border-collapse text-sm">
      <caption className="sr-only">{BIDDING_REPORTS[kindValue]}</caption>
      <thead className="print:table-header-group"><tr>{table.columns.map(column => <th key={column} className="border p-2 text-left">{column}</th>)}</tr></thead>
      <tbody>{table.rows.map((row, index) => <tr key={index} className="break-inside-avoid">{row.map((cell, cellIndex) => <td key={cellIndex} className="whitespace-pre-wrap border p-2 align-top">{cell}</td>)}</tr>)}</tbody>
    </table>{!table.rows.length && <p className="py-4">Nenhum registro corresponde aos filtros.</p>}</div>}
    <p className="text-xs">Emitido em {new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(new Date())}.</p>
  </main>;
}
