import Link from "next/link";
import { ClipboardList, FilePlus2, ShieldCheck } from "lucide-react";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { ServiceNotices } from "@/components/portal-institucional/ServiceNotices";

export const dynamic = "force-dynamic";

export default async function CitizenAreaPage() {
  const account = await getCitizenAccount();
  return (
    <main className="bg-slate-50 px-4 py-10 sm:px-6 sm:py-14">
      <div className="mx-auto max-w-5xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm sm:p-8">
        <p className="text-xs font-bold uppercase tracking-[0.16em] text-emerald-700">Autoatendimento • Cidadão e contribuinte</p>
        <h1 className="mt-2 text-3xl font-bold tracking-tight text-slate-950">Olá, {account.nome}</h1>
        <p className="mt-2 text-sm text-slate-600">Sua área de serviços e acompanhamento de processos.</p>
        <div className="mt-4 space-y-3"><ServiceNotices authenticated /></div>
        <div className="mt-4 flex flex-wrap gap-4 text-sm font-semibold"><Link href="/portal/minha-area/solicitacoes" className="text-emerald-800 hover:underline">Meus pedidos, pendências e respostas</Link><Link href="/portal-servidor" className="text-sky-800 hover:underline">Portal do Servidor</Link><Link href="/portal/tributario" className="text-emerald-800 hover:underline">Área do contribuinte</Link></div>
        <Link href="/portal/tributario/alvaras" className="mt-3 inline-block text-sm font-semibold text-emerald-800 hover:underline">Alvarás da empresa e autenticidade</Link>
        <Link href="/portal/tributario/itbi" className="ml-4 mt-3 inline-block text-sm font-semibold text-emerald-800 hover:underline">Processos ITBI, mensagens e documentos</Link>
        <Link href="/portal/tributario/empresas" className="ml-4 mt-3 inline-block text-sm font-semibold text-emerald-800 hover:underline">Inscrição municipal e certidão cadastral de baixa</Link>
        <div className="mt-8 grid gap-4 sm:grid-cols-2">
          <Link href="/portal/minha-area/servicos" className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 transition hover:border-emerald-500 focus-visible:outline-2 focus-visible:outline-emerald-700">
            <FilePlus2 className="size-7 text-emerald-700" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold text-slate-900">Solicitar serviço</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Acesse os canais de solicitação e os serviços digitais disponíveis.</p>
          </Link>
          <Link href="/portal/minha-area/processos" className="rounded-xl border border-sky-200 bg-sky-50 p-6 transition hover:border-sky-500 focus-visible:outline-2 focus-visible:outline-sky-700">
            <ClipboardList className="size-7 text-sky-700" aria-hidden="true" />
            <h2 className="mt-4 text-lg font-bold text-slate-900">Acompanhar meus processos</h2>
            <p className="mt-2 text-sm leading-6 text-slate-600">Consulte protocolo, situação, setor responsável, prazo e tramitações.</p>
          </Link>
        </div>
        <p className="mt-6 flex items-start gap-2 text-sm leading-6 text-slate-600"><ShieldCheck className="mt-1 size-4 shrink-0 text-emerald-700" aria-hidden="true" />Somente processos com autorização de acompanhamento para sua conta são exibidos.</p>
        <Link href="/portal" className="mt-6 inline-flex text-sm font-semibold text-emerald-800 hover:underline">Voltar ao portal oficial</Link>
      </div>
    </main>
  );
}
