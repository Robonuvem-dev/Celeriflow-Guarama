import Link from "next/link";
import { ArrowUpRight, BarChart3, CheckCircle2, ClipboardList, Clock3, Lightbulb, Users } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

export default function LightingPage() {
  // Initial presentation only: replace this fixture with the IluminaFlow data
  // provider when the utilization indicators and integration are defined.
  const monthlyRequests = [
    { month: "Mai", count: 32 }, { month: "Jun", count: 46 }, { month: "Jul", count: 41 },
    { month: "Ago", count: 57 }, { month: "Set", count: 63 }, { month: "Out", count: 68 },
  ];
  const statuses = [
    { label: "Em aberto", count: 38, color: "bg-amber-400" },
    { label: "Em andamento", count: 23, color: "bg-sky-500" },
    { label: "Concluídas", count: 246, color: "bg-emerald-500" },
  ];
  const total = monthlyRequests.reduce((sum, item) => sum + item.count, 0);
  const maximum = Math.max(...monthlyRequests.map((item) => item.count));
  const metrics = [
    { label: "Usuários ativos", value: "28", detail: "Equipe utilizando a plataforma", icon: Users, color: "bg-sky-50 text-sky-600" },
    { label: "Solicitações registradas", value: String(total), detail: "Acumulado da série ilustrativa", icon: ClipboardList, color: "bg-amber-50 text-amber-600" },
    { label: "Ordens concluídas", value: "246", detail: "Atendimentos finalizados", icon: CheckCircle2, color: "bg-emerald-50 text-emerald-600" },
    { label: "Tempo médio de atendimento", value: "1,8 dia", detail: "Da abertura até a conclusão", icon: Clock3, color: "bg-violet-50 text-violet-600" },
  ];

  return <PageFrame className="flex h-full min-h-0 flex-1 flex-col gap-2 overflow-y-auto px-1 py-1 sm:overflow-hidden md:px-2">
    <PageHeader title="Dashboard de Iluminação Pública" icon={<Lightbulb className="size-4 shrink-0 text-yellow-600" />} className="shrink-0" action={
      <Link href="https://app.iluminaflow.com.br/" className="inline-flex h-7 items-center gap-1.5 rounded bg-amber-500 px-2 text-xs font-semibold text-slate-950 hover:bg-amber-400">
        Abrir IluminaFlow <ArrowUpRight className="size-3.5" aria-hidden="true" />
      </Link>
    } />

    <div className="flex shrink-0 flex-wrap items-center justify-between gap-1 rounded-md border border-amber-200 bg-amber-50 px-3 py-2 text-[11px] text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
      <strong>Indicadores iniciais · Dados ilustrativos</strong>
      <span>Os dados reais serão conectados ao IluminaFlow após a definição dos indicadores.</span>
    </div>

    <section aria-label="Indicadores de utilização do IluminaFlow" className="grid shrink-0 grid-cols-2 gap-2 md:grid-cols-4">
      {metrics.map((metric) => <article key={metric.label} className="flex min-w-0 items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white p-3 shadow-sm dark:border-slate-700 dark:bg-slate-800">
        <div className="min-w-0">
          <h2 className="text-[11px] font-medium text-slate-500 dark:text-slate-400">{metric.label}</h2>
          <p className="mt-1 text-2xl font-bold leading-tight text-slate-900 dark:text-white">{metric.value}</p>
          <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{metric.detail}</p>
        </div>
        <div className={`shrink-0 rounded-md p-1.5 ${metric.color}`}><metric.icon className="size-4" aria-hidden="true" /></div>
      </article>)}
    </section>

    <div className="grid shrink-0 gap-2 sm:min-h-0 sm:flex-1 sm:grid-cols-2">
      <section className="flex min-h-48 min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:min-h-0 dark:border-slate-700 dark:bg-slate-800" aria-label="Evolução das solicitações">
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-1">
          <h2 className="flex items-center gap-1.5 text-xs font-semibold text-slate-800 dark:text-slate-100"><BarChart3 className="size-4 text-amber-600" aria-hidden="true" />Solicitações por mês</h2>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Série ilustrativa · 6 meses</span>
        </div>
        <div className="min-h-0 flex-1">
          <svg viewBox="0 0 420 180" className="h-full max-h-72 w-full" role="img" aria-label={`Exemplo de solicitações mensais: ${monthlyRequests.map((item) => `${item.month}: ${item.count}`).join("; ")}`}>
            <title>Evolução mensal ilustrativa das solicitações</title>
            <line x1="12" y1="147" x2="408" y2="147" stroke="#cbd5e1" />
            {monthlyRequests.map((item, index) => {
              const height = item.count / maximum * 112;
              const x = 28 + index * 66;
              return <g key={item.month}>
                <title>{`${item.month}: ${item.count} solicitações ilustrativas`}</title>
                <rect x={x} y={146 - height} width="34" height={height} rx="4" fill="#f59e0b" />
                <text x={x + 17} y={138 - height} textAnchor="middle" fontSize="12" className="fill-slate-700 dark:fill-slate-200">{item.count}</text>
                <text x={x + 17} y="167" textAnchor="middle" fontSize="11" className="fill-slate-500 dark:fill-slate-400">{item.month}</text>
              </g>;
            })}
          </svg>
        </div>
      </section>

      <section className="flex min-h-48 min-w-0 flex-col rounded-lg border border-slate-200 bg-white p-3 shadow-sm sm:min-h-0 dark:border-slate-700 dark:bg-slate-800" aria-label="Situação dos atendimentos">
        <div className="mb-2 flex shrink-0 flex-wrap items-center justify-between gap-1">
          <h2 className="text-xs font-semibold text-slate-800 dark:text-slate-100">Situação dos atendimentos</h2>
          <span className="text-[10px] text-slate-500 dark:text-slate-400">Exemplo de distribuição</span>
        </div>
        <div className="flex min-h-0 flex-1 flex-col justify-center gap-3">
          <div>
            <p className="text-3xl font-bold text-slate-900 dark:text-white">{Math.round(246 / total * 100)}% <span className="text-xs font-normal text-slate-500 dark:text-slate-400">concluídas</span></p>
            <div className="mt-2 flex h-3 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-700" aria-hidden="true">
              {statuses.map((status) => <div key={status.label} className={status.color} style={{ width: `${status.count / total * 100}%` }} />)}
            </div>
          </div>
          <ul className="space-y-2">
            {statuses.map((status) => <li key={status.label} className="flex items-center justify-between gap-2 text-xs text-slate-600 dark:text-slate-300">
              <span className="flex items-center gap-2"><span className={`size-2 shrink-0 rounded-full ${status.color}`} aria-hidden="true" />{status.label}</span>
              <strong className="tabular-nums text-slate-900 dark:text-white">{status.count}</strong>
            </li>)}
          </ul>
        </div>
      </section>
    </div>

    <p className="shrink-0 px-1 text-[10px] text-slate-500 dark:text-slate-400">Modelo inicial do painel. Todos os números apresentados são demonstrativos.</p>
  </PageFrame>;
}
