import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { accessiblePayrollWhere } from "@/lib/rh/payroll-access";
import { calculateRemunerationAverage } from "@/lib/rh/remuneration-average";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ReferenceLookup } from "../ReferenceLookup";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";
export default async function AveragePage({ searchParams }: { searchParams: Promise<{ contractId?: string; ruleId?: string; from?: string; until?: string }> }) {
  const context = await getTenantContextForModule("RH"), user = context.user; const params = await searchParams;
  let result: Awaited<ReturnType<typeof calculateRemunerationAverage>> | null = null; let error = "";
  if (params.contractId && params.ruleId && params.from && params.until) {
    try { result = await calculateRemunerationAverage(context.database ?? db, params, accessiblePayrollWhere(user)); }
    catch (exception) { error = exception instanceof Error ? exception.message : "Não foi possível calcular a média."; }
  }
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title="Memória de médias de remuneração" description="Seleção de competências e verbas por política, incluindo as 80% maiores quando configurado." action={<Link href="/rh/operacoes">Voltar</Link>} />
    <form className="grid gap-2 rounded border bg-white p-3 text-xs sm:grid-cols-4"><label>Contrato<ReferenceLookup name="contractId" kind="contract" initialValue={params.contractId} required /></label><label>Regra JSON de média<ReferenceLookup name="ruleId" kind="rule" initialValue={params.ruleId} required /></label><label>Início MM/AAAA<input name="from" required defaultValue={params.from} className="block h-8 w-full rounded border px-2" /></label><label>Fim MM/AAAA<input name="until" required defaultValue={params.until} className="block h-8 w-full rounded border px-2" /></label><button className="rounded border px-3 py-2">Conferir média</button></form>
    {error && <p role="alert" className="text-sm">{error}</p>}
    {result && <><p className="rounded border bg-white p-3 text-sm">Média R$ {result.average} · {result.selected.length}/{result.memory.length} competências selecionadas · {result.scope}</p><p className="text-xs">Fundamento: {result.policy.legalReference} · método {result.policy.method} · seleção {result.policy.highestPercent}% / {result.policy.selectionRounding}</p><table className="w-full border bg-white text-left text-xs"><thead><tr><th className="p-2">Competência</th><th>Nominal</th><th>Fator</th><th>Atualizado</th><th>Seleção / origens</th></tr></thead><tbody>{result.memory.map(row => <tr key={row.month} className="border-t"><td className="p-2">{row.month}</td><td>{row.nominal}</td><td>{row.factor}</td><td>{row.amount}</td><td>{result.selected.includes(row.month) ? "Incluída" : "Excluída"}<details><summary>Verbas / versões</summary>{row.sources.map(source => <p key={`${source.statementId}:${source.rubricCode}`}>{source.rubricCode}: {source.value} · {source.statementId}</p>)}</details></td></tr>)}</tbody></table><p className="text-xs">Consulta de memória; a média não cria benefício, concessão previdenciária ou folha especial.</p></>}
  </div>;
}
