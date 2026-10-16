import { Prisma, type PrismaClient } from "@prisma/client";
import { z } from "zod";
import type { TaxActor } from "./index";
import { taxScopeSnapshot } from "./scope";

const accountantSchema = z.object({ taxpayerId: z.string().min(1), crc: z.string().trim().min(1).max(80), expectedVersion: z.number().int().nonnegative(), reason: z.string().trim().min(1).max(4000) });

export async function publishAccountant(db: PrismaClient, actor: TaxActor, raw: z.input<typeof accountantSchema>) {
  const input = accountantSchema.parse(raw);
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`ACCOUNTANT:${input.taxpayerId}`},0))::text`;
    if (!await tx.taxpayer.findFirst({ where: { id: input.taxpayerId, status: "Ativo" } })) throw new Error("Selecione um contribuinte ativo do cadastro único.");
    const previous = await tx.taxRegistryEntry.findFirst({ where: { entityType: "TAXPAYER", entityId: input.taxpayerId, category: "ACCOUNTANT" }, orderBy: { version: "desc" } });
    if ((previous?.version ?? 0) !== input.expectedVersion) throw new Error("O cadastro do contador foi alterado. Recarregue antes de salvar.");
    const entry = await tx.taxRegistryEntry.create({ data: { entityType: "TAXPAYER", entityId: input.taxpayerId, category: "ACCOUNTANT", title: input.crc, version: input.expectedVersion + 1, actorUsuarioId: actor.usuarioId, data: { crc: input.crc, reason: input.reason, previousId: previous?.id ?? null } } });
    await tx.taxAuditLog.create({ data: { action: "PUBLISH_ACCOUNTANT", entityType: "Taxpayer", entityId: input.taxpayerId, authorUsuarioId: actor.usuarioId, authorEmployeeId: actor.employeeId, payload: { before: previous ? taxScopeSnapshot(previous.data) as Prisma.InputJsonObject : null, after: entry.data } as Prisma.InputJsonObject } });
    return entry;
  });
}
