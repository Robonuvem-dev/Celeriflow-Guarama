import { and, desc, eq } from "drizzle-orm";
import { purchaseDemandVersions } from "@/db/schema/procurement-requests";
import type { DatabaseExecutor } from "@/db/transaction";
import { listPlanningForPurchaseRequest } from "./purchase-planning";
import { loadPurchaseRequestDetail } from "./purchase-requests";

export async function loadDemandDraft(db: DatabaseExecutor, id: string) {
  const request = await loadPurchaseRequestDetail(db, id);
  if (!request) return null;
  const planning = await listPlanningForPurchaseRequest(db, id);
  return {
    request,
    snapshot: {
      number: request.number,
      object: request.object,
      justification: request.justification,
      secretariat: request.secretariat?.name ?? null,
      department: request.department?.name ?? null,
      requester: request.requester?.name ?? null,
      priority: request.priority,
      status: request.status,
      createdAt: request.createdAt.toISOString(),
      approvedAt: request.approvedAt?.toISOString() ?? null,
      estimatedValue: request.estimatedValue,
      items: request.items.map(item => ({
        id: item.id,
        name: item.catalogItem?.name ?? item.customName ?? "Item",
        quantity: item.quantity,
        estimatedUnitValue: item.estimatedUnitValue,
      })).sort((a, b) => a.id.localeCompare(b.id)),
      planning: planning.map(entry => ({
        id: entry.id,
        name: entry.catalogName || entry.description || "Item sem especificação",
        status: entry.status,
      })).sort((a, b) => a.id.localeCompare(b.id)),
    },
  };
}

export function listDemandVersions(db: DatabaseExecutor, id: string) {
  return db.select().from(purchaseDemandVersions)
    .where(eq(purchaseDemandVersions.purchaseRequestId, id))
    .orderBy(desc(purchaseDemandVersions.version));
}

export async function recordDemandVersion(
  db: DatabaseExecutor,
  id: string,
  actorId: string,
  expectedVersion: number,
  snapshot: NonNullable<Awaited<ReturnType<typeof loadDemandDraft>>>["snapshot"],
) {
  const [latest] = await db.select().from(purchaseDemandVersions)
    .where(eq(purchaseDemandVersions.purchaseRequestId, id))
    .orderBy(desc(purchaseDemandVersions.version)).limit(1);
  // JSONB canonicalizes object keys. Compare using PostgreSQL's structural equality.
  if (latest) {
    const [same] = await db.select({ id: purchaseDemandVersions.id }).from(purchaseDemandVersions)
      .where(and(eq(purchaseDemandVersions.id, latest.id), eq(purchaseDemandVersions.snapshot, snapshot)));
    if (same) return latest.version;
  }
  if ((latest?.version ?? 0) !== expectedVersion) {
    throw new Error("O DFD foi atualizado. Reabra a prévia antes de formalizar.");
  }
  const version = expectedVersion + 1;
  await db.insert(purchaseDemandVersions).values({ purchaseRequestId: id, actorId, version, snapshot });
  return version;
}
