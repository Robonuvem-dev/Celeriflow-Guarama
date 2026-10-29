import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { loadWorksReports } from "@/db/repositories/works-pages/infrastructure";
import { WorksReportsClient } from "./WorksReportsClient";

export const dynamic = "force-dynamic";
const currency = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
const number = new Intl.NumberFormat("pt-BR");

export default async function RelatoriosPage() {
  const context = await getTenantContextForModule("OBRAS");
  const { obrasPorStatus, medicoes, servicosPorStatusETipo, materiaisEmitidos } = await loadWorksReports(context.database ?? db);
  const totalObras = obrasPorStatus.reduce((total, obra) => total + obra._count._all, 0);
  const totalServicos = servicosPorStatusETipo.reduce((total, servico) => total + servico._count._all, 0);
  const movimentacoesMateriais = materiaisEmitidos.reduce((total, material) => total + material._count._all, 0);
  const custoMateriais = materiaisEmitidos.reduce((total, material) => total + (material._sum.quantity ?? 0) * (material.unitValue ?? 0), 0);
  return <WorksReportsClient works={obrasPorStatus.map(obra => ({ id: obra.status, label: obra.status, values: { status: obra.status, quantity: number.format(obra._count._all) } }))}
    services={servicosPorStatusETipo.map(servico => ({ id: JSON.stringify([servico.status, servico.tipo]), label: `${servico.status} · ${servico.tipo}`, values: { status: servico.status, type: servico.tipo, quantity: number.format(servico._count._all) } }))}
    summary={<dl className="grid gap-3 sm:grid-cols-2">{Object.entries({ "Obras ativas cadastradas": number.format(totalObras), "Medições ativas registradas": number.format(medicoes._count._all), "Valor medido acumulado": currency.format(medicoes._sum.valorMedido ?? 0), "Serviços urbanos ativos": number.format(totalServicos), "Saídas de materiais": number.format(movimentacoesMateriais), "Custo de materiais emitidos": currency.format(custoMateriais) }).map(([label, value]) => <div key={label}><dt>{label}</dt><dd className="font-semibold">{value}</dd></div>)}</dl>} />;
}
