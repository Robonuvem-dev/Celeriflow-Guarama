import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { calculateRemunerationAverage } from "@/lib/rh/remuneration-average";
import { ReferenceLookup } from "../ReferenceLookup";
import { db } from "@/db/client";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { OperationalFilters, OperationalLinkPagination, OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { rhColumn } from "../../_components/operational-columns";

export const dynamic = "force-dynamic";
const columns = [rhColumn("month", "Competência", 130, 110), rhColumn("nominal", "Nominal", 140, 110, "text", "right"), rhColumn("factor", "Fator", 100, 80, "text", "right"), rhColumn("amount", "Atualizado", 140, 110, "text", "right"), rhColumn("selected", "Seleção", 115, 90, "status"), rhColumn("sources", "Verbas / versões", 250, 140)];

export default async function AveragePage({ searchParams }: { searchParams: Promise<{ contractId?: string; ruleId?: string; from?: string; until?: string; page?: string }> }) {
  const context = await getTenantContextForModule("RH"), user = context.user;
  const params = await searchParams;
  let result: Awaited<ReturnType<typeof calculateRemunerationAverage>> | null = null;
  let error = "";
  if (params.contractId && params.ruleId && params.from && params.until) {
    try { result = await calculateRemunerationAverage(context.database ?? db, params, accessiblePayrollWhere(user)); }
    catch (exception) { error = exception instanceof Error ? exception.message : "Não foi possível calcular a média."; }
  }
  const total = result?.memory.length || 0;
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  return <OperationalListFrame label="Memória de médias de remuneração" actions={<Link href="/rh/operacoes" className={styles.filterButton}>Voltar</Link>}
    toolbar={<><OperationalFilters label="Conferir média" activeCount={Number(!!params.contractId) + Number(!!params.ruleId) + Number(!!params.from) + Number(!!params.until)}><form method="GET" className={styles.filterFields}><label>Contrato<ReferenceLookup name="contractId" kind="contract" initialValue={params.contractId} required /></label><label>Regra JSON de média<ReferenceLookup name="ruleId" kind="rule" initialValue={params.ruleId} required /></label><label>Início MM/AAAA<input name="from" required defaultValue={params.from} /></label><label>Fim MM/AAAA<input name="until" required defaultValue={params.until} /></label><button className={styles.primaryButton}>Conferir média</button><Link href="/rh/operacoes/medias">Limpar</Link></form></OperationalFilters><OperationalFilters label="Resultado e fundamento">{error && <p role="alert">{error}</p>}{result && <><p>Média R$ {result.average} · {result.selected.length}/{result.memory.length} competências selecionadas · {result.scope}</p><p>Fundamento: {result.policy.legalReference} · método {result.policy.method} · seleção {result.policy.highestPercent}% / {result.policy.selectionRounding}</p></>}<p>Consulta de memória; a média não cria benefício, concessão previdenciária ou folha especial.</p></OperationalFilters></>}
    pagination={<OperationalLinkPagination page={page} total={total} pathname="/rh/operacoes/medias" values={{ contractId: params.contractId, ruleId: params.ruleId, from: params.from, until: params.until }} />}>
    <OperationalTable columns={columns} preferenceId="rh-medias" caption="Memória de médias de remuneração" state={error ? "error" : "ready"} errorMessage={error} emptyMessage="Informe os parâmetros para conferir a média." rows={(result?.memory || []).slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE).map(row => ({ id: row.month, label: row.month, values: { month: row.month, nominal: String(row.nominal), factor: String(row.factor), amount: String(row.amount), selected: result!.selected.includes(row.month) ? "Incluída" : "Excluída", sources: row.sources.map(source => `${source.rubricCode}: ${source.value} · ${source.statementId}`).join("\n") || "—" } }))} />
  </OperationalListFrame>;
}
