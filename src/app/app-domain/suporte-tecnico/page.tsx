import {
  AlertTriangle,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  FileArchive,
  Headphones,
  MessageSquareText,
  Paperclip,
  Settings2,
  ShieldAlert,
  Siren,
  Wrench,
} from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

const severities = [
  {
    code: "S1",
    title: "Crítica",
    description: "Indisponibilidade ampla ou risco grave à continuidade da plataforma.",
    color: "border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900 dark:bg-rose-950/40 dark:text-rose-200",
  },
  {
    code: "S2",
    title: "Alta",
    description: "Função essencial degradada, sem alternativa operacional adequada.",
    color: "border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900 dark:bg-amber-950/40 dark:text-amber-200",
  },
  {
    code: "S3",
    title: "Moderada",
    description: "Falha com impacto limitado e possibilidade de contorno temporário.",
    color: "border-sky-200 bg-sky-50 text-sky-800 dark:border-sky-900 dark:bg-sky-950/40 dark:text-sky-200",
  },
  {
    code: "S4",
    title: "Baixa",
    description: "Dúvida técnica, ajuste ou solicitação sem interrupção do serviço.",
    color: "border-slate-200 bg-slate-50 text-slate-700 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-200",
  },
];

const roadmap = [
  { title: "Chamados", description: "Abertura, triagem, responsáveis e histórico de atendimento.", icon: MessageSquareText },
  { title: "Incidentes", description: "Comunicação de impacto, evolução e restabelecimento.", icon: Siren },
  { title: "Anexos", description: "Evidências técnicas vinculadas ao atendimento.", icon: Paperclip },
  { title: "Base de conhecimento", description: "Orientações operacionais e soluções recorrentes.", icon: BookOpen },
  { title: "Relatórios", description: "Indicadores de volume, tempos e cumprimento contratual.", icon: BarChart3 },
];

