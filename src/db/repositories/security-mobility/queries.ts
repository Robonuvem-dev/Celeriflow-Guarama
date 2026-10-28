import { and, count, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "@/db/transaction";
import { mobilityRecords, securityGuards, securityInfractions, securityOccurrences, trafficTickets } from "@/db/schema/security-mobility";
import type { MobilityRecord, SecurityGuard, SecurityInfraction, SecurityOccurrence, TrafficInfractionTicket } from "@/lib/contracts/security-mobility";

export async function listSecurityGuards(db: DatabaseExecutor): Promise<SecurityGuard[]> { return db.select().from(securityGuards).orderBy(desc(securityGuards.createdAt)); }
export async function listSecurityOccurrences(db: DatabaseExecutor): Promise<SecurityOccurrence[]> { return db.select().from(securityOccurrences).orderBy(desc(securityOccurrences.createdAt)); }
export async function listSecurityInfractions(db: DatabaseExecutor): Promise<SecurityInfraction[]> { return db.select().from(securityInfractions).orderBy(desc(securityInfractions.createdAt)); }
export async function listMobilityRecords(db: DatabaseExecutor, categories: string[]): Promise<MobilityRecord[]> { return db.select().from(mobilityRecords).where(inArray(mobilityRecords.categoria, categories)).orderBy(desc(mobilityRecords.createdAt)); }
export async function listTrafficTickets(db: DatabaseExecutor): Promise<TrafficInfractionTicket[]> { return db.select().from(trafficTickets).orderBy(desc(trafficTickets.createdAt)).limit(20); }
export async function getSecurityOverview(db: DatabaseExecutor): Promise<[number, number, number, number, number, MobilityRecord[]]> {
  const [guards, occurrences, infractions, records, urgent, recent] = await Promise.all([
    db.select({ value: count() }).from(securityGuards).where(eq(securityGuards.isActive, true)),
    db.select({ value: count() }).from(securityOccurrences).where(eq(securityOccurrences.isActive, true)),
    db.select({ value: count() }).from(securityInfractions).where(eq(securityInfractions.isActive, true)),
    db.select({ value: count() }).from(mobilityRecords).where(eq(mobilityRecords.isActive, true)),
    db.select({ value: count() }).from(mobilityRecords).where(and(eq(mobilityRecords.isActive, true), inArray(mobilityRecords.prioridade, ["Alta", "Urgente"]))),
    db.select().from(mobilityRecords).orderBy(desc(mobilityRecords.createdAt)).limit(5),
  ]);
  return [guards[0].value, occurrences[0].value, infractions[0].value, records[0].value, urgent[0].value, recent];
}
