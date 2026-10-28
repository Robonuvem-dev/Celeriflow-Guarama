import Link from "next/link";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { listServiceRightLedger } from "@/lib/rh/service-right-query";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { db } from "@/db/client";

export const dynamic = "force-dynamic";
export default async function MyServiceRights({ searchParams }: { searchParams: Promise<{ scope?: string; contractId?: string; periodStart?: string; page?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const params = await searchParams;
  const scope = ["PRODUCAO", "HOMOLOGACAO", "DEMONSTRACAO"].includes(params.scope || "") ? params.scope! : "PRODUCAO";
  const result = await listServiceRightLedger(access.context.database ?? db, access.employee.id, { scope, contractId: params.contractId || undefined, periodStart: params.periodStart || undefined, page: Math.max(1, Number.parseInt(params.page || "1") || 1) });
  const href = (page: number) => `?${new URLSearchParams({ scope, page: String(page), contractId: params.contractId || "", periodStart: params.periodStart || "" })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title="Minha licença-prêmio" description="Aquisitivos, reservas e cancelamentos reconhecidos pelo RH, por vínculo e escopo." action={<Link href="/portal-servidor">Portal</Link>} />
    <form className="flex flex-wrap gap-2 text-xs"><input name="contractId" placeholder="Contrato (opcional)" defaultValue={params.contractId} className="rounded border px-2" /><label>Início aquisitivo <input name="periodStart" type="date" defaultValue={params.periodStart} className="rounded border px-2" /></label><select name="scope" defaultValue={scope} className="rounded border px-2"><option>PRODUCAO</option><option>HOMOLOGACAO</option><option>DEMONSTRACAO</option></select><button className="rounded border px-3">Filtrar</button></form>
    <p className="rounded border bg-white p-3 text-sm">{scope} · {result.total} entradas · saldo disponível do filtro: {result.balanceDays} dias</p>
    <table className="w-full border bg-white text-left text-xs"><thead><tr><th className="p-2">Matrícula / aquisitivo</th><th>Dias</th><th>Operação</th><th>Fundamento</th></tr></thead><tbody>{result.rows.map(row => { const memory = row.details as { operation?: string; kind?: string; reason?: string; input?: { start?: string }; policy?: { legalReference?: string } }; return <tr key={row.id} className="h-7 border-t"><td className="p-2">{row.contract.registration} · {row.periodStart.toISOString().slice(0, 10)} a {row.periodEnd.toISOString().slice(0, 10)}</td><td>{row.quantity.toString()}</td><td>{memory.operation} {memory.kind || ""} {memory.input?.start || ""}</td><td>{memory.reason || memory.policy?.legalReference || ""}</td></tr>; })}</tbody></table>
    <p className="text-xs">Reservas de pecúnia representam saldo separado para providência financeira; não comprovam pagamento. Para conferência por aquisitivo, preencha seu início no filtro.</p>
    <ErpPagination page={result.page} total={result.total} pageSize={20} label="entradas" previousHref={href(result.page - 1)} nextHref={href(result.page + 1)} />
  </div>;
}
