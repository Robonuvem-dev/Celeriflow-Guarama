import { Prisma, type PrismaClient } from "@prisma/client";
import { randomUUID } from "node:crypto";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";
import { attributePropertyHistory } from "./property-history";
import { formatPropertyInscription, propertyProfileSchema, propertyRegistrationPolicySchema } from "./property-profile-schema";

async function authorize(tx: Prisma.TransactionClient, actor: TaxActor, governmentEntityId: string, budgetUnitId: string) {
  if (actor.allowedBudgetUnitIds && !actor.allowedBudgetUnitIds.includes(budgetUnitId)) throw new Error("UG fora do acesso autorizado.");
  if (!await tx.planningEntityUnit.findFirst({ where: { governmentEntityId, budgetUnitId } })) throw new Error("Ente/UG não conciliados.");
}

export async function publishPropertyRegistrationPolicy(db: PrismaClient, actor: TaxActor, raw: z.input<typeof propertyRegistrationPolicySchema>) {
  const input = propertyRegistrationPolicySchema.parse(raw);
  return db.$transaction(async tx => {
    await authorize(tx, actor, input.governmentEntityId, input.budgetUnitId);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`PROPERTY_REGISTRATION_POLICY:${input.budgetUnitId}`},0))::text`;
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "PROPERTY_REGISTRATION_POLICY" }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("A configuração foi alterada. Recarregue antes de publicar.");
    if (previous && taxScopeSnapshot(previous.data).governmentEntityId !== input.governmentEntityId) throw new Error("Origem da configuração divergente.");
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "PROPERTY_REGISTRATION_POLICY", title: "Inscrição e controles imobiliários", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: input } });
    await tx.taxAuditLog.create({ data: { action: "PUBLISH_PROPERTY_REGISTRATION_POLICY", entityType: "TaxRegistryEntry", entityId: entry.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: input } as Prisma.InputJsonObject } });
    return entry;
  });
}

export async function savePropertyProfile(db: PrismaClient, actor: TaxActor, raw: z.input<typeof propertyProfileSchema>) {
  return db.$transaction(tx => savePropertyProfileInTransaction(tx, actor, raw), { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 60000 });
}

export async function savePropertyProfileInTransaction(tx: Prisma.TransactionClient, actor: TaxActor, raw: z.input<typeof propertyProfileSchema>) {
  const input = propertyProfileSchema.parse(raw);
  const total = input.owners.reduce((sum, owner) => { const share = new Prisma.Decimal(owner.sharePercent); if (!share.isFinite() || share.lte(0) || share.gt(100)) throw new Error("Participação de proprietário inválida."); return sum.plus(share); }, new Prisma.Decimal(0));
  if (!total.eq(100)) throw new Error("As participações dos proprietários devem totalizar 100%.");
    await authorize(tx, actor, input.governmentEntityId, input.budgetUnitId);
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`PROPERTY_REGISTRATION_POLICY:${input.budgetUnitId}`},0))::text`;
    // Parent and child are locked in the same deterministic order as other operations.
    for (const id of [...new Set([input.propertyId, input.parentId].filter((value): value is string => Boolean(value)))].sort()) await tx.$queryRaw`SELECT id FROM "RealEstate" WHERE id=${id} FOR UPDATE`;
    const property = await tx.realEstate.findUniqueOrThrow({ where: { id: input.propertyId } });
    if (property.updatedAt.toISOString() !== input.expectedUpdatedAt) throw new Error("O imóvel foi alterado. Recarregue antes de salvar.");
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: property.id, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("O perfil imobiliário foi alterado. Recarregue antes de salvar.");
    if (previous) { const data = taxScopeSnapshot(previous.data); if (data.governmentEntityId !== input.governmentEntityId || data.budgetUnitId !== input.budgetUnitId) throw new Error("Origem do perfil imobiliário é imutável."); }
    if (input.parentId) {
      const parent = await tx.realEstate.findUniqueOrThrow({ where: { id: input.parentId } });
      const parentProfile = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: parent.id, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } });
      const data = taxScopeSnapshot(parentProfile?.data);
      if (data.kind !== "Terreno" || data.governmentEntityId !== input.governmentEntityId || data.budgetUnitId !== input.budgetUnitId || ["Baixado", "Inativo", "Desmembrado", "Remembrado"].includes(parent.status)) throw new Error("Selecione um terreno ativo com perfil conciliado na mesma origem.");
    }
    if (input.kind !== "Terreno") {
      const children = await tx.taxRegistryEntry.findMany({ where: { category: "PROPERTY_PROFILE", data: { path: ["parentId"], equals: property.id } }, select: { entityId: true } });
      for (const child of children) { const latest = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: child.entityId, category: "PROPERTY_PROFILE" }, orderBy: { version: "desc" } }); if (taxScopeSnapshot(latest?.data).parentId === property.id) throw new Error("Terreno com unidades vinculadas não pode mudar de tipo."); }
    }
    const owners = await tx.taxpayer.findMany({ where: { id: { in: input.owners.map(owner => owner.taxpayerId) }, status: "Ativo" }, select: { id: true, person: { select: { fullName: true } }, company: { select: { corporateName: true } } } });
    if (owners.length !== input.owners.length) throw new Error("Selecione proprietários ativos do cadastro único.");
    if (input.processId && !await tx.process.findUnique({ where: { id: input.processId } })) throw new Error("Protocolo não encontrado.");
    if (await tx.document.count({ where: { id: { in: input.documentIds }, status: "Válido" } }) !== new Set(input.documentIds).size) throw new Error("Anexo GED inválido.");
    const definition = await tx.taxRegistryEntry.findFirst({ where: { entityType: "BUDGET_UNIT", entityId: input.budgetUnitId, category: "PROPERTY_REGISTRATION_POLICY" }, orderBy: { version: "desc" } });
    const policy = definition ? propertyRegistrationPolicySchema.parse(definition.data) : null;
    if (policy?.requireProcess && !input.processId) throw new Error("A configuração municipal exige protocolo para alterar este cadastro.");
    const inscription = policy ? formatPropertyInscription(policy, input.inscriptionParts) : property.municipalInsc;
    if (!policy && Object.keys(input.inscriptionParts).length) throw new Error("Publique a composição da inscrição antes de informar seus componentes.");
    const ownerNames = Object.fromEntries(owners.map(owner => [owner.id, owner.company?.corporateName ?? owner.person?.fullName ?? owner.id]));
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: property.id, category: "PROPERTY_PROFILE", title: "Perfil imobiliário", version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, processId: input.processId, data: { ...input, inscription, policyId: definition?.id ?? null, ownerNames, previousId: previous?.id ?? null } as Prisma.InputJsonObject } });
    const primary = input.owners.find(owner => owner.primary)!.taxpayerId;
    const position = await tx.taxRegistryEntry.findFirst({ where: { entityType: "REAL_ESTATE", entityId: property.id, category: "FISCAL_OWNERSHIP", status: "ATIVO" }, orderBy: { version: "desc" } });
    const ownersSnapshot = input.owners.map(owner => ({ taxpayerId: owner.taxpayerId, sharePercent: new Prisma.Decimal(owner.sharePercent).toString() })).sort((a,b) => a.taxpayerId.localeCompare(b.taxpayerId));
    const positionData = taxScopeSnapshot(position?.data);
    if (!position || JSON.stringify(positionData.owners) !== JSON.stringify(ownersSnapshot) || positionData.primaryTaxpayerId !== primary) {
      const observed = new Date();
      if (position) await tx.taxRegistryEntry.update({ where: { id: position.id }, data: { status: "HISTORICO", effectiveUntil: observed } });
      await tx.taxRegistryEntry.create({ data: { entityType: "REAL_ESTATE", entityId: property.id, category: "FISCAL_OWNERSHIP", title: "Titularidade fiscal do perfil imobiliário", version: (position?.version ?? 0)+1, effectiveFrom: observed, actorUsuarioId: actor.usuarioId, processId: input.processId, source: "PROPERTY_PROFILE", data: { governmentEntityId: input.governmentEntityId, budgetUnitId: input.budgetUnitId, owners: ownersSnapshot, ownerNames, primaryTaxpayerId: primary, profileId: entry.id, previousPositionId: position?.id ?? null } } });
    }
    await attributePropertyHistory(tx, actor.usuarioId);
    await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_process', ${input.processId ?? ""}, true), set_config('celeriflow.cadastral_profile_change', 'true', true), set_config('celeriflow.cadastral_new_profile', ${property.id}, true)`;
    await tx.realEstate.update({ where: { id: property.id }, data: { municipalInsc: inscription, propertyType: input.kind, taxpayerId: primary } });
    await tx.taxAuditLog.create({ data: { action: "SAVE_PROPERTY_PROFILE", entityType: "RealEstate", entityId: property.id, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous?.data ?? null, after: entry.data, profileId: entry.id } as Prisma.InputJsonObject } });
    return entry;
}

