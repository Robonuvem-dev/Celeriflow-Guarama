import { z } from "zod";
import { Prisma, type PrismaClient } from "@prisma/client";
import type { FleetScope } from "./service";
import { controlQuantity, stableFleetHash, validFleetCapability } from "./control-policy";
import { fleetProvider, confirmFleetFuel } from "./control-fuel";
import { FleetControlError, lockFleetResources } from "./control-access";

export const fleetExternalSchema = z.object({ requestId: z.uuid(), kind: z.enum(["POSTO", "OFICINA"]), code: z.string().trim().min(1).max(60), cnpj: z.string().trim().max(20), token: z.string().max(100), quantity: z.union([controlQuantity, z.literal("")]).default(""), reading: z.union([controlQuantity, z.literal("")]).default(""), unitPrice: z.string().max(30).default(""), performed: z.string().trim().max(10000).default(""), parts: z.string().trim().max(10000).default(""), amount: z.string().max(30).default("") }).strict();
const generic = "Código, CNPJ ou credencial não conferem, ou a autorização não está disponível.";

export async function throttleFleetExternal(db: PrismaClient, key: string) {
  const now = new Date(), through = new Date(now.getTime() + 60000);
  const rows = await db.$queryRaw<{ count: number }[]>`INSERT INTO "FleetExternalThrottle" ("key","count","windowEndsAt") VALUES (${key},1,${through}) ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "FleetExternalThrottle"."windowEndsAt" <= ${now} THEN 1 ELSE "FleetExternalThrottle"."count" + 1 END, "windowEndsAt" = CASE WHEN "FleetExternalThrottle"."windowEndsAt" <= ${now} THEN ${through} ELSE "FleetExternalThrottle"."windowEndsAt" END RETURNING "count"`;
  if (rows[0].count > 8) throw new FleetControlError("Muitas tentativas. Aguarde um minuto.");
}
export async function submitFleetExternal(db: PrismaClient, raw: unknown) {
  const input = fleetExternalSchema.parse(raw), hash = stableFleetHash(input);
  return db.$transaction(async (tx) => {
    const candidate = await tx.fleetAuthorization.findUnique({ where: { code: input.code }, select: { id: true, unitId: true, providerId: true, agreementId: true } });
    if (!candidate?.providerId) throw new FleetControlError(generic);
    await lockFleetResources(tx, [`REQUEST:${input.requestId}`, `AUTH:${candidate.id}`, `UNIT:${candidate.unitId}`, ...(candidate.agreementId ? [`AGREEMENT:${candidate.agreementId}`] : [])]);
    const authorization = await tx.fleetAuthorization.findUniqueOrThrow({ where: { id: candidate.id } });
    const provider = await fleetProvider(tx, candidate.providerId, input.kind);
    if (provider.cnpj !== input.cnpj.replace(/\D/g, "")) throw new FleetControlError(generic);
    const previous = await tx.fleetExternalEvent.findUnique({ where: { requestId: input.requestId } });
    if (previous) { if (previous.providerId !== provider.id || previous.authorizationId !== authorization.id || previous.payloadHash !== hash) throw new FleetControlError(generic); return { code: authorization.code, recorded: true, repeated: true }; }
    if (authorization.status !== "EMITIDA" || authorization.validUntil <= new Date() || !validFleetCapability(authorization.tokenHash, input.token) || (input.kind === "POSTO" ? authorization.kind !== "ABASTECIMENTO" : authorization.kind !== "SERVICO")) throw new FleetControlError(generic);
    const unit = await tx.fleetUnit.findUniqueOrThrow({ where: { id: authorization.unitId }, select: { departmentId: true } });
    const scope: FleetScope = { actorId: `FORNECEDOR:${provider.id}`, employeeId: null, departmentId: unit.departmentId, administrator: false, canReadAssets: false, canIssueStock: false };
    if (input.kind === "POSTO") await confirmFleetFuel(tx, scope, { authorizationId: authorization.id, quantity: input.quantity, reading: input.reading, unitPrice: input.unitPrice, evidenceVersionId: "" }, { providerId: provider.id, token: input.token });
    else {
      if (input.performed.length < 5 || input.amount && !/^\d{1,12}(\.\d{1,2})?$/.test(input.amount)) throw new FleetControlError("Informe serviço realizado e custo válido.");
      if (await tx.fleetWorkshopReport.count({ where: { authorizationId: authorization.id, status: { in: ["RECEBIDO", "CONFERIDO"] } } })) throw new FleetControlError("Execução já enviada; aguarde a conferência do setor.");
      const amount = input.amount ? new Prisma.Decimal(input.amount) : null;
      if (amount && amount.gt(authorization.authorizedAmount!)) throw new FleetControlError("Valor superior à autorização.");
      await tx.fleetWorkshopReport.create({ data: { authorizationId: authorization.id, providerId: provider.id, performed: input.performed, parts: input.parts || null, amount } });
      await tx.fleetAuthorization.update({ where: { id: authorization.id }, data: { tokenHash: null } });
    }
    await tx.fleetExternalEvent.create({ data: { requestId: input.requestId, providerId: provider.id, authorizationId: authorization.id, payloadHash: hash, kind: input.kind } });
    return { code: authorization.code, recorded: true, repeated: false };
  }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000 });
}
