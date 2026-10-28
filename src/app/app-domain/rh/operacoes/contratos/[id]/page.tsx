import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { db } from "@/db/client";
import { readContractTimeline } from "@/db/repositories/personnel-pages/workforce";

export const dynamic = "force-dynamic";
export default async function ContractTimelinePage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ page?: string }> }) {
  const context = await getTenantContextForModule("RH"); const { id } = await params;
  const { contract, total, page, revisions } = await readContractTimeline(context.database ?? db, id, (await searchParams).page);
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3">
    <ErpPageTitle title={`Histórico do contrato ${contract.registration}`} description={contract.employee.name} action={<Link href={`/rh/operacoes?tab=contratos&id=${id}`}>Registrar alteração</Link>} />
    <p className="rounded border bg-white p-3 text-xs">{total} revisões. O cálculo seleciona a revisão vigente na competência. Alterações após fechamento têm vigência posterior; demonstrativos anteriores mantêm seus snapshots. O cadastro exibe a última revisão registrada, que pode ter vigência futura.</p>
    <Link href={`/rh/pasta-funcional/${contract.employeeId}`} className="text-xs underline">Pasta funcional do titular: contratos, atos, documentos, ocorrências e direitos</Link>
    {revisions.map(revision => <details key={revision.id} className="rounded border bg-white p-3 text-xs"><summary>Versão {revision.version} · vigência {revision.effectiveFrom.toISOString().slice(0, 10)} · {revision.reason}</summary><p className="mt-2">Registrado em {revision.createdAt.toISOString()} · operador {revision.actorId}</p><pre className="whitespace-pre-wrap break-words">{JSON.stringify(revision.snapshot, null, 2)}</pre></details>)}
    <ErpPagination page={page} total={total} pageSize={20} label="revisões" previousHref={`?page=${page - 1}`} nextHref={`?page=${page + 1}`} />
  </div>;
}
