import { asc, count, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import type { PendingPriceResearchInvitation, ProcurementNotificationRecipient } from "@/lib/contracts/procurement-exports";
import { priceQuotes, priceResearches, purchaseProcesses } from "../../schema/procurement-core";
import { suppliers, companies } from "../../schema/registry";
import { people } from "../../schema/people";
import { accessProfiles, modules, userModulePermissions, users } from "../../schema/identity";

export async function listPendingProcurementInvitations(db: DatabaseExecutor): Promise<PendingPriceResearchInvitation[]> {
  const rows = await db.select({ id: priceQuotes.id, person: { fullName: people.fullName }, company: { tradeName: companies.tradeName, corporateName: companies.corporateName }, number: purchaseProcesses.number }).from(priceQuotes)
    .innerJoin(suppliers, eq(suppliers.id, priceQuotes.supplierId)).leftJoin(people, eq(people.id, suppliers.personId)).leftJoin(companies, eq(companies.id, suppliers.companyId))
    .innerJoin(priceResearches, eq(priceResearches.id, priceQuotes.researchId)).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, priceResearches.processId))
    .where(eq(priceQuotes.status, "CONVITE_PENDENTE")).orderBy(asc(priceQuotes.createdAt));
  return rows.map(({ id, person, company, number }) => ({ id, supplier: { person, company }, research: { process: { number } } }));
}

export async function countPendingProcurementInvitations(db: DatabaseExecutor): Promise<number> {
  const [row] = await db.select({ value: count() }).from(priceQuotes).where(eq(priceQuotes.status, "CONVITE_PENDENTE"));
  return row.value;
}

export async function listProcurementNotificationRecipients(db: DatabaseExecutor): Promise<ProcurementNotificationRecipient[]> {
  const recipients = await db.select({ id: users.id, perfil: { codigo: accessProfiles.codigo, permissoes: accessProfiles.permissoes, ativo: accessProfiles.ativo, nome: accessProfiles.nome } }).from(users)
    .innerJoin(accessProfiles, eq(accessProfiles.id, users.perfilId)).where(eq(users.ativo, true));
  if (!recipients.length) return [];
  const permissions = await db.select({ userId: userModulePermissions.usuarioId, modulo: { codigo: modules.codigo }, canView: userModulePermissions.canView, canEdit: userModulePermissions.canEdit }).from(userModulePermissions)
    .innerJoin(modules, eq(modules.id, userModulePermissions.moduloId)).where(inArray(userModulePermissions.usuarioId, recipients.map(user => user.id)));
  return recipients.map(user => ({ ...user, permissoesModulo: permissions.filter(permission => permission.userId === user.id) }));
}
