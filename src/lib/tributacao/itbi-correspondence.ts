import { and, eq, sql } from "drizzle-orm";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { itbiParties } from "@/db/schema/tax-itbi";
import { taxRegistryEntries } from "@/db/schema/taxation-registry";
import { auditItbi, firstItbiRegistryEntry, insertItbiRegistryEntry, itbiRegistryPosition, latestItbiRegistryEntry, lockItbiRecord, requireItbiRecord, updateItbiDeclaration } from "@/db/repositories/tax-itbi/records";
import type { TaxScopeSnapshot } from "./scope";
import { z } from "zod";
import type { TaxActor } from "./index";
import { assertInternalItbiProcessAccess } from "./itbi-process-channel";
import { propertyAddressSchema, propertyProfileSchema } from "./property-profile-schema";
import { taxScopeSnapshot } from "./scope";
import { attributeItbiHistory } from "./itbi-history";

const correspondenceSchema = z.object({ declarationId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), updateAddress: z.boolean(), buyerTaxpayerId: z.string().nullable(), address: propertyAddressSchema.nullable(), reason: z.string().trim().min(1).max(4000) }).refine(input => !input.updateAddress || Boolean(input.buyerTaxpayerId && input.address), "Informe o adquirente e seu endereço completo.");
export async function configureItbiCorrespondence(connection: DatabaseConnection, actor: TaxActor, raw: z.input<typeof correspondenceSchema>) {
  const input = correspondenceSchema.parse(raw);
  return withDatabaseTransaction(connection, async tx => {
    await attributeItbiHistory(tx, actor);
    await lockItbiRecord(tx, "ItbiDeclaration", input.declarationId);
    const { declaration, scope } = await assertInternalItbiProcessAccess(tx, actor, input.declarationId);
    if (declaration.updatedAt.toISOString() !== input.expectedUpdatedAt || declaration.cadastralUpdatedAt) throw new Error("Declaração alterada ou cadastro já transferido. Recarregue.");
    if (!["RASCUNHO", "PROTOCOLADA", "EM_ANALISE", "APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new Error("Declaração indisponível para definir a correspondência.");
    if (input.updateAddress && !(await tx.select({ id: itbiParties.id }).from(itbiParties).where(and(eq(itbiParties.declarationId, declaration.id), eq(itbiParties.role, "ADQUIRENTE"), eq(itbiParties.taxpayerId, input.buyerTaxpayerId!))).limit(1)).length) throw new Error("Selecione um adquirente deste ITBI.");
    const previous = await latestItbiRegistryEntry(tx, "ITBI_DECLARATION", declaration.id, "ITBI_CORRESPONDENCE");
    const entry = await insertItbiRegistryEntry(tx, { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_CORRESPONDENCE", title: "Endereço de correspondência após transmissão", version: (previous?.version ?? 0) + 1, processId: declaration.processId, actorUsuarioId: actor.usuarioId, data: { ...scope, ...input, previousId: previous?.id ?? null } });
    await updateItbiDeclaration(tx, declaration.id, {}, { eventType: "CORRESPONDENCIA_CONFIGURADA", description: input.reason, actorUsuarioId: actor.usuarioId, payload: { before: previous?.data ?? null, after: entry.data } });
    await auditItbi(tx, { action: "CONFIGURE_ITBI_CORRESPONDENCE", entityType: "ItbiDeclaration", entityId: declaration.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data } });
    return entry;
  }, { isolationLevel: "serializable" });
}

/** Publishes a profile coherent with the new fiscal ownership, without creating another ownership position. */
export async function transferItbiProfileInTransaction(tx: DatabaseTransaction, actor: TaxActor, input: { declarationId: string; propertyId: string; processId: string | null; owners: { taxpayerId: string; sharePercent: string }[]; ownerNames: Record<string, string>; primaryTaxpayerId: string | null; governmentEntityId: string | null; budgetUnitId: string | null }) {
  const previous = await latestItbiRegistryEntry(tx, "REAL_ESTATE", input.propertyId, "PROPERTY_PROFILE");
  const setting = await latestItbiRegistryEntry(tx, "ITBI_DECLARATION", input.declarationId, "ITBI_CORRESPONDENCE");
  const config = taxScopeSnapshot(setting?.data);
  if (!previous) {
    if (config.updateAddress === true) throw new Error("Publique o perfil imobiliário conciliado para atualizar a correspondência.");
    return { previousProfileId: null, transferredProfileId: null };
  }
  const profile = propertyProfileSchema.parse(previous.data);
  if (profile.governmentEntityId !== input.governmentEntityId || profile.budgetUnitId !== input.budgetUnitId) throw new Error("Perfil imobiliário de outra origem.");
  const address = config.updateAddress === true ? propertyAddressSchema.parse(config.address) : profile.correspondenceAddress;
  if (config.updateAddress === true && (config.governmentEntityId !== input.governmentEntityId || config.budgetUnitId !== input.budgetUnitId || !input.owners.some(owner => owner.taxpayerId === config.buyerTaxpayerId))) throw new Error("Adquirente ou origem da correspondência divergente.");
  const entry = await insertItbiRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: input.propertyId, category: "PROPERTY_PROFILE", title: "Perfil imobiliário após transmissão ITBI", version: previous.version + 1, actorUsuarioId: actor.usuarioId, processId: input.processId, source: "ITBI_PAYMENT", data: { ...taxScopeSnapshot(previous.data), owners: input.owners.map(owner => ({ ...owner, primary: owner.taxpayerId === input.primaryTaxpayerId })), ownerNames: input.ownerNames, correspondenceAddress: address, processId: input.processId, previousId: previous.id, declarationId: input.declarationId, correspondenceSettingId: setting?.id ?? null, expectedVersion: previous.version, reason: "Atualização do perfil após pagamento integral do ITBI." } });
  await tx.execute(sql`SELECT set_config('celeriflow.cadastral_new_profile',${input.propertyId},true)`);
  return { previousProfileId: previous.id, transferredProfileId: entry.id };
}

export async function reverseItbiProfileInTransaction(tx: DatabaseTransaction, actor: TaxActor, propertyId: string, memory: TaxScopeSnapshot, processId: string | null) {
  if (typeof memory.transferredProfileId !== "string" || typeof memory.previousProfileId !== "string") return;
  const current = requireItbiRecord(await latestItbiRegistryEntry(tx, "REAL_ESTATE", propertyId, "PROPERTY_PROFILE"));
  if (current.id !== memory.transferredProfileId) throw new Error("Perfil imobiliário alterado após a transmissão; concilie a correspondência e a titularidade antes do estorno.");
  const previous = requireItbiRecord(await firstItbiRegistryEntry(tx, and(eq(taxRegistryEntries.id, memory.previousProfileId), itbiRegistryPosition("REAL_ESTATE", propertyId, "PROPERTY_PROFILE"))!));
  await insertItbiRegistryEntry(tx, { entityType: "REAL_ESTATE", entityId: propertyId, category: "PROPERTY_PROFILE", title: "Perfil recomposto após estorno ITBI", version: current.version + 1, actorUsuarioId: actor.usuarioId, processId, source: "ITBI_PAYMENT_REVERSAL", data: { ...taxScopeSnapshot(previous.data), previousId: current.id, restoredProfileId: previous.id, expectedVersion: current.version, processId, reason: "Recomposição do perfil e correspondência após estorno do ITBI." } });
  await tx.execute(sql`SELECT set_config('celeriflow.cadastral_new_profile',${propertyId},true)`);
}
