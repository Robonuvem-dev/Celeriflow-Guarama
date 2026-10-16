import { Prisma, type PrismaClient } from "@prisma/client";

/** Transaction-local attribution used by the database history trigger. */
export async function attributePropertyHistory(tx: Prisma.TransactionClient, actorId: string) {
  if (!actorId.trim()) throw new Error("Identifique o usuário da alteração imobiliária.");
  await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_actor', ${actorId}, true)`;
}

/** Apply native protocol/supervisor guards to a mutation of cadastral relationships. */
export async function touchPropertyMetadata(tx: Prisma.TransactionClient, actorId: string, propertyId: string, processId: string | null) {
  await attributePropertyHistory(tx, actorId);
  await tx.$queryRaw`SELECT set_config('celeriflow.cadastral_process', ${processId ?? ""}, true), set_config('celeriflow.cadastral_profile_change','true',true)`;
  await tx.realEstate.update({ where: { id: propertyId }, data: { updatedAt: new Date() } });
}

export async function createPropertyWithHistory(db: PrismaClient, actorId: string, data: Prisma.RealEstateUncheckedCreateInput) {
  return db.$transaction(async tx => {
    await attributePropertyHistory(tx, actorId);
    return tx.realEstate.create({ data });
  });
}

export async function updatePropertyWithHistory(db: PrismaClient, actorId: string, id: string, data: Prisma.RealEstateUncheckedUpdateInput) {
  return db.$transaction(async tx => {
    await attributePropertyHistory(tx, actorId);
    return tx.realEstate.update({ where: { id }, data });
  });
}
