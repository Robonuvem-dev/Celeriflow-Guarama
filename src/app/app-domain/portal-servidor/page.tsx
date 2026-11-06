import { 
  BadgeCheck, 
  CalendarDays, 
  Clock3, 
  FileSignature, 
  LockKeyhole, 
  UserRoundCheck,
  FileText,
  Building2,
  Newspaper,
  BellRing,
  BookOpen,
  ShieldCheck,
  Coins
} from "lucide-react";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import Link from "next/link";
import { sql } from "drizzle-orm";
import { db } from "@/db/client";
import { portalCount } from "@/db/repositories/portal-servidor/records";

export const dynamic = "force-dynamic";

function PortalUnavailable() {
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ErpPageTitle
        title="Portal do Servidor"
        description="Autosserviço, documentos e solicitações funcionais"
        icon={<UserRoundCheck className="size-5 text-emerald-700" />}
      />
      <section className="m-3 flex min-h-0 flex-1 items-center justify-center border border-slate-300 bg-white p-5 shadow-sm">
        <div className="max-w-md text-center">
          <div className="mx-auto flex size-10 items-center justify-center rounded-full bg-amber-50 text-amber-700">
            <LockKeyhole className="size-5" />
          </div>
          <h2 className="mt-3 text-base font-semibold text-slate-900">Acesso funcional indisponível</h2>
          <p className="mt-1 text-sm leading-5 text-slate-600">
            Seu usuário ainda não possui um vínculo ativo de servidor para consultar este Portal. Procure o RH para regularizar o cadastro.
          </p>
        </div>
      </section>
    </div>
  );
}

