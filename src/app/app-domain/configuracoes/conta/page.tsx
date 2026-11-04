import { and, desc, eq } from "drizzle-orm";
import { getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { auditEvents } from "@/db/schema/audit";
import { users } from "@/db/schema/identity";
import { db } from "@/db/client";
import { PasswordChangeForm } from "../../portal-servidor/seguranca/PasswordChangeForm";
import { EmailChangeForm } from "./EmailChangeForm";

export const dynamic = "force-dynamic";

export default async function OwnAccountPage() {
  const context = await getCurrentTenantContext(),
    database = context.database ?? db;
  const changes = await database
    .select({ id: auditEvents.id, at: auditEvents.createdAt, event: auditEvents.eventType, name: users.nome, email: users.email })
    .from(auditEvents)
    .innerJoin(users, eq(auditEvents.actorUsuarioId, users.id))
    .where(and(eq(auditEvents.targetType, "USUARIO"), eq(auditEvents.targetId, context.user.id)))
    .orderBy(desc(auditEvents.createdAt))
    .limit(30);

  return (
    <main className="mx-auto max-w-5xl space-y-4 p-4 sm:p-6">
      <header className="cf-portal-hero">
        <p className="text-[11px] font-bold uppercase tracking-wider text-blue-700">Configurações de Acesso e Segurança</p>
        <h1 className="text-xl font-bold text-slate-900">Minha conta</h1>
        <p className="mt-1 text-xs text-slate-600">
          Operador autenticado: <strong>{context.user.name}</strong> — <span>{context.user.email}</span>
        </p>
      </header>

      <div className="grid gap-4 lg:grid-cols-2">
        <section className="cf-portal-card space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Alterar minha senha</h2>
          <PasswordChangeForm email={context.user.email} firebaseUid={context.user.firebaseUid} returnTo="/login" />
        </section>

        <section className="cf-portal-card space-y-3">
          <h2 className="text-sm font-bold text-slate-900">Atualizar e-mail de acesso</h2>
          <EmailChangeForm email={context.user.email} firebaseUid={context.user.firebaseUid} />
        </section>
      </div>

      <section className="cf-portal-card space-y-3">
        <div>
          <h2 className="text-sm font-bold text-slate-900">Últimas alterações cadastrais</h2>
          <p className="text-xs text-slate-500">Exibe o nome e e-mail atuais do operador responsável pelo evento.</p>
        </div>
        <div className="overflow-x-auto rounded-lg border border-slate-200">
          <table className="cf-portal-table w-full text-sm">
            <thead>
              <tr>
                <th>Data/hora</th>
                <th>Operador</th>
                <th>Evento</th>
                <th>E-mail atual do operador</th>
              </tr>
            </thead>
            <tbody>
              {changes.map((change) => (
                <tr key={change.id}>
                  <td>{change.at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td>
                  <td>{change.name}</td>
                  <td>{change.event}</td>
                  <td>{change.email}</td>
                </tr>
              ))}
              {!changes.length && (
                <tr>
                  <td colSpan={4} className="py-6 text-center text-xs text-slate-500">
                    Nenhuma alteração cadastral registrada.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
