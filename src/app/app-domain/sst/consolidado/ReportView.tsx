import { SstRemoteTablePanel } from "../_components/SstRemoteTablePanel";
import { readPanelPage } from "../_components/read-panel-page";
import { sstColumn } from "../_components/operational-columns";
import { pppReport, functionalSstReport, portalPppReport } from "@/lib/sst/closure-service";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { getTenantContextForModuleOperation } from "@/lib/platform/tenant-context";

const date = (value: Date) => value.toISOString().slice(0, 10);
type PppReport = Awaited<ReturnType<typeof pppReport>>;
const periodRows = (report: PppReport) => report.periods.map(period => ({ id: period.id, label: period.contractReference, values: { startsAt: date(period.startsAt), endsAt: date(period.endsAt), id: period.id, contract: period.contractReference, snapshot: JSON.stringify(period.snapshot, null, 2), exposures: JSON.stringify(report.exposures.filter(value => value.functionalPeriodId === period.id).map(value => ({ programId: value.programId, version: value.version, startsAt: date(value.startsAt), endsAt: date(value.endsAt), group: value.group, risks: value.risks })), null, 2) } }));
const catRows = (report: PppReport) => report.accidents.map(value => ({ id: value.id, label: value.id, values: { date: date(value.occurredAt), kind: value.kind, id: value.id } }));
const functionalRows = (report: Awaited<ReturnType<typeof functionalSstReport>>) => report.records.map(value => ({ id: `${value.source}:${value.id}`, label: value.source, values: { source: value.source, date: date(value.occurredAt), id: value.id, content: JSON.stringify(value.content, null, 2) } }));

