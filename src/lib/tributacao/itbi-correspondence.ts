import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { assertInternalItbiProcessAccess } from "./itbi-process-channel";
import { propertyAddressSchema, propertyProfileSchema } from "./property-profile-schema";
import { taxScopeSnapshot } from "./scope";
import { attributeItbiHistory } from "./itbi-history";

const correspondenceSchema = z.object({ declarationId: z.string().min(1), expectedUpdatedAt: z.iso.datetime(), updateAddress: z.boolean(), buyerTaxpayerId: z.string().nullable(), address: propertyAddressSchema.nullable(), reason: z.string().trim().min(1).max(4000) }).refine(input => !input.updateAddress || Boolean(input.buyerTaxpayerId && input.address), "Informe o adquirente e seu endereço completo.");
export async function configureItbiCorrespondence(db: PrismaClient, actor: TaxActor, raw: z.input<typeof correspondenceSchema>) {
  const input = correspondenceSchema.parse(raw);
  return db.$transaction(async tx => {
    await attributeItbiHistory(tx, actor);
    await tx.$queryRaw`SELECT id FROM "ItbiDeclaration" WHERE id=${input.declarationId} FOR UPDATE`;
    const { declaration, scope } = await assertInternalItbiProcessAccess(tx, actor, input.declarationId);
    if (declaration.updatedAt.toISOString() !== input.expectedUpdatedAt || declaration.cadastralUpdatedAt) throw new Error("Declaração alterada ou cadastro já transferido. Recarregue.");
    if (!["RASCUNHO", "PROTOCOLADA", "EM_ANALISE", "APROVADA", "DAM_EMITIDO", "DOCUMENTO_EMITIDO"].includes(declaration.status)) throw new Error("Declaração indisponível para definir a correspondência.");
    if (input.updateAddress && !await tx.itbiParty.findFirst({ where: { declarationId: declaration.id, role: "ADQUIRENTE", taxpayerId: input.buyerTaxpayerId! } })) throw new Error("Selecione um adquirente deste ITBI.");
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_CORRESPONDENCE" }, orderBy: { version: "desc" } });
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "ITBI_DECLARATION", entityId: declaration.id, category: "ITBI_CORRESPONDENCE", title: "Endereço de correspondência após transmissão", version: (previous?.version ?? 0) + 1, processId: declaration.processId, actorUsuarioId: actor.usuarioId, data: { ...scope, ...input, previousId: previous?.id ?? null } } });
    await tx.itbiDeclaration.update({ where: { id: declaration.id }, data: { events: { create: { eventType: "CORRESPONDENCIA_CONFIGURADA", description: input.reason, actorUsuarioId: actor.usuarioId, payload: { before: previous?.data ?? null, after: entry.data } as Prisma.InputJsonObject } } } });
    await tx.taxAuditLog.create({ data: { action: "CONFIGURE_ITBI_CORRESPONDENCE", entityType: "ItbiDeclaration", entityId: declaration.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data } as Prisma.InputJsonObject } });
    return entry;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });
}

/** Publishes a profile coherent with the new fiscal ownership, without creating another ownership position. */
export async function transferItbiProfileInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, input: { declarationId: string; propertyId: string; processId: string | null; owners: { taxpayerId: string; sharePercent: string }[]; ownerNames: Record<string, string>; primaryTaxpayerId: string | null; governmentEntityId: string | null; budgetUnitId: string | null }) {
  const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: input.propertyId, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
  const setting = await tx.taxRegistryEntry.findFirst({ where: { entityType: "ITBI_DECLARATION", entityId: input.declarationId, category: "ITBI_CORRESPONDENCE" }, orderBy: { version: "desc" } });
  const config = taxScopeSnapshot(setting?.data);
  if (!previous) {
    if (config.updateAddress === true) throw new Error("Publique o perfil imobiliário conciliado para atualizar a correspondência.");
    return { previousProfileId: null, transferredProfileId: null };
  }
  const profile = propertyProfileSchema.parse(previous.data);
  if (profile.governmentEntityId !== input.governmentEntityId || profile.budgetUnitId !== input.budgetUnitId) throw new Error("Perfil imobiliário de outra origem.");
  const address = config.updateAddress === true ? propertyAddressSchema.parse(config.address) : profile.correspondenceAddress;
  if (config.updateAddress === true && (config.governmentEntityId !== input.governmentEntityId || config.budgetUnitId !== input.budgetUnitId || !input.owners.some(owner => owner.taxpayerId === config.buyerTaxpayerId))) throw new Error("Adquirente ou origem da correspondência divergente.");
  const entry = await tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: input.propertyId, category: "PROPERTY_PROFILE", title: "Perfil imobiliário após transmissão ITBI", version: previous.version + 1, actorUsuarioId: actor.usuarioId, processId: input.processId, source: "ITBI_PAYMENT", data: { ...taxScopeSnapshot(previous.data), owners: input.owners.map(owner => ({ ...owner, primary: owner.taxpayerId === input.primaryTaxpayerId })), ownerNames: input.ownerNames, correspondenceAddress: address, processId: input.processId, previousId: previous.id, declarationId: input.declarationId, correspondenceSettingId: setting?.id ?? null, expectedVersion: previous.version, reason: "Atualização do perfil após pagamento integral do ITBI." } } });
  await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_new_profile',${input.propertyId},true)`;
  return { previousProfileId: previous.id, transferredProfileId: entry.id };
}

export async function reverseItbiProfileInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, propertyId: string, memory: Prisma.JsonObject, processId: string | null) {
  if (typeof memory.transferredProfileId !== "string" || typeof memory.previousProfileId !== "string") return;
  const current = await tx.taxRegistryEntry.findFirstOrThrow({ where: { entityType: "REAL_ESTATE", entityId: propertyId, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
  if (current.id !== memory.transferredProfileId) throw new Error("Perfil imobiliário alterado após a transmissão; concilie a correspondência e a titularidade antes do estorno.");
  const previous = await tx.taxRegistryEntry.findFirstOrThrow({ where: { id: memory.previousProfileId, entityType: "REAL_ESTATE", entityId: propertyId, category: "PROPERTY_PROFILE" } });
  await tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: propertyId, category: "PROPERTY_PROFILE", title: "Perfil recomposto após estorno ITBI", version: current.version + 1, actorUsuarioId: actor.usuarioId, processId, source: "ITBI_PAYMENT_REVERSAL", data: { ...taxScopeSnapshot(previous.data), previousId: current.id, restoredProfileId: previous.id, expectedVersion: current.version, processId, reason: "Recomposição do perfil e correspondência após estorno do ITBI." } } });
  await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_new_profile',${propertyId},true)`;
}
