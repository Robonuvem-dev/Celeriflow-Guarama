import Link from "next/link";
import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { loadBiddingRegister } from "@/db/repositories/procurement/bidding-register";
import { BIDDING_REGISTERS, filterBiddingRegister, isBiddingRegisterKind } from "@/lib/compras/bidding-register";
import { validateBiddingReportPeriod } from "@/lib/compras/bidding-reports";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PrintInstrumentReportButton } from "../../contratos/PrintInstrumentReportButton";

export default async function BiddingRegisterPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const search = await searchParams;
  const value = (key: string) => typeof search[key] === "string" ? search[key] as string : "";
  const kind = value("report") || "geral";
  if (!isBiddingRegisterKind(kind)) notFound();
  const filters = { kind, modality: value("modality"), status: value("status"), start: value("start"), end: value("end"), q: value("q"), supplierId: value("supplierId") };
  const error = validateBiddingReportPeriod(filters.start, filters.end);
  const data = await loadBiddingRegister(context.database ?? db);
  const rows = error ? [] : filterBiddingRegister(data, filters);
  const modalities = [...new Set(data.map(row => row.modality))].sort();
  const statuses = [...new Set(data.map(row => row.status))].sort();
  const suppliers = [...new Map(data.flatMap(row => row.participants.map(participant => [participant.supplierId, participant.name] as const))).entries()].sort((a, b) => a[1].localeCompare(b[1], "pt-BR"));
  const date = (value: Date | null) => value ? new Intl.DateTimeFormat("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "short", timeStyle: "short" }).format(value) : "Não informada";
  return <main className="space-y-4 p-4 print:p-0">
    <div className="flex gap-3 print:hidden"><Link href="/compras/licitacoes" className="underline">Voltar às licitações</Link>{!error && <PrintInstrumentReportButton />}</div>
    <h1 className="text-xl font-semibold">{BIDDING_REGISTERS[kind]}</h1>
    <form className="flex flex-wrap items-end gap-3 print:hidden">
      <label>Relatório<select name="report" defaultValue={kind} className="block rounded border p-2">{Object.entries(BIDDING_REGISTERS).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
      <label>Processo, licitação ou objeto<input name="q" defaultValue={filters.q} className="block rounded border p-2" /></label>
      <label>Modalidade<select name="modality" defaultValue={filters.modality} className="block rounded border p-2"><option value="">Todas</option>{modalities.map(modality => <option key={modality}>{modality}</option>)}</select></label>
      <label>Situação<select name="status" defaultValue={filters.status} className="block rounded border p-2"><option value="">Todas</option>{statuses.map(status => <option key={status}>{status}</option>)}</select></label>
      <label>Fornecedor<select name="supplierId" defaultValue={filters.supplierId} className="block rounded border p-2"><option value="">Todos</option>{suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}</select></label>
      <label>Data inicial<input type="date" name="start" defaultValue={filters.start} className="block rounded border p-2" /></label>
      <label>Data final<input type="date" name="end" defaultValue={filters.end} className="block rounded border p-2" /></label>
      <button className="rounded border px-3 py-2">Emitir relatório</button><Link href="/compras/licitacoes/relatorios" className="underline">Limpar</Link>
    </form>
    {error && <p role="alert" className="text-destructive">{error}</p>}
    <p className="text-sm">Período: {filters.start || "sem início"} a {filters.end || "sem fim"}. Referência: {kind === "homologadas" ? "data de homologação registrada na fase" : kind === "anuladas" ? "data do evento de anulação" : kind === "agendadas" ? "sessão futura" : "abertura / criação do processo licitatório"}. Horário de Brasília. Processos históricos sem data do evento não entram no período específico de homologação ou anulação. Fornecedores relacionados são participantes; vencedores têm indicação própria.</p>
    <div className="overflow-x-auto print:overflow-visible"><table className="w-full border-collapse text-sm"><caption className="sr-only">{BIDDING_REGISTERS[kind]}</caption>
      {kind === "resumo" ? <><thead><tr>{["Modalidade", "Processos", "Anulados", "Homologados / concluídos"].map(title => <th key={title} className="border p-2 text-left">{title}</th>)}</tr></thead><tbody>{[...new Set(rows.map(row => row.modality))].sort().map(modality => {
        const group = rows.filter(row => row.modality === modality);
        return <tr key={modality}>{[modality, String(group.length), String(group.filter(row => row.status === "Anulada").length), String(group.filter(row => row.homologatedAt || ["Homologado", "Concluída"].includes(row.status)).length)].map((cell, index) => <td key={index} className="border p-2">{cell}</td>)}</tr>;
      })}</tbody></> : <><thead><tr>{["Licitação", "Processo", "Modalidade", "Objeto", "Abertura", "Sessão", "Situação", "Fornecedores"].map(title => <th key={title} className="border p-2 text-left">{title}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.id} className="break-inside-avoid">
        <td className="border p-2"><Link href={`/compras/licitacoes/${row.id}/relatorio`} className="underline">{row.number}</Link></td>
        {[row.process.number, row.modality, row.process.object, date(row.createdAt), date(row.sessionDate), row.status, row.participants.filter(participant => !filters.supplierId || participant.supplierId === filters.supplierId).map(participant => `${participant.name}${participant.winner ? " (vencedor)" : ""}`).join("; ") || "Nenhum"].map((cell, index) => <td key={index} className="border p-2 align-top">{cell}</td>)}
      </tr>)}</tbody></>}
    </table></div>
    <p>{rows.length} processo(s).{!rows.length && " Nenhum processo corresponde aos filtros."}</p>
  </main>;
}