async function readPppPage(baseHref: string, page: number) {
  const pathname = baseHref.split("?")[0], query = new URLSearchParams(baseHref.split("?")[1] || "");
  const input = { budgetUnitId: query.get("budgetUnitId") || "", from: query.get("from") || "", until: query.get("until") || "" };
  if (pathname === "/portal-servidor/sst/relatorios") {
    const access = await getEmployeePortalAccess();
    if (access.status !== "AVAILABLE") throw new Error("Histórico próprio indisponível.");
    return portalPppReport(access.context, input, page);
  }
  if (pathname !== "/sst/consolidado") throw new Error("Consulta indisponível.");
  const context = await getTenantContextForModuleOperation("SST", "issueReports");
  return pppReport(context, { ...input, employeeId: query.get("employeeId") || "" }, page);
}
export function PppView({ report, baseHref }: { report: Awaited<ReturnType<typeof pppReport>>; baseHref: string }) {
  async function loadHistoryPage(page: number) {
    "use server";
    return readPanelPage(async () => {
      const next = await readPppPage(baseHref, page);
      return { rows: periodRows(next), page: next.historyPage, total: next.historyTotal };
    });
  }
  async function loadCatsPage(page: number) {
    "use server";
    return readPanelPage(async () => {
      const next = await readPppPage(baseHref, page);
      return { rows: catRows(next), page: next.page, total: next.total };
    });
  }
  const exportHref = baseHref.replace("/sst/consolidado?", "/sst/consolidado/exportar?").replace("/portal-servidor/sst/relatorios?", "/portal-servidor/sst/relatorios/exportar?");
  return <section className="space-y-4"><h2 className="text-lg font-semibold">Histórico preparatório PPP</h2><a href={exportHref} className="inline-block rounded border p-2">Emitir PDF do período completo</a><ul className="list-inside list-disc">{report.limitations.map((value) => <li key={value}>{value}</li>)}</ul>
    <h3 className="font-semibold">Lacunas de história funcional</h3>{report.missingHistory.length ? report.missingHistory.map((value) => <p key={value.startsAt.toISOString()}>{date(value.startsAt)} até {date(value.endsAt)} (final exclusivo)</p>) : <p>Intervalo coberto pelos períodos canônicos registrados.</p>}
    <h3 className="font-semibold">Lacunas de LTCAT aplicável</h3>{report.missingLtcat.length ? report.missingLtcat.map((value) => <p key={value.startsAt.toISOString()}>{date(value.startsAt)} até {date(value.endsAt)} (final exclusivo) — risco desconhecido</p>) : <p>LTCAT localizado para o intervalo; exige revisão técnica.</p>}
    <h3 className="font-semibold">Períodos funcionais / locais / riscos LTCAT</h3><p>{report.historyTotal} período(s) · 20 por página</p>
    <SstRemoteTablePanel title="Períodos funcionais / locais / riscos LTCAT" triggerLabel="Consultar períodos e riscos em tela cheia" description="Datas finais exclusivas. Snapshots e exposições integrais disponíveis nos detalhes; a exportação continua abrangendo o período completo." preferenceId="sst-ppp-periodos"
      columns={[sstColumn("startsAt", "Início", 130, 90), sstColumn("endsAt", "Fim exclusivo", 140, 100), sstColumn("id", "Fonte RH", 210, 110, "identifier"), sstColumn("contract", "Contrato", 170, 100), sstColumn("snapshot", "Snapshot funcional", 250, 130), sstColumn("exposures", "Exposições LTCAT", 280, 140)]}
      initial={{ rows: periodRows(report), page: report.historyPage, total: report.historyTotal }} loadPageAction={loadHistoryPage} />
    <SstRemoteTablePanel title="Comunicações de acidente — PPP" triggerLabel="Consultar CATs em tela cheia" preferenceId="sst-ppp-cats"
      columns={[sstColumn("date", "Data", 150, 100), sstColumn("kind", "Tipo", 230, 120), sstColumn("id", "Origem CAT", 400, 160, "identifier")]}
      initial={{ rows: catRows(report), page: report.page, total: report.total }} loadPageAction={loadCatsPage} />
  </section>;
}
export function FunctionalView({ report, baseHref }: { report: Awaited<ReturnType<typeof functionalSstReport>>; baseHref: string }) {
  async function loadFunctionalPage(page: number) {
    "use server";
    return readPanelPage(async () => {
      const context = await getTenantContextForModuleOperation("SST", "issueReports");
      const query = new URLSearchParams(baseHref.split("?")[1] || "");
      const next = await functionalSstReport(context, { budgetUnitId: query.get("budgetUnitId") || "", employeeId: query.get("employeeId") || "", from: query.get("from") || "", until: query.get("until") || "" }, page);
      return { rows: functionalRows(next), page: next.page, total: next.total };
    });
  }
  return <section className="space-y-4"><h2 className="text-lg font-semibold">Relatório funcional SST — escopo clínico autorizado</h2><a href={baseHref.replace("/sst/consolidado?", "/sst/consolidado/exportar?")} className="inline-block rounded border p-2">Emitir PDF do período e das atuações autorizadas</a><ul className="list-inside list-disc">{report.limitations.map((value) => <li key={value}>{value}</li>)}</ul><p>{report.total} registro(s) autorizado(s) · 20 por página</p>
    <p>História funcional: {report.history.periods.length} período(s). Lacunas: {report.history.missingHistory.length}. LTCAT: {report.history.exposures.length} interseção(ões), com {report.history.missingLtcat.length} lacuna(s).</p>
    <SstRemoteTablePanel title="Registros funcionais SST autorizados" triggerLabel="Consultar registros em tela cheia" description="Conteúdo integral por origem, limitado às atuações clínicas autorizadas." preferenceId="sst-relatorio-funcional"
      columns={[sstColumn("source", "Fonte", 190, 110), sstColumn("date", "Data", 130, 90), sstColumn("id", "Origem", 250, 130, "identifier"), sstColumn("content", "Conteúdo", 400, 180)]}
      initial={{ rows: functionalRows(report), page: report.page, total: report.total }} loadPageAction={loadFunctionalPage} />
  </section>;
}
