import { and, desc, eq } from "drizzle-orm";
import { getCurrentTenantContext } from "@/lib/platform/tenant-context";
import { auditEvents } from "@/db/schema/audit";
import { users } from "@/db/schema/identity";
import { db } from "@/db/client";
import { PasswordChangeForm } from "../../portal-servidor/seguranca/PasswordChangeForm";
import { EmailChangeForm } from "./EmailChangeForm";

export const dynamic = "force-dynamic";
export default async function OwnAccountPage() {
  const context = await getCurrentTenantContext(), database = context.database ?? db;
  const changes = await database.select({ id: auditEvents.id, at: auditEvents.createdAt, event: auditEvents.eventType, name: users.nome, email: users.email }).from(auditEvents).innerJoin(users, eq(auditEvents.actorUsuarioId, users.id)).where(and(eq(auditEvents.targetType, "USUARIO"), eq(auditEvents.targetId, context.user.id))).orderBy(desc(auditEvents.createdAt)).limit(30);
  return <main className="space-y-6 p-4"><h1 className="text-xl font-bold">Minha conta</h1><p>{context.user.name} — {context.user.email}</p><section className="space-y-3"><h2 className="font-semibold">Alterar minha senha</h2><PasswordChangeForm email={context.user.email} firebaseUid={context.user.firebaseUid} returnTo="/login" /></section><EmailChangeForm email={context.user.email} firebaseUid={context.user.firebaseUid} /><section className="space-y-3"><h2 className="font-semibold">Últimas alterações cadastrais</h2><p className="text-sm">Exibe o nome e e-mail atuais do operador responsável pelo evento.</p><table className="w-full text-sm"><thead><tr><th>Data/hora</th><th>Operador</th><th>Evento</th><th>E-mail atual do operador</th></tr></thead><tbody>{changes.map(change => <tr key={change.id}><td>{change.at.toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo" })}</td><td>{change.name}</td><td>{change.event}</td><td>{change.email}</td></tr>)}</tbody></table>{!changes.length && <p>Nenhuma alteração cadastral registrada.</p>}</section></main>;
}
