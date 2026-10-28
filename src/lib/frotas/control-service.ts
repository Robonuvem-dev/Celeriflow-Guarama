import { and, eq } from "drizzle-orm";
import { Decimal } from "@/db/decimal";
import { databaseConnection } from "@/db/client";
import type { DatabaseConnection } from "@/db/connection";
import { withDatabaseTransaction, type DatabaseTransaction } from "@/db/transaction";
import { getPostgresError } from "@/db/errors";
import * as f from "@/db/schema/fleet";
import { departments } from "@/db/schema/administration";
import { fleetJson, requiredFleetRecord } from "@/db/repositories/fleet/records";
import { fleetPaymentInBudgetScope, readFleetContract } from "@/db/repositories/fleet/sources";
import type { FleetContext as AppContext } from "@/lib/contracts/fleet";
import { canPerformModuleOperation, canViewModule, AccessError } from "@/lib/platform/tenant-context";
import { auditEventTypes } from "@/lib/contracts/audit";
import { insertAuditEvent } from "@/db/repositories/platform/audit";
import { fleetScope } from "./service";
import { fleetControlRequest, controlSchemas, stableFleetHash, type FleetControlOperation } from "./control-policy";
import { assertFleetVersion, FleetControlError, lockFleetResources, scopedFleetDriver, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { importFleetCatalog, saveFleetDriver, saveFleetUnitControl } from "./control-catalog";
import { arriveFleetTrip, cancelFleetBooking, createFleetBooking, departFleetTrip } from "./control-motion";
import { cancelFleetAuthorization, confirmFleetFuel, issueFleetFuel, renewFleetCredential, saveFleetFuelAgreement, saveFleetProvider, saveFleetQuota } from "./control-fuel";
import { executeFleetService, installFleetComponent, issueFleetService, removeFleetComponent, reviewFleetWorkshop, saveFleetComponent } from "./control-maintenance";
import { changeFleetClaim, changeFleetFineStatus, openFleetClaim, recordFleetFinePayment, registerFleetFine, registerFleetOccurrence, reverseFleetFinePayment } from "./control-incidents";
import { payFleetDebt, registerFleetDebt, reverseFleetDebtPayment, saveFleetDebtSettings } from "./control-debts";

const updateOperations = new Set<FleetControlOperation>(["unitControl", "cancelBooking", "arrive", "quota", "cancelAuthorization", "renewCredential", "confirmFuel", "executeService", "reviewWorkshop", "installComponent", "removeComponent", "debtSettings", "payDebt", "reverseDebtPayment", "fineStatus", "payFine", "reverseFinePayment", "claimStatus"]);
export function fleetControlPermission(operation: FleetControlOperation, data: Record<string, unknown>): "create" | "update" { return updateOperations.has(operation) || (operation === "driver" || operation === "machineType") && Boolean(data.id) ? "update" : "create"; }

async function replayScope(tx: FleetControlTx, context: AppContext, event: { targetType: string; targetId: string; unitId: string | null }) {
  const scope = fleetScope(context);
  if (event.unitId) { await scopedFleetUnit(tx, scope, event.unitId, false); return; }
  if (event.targetType === "DRIVER") { await scopedFleetDriver(tx, scope, event.targetId); return; }
  if (event.targetType === "DESTINATION") {
    const destination = requiredFleetRecord(await tx.select({ departmentId: f.fleetDestinations.departmentId }).from(f.fleetDestinations).where(eq(f.fleetDestinations.id, event.targetId)).limit(1));
    if (!scope.administrator && destination.departmentId !== scope.departmentId) throw new FleetControlError("Destino fora da repartição atual.");
  }
  if (["CATALOG", "MACHINE_TYPE", "PROVIDER"].includes(event.targetType) && !scope.administrator) throw new FleetControlError("Confirmação exige administração atual do catálogo/credenciamento.");
  if (event.targetType === "FUEL_AGREEMENT") {
    const agreement = requiredFleetRecord(await tx.select({ contractId: f.fleetFuelAgreements.contractId }).from(f.fleetFuelAgreements).where(eq(f.fleetFuelAgreements.id, event.targetId)).limit(1));
    const contract = await readFleetContract(tx, agreement.contractId);
    if (!contract) throw new FleetControlError("Origem contratual não encontrada.");
    if (!canViewModule(context.user, "COMPRAS") || !scope.administrator && contract.secretariatId !== context.user.secretariatId) throw new FleetControlError("Origem contratual fora do escopo atual.");
  }
}
async function applyControl(tx: DatabaseTransaction, context: AppContext, operation: FleetControlOperation, data: unknown): Promise<{ id: string; type: string; unitId?: string; token?: string }> {
  const scope = fleetScope(context);
  switch (operation) {
    case "unitControl": return saveFleetUnitControl(tx, scope, data);
    case "driver": return saveFleetDriver(tx, scope, data);
    case "catalog": return importFleetCatalog(tx, scope, data);
    case "booking": return createFleetBooking(tx, scope, data);
    case "cancelBooking": return cancelFleetBooking(tx, scope, data);
    case "depart": return departFleetTrip(tx, scope, data);
    case "arrive": return arriveFleetTrip(tx, scope, data);
    case "provider": return saveFleetProvider(tx, scope, data);
    case "fuelAgreement": return saveFleetFuelAgreement(tx, scope, context, data);
    case "quota": return saveFleetQuota(tx, scope, data);
    case "fuelAuthorization": return issueFleetFuel(tx, scope, data);
    case "cancelAuthorization": return cancelFleetAuthorization(tx, scope, data);
    case "renewCredential": return renewFleetCredential(tx, scope, data);
    case "confirmFuel": return confirmFleetFuel(tx, scope, data);
    case "serviceAuthorization": return issueFleetService(tx, scope, context, data);
    case "executeService": return executeFleetService(tx, scope, data);
    case "reviewWorkshop": return reviewFleetWorkshop(tx, scope, data);
    case "component": return saveFleetComponent(tx, scope, data);
    case "installComponent": return installFleetComponent(tx, scope, data);
    case "removeComponent": return removeFleetComponent(tx, scope, data);
    case "debtSettings": return saveFleetDebtSettings(tx, scope, data);
    case "debtDocument": return registerFleetDebt(tx, scope, data);
    case "payDebt": {
      const payment = controlSchemas.payDebt.parse(data);
      if (payment.financialPaymentId && !canViewModule(context.user, "FINANCEIRO")) throw new FleetControlError("Vínculo de pagamento exige leitura de Financeiro.");
      if (payment.financialPaymentId && !scope.administrator && !await fleetPaymentInBudgetScope(tx, payment.financialPaymentId, context.user.allowedBudgetUnitIds)) throw new FleetControlError("Ordem de pagamento fora das unidades gestoras autorizadas.");
      return payFleetDebt(tx, scope, payment);
    }
    case "reverseDebtPayment": return reverseFleetDebtPayment(tx, scope, data);
    case "fine": return registerFleetFine(tx, scope, data);
    case "fineStatus": return changeFleetFineStatus(tx, scope, data);
    case "payFine": {
      const payment = controlSchemas.payFine.parse(data);
      if (payment.financialPaymentId && !canViewModule(context.user, "FINANCEIRO")) throw new FleetControlError("Vínculo de pagamento exige leitura de Financeiro.");
      if (payment.financialPaymentId && !scope.administrator && !await fleetPaymentInBudgetScope(tx, payment.financialPaymentId, context.user.allowedBudgetUnitIds)) throw new FleetControlError("Ordem de pagamento fora das unidades gestoras autorizadas.");
      return recordFleetFinePayment(tx, scope, payment);
    }
    case "reverseFinePayment": return reverseFleetFinePayment(tx, scope, data);
    case "occurrence": return registerFleetOccurrence(tx, scope, data);
    case "claim": return openFleetClaim(tx, scope, data);
    case "claimStatus": return changeFleetClaim(tx, scope, data);
    case "machineType": {
      if (!scope.administrator) throw new FleetControlError("Configuração de máquinas exige administração.");
      const input = controlSchemas.machineType.parse(data);
      await lockFleetResources(tx, [`MACHINE_TYPE:${input.code}`]);
      const previous = input.id ? requiredFleetRecord(await tx.select().from(f.fleetMachineTypes).where(eq(f.fleetMachineTypes.id, input.id)).limit(1)) : null;
      if (previous) { assertFleetVersion(previous.updatedAt, input.version); if (previous.code !== input.code) throw new FleetControlError("Preserve o código do tipo de máquina."); }
      const values = { code: input.code, name: input.name, fields: input.fields, active: input.active };
      const result = requiredFleetRecord(previous ? await tx.update(f.fleetMachineTypes).set(values).where(eq(f.fleetMachineTypes.id, previous.id)).returning() : await tx.insert(f.fleetMachineTypes).values(values).returning());
      return { id: result.id, type: "MACHINE_TYPE" };
    }
    case "destination": {
      const input = controlSchemas.destination.parse(data);
      if (!scope.administrator && input.departmentId !== scope.departmentId || !(await tx.select({ id: departments.id }).from(departments).where(and(eq(departments.id, input.departmentId), eq(departments.isActive, true))).limit(1)).length) throw new FleetControlError("Repartição não autorizada.");
      const result = requiredFleetRecord(await tx.insert(f.fleetDestinations).values({ ...input, address: input.address || null, distance: input.distance ? new Decimal(input.distance) : null }).returning());
      return { id: result.id, type: "DESTINATION" };
    }
  }
}

export async function mutateFleetControl(context: AppContext, raw: unknown, connection: DatabaseConnection = databaseConnection) {
  const request = fleetControlRequest.parse(raw), parsed = controlSchemas[request.operation].parse(request.data);
  const operation = fleetControlPermission(request.operation, request.data);
  if (!canPerformModuleOperation(context.user, "FROTAS", operation)) throw new AccessError("Perfil sem autorização para esta operação de Frota.", 403);
  const hash = stableFleetHash({ operation: request.operation, data: parsed });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await withDatabaseTransaction(connection, async (tx) => {
        await lockFleetResources(tx, [`REQUEST:${request.requestId}`]);
        const [previous] = await tx.select().from(f.fleetControlEvents).where(eq(f.fleetControlEvents.requestId, request.requestId)).limit(1);
        if (previous) {
          if (previous.actorId !== context.user.id || previous.payloadHash !== hash) throw new FleetControlError("Chave de confirmação já utilizada com outro ator/conteúdo.");
          await replayScope(tx, context, previous);
          return { id: previous.targetId, type: previous.targetType, repeated: true, token: undefined as string | undefined };
        }
        const result = await applyControl(tx, context, request.operation, parsed);
        await tx.insert(f.fleetControlEvents).values({ requestId: request.requestId, actorId: context.user.id, payloadHash: hash, operation: request.operation, targetType: result.type, targetId: result.id, unitId: result.unitId, snapshot: fleetJson(parsed) });
        await insertAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.fleetOperationRegistered, targetType: result.type, targetId: result.id });
        return { id: result.id, type: result.type, repeated: false, token: result.token };
      }, { isolationLevel: "serializable", timeoutMs: 30000, lockTimeoutMs: 30000 });
    } catch (error) {
      if (["40001", "40P01", "23505"].includes(getPostgresError(error)?.code || "") && attempt < 3) continue;
      throw error;
    }
  }
  throw new FleetControlError("Concorrência persistente. Tente novamente com a mesma confirmação.");
}
