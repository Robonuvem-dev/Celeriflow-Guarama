import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import type { pppReport, functionalSstReport } from "@/lib/sst/closure-service";

const date = (value: Date) => value.toISOString().slice(0, 10);
export function PppView({ report, baseHref }: { report: Awaited<ReturnType<typeof pppReport>>; baseHref: string }) {
  const href = (page: number) => `${baseHref}&page=${page}`;
  const exportHref = baseHref.replace("/sst/consolidado?", "/sst/consolidado/exportar?").replace("/portal-servidor/sst/relatorios?", "/portal-servidor/sst/relatorios/exportar?");
  return <section className="space-y-4"><h2 className="text-lg font-semibold">Histórico preparatório PPP</h2><a href={exportHref} className="inline-block rounded border p-2">Emitir PDF do período completo</a><ul className="list-inside list-disc">{report.limitations.map((value) => <li key={value}>{value}</li>)}</ul>
    <h3 className="font-semibold">Lacunas de história funcional</h3>{report.missingHistory.length ? report.missingHistory.map((value) => <p key={value.startsAt.toISOString()}>{date(value.startsAt)} até {date(value.endsAt)} (final exclusivo)</p>) : <p>Intervalo coberto pelos períodos canônicos registrados.</p>}
    <h3 className="font-semibold">Lacunas de LTCAT aplicável</h3>{report.missingLtcat.length ? report.missingLtcat.map((value) => <p key={value.startsAt.toISOString()}>{date(value.startsAt)} até {date(value.endsAt)} (final exclusivo) — risco desconhecido</p>) : <p>LTCAT localizado para o intervalo; exige revisão técnica.</p>}
    <h3 className="font-semibold">Períodos funcionais / locais / riscos LTCAT</h3><p>{report.historyTotal} período(s) · 20 por página</p>
    {report.periods.map((period) => <article key={period.id} className="space-y-2 rounded border p-3"><h4 className="font-semibold">{date(period.startsAt)} até {date(period.endsAt)} (final exclusivo)</h4><p>Fonte RH: {period.id} · contrato: {period.contractReference}</p><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(period.snapshot, null, 2)}</pre>{report.exposures.filter((value) => value.functionalPeriodId === period.id).map((value) => <div key={`${value.programGroupId}:${value.startsAt.toISOString()}`}><p>LTCAT {value.programId} v{value.version} · {date(value.startsAt)} até {date(value.endsAt)}</p><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify({ group: value.group, risks: value.risks }, null, 2)}</pre></div>)}</article>)}
    <ErpPagination page={report.historyPage} total={report.historyTotal} pageSize={20} previousHref={href(report.historyPage - 1)} nextHref={href(report.historyPage + 1)}/>
    <h3 className="font-semibold">Comunicações de acidente</h3><table className="w-full table-fixed text-left text-sm"><thead><tr><th>Data</th><th>Tipo</th><th>Origem CAT</th></tr></thead><tbody>{report.accidents.map((value) => <tr key={value.id} className="border-b"><td className="p-2">{date(value.occurredAt)}</td><td className="break-words p-2">{value.kind}</td><td className="break-words p-2">{value.id}</td></tr>)}</tbody></table>
    <ErpPagination page={report.page} total={report.total} pageSize={20} previousHref={href(report.page - 1)} nextHref={href(report.page + 1)}/>
  </section>;
}
export function FunctionalView({ report, baseHref }: { report: Awaited<ReturnType<typeof functionalSstReport>>; baseHref: string }) {
  const href = (page: number) => `${baseHref}&page=${page}`;
  return <section className="space-y-4"><h2 className="text-lg font-semibold">Relatório funcional SST — escopo clínico autorizado</h2><a href={baseHref.replace("/sst/consolidado?", "/sst/consolidado/exportar?")} className="inline-block rounded border p-2">Emitir PDF do período e das atuações autorizadas</a><ul className="list-inside list-disc">{report.limitations.map((value) => <li key={value}>{value}</li>)}</ul><p>{report.total} registro(s) autorizado(s) · 20 por página</p>
    <p>História funcional: {report.history.periods.length} período(s). Lacunas: {report.history.missingHistory.length}. LTCAT: {report.history.exposures.length} interseção(ões), com {report.history.missingLtcat.length} lacuna(s).</p>
    {report.records.map((value) => <article key={`${value.source}:${value.id}`} className="rounded border p-3"><h3 className="font-semibold">{value.source} · {date(value.occurredAt)}</h3><p className="break-words text-xs">Origem: {value.id}</p><pre className="whitespace-pre-wrap break-words text-xs">{JSON.stringify(value.content, null, 2)}</pre></article>)}
    <ErpPagination page={report.page} total={report.total} pageSize={20} previousHref={href(report.page - 1)} nextHref={href(report.page + 1)}/>
  </section>;
}
