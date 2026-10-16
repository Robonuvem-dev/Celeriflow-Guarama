import Link from "next/link";
import type { Prisma } from "@prisma/client";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";

export const dynamic = "force-dynamic";
export default async function MyTimeBank({ searchParams }: { searchParams: Promise<{ page?: string; contractId?: string; scope?: string }> }) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p className="p-4">Cadastro funcional indisponível.</p>;
  const { context, employee } = access; const params = await searchParams;
  const scope = ["PRODUCAO", "HOMOLOGACAO", "DEMONSTRACAO"].includes(params.scope || "") ? params.scope! : "PRODUCAO";
  const where: Prisma.HrRightEntryWhereInput = { kind: "BANCO_HORAS", contract: { employeeId: employee.id }, details: { path: ["scope"], equals: scope }, ...(params.contractId ? { contractId: params.contractId } : {}) };
  const total = await context.prisma.hrRightEntry.count({ where });
  const page = Math.min(Math.max(1, Number.parseInt(params.page || "1") || 1), Math.max(1, Math.ceil(total / 20)));
  const [rows, sum, credits, debits] = await Promise.all([
    context.prisma.hrRightEntry.findMany({ where, include: { contract: { select: { registration: true } } }, orderBy: [{ periodStart: "asc" }, { id: "asc" }], take: 20, skip: (page - 1) * 20 }),
    context.prisma.hrRightEntry.aggregate({ where, _sum: { quantity: true } }),
    context.prisma.hrRightEntry.aggregate({ where: { ...where, quantity: { gt: 0 } }, _sum: { quantity: true } }),
    context.prisma.hrRightEntry.aggregate({ where: { ...where, quantity: { lt: 0 } }, _sum: { quantity: true } }),
  ]);
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), contractId: params.contractId || "", scope })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3"><ErpPageTitle title="Meu banco de horas" description="Entradas reconhecidas pelo RH; créditos e débitos preservados no histórico." action={<Link href="/portal-servidor/ponto">Meu ponto</Link>} />
    <form className="flex gap-2 text-xs"><input name="contractId" placeholder="ID contrato (opcional)" defaultValue={params.contractId} className="h-8 rounded border px-2" /><select name="scope" defaultValue={scope} className="rounded border px-2"><option>PRODUCAO</option><option>HOMOLOGACAO</option><option>DEMONSTRACAO</option></select><button className="rounded border px-3">Filtrar vínculo</button></form>
    <p className="rounded border bg-white p-3 text-sm">{scope} · {total} entradas · créditos {credits._sum.quantity?.toString() || "0"}h · débitos {debits._sum.quantity?.abs().toString() || "0"}h · saldo {sum._sum.quantity?.toString() || "0"}h</p>
    <table className="w-full border bg-white text-left text-xs"><thead><tr><th className="p-2">Data / matrícula</th><th>Horas</th><th>Escopo</th><th>Operação / fundamento</th><th>Origem</th></tr></thead><tbody>{rows.map(row => <tr key={row.id} className="h-7 border-t"><td className="px-2">{row.periodStart.toISOString().slice(0, 10)} · {row.contract.registration}</td><td>{row.quantity.toString()}</td><td>{(row.details as { scope?: string }).scope || "LEGADO/MANUAL"}</td><td>{(row.details as { operation?: string }).operation || "PONTO/AJUSTE"} · {(row.details as { reason?: string }).reason || ""}</td><td>{row.sourceKey}</td></tr>)}</tbody></table>
    <p className="text-xs">Saldo reconhecido não implica conversão em pagamento. Entradas legadas sem escopo exigem conciliação pelo RH e não são presumidas como produção.</p>
    {!total && <p className="text-sm">Nenhuma entrada reconhecida neste filtro.</p>}
    <ErpPagination page={page} total={total} pageSize={20} label="entradas" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
