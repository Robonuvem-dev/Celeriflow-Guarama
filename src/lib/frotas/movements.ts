import { createHash } from "node:crypto";
import { and, desc, eq, isNull, sql } from "drizzle-orm";
import { z } from "zod";
import { Decimal } from "@/db/decimal";
import { databaseConnection } from "@/db/client";
import { withDatabaseTransaction } from "@/db/transaction";
import * as f from "@/db/schema/fleet";
import { assetMaintenances } from "@/db/schema/assets";
import { fleetJson, requiredFleetRecord } from "@/db/repositories/fleet/records";
import type { FleetContext } from "@/lib/contracts/fleet";
import { canPerformModuleOperation, AccessError } from "@/lib/platform/tenant-context";
import { fleetScope, mutateFleetInTransaction } from "./service";
import { dateOnly, dateSchema, todayInBrazil } from "./contract";
import { controlQuantity, controlMoney } from "./control-policy";
import { FleetControlError, lockFleetResources, scopedFleetUnit } from "./control-access";
import { reverseStockMovementInTransaction } from "@/lib/patrimonio/stock-service";

const plate = z.string().trim().toUpperCase().transform(value => value.replace(/[- ]/g, "")).pipe(z.string().regex(/^[A-Z]{3}\d[A-Z0-9]\d{2}$/, "Placa inválida."));
const schema = z.object({ requestId: z.uuid(), operation: z.enum(["plate", "meter", "importFuel", "importMaintenance", "reverseFuel", "reverseMaintenance"]), unitId: z.string().max(100).default(""), externalPlate: z.string().max(20).default(""), recordId: z.string().max(100).default(""), reading: z.string().max(30).default(""), reason: z.string().trim().min(5).max(2000), csv: z.string().max(500000).default("") });
function csvRows(csv: string) {
  const rows: string[][] = []; let row: string[] = [], cell = "", quoted = false;
  for (let i = 0; i <= csv.length; i++) {
    const char = csv[i];
    if (char === '"') { if (quoted && csv[i + 1] === '"') { cell += '"'; i++; } else quoted = !quoted; }
    else if (!quoted && (char === ";" || char === "\n" || char === undefined)) { row.push(cell.replace(/\r$/, "").trim()); cell = ""; if (char !== ";") { if (row.some(Boolean)) rows.push(row); row = []; } }
    else cell += char;
  }
  if (quoted || rows.length < 2 || rows.length > 201) throw new FleetControlError("CSV inválido: informe cabeçalho e até 200 registros separados por ponto e vírgula.");
  const header = rows.shift()!.map(value => value.replace(/^\uFEFF/, ""));
  return rows.map(values => Object.fromEntries(header.map((key, i) => [key, values[i] || ""])));
}
function importKey(kind: string, reference: string) {
  const hash = createHash("sha256").update(`CF14:${kind}:${reference}`).digest("hex");
  return `${hash.slice(0, 8)}-${hash.slice(8, 12)}-4${hash.slice(13, 16)}-8${hash.slice(17, 20)}-${hash.slice(20, 32)}`;
}

