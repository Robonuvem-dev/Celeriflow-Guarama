import { and, asc, desc, eq, gte, lte, or, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { secretariats } from "@/db/schema/administration";
import { biddings, biddingLots, biddingParticipants, purchaseProcesses, purchaseProcessItems } from "@/db/schema/procurement-core";
import { biddingPhases, biddingLotItems } from "@/db/schema/procurement-bidding";
import { purchaseRequests, purchaseReceipts, purchaseReceiptItems } from "@/db/schema/procurement-requests";
import { companies, suppliers } from "@/db/schema/registry";
import { people as persons } from "@/db/schema/people";
import { catalogItems } from "@/db/schema/master-data";
import { materials } from "@/db/schema/assets-stock";

export type BiddingRegisterFilter = {
  startDate?: string;
  endDate?: string;
  modality?: string;
  status?: string;
  secretariatId?: string;
};

export type BiddingRegisterSummaryItem = {
  id: string;
  number: string;
  modality: string;
  status: string;
  publicationDate: Date | null;
  sessionDate: Date | null;
  processNumber: string;
  secretariatName: string;
  object: string;
  estimatedValue: number;
  lotCount: number;
  itemCount: number;
  participantCount: number;
};

export async function listBiddingRegisterSummary(
  db: DatabaseExecutor,
  filter?: BiddingRegisterFilter,
): Promise<BiddingRegisterSummaryItem[]> {
  const conditions = [];

  if (filter?.modality) {
    conditions.push(eq(biddings.modality, filter.modality));
  }
  if (filter?.status) {
    if (filter.status === "Encerrada") {
      conditions.push(or(eq(biddings.status, "Homologada"), eq(biddings.status, "Adjudicada"), eq(biddings.status, "Concluída"), eq(biddings.status, "Inativa")));
    } else if (filter.status === "Recurso") {
      conditions.push(or(eq(biddings.status, "Julgamento"), eq(biddings.status, "Recurso")));
    } else {
      conditions.push(eq(biddings.status, filter.status));
    }
  }
  if (filter?.secretariatId) {
    conditions.push(eq(purchaseProcesses.secretariatId, filter.secretariatId));
  }
  if (filter?.startDate) {
    const start = new Date(`${filter.startDate}T00:00:00-03:00`);
    if (!Number.isNaN(start.getTime())) {
      conditions.push(
        or(
          gte(biddings.publicationDate, start),
          gte(biddings.sessionDate, start),
          gte(biddings.createdAt, start),
        ),
      );
    }
  }
  if (filter?.endDate) {
    const end = new Date(`${filter.endDate}T23:59:59-03:00`);
    if (!Number.isNaN(end.getTime())) {
      conditions.push(
        or(
          lte(biddings.publicationDate, end),
          lte(biddings.sessionDate, end),
          lte(biddings.createdAt, end),
        ),
      );
    }
  }

  const rows = await db
    .select({
      id: biddings.id,
      number: biddings.number,
      modality: biddings.modality,
      status: biddings.status,
      publicationDate: biddings.publicationDate,
      sessionDate: biddings.sessionDate,
      processNumber: purchaseProcesses.number,
      secretariatName: secretariats.name,
      object: purchaseProcesses.object,
      estimatedValue: purchaseProcesses.estimatedValue,
      lotCount: sql<number>`(SELECT count(*)::integer FROM "BiddingLot" l WHERE l."biddingId" = ${biddings.id})`,
      itemCount: sql<number>`(SELECT count(*)::integer FROM "PurchaseProcessItem" ppi WHERE ppi."purchaseProcessId" = ${purchaseProcesses.id})`,
      participantCount: sql<number>`(SELECT count(*)::integer FROM "BiddingParticipant" bp WHERE bp."biddingId" = ${biddings.id})`,
    })
    .from(biddings)
    .innerJoin(purchaseProcesses, eq(purchaseProcesses.id, biddings.processId))
    .innerJoin(secretariats, eq(secretariats.id, purchaseProcesses.secretariatId))
    .where(conditions.length ? and(...conditions) : undefined)
    .orderBy(desc(biddings.createdAt));

  return rows.map((r) => ({
    ...r,
    estimatedValue: r.estimatedValue ?? 0,
    lotCount: Number(r.lotCount ?? 0),
    itemCount: Number(r.itemCount ?? 0),
    participantCount: Number(r.participantCount ?? 0),
  }));
}
