import { z } from "zod";
import { and, eq, inArray, sql } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseExecutor } from "@/db/transaction";
import * as f from "@/db/schema/fleet";
import { requiredFleetRecord } from "@/db/repositories/fleet/records";
import type { FleetScope } from "./service";
import { controlQuantity, stableFleetHash, validFleetCapability } from "./control-policy";
import { fleetProvider, confirmFleetFuel } from "./control-fuel";
import { FleetControlError, lockFleetResources } from "./control-access";

export const fleetExternalSchema = z.object({ requestId: z.uuid(), kind: z.enum(["POSTO", "OFICINA"]), code: z.string().trim().min(1).max(60), cnpj: z.string().trim().max(20), token: z.string().max(100), quantity: z.union([controlQuantity, z.literal("")]).default(""), reading: z.union([controlQuantity, z.literal("")]).default(""), unitPrice: z.string().max(30).default(""), performed: z.string().trim().max(10000).default(""), parts: z.string().trim().max(10000).default(""), amount: z.string().max(30).default("") }).strict();
const generic = "Código, CNPJ ou credencial não conferem, ou a autorização não está disponível.";

export async function throttleFleetExternal(db: DatabaseExecutor, key: string) {
  const instant = new Date(), now = instant.toISOString(), through = new Date(instant.getTime() + 60000).toISOString();
  const rows = await db.execute<{ count: number }>(sql`INSERT INTO "FleetExternalThrottle" ("key","count","windowEndsAt") VALUES (${key},1,${through}) ON CONFLICT ("key") DO UPDATE SET "count" = CASE WHEN "FleetExternalThrottle"."windowEndsAt" <= ${now} THEN 1 ELSE "FleetExternalThrottle"."count" + 1 END, "windowEndsAt" = CASE WHEN "FleetExternalThrottle"."windowEndsAt" <= ${now} THEN ${through} ELSE "FleetExternalThrottle"."windowEndsAt" END RETURNING "count"`);
  if (rows.rows[0].count > 8) throw new FleetControlError("Muitas tentativas. Aguarde um minuto.");
}
export async function submitFleetExternal(connection: DatabaseConnection, raw: unknown) {
  const input = fleetExternalSchema.parse(raw), hash = stableFleetHash(input);
  return withDatabaseTransaction(connection, async (tx) => {
    const [candidate] = await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.code, input.code)).limit(1);
    if (!candidate?.providerId) throw new FleetControlError(generic);
    await lockFleetResources(tx, [`REQUEST:${input.requestId}`, `AUTH:${candidate.id}`, `UNIT:${candidate.unitId}`, ...(candidate.agreementId ? [`AGREEMENT:${candidate.agreementId}`] : [])]);
    const authorization = requiredFleetRecord(await tx.select().from(f.fleetAuthorizations).where(eq(f.fleetAuthorizations.id, candidate.id)).limit(1));
    const provider = await fleetProvider(tx, candidate.providerId, input.kind);
    if (provider.cnpj !== input.cnpj.replace(/\D/g, "")) throw new FleetControlError(generic);
    const [previous] = await tx.select().from(f.fleetExternalEvents).where(eq(f.fleetExternalEvents.requestId, input.requestId)).limit(1);
    if (previous) { if (previous.providerId !== provider.id || previous.authorizationId !== authorization.id || previous.payloadHash !== hash) throw new FleetControlError(generic); return { code: authorization.code, recorded: true, repeated: true }; }
    if (authorization.status !== "EMITIDA" || authorization.validUntil <= new Date() || !validFleetCapability(authorization.tokenHash, input.token) || (input.kind === "POSTO" ? authorization.kind !== "ABASTECIMENTO" : authorization.kind !== "SERVICO")) throw new FleetControlError(generic);
    const unit = requiredFleetRecord(await tx.select({ departmentId: f.fleetUnits.departmentId }).from(f.fleetUnits).where(eq(f.fleetUnits.id, authorization.unitId)).limit(1));
    const scope: FleetScope = { actorId: `FORNECEDOR:${provider.id}`, employeeId: null, departmentId: unit.departmentId, administrator: false, canReadAssets: false, canIssueStock: false };
    if (input.kind === "POSTO") await confirmFleetFuel(tx, scope, { authorizationId: authorization.id, quantity: input.quantity, reading: input.reading, unitPrice: input.unitPrice, evidenceVersionId: "" }, { providerId: provider.id, token: input.token });
    else {
      if (input.performed.length < 5 || input.amount && !/^\d{1,12}(\.\d{1,2})?$/.test(input.amount)) throw new FleetControlError("Informe serviço realizado e custo válido.");
      if ((await tx.select({ id: f.fleetWorkshopReports.id }).from(f.fleetWorkshopReports).where(and(eq(f.fleetWorkshopReports.authorizationId, authorization.id), inArray(f.fleetWorkshopReports.status, ["RECEBIDO", "CONFERIDO"]))).limit(1)).length) throw new FleetControlError("Execução já enviada; aguarde a conferência do setor.");
      const amount = input.amount ? new Decimal(input.amount) : null;
      if (amount && amount.gt(authorization.authorizedAmount!)) throw new FleetControlError("Valor superior à autorização.");
      await tx.insert(f.fleetWorkshopReports).values({ authorizationId: authorization.id, providerId: provider.id, performed: input.performed, parts: input.parts || null, amount });
      await tx.update(f.fleetAuthorizations).set({ tokenHash: null }).where(eq(f.fleetAuthorizations.id, authorization.id));
    }
    await tx.insert(f.fleetExternalEvents).values({ requestId: input.requestId, providerId: provider.id, authorizationId: authorization.id, payloadHash: hash, kind: input.kind });
    return { code: authorization.code, recorded: true, repeated: false };
  }, { isolationLevel: "serializable", timeoutMs: 30000 });
}