export async function recordFleetMovement(context: FleetContext, raw: unknown) {
  const input = schema.parse(raw), scope = fleetScope(context);
  if (!canPerformModuleOperation(context.user, "FROTAS", "update")) throw new AccessError("Sem permissão para alterar Frotas.", 403);
  const hash = createHash("sha256").update(JSON.stringify(input)).digest("hex");
  return withDatabaseTransaction(databaseConnection, async tx => {
    await lockFleetResources(tx, [`REQUEST:${input.requestId}`, `MOVEMENT:${input.operation}:${input.recordId || input.unitId}`]);
    const [previous] = await tx.select().from(f.fleetControlEvents).where(eq(f.fleetControlEvents.requestId, input.requestId)).limit(1);
    if (previous) {
      if (previous.actorId !== scope.actorId || previous.payloadHash !== hash) throw new FleetControlError("Confirmação já utilizada com outros dados.");
      if (previous.unitId) await scopedFleetUnit(tx, scope, previous.unitId, false);
      return previous.targetId;
    }
    let unitId = input.unitId, targetId = input.recordId || input.unitId;
    let snapshot: unknown = input;
    if (input.operation === "plate") {
      const externalPlate = plate.parse(input.externalPlate);
      await lockFleetResources(tx, [`EXTERNAL_PLATE:${externalPlate}`]);
      await scopedFleetUnit(tx, scope, unitId, false);
      const [existing] = await tx.select().from(f.fleetControlEvents).where(and(eq(f.fleetControlEvents.operation, "MOVEMENT_plate"), eq(f.fleetControlEvents.targetId, externalPlate))).orderBy(desc(f.fleetControlEvents.createdAt), desc(f.fleetControlEvents.id)).limit(1);
      if (existing?.unitId) await scopedFleetUnit(tx, scope, existing.unitId, false);
      targetId = externalPlate; snapshot = { ...input, externalPlate };
    } else if (input.operation === "meter") {
      await lockFleetResources(tx, [`UNIT:${unitId}`]);
      const unit = await scopedFleetUnit(tx, scope, unitId, false);
      if (!unit.control || unit.control.meterType === "SEM_MARCADOR") throw new FleetControlError("Configure o marcador da unidade antes de registrar a troca.");
      if ((await tx.select({ id: f.fleetTrips.id }).from(f.fleetTrips).where(and(eq(f.fleetTrips.unitId, unitId), isNull(f.fleetTrips.returnedAt))).limit(1)).length) throw new FleetControlError("Registre o retorno da viagem antes de trocar o marcador.");
      const reading = new Decimal(controlQuantity.parse(input.reading));
      snapshot = { ...input, previousReading: unit.control.currentReading?.toString(), meterType: unit.control.meterType };
      await tx.update(f.fleetUnitControls).set({ currentReading: reading }).where(eq(f.fleetUnitControls.unitId, unitId));
    } else if (input.operation.startsWith("import")) {
      if (!canPerformModuleOperation(context.user, "FROTAS", "create")) throw new AccessError("Importação exige criação em Frotas.", 403);
      const imported: string[] = [];
      for (const row of csvRows(input.csv)) {
        const externalPlate = plate.parse(row.placa), reference = z.string().min(1).max(150).parse(row.referencia);
        const occurredAt = dateSchema.parse(row.data);
        if (occurredAt > todayInBrazil()) throw new FleetControlError(`Data futura na referência ${reference}.`);
        const [mapping] = await tx.select().from(f.fleetControlEvents).where(and(eq(f.fleetControlEvents.operation, "MOVEMENT_plate"), eq(f.fleetControlEvents.targetId, externalPlate))).orderBy(desc(f.fleetControlEvents.createdAt), desc(f.fleetControlEvents.id)).limit(1);
        const [registered] = await tx.select({ id: f.fleetUnits.id }).from(f.fleetUnits).where(eq(f.fleetUnits.plate, externalPlate)).limit(1);
        const id = mapping?.unitId || registered?.id;
        if (!id) throw new FleetControlError(`Placa sem vínculo: ${externalPlate}.`);
        const unit = await scopedFleetUnit(tx, scope, id);
        const cost = controlMoney.parse(row.valor), key = importKey(input.operation, `${externalPlate}:${reference}`);
        if (input.operation === "importFuel") {
          const result = await mutateFleetInTransaction(tx, context, { requestId: key, kind: "consumption", data: { unitId: id, type: "COMBUSTIVEL", origin: "TERCEIRO", occurredAt, material: row.descricao || "Combustível importado", quantity: controlQuantity.parse(row.quantidade), measurementUnit: "L", cost, supplierId: "", reference, workOrderId: "", stockMode: "LOCAL", stockId: "", stockMovementId: "" } });
          imported.push(result.id);
        } else {
          await lockFleetResources(tx, [`IMPORT:${key}`]);
          const [prior] = await tx.select().from(f.fleetControlEvents).where(eq(f.fleetControlEvents.requestId, key)).limit(1);
          const rowHash = createHash("sha256").update(JSON.stringify(row)).digest("hex");
          if (prior) { if (prior.unitId) await scopedFleetUnit(tx, scope, prior.unitId, false); if (prior.payloadHash !== rowHash || prior.unitId !== id) throw new FleetControlError(`Referência ${reference} já importada com outros dados.`); imported.push(prior.targetId); continue; }
          const description = z.string().trim().min(1).max(10000).parse(row.descricao);
          const maintenance = unit.assetId ? requiredFleetRecord(await tx.insert(assetMaintenances).values({ assetId: unit.assetId, description, status: "Concluída", startDate: dateOnly(occurredAt), endDate: dateOnly(occurredAt), cost: Number(cost) }).returning()) : null;
          const order = requiredFleetRecord(await tx.insert(f.fleetWorkOrders).values({ unitId: id, title: description.slice(0, 200), type: "AVULSA", services: description, intervalDays: 1, scheduledAt: dateOnly(occurredAt), status: "CONCLUIDA", completedAt: dateOnly(occurredAt), performed: description, result: `Importação ${reference}`, actualCost: new Decimal(cost), assetMaintenanceId: maintenance?.id, createdById: scope.actorId }).returning());
          await tx.insert(f.fleetExpenses).values({ unitId: id, nature: "MANUTENCAO", occurredAt: dateOnly(occurredAt), amount: new Decimal(cost), description, sourceType: "OS", sourceId: order.id, sourceKey: maintenance ? `asset-maintenance:${maintenance.id}` : `order:${order.id}`, reference, createdById: scope.actorId });
          await tx.insert(f.fleetControlEvents).values({ requestId: key, actorId: scope.actorId, payloadHash: rowHash, operation: "MOVEMENT_importMaintenanceRow", targetType: "WORK_ORDER", targetId: order.id, unitId: id, snapshot: fleetJson(row) });
          imported.push(order.id);
        }
      }
      unitId = ""; targetId = input.requestId; snapshot = { operation: input.operation, reason: input.reason, imported };
    } else {
      const fuel = input.operation === "reverseFuel";
      const source = fuel ? requiredFleetRecord(await tx.select().from(f.fleetConsumptions).where(eq(f.fleetConsumptions.id, input.recordId)).limit(1)) : requiredFleetRecord(await tx.select().from(f.fleetWorkOrders).where(eq(f.fleetWorkOrders.id, input.recordId)).limit(1));
      unitId = source.unitId; await lockFleetResources(tx, [`UNIT:${unitId}`, `REVERSE:${input.recordId}`]);
      await scopedFleetUnit(tx, scope, unitId, false);
      const [reversed] = await tx.select({ id: f.fleetControlEvents.id }).from(f.fleetControlEvents).where(and(eq(f.fleetControlEvents.operation, `MOVEMENT_${input.operation}`), eq(f.fleetControlEvents.targetId, input.recordId))).limit(1);
      if (reversed) throw new FleetControlError("Movimento já estornado.");
      if (fuel) {
        const consumption = requiredFleetRecord(await tx.select().from(f.fleetConsumptions).where(eq(f.fleetConsumptions.id, input.recordId)).limit(1));
        if (consumption.quantity.lte(0)) throw new FleetControlError("Selecione um consumo positivo de origem.");
        if (consumption.stockMovementId) {
          if (!scope.canIssueStock) throw new FleetControlError("Estorno de estoque exige permissão de Almoxarifado.");
          await reverseStockMovementInTransaction(tx, { movementId: consumption.stockMovementId, reason: input.reason, idempotencyKey: `FLEET_REVERSAL:${consumption.id}`, actor: { usuarioId: scope.actorId, employeeId: scope.employeeId } });
        }
        await tx.insert(f.fleetConsumptions).values({ unitId, type: consumption.type, origin: consumption.origin, occurredAt: consumption.occurredAt, material: consumption.material, quantity: consumption.quantity.neg(), measurementUnit: consumption.measurementUnit, cost: consumption.cost?.neg(), supplierId: consumption.supplierId, supplierName: consumption.supplierName, reference: `Estorno ${consumption.id}: ${input.reason}`, createdById: scope.actorId });
      } else {
        const order = requiredFleetRecord(await tx.select().from(f.fleetWorkOrders).where(eq(f.fleetWorkOrders.id, input.recordId)).limit(1));
        if (order.status !== "CONCLUIDA") throw new FleetControlError("Selecione uma manutenção concluída.");
        await tx.update(f.fleetWorkOrders).set({ status: "ESTORNADA", result: `${order.result || ""}\nEstorno: ${input.reason}` }).where(eq(f.fleetWorkOrders.id, order.id));
        if (order.assetMaintenanceId) await tx.update(assetMaintenances).set({ status: "Cancelada", cost: 0 }).where(eq(assetMaintenances.id, order.assetMaintenanceId));
      }
      const expenses = await tx.select().from(f.fleetExpenses).where(and(eq(f.fleetExpenses.sourceId, input.recordId), eq(f.fleetExpenses.sourceType, fuel ? "CONSUMO" : "OS")));
      for (const expense of expenses) await tx.insert(f.fleetExpenses).values({ unitId, nature: expense.nature, occurredAt: expense.occurredAt, amount: expense.amount?.neg(), description: `Estorno: ${input.reason}`, sourceType: "ESTORNO", sourceId: expense.id, sourceKey: `reversal:${expense.id}`, reference: input.recordId, createdById: scope.actorId });
      const authorizations = await tx.select().from(f.fleetAuthorizations).where(fuel ? eq(f.fleetAuthorizations.consumptionId, input.recordId) : eq(f.fleetAuthorizations.workOrderId, input.recordId));
      for (const authorization of authorizations) {
        if (authorization.agreementId && fuel) { await lockFleetResources(tx, [`AGREEMENT:${authorization.agreementId}`]); await tx.update(f.fleetFuelAgreements).set({ consumed: sql`${f.fleetFuelAgreements.consumed} - ${authorization.actualQuantity?.toString() || "0"}` }).where(eq(f.fleetFuelAgreements.id, authorization.agreementId)); }
        await tx.update(f.fleetAuthorizations).set({ status: "ESTORNADA", tokenHash: null }).where(eq(f.fleetAuthorizations.id, authorization.id));
      }
      snapshot = { ...input, original: source };
    }
    await tx.insert(f.fleetControlEvents).values({ requestId: input.requestId, actorId: scope.actorId, payloadHash: hash, operation: `MOVEMENT_${input.operation}`, targetType: "MOVEMENT", targetId, unitId: unitId || null, snapshot: fleetJson(snapshot) });
    return targetId;
  }, { isolationLevel: "serializable", timeoutMs: 30000 });
}
