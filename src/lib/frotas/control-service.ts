import { Prisma } from "@prisma/client";
import type { AppContext } from "@/lib/platform/tenant-context";
import { canPerformModuleOperation, canViewModule, AccessError } from "@/lib/platform/tenant-context";
import { auditEventTypes, writeAuditEvent } from "@/lib/platform/audit-evidence";
import { fleetScope } from "./service";
import { fleetControlRequest, controlSchemas, stableFleetHash, type FleetControlOperation } from "./control-policy";
import { assertFleetVersion, FleetControlError, lockFleetResources, scopedFleetDriver, scopedFleetUnit, type FleetControlTx } from "./control-access";
import { importFleetCatalog, saveFleetDriver, saveFleetUnitControl } from "./control-catalog";
import { arriveFleetTrip, cancelFleetBooking, createFleetBooking, departFleetTrip } from "./control-motion";
import { cancelFleetAuthorization, confirmFleetFuel, issueFleetFuel, renewFleetCredential, saveFleetFuelAgreement, saveFleetProvider, saveFleetQuota } from "./control-fuel";
import { executeFleetService, installFleetComponent, issueFleetService, removeFleetComponent, reviewFleetWorkshop, saveFleetComponent } from "./control-maintenance";
import { changeFleetClaim, changeFleetFineStatus, openFleetClaim, recordFleetFinePayment, registerFleetFine, registerFleetOccurrence, reverseFleetFinePayment } from "./control-incidents";

const updateOperations = new Set<FleetControlOperation>(["unitControl", "cancelBooking", "arrive", "quota", "cancelAuthorization", "renewCredential", "confirmFuel", "executeService", "reviewWorkshop", "installComponent", "removeComponent", "fineStatus", "payFine", "reverseFinePayment", "claimStatus"]);
export function fleetControlPermission(operation: FleetControlOperation, data: Record<string, unknown>): "create" | "update" { return updateOperations.has(operation) || (operation === "driver" || operation === "machineType") && Boolean(data.id) ? "update" : "create"; }

async function replayScope(tx: FleetControlTx, context: AppContext, event: { targetType: string; targetId: string; unitId: string | null }) {
  const scope = fleetScope(context);
  if (event.unitId) { await scopedFleetUnit(tx, scope, event.unitId, false); return; }
  if (event.targetType === "DRIVER") { await scopedFleetDriver(tx, scope, event.targetId); return; }
  if (event.targetType === "DESTINATION") {
    const destination = await tx.fleetDestination.findUniqueOrThrow({ where: { id: event.targetId }, select: { departmentId: true } });
    if (!scope.administrator && destination.departmentId !== scope.departmentId) throw new FleetControlError("Destino fora da repartição atual.");
  }
  if (["CATALOG", "MACHINE_TYPE", "PROVIDER"].includes(event.targetType) && !scope.administrator) throw new FleetControlError("Confirmação exige administração atual do catálogo/credenciamento.");
  if (event.targetType === "FUEL_AGREEMENT") {
    const agreement = await tx.fleetFuelAgreement.findUniqueOrThrow({ where: { id: event.targetId }, select: { contractId: true } });
    const contract = await tx.contract.findUniqueOrThrow({ where: { id: agreement.contractId }, select: { secretariatId: true } });
    if (!canViewModule(context.user, "COMPRAS") || !scope.administrator && contract.secretariatId !== context.user.secretariatId) throw new FleetControlError("Origem contratual fora do escopo atual.");
  }
}
async function applyControl(tx: FleetControlTx, context: AppContext, operation: FleetControlOperation, data: unknown): Promise<{ id: string; type: string; unitId?: string; token?: string }> {
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
    case "fine": return registerFleetFine(tx, scope, data);
    case "fineStatus": return changeFleetFineStatus(tx, scope, data);
    case "payFine": {
      const payment = controlSchemas.payFine.parse(data);
      if (payment.financialPaymentId && !canViewModule(context.user, "FINANCEIRO")) throw new FleetControlError("Vínculo de pagamento exige leitura de Financeiro.");
      if (payment.financialPaymentId && !scope.administrator && !await tx.payment.findFirst({ where: { id: payment.financialPaymentId, bankAccount: { budgetUnitId: { in: context.user.allowedBudgetUnitIds } } }, select: { id: true } })) throw new FleetControlError("Ordem de pagamento fora das unidades gestoras autorizadas.");
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
      const previous = input.id ? await tx.fleetMachineType.findUniqueOrThrow({ where: { id: input.id } }) : null;
      if (previous) { assertFleetVersion(previous.updatedAt, input.version); if (previous.code !== input.code) throw new FleetControlError("Preserve o código do tipo de máquina."); }
      const values = { code: input.code, name: input.name, fields: input.fields, active: input.active };
      const result = previous ? await tx.fleetMachineType.update({ where: { id: previous.id }, data: values }) : await tx.fleetMachineType.create({ data: values });
      return { id: result.id, type: "MACHINE_TYPE" };
    }
    case "destination": {
      const input = controlSchemas.destination.parse(data);
      if (!scope.administrator && input.departmentId !== scope.departmentId || !await tx.department.findFirst({ where: { id: input.departmentId, isActive: true }, select: { id: true } })) throw new FleetControlError("Repartição não autorizada.");
      const result = await tx.fleetDestination.create({ data: { ...input, address: input.address || null, distance: input.distance ? new Prisma.Decimal(input.distance) : null } });
      return { id: result.id, type: "DESTINATION" };
    }
  }
}

export async function mutateFleetControl(context: AppContext, raw: unknown) {
  const request = fleetControlRequest.parse(raw), parsed = controlSchemas[request.operation].parse(request.data);
  const operation = fleetControlPermission(request.operation, request.data);
  if (!canPerformModuleOperation(context.user, "FROTAS", operation)) throw new AccessError("Perfil sem autorização para esta operação de Frota.", 403);
  const hash = stableFleetHash({ operation: request.operation, data: parsed });
  for (let attempt = 0; attempt < 4; attempt++) {
    try {
      return await context.prisma.$transaction(async (tx) => {
        await lockFleetResources(tx, [`REQUEST:${request.requestId}`]);
        const previous = await tx.fleetControlEvent.findUnique({ where: { requestId: request.requestId } });
        if (previous) {
          if (previous.actorId !== context.user.id || previous.payloadHash !== hash) throw new FleetControlError("Chave de confirmação já utilizada com outro ator/conteúdo.");
          await replayScope(tx, context, previous);
          return { id: previous.targetId, type: previous.targetType, repeated: true, token: undefined as string | undefined };
        }
        const result = await applyControl(tx, context, request.operation, parsed);
        await tx.fleetControlEvent.create({ data: { requestId: request.requestId, actorId: context.user.id, payloadHash: hash, operation: request.operation, targetType: result.type, targetId: result.id, unitId: result.unitId, snapshot: parsed as Prisma.InputJsonValue } });
        await writeAuditEvent(tx, { actorUsuarioId: context.user.id, eventType: auditEventTypes.fleetOperationRegistered, targetType: result.type, targetId: result.id });
        return { id: result.id, type: result.type, repeated: false, token: result.token };
      }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable, timeout: 30000, maxWait: 30000 });
    } catch (error) {
      if (error instanceof Prisma.PrismaClientKnownRequestError && ["P2034", "P2002"].includes(error.code) && attempt < 3) continue;
      throw error;
    }
  }
  throw new FleetControlError("Concorrência persistente. Tente novamente com a mesma confirmação.");
}
