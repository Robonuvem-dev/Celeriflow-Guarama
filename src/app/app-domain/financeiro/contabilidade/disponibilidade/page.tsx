import Link from "next/link";
import { getTenantContextForModuleOperation, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { readResourceAvailability } from "@/lib/financeiro/resource-availability";
import { db, databaseConnection } from "@/db/client";
import { listFinancePageSources, listFinancePageYears } from "@/db/repositories/finance-pages/catalog";
import FinanceOperationalList from "../../FinanceOperationalList";
import { financeColumn } from "../../operational-columns";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";

export const dynamic = "force-dynamic";

export default async function AvailabilityPage({ searchParams }: { searchParams: Promise<{ financialYearId?: string; resourceSourceIds?: string | string[] }> }) {
  const context = await getTenantContextForModuleOperation("FINANCEIRO", "issueReports");
  const params = await searchParams;
  const allowedBudgetUnitIds = isSystemAdministrator(context.user) ? undefined : context.user.allowedBudgetUnitIds;
  const executor = context.database ?? db;
  const years = (await listFinancePageYears(executor, { allowedBudgetUnitIds })).filter(year => year.governmentEntity !== null);
  const year = years.find(year => year.id === params.financialYearId) ?? (!params.financialYearId ? years.find(year => year.status === "Aberto") ?? years[0] : undefined);
  const sources = await listFinancePageSources(executor);
  const selected = params.resourceSourceIds ? Array.isArray(params.resourceSourceIds) ? params.resourceSourceIds : [params.resourceSourceIds] : [];
  let result: Awaited<ReturnType<typeof readResourceAvailability>> | undefined;
  let error: string | undefined;
  if (year?.governmentEntityId) {
    try { result = await readResourceAvailability(databaseConnection, { allowedBudgetUnitIds }, { financialYearId: year.id, governmentEntityId: year.governmentEntityId, resourceSourceIds: selected }); }
    catch (failure) { error = failure instanceof Error ? failure.message : "Não foi possível gerar a disponibilidade."; }
  } else error = "Selecione um exercício de ente autorizado.";
  const csvParams = new URLSearchParams({ financialYearId: year?.id ?? "", governmentEntityId: year?.governmentEntityId ?? "" });
  for (const sourceId of selected) csvParams.append("resourceSourceIds", sourceId);
  return <FinanceOperationalList key={`${year?.id}:${selected.join(",")}`} label="Disponibilidade de recursos por fonte" preferenceId="financeiro-disponibilidade" state={error ? "error" : "ready"} errorMessage={error}
    columns={[financeColumn("source", "Fonte", 180, 280), financeColumn("balance", "Saldo disponível", 125, 150, "text", "right"), financeColumn("commitments", "Empenhos a pagar", 135, 160, "text", "right"), financeColumn("rap", "RAP a pagar", 115, 140, "text", "right"), financeColumn("extras", "Extras a pagar", 115, 140, "text", "right"), financeColumn("result", "Déficit/superávit", 130, 155, "text", "right")]}
    actions={<><Link className={styles.dialogButton} href="/financeiro/contabilidade">Contabilidade</Link>{result && <Link className={styles.dialogButton} href={`/api/financeiro/disponibilidade?${csvParams}`}>Baixar relatório CSV</Link>}</>}
    toolbar={<OperationalFilters activeCount={selected.length + (params.financialYearId ? 1 : 0)}><form className={styles.filterFields} method="get"><label>Exercício e ente<select className="block w-full rounded border p-2" name="financialYearId" defaultValue={year?.id}>{years.map(year => <option key={year.id} value={year.id}>{year.governmentEntity?.name} · {year.year}</option>)}</select></label><label>Fontes (seleção múltipla)<select multiple name="resourceSourceIds" defaultValue={selected} className="block h-28 w-full rounded border p-2">{sources.map(source => <option key={source.id} value={source.id}>{source.code} · {source.name}</option>)}</select><span>Sem seleção: todas as fontes.</span></label><button className={styles.primaryButton}>Emitir relatório</button><Link className={styles.dialogButton} href="/financeiro/contabilidade/disponibilidade">Limpar filtros</Link></form><p>Posição operacional atual: caixa, empenhos, restos e obrigações extraorçamentárias das UGs autorizadas.</p>{result && <p>{year?.governmentEntity?.name} · exercício {year?.year} · posição {new Date(result.positionDate).toLocaleString("pt-BR")}{!result.fullEntity && " · recorte das UGs autorizadas"}</p>}</OperationalFilters>}
    rows={(result?.rows ?? []).map(row => ({ id: row.sourceId, label: row.sourceCode, values: { source: `${row.sourceCode} · ${row.sourceName}`, balance: row.availableBalance, commitments: row.commitmentsPayable, rap: row.carryForwardsPayable, extras: row.extraPayables, result: row.deficitSurplus } }))} />;
}