export default async function PortalServidorPage() {
  const access = await getEmployeePortalAccess();

  if (access.status !== "AVAILABLE") return <PortalUnavailable />;

  const { context, employee } = access;
  const assignment = employee.department?.name ?? employee.secretariat?.name ?? "Lotação não informada";
  const currentMonthStart = new Date();
  currentMonthStart.setUTCDate(1);
  currentMonthStart.setUTCHours(0, 0, 0, 0);
  const executor = context.database ?? db;
  const [pendingSignatures, plannedVacations, activeLeaves, currentMonthAttendance] = await Promise.all([
    portalCount(executor, sql`SELECT count(*) FROM "DocumentSignature" WHERE "signerEmployeeId"=${employee.id} AND status='PENDING'`),
    portalCount(executor, sql`SELECT count(*) FROM "Vacation" WHERE "employeeId"=${employee.id} AND status='Programada'`),
    portalCount(executor, sql`SELECT count(*) FROM "Leave" WHERE "employeeId"=${employee.id} AND status='Ativa'`),
    portalCount(executor, sql`SELECT count(*) FROM "AttendanceRecord" WHERE "employeeId"=${employee.id} AND date>=${currentMonthStart}`),
  ]);

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
      <ErpPageTitle
        title="Portal do Servidor"
        description="Autosserviço, documentos funcionais, demonstrativos e transparência institucional"
        icon={<UserRoundCheck className="size-5 text-emerald-700" />}
        action={
          <div className="flex items-center gap-2">
            <Link 
              href="/validar-recibo" 
              target="_blank"
              className="inline-flex h-7 items-center rounded border border-slate-300 bg-white px-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
            >
              Autenticar Contracheque
            </Link>
            <Link 
              href="/portal-servidor/solicitacoes-rh" 
              className="inline-flex h-7 items-center rounded border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800"
            >
              Solicitar serviço ao RH
            </Link>
          </div>
        }
      />

      <div className="grid min-h-0 flex-1 content-start gap-4 overflow-y-auto p-3">
        {/* Banner do Servidor */}
        <section className="grid gap-px overflow-hidden border border-slate-300 bg-slate-200 shadow-sm md:grid-cols-3">
          <div className="min-w-0 bg-white px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Servidor</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900" title={employee.name}>{employee.name}</p>
            <p className="mt-0.5 text-[11px] text-slate-500">Matrícula {employee.registration ?? "não informada"}</p>
          </div>
          <div className="min-w-0 bg-white px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Vínculo funcional</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-900" title={employee.role?.name ?? "Cargo não informado"}>{employee.role?.name ?? "Cargo não informado"}</p>
            <p className="mt-0.5 truncate text-[11px] text-slate-500" title={assignment}>{assignment}</p>
          </div>
          <div className="bg-white px-3 py-2.5">
            <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-slate-500">Situação do acesso</p>
            <div className="mt-1 inline-flex items-center gap-1.5 rounded bg-emerald-50 px-2 py-1 text-[11px] font-semibold text-emerald-800">
              <BadgeCheck className="size-3.5" />
              Vínculo ativo
            </div>
            <p className="mt-1 text-[11px] text-slate-500">Consulta restrita e com trilha de auditoria ativa.</p>
          </div>
        </section>

        {/* Atalhos Rápidos de Acesso e Transparência */}
        <section aria-labelledby="portal-institucional-title" className="space-y-2">
          <div className="flex items-center justify-between">
            <h2 id="portal-institucional-title" className="text-xs font-bold uppercase tracking-wide text-slate-600">
              Canais Institucionais, Avisos e Informações
            </h2>
          </div>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Link 
              href="/portal/noticias" 
              className="flex flex-col justify-between rounded border border-slate-300 bg-white p-3 shadow-sm transition-colors hover:border-emerald-600 hover:bg-slate-50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded bg-emerald-50 text-emerald-700">
                    <Newspaper className="size-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">Notícias e Eventos</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Consulte os comunicados oficiais, eventos do município e informes aos servidores.
                </p>
              </div>
              <span className="mt-3 text-[11px] font-semibold text-emerald-700">Ver notícias →</span>
            </Link>

            <Link 
              href="/portal-protocolos" 
              className="flex flex-col justify-between rounded border border-slate-300 bg-white p-3 shadow-sm transition-colors hover:border-emerald-600 hover:bg-slate-50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded bg-blue-50 text-blue-700">
                    <BellRing className="size-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">Quadro de Avisos</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Avisos de interesse público, prazos, comunicados e portarias com vigência ativa.
                </p>
              </div>
              <span className="mt-3 text-[11px] font-semibold text-blue-700">Consultar avisos →</span>
            </Link>

            <Link 
              href="/portal-servidor/atendimento" 
              className="flex flex-col justify-between rounded border border-slate-300 bg-white p-3 shadow-sm transition-colors hover:border-emerald-600 hover:bg-slate-50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded bg-amber-50 text-amber-700">
                    <Building2 className="size-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">Locais de Atendimento</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Endereços, secretarias, unidades de atendimento e contatos para o servidor e cidadão.
                </p>
              </div>
              <span className="mt-3 text-[11px] font-semibold text-amber-700">Ver locais e horários →</span>
            </Link>

            <Link 
              href="/portal-servidor/biblioteca" 
              className="flex flex-col justify-between rounded border border-slate-300 bg-white p-3 shadow-sm transition-colors hover:border-emerald-600 hover:bg-slate-50"
            >
              <div>
                <div className="flex items-center gap-2">
                  <div className="flex size-7 items-center justify-center rounded bg-purple-50 text-purple-700">
                    <BookOpen className="size-4" />
                  </div>
                  <h3 className="text-sm font-semibold text-slate-900">Normas e Manuais</h3>
                </div>
                <p className="mt-2 text-xs leading-5 text-slate-600">
                  Download de documentos, estatutos, modelos de requerimento, normas e decretos.
                </p>
              </div>
              <span className="mt-3 text-[11px] font-semibold text-purple-700">Acessar biblioteca →</span>
            </Link>
          </div>
        </section>

        {/* Consultas Pessoais e Funcionais */}
        <section className="grid min-h-0 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Consultas pessoais disponíveis">
          <Link href="/portal-servidor/ficha-funcional" className="rounded border border-slate-300 bg-white p-3 shadow-sm outline-none transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded bg-slate-100 text-slate-700"><UserRoundCheck className="size-4" /></div>
              <h2 className="text-sm font-semibold text-slate-900">Minha ficha</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">Dados de vínculo, cargo, lotação e atos funcionais.</p>
          </Link>

          <Link href="/portal-servidor/documentos" className="rounded border border-slate-300 bg-white p-3 shadow-sm outline-none transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded bg-slate-100 text-slate-700"><FileSignature className="size-4" /></div>
              <h2 className="text-sm font-semibold text-slate-900">Documentos</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600"><strong className="text-slate-900">{pendingSignatures}</strong> assinatura(s) pendente(s) no seu histórico.</p>
          </Link>

          <Link href="/portal-servidor/ponto" className="rounded border border-slate-300 bg-white p-3 shadow-sm outline-none transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded bg-slate-100 text-slate-700"><Clock3 className="size-4" /></div>
              <h2 className="text-sm font-semibold text-slate-900">Meu ponto</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600"><strong className="text-slate-900">{currentMonthAttendance}</strong> registro(s) disponíveis neste mês.</p>
          </Link>

          <Link href="/portal-servidor/ferias" className="rounded border border-slate-300 bg-white p-3 shadow-sm outline-none transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded bg-slate-100 text-slate-700"><CalendarDays className="size-4" /></div>
              <h2 className="text-sm font-semibold text-slate-900">Férias e afastamentos</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600"><strong className="text-slate-900">{plannedVacations}</strong> férias programada(s) · <strong className="text-slate-900">{activeLeaves}</strong> afastamento(s) ativo(s).</p>
          </Link>
        </section>

        {/* Demonstrativos e Financeiro */}
        <section aria-labelledby="portal-financeiro-title" className="space-y-2">
          <h2 id="portal-financeiro-title" className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Folha de Pagamento, Demonstrativos e Rendimentos
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Link href="/portal-servidor/demonstrativos" className="rounded border border-slate-300 bg-white p-3 shadow-sm hover:border-emerald-600 hover:bg-slate-50 focus-visible:outline-none">
              <div className="flex items-center gap-2">
                <FileText className="size-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">Contracheques (PDF)</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">Demonstrativos completos e PDFs oficiais liberados pela gestão.</p>
            </Link>

            <Link href="/portal-servidor/relatorios" className="rounded border border-slate-300 bg-white p-3 shadow-sm hover:border-emerald-600 hover:bg-slate-50 focus-visible:outline-none">
              <div className="flex items-center gap-2">
                <Coins className="size-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">Ficha Financeira & Rendimentos</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">Emissão de comprovante de rendimentos do IRPF e ficha financeira anual.</p>
            </Link>

            <Link href="/portal-servidor/margem" className="rounded border border-slate-300 bg-white p-3 shadow-sm hover:border-emerald-600 hover:bg-slate-50 focus-visible:outline-none">
              <h3 className="text-sm font-semibold text-slate-900">Margem consignável</h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">Consulte os cálculos e limites disponíveis para seu cadastro.</p>
            </Link>

            <Link href="/portal-servidor/consignacoes" className="rounded border border-slate-300 bg-white p-3 shadow-sm hover:border-emerald-600 hover:bg-slate-50 focus-visible:outline-none">
              <h3 className="text-sm font-semibold text-slate-900">Minhas consignações</h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">Contratos bancários, entidades e parcelas registradas em seu nome.</p>
            </Link>
          </div>
        </section>

        {/* Serviços e Segurança */}
        <section aria-labelledby="portal-services-title" className="space-y-2">
          <h2 id="portal-services-title" className="text-xs font-bold uppercase tracking-wide text-slate-600">
            Serviços Internos e Segurança da Conta
          </h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            <Link href="/portal-servidor/solicitacoes-rh" className="rounded border border-slate-300 bg-white p-3 shadow-sm hover:border-emerald-600 hover:bg-slate-50 focus-visible:outline-none">
              <h3 className="text-sm font-semibold text-slate-900">Solicitações ao RH</h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">Envie requerimentos administrativos e acompanhe as respostas.</p>
            </Link>

            <Link href="/portal-servidor/banco-horas" className="rounded border border-slate-300 bg-white p-3 shadow-sm hover:border-emerald-600 hover:bg-slate-50 focus-visible:outline-none">
              <h3 className="text-sm font-semibold text-slate-900">Banco de horas</h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">Créditos, débitos e saldos de compensação dos seus vínculos.</p>
            </Link>

            <Link href="/portal-servidor/seguranca" className="rounded border border-slate-300 bg-white p-3 shadow-sm hover:border-emerald-600 hover:bg-slate-50 focus-visible:outline-none">
              <div className="flex items-center gap-2">
                <ShieldCheck className="size-4 text-emerald-700" />
                <h3 className="text-sm font-semibold text-slate-900">Segurança & Auditoria</h3>
              </div>
              <p className="mt-2 text-xs leading-5 text-slate-600">Troca de senha, histórico de acessos, IPs e atividades registradas.</p>
            </Link>

            <Link href="/portal-servidor/recadastramento" className="rounded border border-slate-300 bg-white p-3 shadow-sm hover:border-emerald-600 hover:bg-slate-50 focus-visible:outline-none">
              <h3 className="text-sm font-semibold text-slate-900">Recadastramento Anual</h3>
              <p className="mt-2 text-xs leading-5 text-slate-600">Atualização de dados cadastrais para campanhas periódicas.</p>
            </Link>
          </div>
        </section>
      </div>
    </div>
  );
}