export const newPropertyWithProfileSchema = z.object({
  profile: propertyProfileSchema,
  cadastral: z.object({ registration:z.string().trim().max(120),streetName:z.string().trim().min(1).max(240),streetId:z.string().nullable(),neighborhoodId:z.string().nullable(),number:z.string().trim().max(40),complement:z.string().trim().max(240),lot:z.string().trim().max(80),block:z.string().trim().max(80),landArea:z.number().finite().nonnegative(),builtArea:z.number().finite().nonnegative(),propertyUse:z.string().trim().min(1).max(120),fiscalZone:z.string().trim().max(120) }),
});

export async function createPropertyWithProfile(db:PrismaClient,actor:TaxActor,raw:z.input<typeof newPropertyWithProfileSchema>) {
  const input=newPropertyWithProfileSchema.parse({...raw,profile:{...raw.profile,propertyId:randomUUID(),expectedVersion:0,expectedUpdatedAt:new Date().toISOString()}});
  return db.$transaction(async tx=>{
    await authorize(tx,actor,input.profile.governmentEntityId,input.profile.budgetUnitId);
    if(input.cadastral.streetId && !await tx.street.findUnique({where:{id:input.cadastral.streetId}})) throw new Error("Logradouro cadastrado não encontrado.");
    if(input.cadastral.neighborhoodId && !await tx.neighborhood.findUnique({where:{id:input.cadastral.neighborhoodId}})) throw new Error("Bairro cadastrado não encontrado.");
    const policy=await tx.taxRegistryEntry.findFirst({where:{entityType:"BUDGET_UNIT",entityId:input.profile.budgetUnitId,category:"PROPERTY_REGISTRATION_POLICY"},orderBy:{version:"desc"}});
    if(!policy) throw new Error("Publique a composição da inscrição para incluir o imóvel completo.");
    const inscription=formatPropertyInscription(propertyRegistrationPolicySchema.parse(policy.data),input.profile.inscriptionParts);
    await attributePropertyHistory(tx,actor.usuarioId);
    await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_process',${input.profile.processId ?? ""},true)`;
    const property=await tx.realEstate.create({data:{id:input.profile.propertyId,...input.cadastral,municipalInsc:inscription,propertyType:input.profile.kind,status:"Ativo",taxpayerId:input.profile.owners.find(owner=>owner.primary)!.taxpayerId}});
    await savePropertyProfileInTransaction(tx,actor,{...input.profile,propertyId:property.id,expectedVersion:0,expectedUpdatedAt:property.updatedAt.toISOString()});
    return tx.realEstate.findUniqueOrThrow({where:{id:property.id}});
  },{isolationLevel:Prisma.TransactionIsolationLevel.Serializable,timeout:60000});
}
