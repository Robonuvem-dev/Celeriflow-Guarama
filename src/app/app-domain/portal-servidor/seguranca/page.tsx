import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { PasswordChangeForm } from "./PasswordChangeForm";
import { db } from "@/db/client";
import { sql, desc, eq, and } from "drizzle-orm";
import { hrIntegrationEvents } from "@/db/schema/personnel-workforce";
import { employees } from "@/db/schema/administration";
import { isSystemAdministrator } from "@/lib/platform/tenant-context";
import { KeyRound, ShieldCheck, History, Laptop, Globe, User, Filter, AlertCircle } from "lucide-react";
import Link from "next/link";

export const dynamic = "force-dynamic";

type SearchParams = {
  cpf?: string;
  registration?: string;
  ip?: string;
  action?: string;
  page?: string;
};

const ACTION_LABELS: Record<string, { label: string; badge: string }> = {
  LOGIN: { label: "Login no Portal", badge: "bg-emerald-50 text-emerald-700 border-emerald-200" },
  LOGOUT: { label: "Logout / Encerramento", badge: "bg-slate-50 text-slate-700 border-slate-200" },
  PASSWORD_CHANGE: { label: "Alteração de Senha", badge: "bg-blue-50 text-blue-700 border-blue-200" },
  LOGIN_FAILURE: { label: "Falha de Login", badge: "bg-red-50 text-red-700 border-red-200" },
  PAYSLIP_PRINT: { label: "Impressão de Contracheque", badge: "bg-teal-50 text-teal-700 border-teal-200" },
  FINANCIAL_STATEMENT_PRINT: { label: "Impressão de Ficha Financeira", badge: "bg-indigo-50 text-indigo-700 border-indigo-200" },
  INCOME_STATEMENT_PRINT: { label: "Impressão de Comprovante Rendimentos", badge: "bg-purple-50 text-purple-700 border-purple-200" },
};

export default async function EmployeeAccountSecurityPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") {
    return (
      <div className="p-6">
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-5 text-sm text-amber-900">
          <div className="flex items-center gap-2 font-bold">
            <AlertCircle className="size-5 text-amber-600" />
            Acesso funcional indisponível
          </div>
          <p className="mt-1">
            Seu usuário ainda não possui um vínculo ativo de servidor para gerenciar este Portal. Procure o RH para regularizar o cadastro.
          </p>
        </div>
      </div>
    );
  }

  const { context, employee } = access;
  const executor = context.database ?? db;
  const params = await searchParams;
  const isAdmin = isSystemAdministrator(context.user);

  // Filters for Audit Log
  const qCpf = (params.cpf || "").trim();
  const qRegistration = (params.registration || "").trim();
  const qIp = (params.ip || "").trim();
  const qAction = (params.action || "").trim();

  // Query audit activities from HrIntegrationEvent
  // If not admin, restrict only to own employee activities
  const rows = await executor
    .select({
      id: hrIntegrationEvents.id,
      createdAt: hrIntegrationEvents.createdAt,
      payload: hrIntegrationEvents.payload,
    })
    .from(hrIntegrationEvents)
    .where(eq(hrIntegrationEvents.eventType, "ATIVIDADE_PORTAL_SERVIDOR"))
    .orderBy(desc(hrIntegrationEvents.createdAt))
    .limit(100);

  // Enrich with employee registration and CPF if needed
  type AuditItem = {
    id: string;
    occurredAt: string;
    action: string;
    actionLabel: string;
    badgeStyle: string;
    ip: string;
    host: string;
    employeeId: string | null;
    userId: string | null;
    targetId: string | null;
  };

  const activities: AuditItem[] = rows
    .map((r) => {
      const p = (r.payload as Record<string, any>) || {};
      const actionKey = String(p.action || "UNKNOWN");
      const actionMeta = ACTION_LABELS[actionKey] || {
        label: actionKey,
        badge: "bg-slate-50 text-slate-700 border-slate-200",
      };
      return {
        id: r.id,
        occurredAt: p.occurredAt || r.createdAt.toISOString(),
        action: actionKey,
        actionLabel: actionMeta.label,
        badgeStyle: actionMeta.badge,
        ip: p.ip || "—",
        host: p.host || "—",
        employeeId: p.employeeId || null,
        userId: p.actorId || null,
        targetId: p.targetId || null,
      };
    })
    .filter((act) => {
      // Non-admins see only their own activities
      if (!isAdmin && act.employeeId && act.employeeId !== employee.id) {
        return false;
      }
      if (qIp && !act.ip.toLowerCase().includes(qIp.toLowerCase())) return false;
      if (qAction && act.action !== qAction) return false;
      return true;
    });

  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-y-auto">
      <ErpPageTitle
        title="Segurança e Auditoria do Servidor"
        description="Atualização de credencial de acesso e histórico completo de atividades realizadas no portal."
        icon={<ShieldCheck className="size-5 text-emerald-700" />}
      />

      <div className="space-y-6 p-4 max-w-6xl">
        {/* Seção 1: Troca de Senha */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center gap-2 border-b border-slate-100 pb-3 mb-4">
            <KeyRound className="size-4 text-emerald-700" />
            <h2 className="text-sm font-bold text-slate-800">Alterar Minha Senha de Acesso</h2>
          </div>
          <p className="text-xs text-slate-600 mb-4">
            Defina uma senha pessoal com padrão de segurança alto (mínimo de 12 caracteres, maiúscula, minúscula, número e símbolo especial).
          </p>
          <PasswordChangeForm email={context.user.email} firebaseUid={context.user.firebaseUid} />
        </section>

        {/* Seção 2: Histórico de Atividades dos Servidores (Requisito 7.13 e 7.14) */}
        <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm">
          <div className="flex items-center justify-between border-b border-slate-100 pb-3 mb-4 flex-wrap gap-2">
            <div className="flex items-center gap-2">
              <History className="size-4 text-emerald-700" />
              <h2 className="text-sm font-bold text-slate-800">
                Histórico de Atividades no Portal {isAdmin ? "(Todos os Servidores)" : "(Meu Histórico)"}
              </h2>
            </div>
            <span className="text-xs text-slate-500 font-medium">
              {activities.length} registro(s) auditado(s)
            </span>
          </div>

          <p className="text-xs text-slate-600 mb-4 leading-relaxed">
            Todas as operações de autenticação, emissão e visualização de documentos sensíveis (Login, Logout, Troca de Senha, Falha de Login, Impressão de Contracheque, Ficha Financeira e Rendimentos) são registradas com data, hora, IP de origem e host para rastreabilidade oficial.
          </p>

          {/* Filtros de Consulta */}
          <form method="GET" action="/portal-servidor/seguranca" className="mb-4 grid gap-2.5 rounded-lg border border-slate-200 bg-slate-50/70 p-3 text-xs sm:grid-cols-4">
            <label className="flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Ação / Operação</span>
              <select name="action" defaultValue={qAction} className="h-8 rounded border border-slate-300 bg-white px-2 text-xs">
                <option value="">Todas as ações</option>
                <option value="LOGIN">Login com Sucesso</option>
                <option value="LOGOUT">Logout</option>
                <option value="LOGIN_FAILURE">Tentativa com Falha</option>
                <option value="PASSWORD_CHANGE">Alteração de Senha</option>
                <option value="PAYSLIP_PRINT">Impressão de Contracheque</option>
                <option value="FINANCIAL_STATEMENT_PRINT">Ficha Financeira Anual</option>
                <option value="INCOME_STATEMENT_PRINT">Comprovante de Rendimentos</option>
              </select>
            </label>

            <label className="flex flex-col gap-1">
              <span className="font-semibold text-slate-700">Filtrar por IP</span>
              <input
                type="text"
                name="ip"
                defaultValue={qIp}
                placeholder="Ex: 192.168.1.1"
                className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
              />
            </label>

            {isAdmin && (
              <label className="flex flex-col gap-1">
                <span className="font-semibold text-slate-700">Matrícula / CPF</span>
                <input
                  type="text"
                  name="registration"
                  defaultValue={qRegistration}
                  placeholder="Matrícula do servidor..."
                  className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
                />
              </label>
            )}

            <div className="flex items-end gap-2">
              <button
                type="submit"
                className="inline-flex h-8 items-center gap-1.5 rounded bg-emerald-800 px-3 font-semibold text-white hover:bg-emerald-900"
              >
                <Filter className="size-3" />
                Filtrar
              </button>
              <Link
                href="/portal-servidor/seguranca"
                className="inline-flex h-8 items-center justify-center rounded border border-slate-300 bg-white px-3 font-semibold text-slate-700 hover:bg-slate-50"
              >
                Limpar
              </Link>
            </div>
          </form>

          {/* Tabela Operacional de Auditoria */}
          <div className="overflow-x-auto rounded-lg border border-slate-200">
            <table className="w-full text-left text-xs text-slate-700">
              <thead className="bg-slate-100 text-[11px] font-bold uppercase tracking-wider text-slate-600 border-b border-slate-200">
                <tr>
                  <th className="px-3 py-2.5">Data / Hora</th>
                  <th className="px-3 py-2.5">Ação Realizada</th>
                  <th className="px-3 py-2.5">Endereço IP</th>
                  <th className="px-3 py-2.5">Dispositivo / Host</th>
                  <th className="px-3 py-2.5">Vínculo Auditado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {activities.length > 0 ? (
                  activities.map((act) => (
                    <tr key={act.id} className="hover:bg-slate-50 transition-colors">
                      <td className="px-3 py-2 font-mono whitespace-nowrap text-slate-600">
                        {new Date(act.occurredAt).toLocaleString("pt-BR")}
                      </td>
                      <td className="px-3 py-2 whitespace-nowrap">
                        <span className={`inline-flex items-center rounded border px-2 py-0.5 text-[11px] font-semibold ${act.badgeStyle}`}>
                          {act.actionLabel}
                        </span>
                      </td>
                      <td className="px-3 py-2 font-mono text-slate-700">
                        <span className="inline-flex items-center gap-1">
                          <Globe className="size-3 text-slate-400" />
                          {act.ip}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600 truncate max-w-xs" title={act.host}>
                        <span className="inline-flex items-center gap-1">
                          <Laptop className="size-3 text-slate-400" />
                          {act.host}
                        </span>
                      </td>
                      <td className="px-3 py-2 text-slate-600 whitespace-nowrap">
                        {act.employeeId === employee.id ? (
                          <span className="font-semibold text-emerald-800">Sua conta ({employee.name})</span>
                        ) : (
                          <span className="text-slate-500 font-mono text-[11px]">{act.employeeId || act.userId || "Geral / Anônimo"}</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                      Nenhuma atividade registrada no período ou filtro selecionado.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </div>
    </div>
  );
}
