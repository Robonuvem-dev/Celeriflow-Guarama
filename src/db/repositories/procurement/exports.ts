import { and, asc, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor, DatabaseTransaction } from "../../transaction";
import type { BiddingExportRecord, ContractExportRecord } from "@/lib/contracts/procurement-exports";
import type { IntegrationConnectionRecord, IntegrationRunRecord } from "@/lib/contracts/integrations";
import { biddings, biddingLots, biddingParticipants, biddingResults, contractAmendments, procurementBudgetUnits, procurementContracts, purchaseProcesses, purchaseProcessItems } from "../../schema/procurement-core";
import { catalogItems } from "../../schema/master-data";
import { materials } from "../../schema/assets-stock";
import { integrationConnections, integrationRuns } from "../../schema/integrations";
import type { JsonValue } from "../../json";

export async function readBiddingExportRecords(db: DatabaseExecutor, id?: string): Promise<BiddingExportRecord[]> {
  const headers = await db.select({ bidding: biddings, process: purchaseProcesses }).from(biddings)
    .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, biddings.processId)).where(id ? eq(biddings.id, id) : undefined).orderBy(desc(biddings.updatedAt)).limit(id ? 1 : 100);
  if (!headers.length) return [];
  const [items, lots] = await Promise.all([
    db.select({ item: purchaseProcessItems, catalogItem: { name: catalogItems.name, unit: catalogItems.unit }, material: { name: materials.name, unitOfMeasure: materials.unitOfMeasure } }).from(purchaseProcessItems)
      .leftJoin(catalogItems, eq(catalogItems.id, purchaseProcessItems.catalogItemId)).leftJoin(materials, eq(materials.id, purchaseProcessItems.materialId))
      .where(inArray(purchaseProcessItems.purchaseProcessId, headers.map(row => row.process.id))).orderBy(asc(purchaseProcessItems.createdAt)),
    db.select().from(biddingLots).where(inArray(biddingLots.biddingId, headers.map(row => row.bidding.id))).orderBy(asc(biddingLots.number)),
  ]);
  const results = lots.length ? await db.select({ result: biddingResults, participant: { id: biddingParticipants.id, displayCode: biddingParticipants.displayCode, supplierId: biddingParticipants.supplierId } }).from(biddingResults)
    .innerJoin(biddingParticipants, eq(biddingParticipants.id, biddingResults.participantId))
    .where(and(inArray(biddingResults.biddingLotId, lots.map(row => row.id)), eq(biddingResults.isCurrent, true))).orderBy(asc(biddingResults.decidedAt)) : [];
  return headers.map(({ bidding, process }) => ({
    ...bidding,
    process: { ...process, items: items.filter(row => row.item.purchaseProcessId === process.id).map(({ item, catalogItem, material }) => ({ ...item, catalogItem, material })) },
    biddingLots: lots.filter(lot => lot.biddingId === bidding.id).map(lot => ({ ...lot, results: results.filter(row => row.result.biddingLotId === lot.id).map(({ result, participant }) => ({ ...result, participant })) })),
  }));
}

export async function readContractExportRecords(db: DatabaseExecutor, id?: string): Promise<ContractExportRecord[]> {
  const headers = await db.select({ contract: procurementContracts, process: { id: purchaseProcesses.id, number: purchaseProcesses.number, object: purchaseProcesses.object, modality: purchaseProcesses.modality }, sourceBudgetUnit: { code: procurementBudgetUnits.code, name: procurementBudgetUnits.name } }).from(procurementContracts)
    .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, procurementContracts.processId)).leftJoin(procurementBudgetUnits, eq(procurementBudgetUnits.id, procurementContracts.sourceBudgetUnitId))
    .where(id ? eq(procurementContracts.id, id) : undefined).orderBy(desc(procurementContracts.updatedAt)).limit(id ? 1 : 100);
  if (!headers.length) return [];
  const amendments = await db.select().from(contractAmendments).where(inArray(contractAmendments.contractId, headers.map(row => row.contract.id))).orderBy(asc(contractAmendments.createdAt));
  return headers.map(({ contract, process, sourceBudgetUnit }) => ({ ...contract, process, sourceBudgetUnit, amendments: amendments.filter(row => row.contractId === contract.id) }));
}

export async function listProcurementExportRuns(db: DatabaseExecutor, connectionId: string, operation: string): Promise<IntegrationRunRecord[]> {
  return db.select().from(integrationRuns).where(and(eq(integrationRuns.connectionId, connectionId), eq(integrationRuns.operation, operation))).orderBy(desc(integrationRuns.createdAt));
}

export async function readProcurementExportRun(db: DatabaseExecutor, id: string): Promise<(IntegrationRunRecord & { connection: { code: string } }) | null> {
  const [row] = await db.select({ run: integrationRuns, connection: { code: integrationConnections.code } }).from(integrationRuns).innerJoin(integrationConnections, eq(integrationConnections.id, integrationRuns.connectionId)).where(eq(integrationRuns.id, id));
  return row ? { ...row.run, connection: row.connection } : null;
}

export async function listProcurementExportConnections(db: DatabaseExecutor): Promise<(IntegrationConnectionRecord & { runs: IntegrationRunRecord[] })[]> {
  const connections = await db.select().from(integrationConnections).where(inArray(integrationConnections.code, ["TCE_PB_SAGRES", "PNCP"]));
  if (!connections.length) return [];
  const runs = await db.select().from(integrationRuns).where(inArray(integrationRuns.connectionId, connections.map(row => row.id))).orderBy(desc(integrationRuns.createdAt));
  return connections.map(connection => ({ ...connection, runs: runs.filter(run => run.connectionId === connection.id) }));
}

export async function insertProcurementExportRun(tx: DatabaseTransaction, input: { connectionId: string; operation: string; environment: string; status: string; message: string; payload: JsonValue }): Promise<IntegrationRunRecord> {
  const [run] = await tx.insert(integrationRuns).values(input).returning();
  return run;
}

export async function updateProcurementExportRun(tx: DatabaseTransaction, id: string, input: { status: string; externalId: string; message: string; payload: JsonValue }): Promise<IntegrationRunRecord> {
  const [run] = await tx.update(integrationRuns).set(input).where(eq(integrationRuns.id, id)).returning();
  return run;
}
