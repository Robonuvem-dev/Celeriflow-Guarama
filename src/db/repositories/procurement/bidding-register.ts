import { desc, eq, inArray, sql } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { biddings, purchaseProcesses, biddingParticipants, biddingLots, biddingResults } from "@/db/schema/procurement-core";
import { suppliers, companies } from "@/db/schema/registry";
import { people } from "@/db/schema/people";
import { biddingPhases } from "@/db/schema/procurement-bidding";
import { procurementLifecycleEvents } from "@/db/schema/procurement-requests";

export async function loadBiddingRegister(db: DatabaseExecutor) {
  const rows = await db.select({ bidding: biddings, process: { number: purchaseProcesses.number, object: purchaseProcesses.object },
    hasContract: sql<boolean>`EXISTS (SELECT 1 FROM "Contract" c WHERE c."processId" = ${biddings.processId})`,
    annulledAt: sql<Date | null>`(SELECT e."createdAt" FROM "ProcurementLifecycleEvent" e WHERE e."entityType" = 'BIDDING' AND e."entityId" = ${biddings.id} AND e."eventType" = 'BIDDING_STATUS_TRANSITION' AND e."sourceId" = 'Anulada' ORDER BY e."createdAt" DESC LIMIT 1)`.mapWith(procurementLifecycleEvents.createdAt),
    homologatedAt: sql<Date | null>`(SELECT p."startedAt" FROM "BiddingPhase" p WHERE p."biddingId" = ${biddings.id} AND p.code = 'HOMOLOGATION' AND p.status IN ('Em andamento', 'Concluída') AND p.version = 1 ORDER BY p."startedAt" DESC NULLS LAST LIMIT 1)`.mapWith(biddingPhases.startedAt),
  }).from(biddings).innerJoin(purchaseProcesses, eq(purchaseProcesses.id, biddings.processId)).orderBy(desc(biddings.createdAt), desc(biddings.id));
  if (!rows.length) return [];
  const participants = await db.select({ biddingId: biddingParticipants.biddingId, id: biddingParticipants.id, supplierId: suppliers.id, company: companies.corporateName, person: people.fullName })
    .from(biddingParticipants).innerJoin(suppliers, eq(suppliers.id, biddingParticipants.supplierId)).leftJoin(companies, eq(companies.id, suppliers.companyId)).leftJoin(people, eq(people.id, suppliers.personId))
    .where(inArray(biddingParticipants.biddingId, rows.map(row => row.bidding.id)));
  const winners = await db.select({ biddingId: biddingLots.biddingId, participantId: biddingResults.participantId }).from(biddingResults).innerJoin(biddingLots, eq(biddingLots.id, biddingResults.biddingLotId)).where(sql`${biddingResults.isCurrent} = true AND ${inArray(biddingLots.biddingId, rows.map(row => row.bidding.id))}`);
  return rows.map(row => ({ ...row.bidding, process: row.process, hasContract: row.hasContract, homologatedAt: row.homologatedAt, annulledAt: row.annulledAt,
    participants: participants.filter(participant => participant.biddingId === row.bidding.id).map(participant => ({ supplierId: participant.supplierId, name: participant.company || participant.person || "Fornecedor sem identificação", winner: winners.some(winner => winner.biddingId === row.bidding.id && winner.participantId === participant.id) })),
  }));
}
