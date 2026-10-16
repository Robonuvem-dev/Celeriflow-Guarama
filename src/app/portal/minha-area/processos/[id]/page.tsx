import Link from "next/link";
import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getCitizenAccount, getCitizenProcessWhere } from "@/lib/portal-cidadao/access";
import { citizenProcessSelect } from "@/lib/portal-cidadao/policy";

export const dynamic = "force-dynamic";

export default async function CitizenProcessPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const account = await getCitizenAccount(`/portal/minha-area/processos/${encodeURIComponent(id)}`);
  const scope = await getCitizenProcessWhere(account.id);
  const item = await prisma.process.findFirst({ where: { AND: [{ id }, scope] }, select: {
    ...citizenProcessSelect,
    movements: { orderBy: [{ movedAt: "asc" }, { id: "asc" }], select: { id: true, movedAt: true, receivedAt: true, fromDepartment: { select: { name: true } }, toDepartment: { select: { name: true } } } },
  } });
  if (!item) notFound();
  const date = (value: Date | null) => value?.toLocaleString("pt-BR") || "Não definido";
  return <main className="mx-auto max-w-5xl space-y-6 px-4 py-10 sm:px-6">
    <Link href="/portal/minha-area/processos" className="text-sm font-semibold text-emerald-800 hover:underline">← Meus processos</Link>
    <header><p className="text-xs font-bold uppercase tracking-widest text-emerald-700">Acompanhamento do processo</p><h1 className="mt-2 break-words text-3xl font-bold text-slate-950">{item.protocolNumber}</h1><p className="mt-2 text-slate-600">{item.processType.name} • {item.subject.name}</p><span className="mt-4 inline-block rounded-full bg-sky-50 px-4 py-2 text-sm font-semibold text-sky-800">{item.status}</span></header>
    <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-900">Informações do acompanhamento</h2><dl className="mt-5 grid gap-5 sm:grid-cols-2">{[["Setor atual", item.currentDepartment?.name || "Não atribuído"], ["Abertura", date(item.createdAt)], ["Prazo previsto", date(item.expectedCompletionAt)], ["Última atualização", date(item.updatedAt)], ...(item.completedAt ? [["Conclusão", date(item.completedAt)]] : []), ...(item.archivedAt ? [["Arquivamento", date(item.archivedAt)]] : [])].map(([label, value]) => <div key={label}><dt className="text-sm text-slate-500">{label}</dt><dd className="mt-1 text-sm font-semibold text-slate-900">{value}</dd></div>)}</dl></section>
    <section className="rounded-xl border border-slate-200 bg-white p-6"><h2 className="text-lg font-semibold text-slate-900">Histórico de tramitações</h2><ol className="mt-5 space-y-5"><li className="border-l-2 border-emerald-300 pl-4"><p className="font-semibold text-slate-900">Processo protocolado</p><p className="mt-1 text-sm text-slate-600">{date(item.createdAt)}</p></li>{item.movements.map((movement) => <li key={movement.id} className="border-l-2 border-emerald-300 pl-4"><p className="font-semibold text-slate-900">{movement.fromDepartment ? `${movement.fromDepartment.name} → ` : "Encaminhado para "}{movement.toDepartment.name}</p><p className="mt-1 text-sm text-slate-600">Encaminhamento: {date(movement.movedAt)}</p><p className="mt-1 text-sm text-slate-600">{movement.receivedAt ? `Recebimento: ${date(movement.receivedAt)}` : "Sem recebimento registrado nesta tramitação."}</p></li>)}</ol></section>
    <p className="text-sm leading-6 text-slate-600">Esta consulta apresenta o andamento autorizado do protocolo. Para informações sobre pendências ou respostas do serviço, utilize o canal responsável.</p>
    <Link href="/portal/contato" className="inline-flex text-sm font-semibold text-emerald-800 hover:underline">Falar com o atendimento</Link>
  </main>;
}
