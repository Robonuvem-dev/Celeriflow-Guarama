import { BadgeCheck, CalendarDays, Clock3, FileSignature, LockKeyhole, UserRoundCheck } from "lucide-react";
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
        description="Autosserviço, documentos e solicitações funcionais"
        icon={<UserRoundCheck className="size-5 text-emerald-700" />}
        action={<Link href="/portal-servidor/solicitacoes-rh" className="inline-flex h-7 items-center rounded border border-emerald-700 bg-emerald-700 px-3 text-xs font-semibold text-white hover:bg-emerald-800">Solicitar serviço ao RH</Link>}
      />

      <div className="grid min-h-0 flex-1 content-start gap-3 overflow-y-auto p-3">
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
            <p className="mt-1 text-[11px] text-slate-500">Consulta restrita aos seus próprios dados.</p>
          </div>
        </section>

        <section className="grid min-h-0 gap-2 sm:grid-cols-2 xl:grid-cols-4" aria-label="Consultas pessoais disponíveis">
          <Link href="/portal-servidor/licenca-premio" className="border border-slate-300 bg-white p-3 shadow-sm hover:bg-slate-50"><strong className="text-sm">Licença-prêmio</strong><p className="mt-2 text-xs text-slate-500">Aquisitivos, reservas e saldo reconhecido pelo RH.</p></Link>
          <Link href="/portal-servidor/ficha-funcional" className="border border-slate-300 bg-white p-3 shadow-sm outline-none transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded bg-slate-100 text-slate-700"><UserRoundCheck className="size-4" /></div>
              <h2 className="text-sm font-semibold text-slate-900">Minha ficha</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600">Dados de vínculo, cargo, lotação e atos funcionais.</p>
          </Link>
          <Link href="/portal-servidor/documentos" className="border border-slate-300 bg-white p-3 shadow-sm outline-none transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded bg-slate-100 text-slate-700"><FileSignature className="size-4" /></div>
              <h2 className="text-sm font-semibold text-slate-900">Documentos</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600"><strong className="text-slate-900">{pendingSignatures}</strong> assinatura(s) pendente(s) no seu histórico.</p>
          </Link>
          <Link href="/portal-servidor/ponto" className="border border-slate-300 bg-white p-3 shadow-sm outline-none transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded bg-slate-100 text-slate-700"><Clock3 className="size-4" /></div>
              <h2 className="text-sm font-semibold text-slate-900">Meu ponto</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600"><strong className="text-slate-900">{currentMonthAttendance}</strong> registro(s) disponíveis neste mês.</p>
          </Link>
          <Link href="/portal-servidor/ferias" className="border border-slate-300 bg-white p-3 shadow-sm outline-none transition-colors hover:border-slate-400 hover:bg-slate-50 focus-visible:ring-2 focus-visible:ring-emerald-600">
            <div className="flex items-center gap-2">
              <div className="flex size-8 items-center justify-center rounded bg-slate-100 text-slate-700"><CalendarDays className="size-4" /></div>
              <h2 className="text-sm font-semibold text-slate-900">Férias e afastamentos</h2>
            </div>
            <p className="mt-3 text-xs leading-5 text-slate-600"><strong className="text-slate-900">{plannedVacations}</strong> férias programada(s) · <strong className="text-slate-900">{activeLeaves}</strong> afastamento(s) ativo(s).</p>
          </Link>
        </section>
        <section aria-labelledby="portal-services-title" className="space-y-2">
          <h2 id="portal-services-title" className="text-xs font-bold uppercase tracking-wide text-slate-600">Pagamentos, direitos e serviços internos</h2>
          <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
            {[
              { href: "/portal-servidor/demonstrativos", title: "Meus contracheques", description: "Demonstrativos completos e PDFs publicados pelo RH." },
              { href: "/portal-servidor/banco-horas", title: "Banco de horas", description: "Créditos, débitos e saldos dos seus vínculos." },
              { href: "/portal-servidor/margem", title: "Margem consignável", description: "Consulte os cálculos disponíveis para seu cadastro." },
              { href: "/portal-servidor/consignacoes", title: "Minhas consignações", description: "Contratos e parcelas registrados em seu nome." },
              { href: "/portal-servidor/solicitacoes-rh", title: "Solicitações ao RH", description: "Envie pedidos e acompanhe a decisão do responsável." },
              { href: "/portal-servidor/recadastramento", title: "Recadastramento", description: "Responda às campanhas atribuídas ao seu cadastro." },
              { href: "/portal-servidor/credito", title: "Crédito consignado", description: "Registre seu pedido de crédito para análise." },
              { href: "/portal-servidor/beneficios", title: "Meus benefícios", description: "Consulte os benefícios vinculados ao seu cadastro." },
            ].map(service => <Link key={service.href} href={service.href} className="rounded border border-slate-300 bg-white p-3 shadow-sm hover:border-emerald-600 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-600"><h3 className="text-sm font-semibold text-slate-900">{service.title}</h3><p className="mt-2 text-xs leading-5 text-slate-600">{service.description}</p></Link>)}
          </div>
        </section>
      </div>
    </div>
  );
}
