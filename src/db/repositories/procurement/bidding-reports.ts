import { desc, eq } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { biddingActs, biddingPhases } from "@/db/schema/procurement-bidding";
import { biddingLots } from "@/db/schema/procurement-core";
import { users } from "@/db/schema/identity";
import { loadBiddingDetail } from "./bidding";

/** Report exports must not inherit the operational timeline's 60-record limit. */
export async function loadBiddingReport(db: DatabaseExecutor, id: string) {
  const detail = await loadBiddingDetail(db, id);
  if (!detail) return null;
  const acts = await db.select({ act: biddingActs, phase: { name: biddingPhases.name }, biddingLot: { number: biddingLots.number }, actorUsuario: { nome: users.nome } })
    .from(biddingActs).leftJoin(biddingPhases, eq(biddingPhases.id, biddingActs.phaseId)).leftJoin(biddingLots, eq(biddingLots.id, biddingActs.biddingLotId))
    .innerJoin(users, eq(users.id, biddingActs.actorUsuarioId)).where(eq(biddingActs.biddingId, id)).orderBy(desc(biddingActs.occurredAt), desc(biddingActs.id));
  return { ...detail, biddingActs: acts.map(row => ({ ...row.act, phase: row.phase, biddingLot: row.biddingLot, actorUsuario: row.actorUsuario })) };
}
