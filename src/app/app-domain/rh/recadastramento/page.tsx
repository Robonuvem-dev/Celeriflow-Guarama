import Link from "next/link";
import { getTenantContextForModule, isSystemAdministrator } from "@/lib/platform/tenant-context";
import { listRecertificationProgress } from "@/lib/rh/recertification";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function CampaignProgress({ searchParams }: { searchParams: Promise<{ campaignId?: string; page?: string; status?: string }> }) {
  const context = await getTenantContextForModule("RH"), { prisma } = context; const params = await searchParams;
  const units = isSystemAdministrator(context.user) ? [] : await prisma.budgetUnit.findMany({ where: { id: { in: context.user.allowedBudgetUnitIds } }, select: { secretariatId: true } });
  const employees = isSystemAdministrator(context.user) ? [] : await prisma.employee.findMany({ where: { secretariatId: { in: units.map(unit => unit.secretariatId) } }, select: { id: true } });
  const campaigns = await listRecertificationProgress(prisma, isSystemAdministrator(context.user) ? undefined : { employeeIds: employees.map(employee => employee.id), budgetUnitIds: context.user.allowedBudgetUnitIds }); const selected = campaigns.find(campaign => campaign.id === params.campaignId) || campaigns[0];
  const status = ["PENDENTE", "EM_ANALISE", "PENDENTE_CORRECAO", "DEFERIDA", "INDEFERIDA"].includes(params.status || "") ? params.status : undefined;
  const rows = selected?.recipients.filter(recipient => !status || recipient.status === status) || [];
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(rows.length / 20)));
  const href = (value: number) => `?${new URLSearchParams({ campaignId: selected?.id || "", page: String(value), status: status || "" })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3"><ErpPageTitle title="Campanhas de recadastramento" description="Público definido, pendências, propostas e decisões do RH." action={<Link href="/rh/recadastramento/configurar">Configurar campanha assistida</Link>} />
    <form className="flex flex-wrap gap-2 text-xs"><select name="campaignId" defaultValue={selected?.id} className="h-8 rounded border px-2">{campaigns.map(campaign => <option key={campaign.id} value={campaign.id}>{campaign.name}</option>)}</select><select name="status" defaultValue={status || ""} className="rounded border px-2"><option value="">Todas as situações</option><option>PENDENTE</option><option>EM_ANALISE</option><option>DEFERIDA</option><option>INDEFERIDA</option></select><button className="rounded border px-3">Filtrar</button></form>
    {selected && <p className="rounded border bg-white p-3 text-xs">{selected.name} · {selected.startsAt} até {selected.endsAt} · {selected.recipients.length} convocados · {selected.recipients.filter(recipient => recipient.status !== "PENDENTE").length} responderam · {selected.recipients.filter(recipient => recipient.status === "DEFERIDA").length} aprovados · {rows.length} registros no filtro</p>}
    <table className="w-full border bg-white text-left text-xs"><thead><tr><th className="p-2">Servidor</th><th>Cadastro ativo</th><th>Situação</th><th>Análise</th></tr></thead><tbody>{rows.slice((page - 1) * 20, page * 20).map(row => <tr key={row.employeeId} className="h-7 border-t"><td className="px-2">{row.name}</td><td>{row.employeeActive ? "Sim" : "Não"}</td><td>{row.status}</td><td>{row.requestId && <Link href={`/rh/solicitacoes?status=${row.status}`}>Abrir fila de análise</Link>}</td></tr>)}</tbody></table>
    {!campaigns.length && <p className="text-sm">Cadastre uma regra JSON de campanha na categoria PORTAL em Parametrizações. O formato está documentado no registro de execução de RH.</p>}
    <ErpPagination page={page} total={rows.length} pageSize={20} label="servidores" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