export default async function SuporteTecnicoPage() {
  await getTenantContextForModule("SUPORTE_TECNICO");

  return (
    <PageFrame className="space-y-3 px-1 py-1 md:px-2">
      <PageHeader
        title="Suporte Técnico Robonuvem"
        icon={<Headphones className="size-4 shrink-0 text-indigo-700 dark:text-indigo-300" />}
        className="dark:border-slate-700 dark:bg-slate-800 dark:[&>h1]:text-white"
      />

      <section className="overflow-hidden rounded-xl border border-indigo-200 bg-white shadow-sm dark:border-indigo-950 dark:bg-slate-900">
        <div className="grid lg:grid-cols-[1.25fr_0.75fr]">
          <div className="p-5 sm:p-6">
            <Badge className="border border-indigo-200 bg-indigo-50 text-indigo-800 hover:bg-indigo-50 dark:border-indigo-900 dark:bg-indigo-950/50 dark:text-indigo-200">
              Manutenção da plataforma e SLA
            </Badge>
            <h2 className="mt-3 max-w-3xl text-xl font-bold tracking-tight text-slate-950 sm:text-2xl dark:text-white">
              Central técnica da Robonuvem para a sustentação do CeleriFlow
            </h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-slate-600 dark:text-slate-300">
              Este espaço será destinado a falhas, indisponibilidades e necessidades de manutenção da plataforma contratada.
              Os fluxos operacionais ainda dependem da configuração do contrato de suporte.
            </p>
          </div>
          <div className="border-t border-amber-200 bg-amber-50 p-5 sm:p-6 lg:border-t-0 lg:border-l dark:border-amber-900 dark:bg-amber-950/30">
            <div className="flex gap-3">
              <ShieldAlert className="mt-0.5 size-5 shrink-0 text-amber-700 dark:text-amber-300" />
              <div>
                <h3 className="font-semibold text-amber-950 dark:text-amber-100">Não é atendimento municipal</h3>
                <p className="mt-1 text-sm leading-5 text-amber-900/80 dark:text-amber-200/80">
                  Solicitações de cidadãos, ouvidoria, protocolos e serviços públicos devem ser registradas nos canais oficiais do município.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="rounded-md bg-emerald-100 p-2 text-emerald-700 dark:bg-emerald-950 dark:text-emerald-300"><CheckCircle2 className="size-5" /></span>
            <div><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Acesso ao módulo</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">Habilitado</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Permissão validada para esta sessão.</p></div>
          </CardContent>
        </Card>
        <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="rounded-md bg-amber-100 p-2 text-amber-700 dark:bg-amber-950 dark:text-amber-300"><Settings2 className="size-5" /></span>
            <div><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Central operacional</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">Configuração pendente</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Sem fluxo de chamados ativo nesta tela.</p></div>
          </CardContent>
        </Card>
        <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="rounded-md bg-slate-100 p-2 text-slate-600 dark:bg-slate-800 dark:text-slate-300"><Headphones className="size-5" /></span>
            <div><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Canais de contato</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">A definir</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Nenhum canal contratual publicado.</p></div>
          </CardContent>
        </Card>
        <Card className="gap-0 rounded-lg border-slate-200 py-0 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <CardContent className="flex items-start gap-3 p-4">
            <span className="rounded-md bg-indigo-100 p-2 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300"><Clock3 className="size-5" /></span>
            <div><p className="text-xs font-medium text-slate-500 dark:text-slate-400">Compromissos de SLA</p><p className="mt-1 font-semibold text-slate-900 dark:text-white">Aguardando contrato</p><p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Tempos ainda não configurados.</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-3 xl:grid-cols-[1.05fr_0.95fr]">
        <Card className="rounded-lg border-slate-200 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white"><AlertTriangle className="size-4 text-amber-600" /> Severidades de referência</CardTitle>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">A classificação final e os tempos associados dependem da configuração contratual de SLA.</p>
          </CardHeader>
          <CardContent className="grid gap-2 sm:grid-cols-2">
            {severities.map((severity) => (
              <article key={severity.code} className={`rounded-lg border p-3 ${severity.color}`}>
                <div className="flex items-center gap-2"><span className="text-xs font-bold tracking-wide">{severity.code}</span><span className="text-sm font-semibold">{severity.title}</span></div>
                <p className="mt-1.5 text-xs leading-5 opacity-80">{severity.description}</p>
                <p className="mt-2 border-t border-current/15 pt-2 text-[11px] font-medium">Resposta e solução: conforme contrato</p>
              </article>
            ))}
          </CardContent>
        </Card>

        <Card className="rounded-lg border-slate-200 shadow-sm dark:border-slate-700 dark:bg-slate-900">
          <CardHeader className="border-b border-slate-100 dark:border-slate-800">
            <CardTitle className="flex items-center gap-2 text-base text-slate-900 dark:text-white"><Wrench className="size-4 text-indigo-600" /> Compromissos operacionais</CardTitle>
            <p className="text-xs leading-5 text-slate-500 dark:text-slate-400">Referências do futuro serviço, sem vigência até a parametrização contratual.</p>
          </CardHeader>
          <CardContent>
            <dl className="divide-y divide-slate-100 text-sm dark:divide-slate-800">
              {[
                ["Horário de cobertura", "Dependente da configuração contratual"],
                ["Tempo de primeira resposta", "Dependente da severidade e do contrato"],
                ["Meta de restabelecimento", "Dependente da severidade e do contrato"],
                ["Escalonamento", "Responsáveis e canais ainda não definidos"],
              ].map(([term, value]) => (
                <div key={term} className="grid gap-1 py-3 sm:grid-cols-[180px_1fr] sm:gap-4">
                  <dt className="font-medium text-slate-700 dark:text-slate-200">{term}</dt>
                  <dd className="text-slate-500 dark:text-slate-400">{value}</dd>
                </div>
              ))}
            </dl>
          </CardContent>
        </Card>
      </div>

      <section className="rounded-lg border border-slate-200 bg-white p-4 shadow-sm sm:p-5 dark:border-slate-700 dark:bg-slate-900">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <h2 className="flex items-center gap-2 font-semibold text-slate-900 dark:text-white"><FileArchive className="size-4 text-indigo-600" /> Roadmap de capacidades</h2>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Visão planejada. Nenhuma das capacidades abaixo está disponível ou persiste dados nesta versão.</p>
          </div>
          <Badge variant="outline" className="text-slate-600 dark:text-slate-300">Planejamento</Badge>
        </div>
        <div className="mt-4 grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
          {roadmap.map((item, index) => (
            <article key={item.title} className="relative rounded-lg border border-dashed border-slate-300 bg-slate-50/70 p-3 dark:border-slate-700 dark:bg-slate-800/50">
              <div className="flex items-center justify-between gap-2">
                <item.icon className="size-5 text-slate-500 dark:text-slate-400" />
                <span className="text-[10px] font-bold tracking-wider text-slate-400">{String(index + 1).padStart(2, "0")}</span>
              </div>
              <h3 className="mt-3 text-sm font-semibold text-slate-800 dark:text-slate-100">{item.title}</h3>
              <p className="mt-1 text-xs leading-5 text-slate-500 dark:text-slate-400">{item.description}</p>
              <p className="mt-3 text-[11px] font-medium text-slate-500 dark:text-slate-400">Planejado, indisponível</p>
            </article>
          ))}
        </div>
      </section>
    </PageFrame>
  );
}
