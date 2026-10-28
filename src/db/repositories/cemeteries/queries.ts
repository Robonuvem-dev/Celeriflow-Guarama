import { asc, count, desc, eq, inArray } from "drizzle-orm";
import type { DatabaseExecutor } from "../../transaction";
import { cemeteries, cemeteryChapels, cemeteryDeathCauses, cemeteryDeceased, cemeteryFuneralHomes, cemeteryGraves, cemeteryProcesses } from "../../schema/cemeteries";
import { companies, taxpayers } from "../../schema/registry";
import { people } from "../../schema/people";
import { cemeteryProcessPredicate } from "./process-filter";
import type { CemeteryQuery } from "@/lib/cemeteries/query-policy";
import type { CemeteryBurialReportRow, CemeteryProcessPage } from "@/lib/contracts/cemeteries";

export async function readCemeteryProcessPage(db: DatabaseExecutor, query: CemeteryQuery): Promise<CemeteryProcessPage> {
  const where = cemeteryProcessPredicate(query);
  const [totals] = await db.select({ total: count() }).from(cemeteryProcesses).innerJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryProcesses.deceasedId)).where(where);
  const total = totals.total;
  const page = Math.min(query.page, Math.max(1, Math.ceil(total / 20)));
  const rows = await db.select({ process: cemeteryProcesses, deceased: cemeteryDeceased, cause: cemeteryDeathCauses, cemetery: cemeteries, chapel: cemeteryChapels, grave: cemeteryGraves })
    .from(cemeteryProcesses).innerJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryProcesses.deceasedId))
    .leftJoin(cemeteryDeathCauses, eq(cemeteryDeathCauses.id, cemeteryDeceased.causeId)).leftJoin(cemeteries, eq(cemeteries.id, cemeteryProcesses.cemeteryId))
    .leftJoin(cemeteryChapels, eq(cemeteryChapels.id, cemeteryProcesses.chapelId)).leftJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryProcesses.graveId))
    .where(where).orderBy(desc(cemeteryProcesses.scheduledAt), desc(cemeteryProcesses.id)).limit(20).offset((page - 1) * 20);
  const homeIds = rows.flatMap(r => r.process.funeralHomeId ? [r.process.funeralHomeId] : []);
  const declarantIds = rows.map(r => r.process.declarantTaxpayerId);
  const [homes, declarants] = await Promise.all([
    homeIds.length ? db.select().from(cemeteryFuneralHomes).where(inArray(cemeteryFuneralHomes.id, homeIds)) : [],
    declarantIds.length ? db.select({ taxpayer: taxpayers, person: people, company: companies }).from(taxpayers).leftJoin(people, eq(people.id, taxpayers.personId)).leftJoin(companies, eq(companies.id, taxpayers.companyId)).where(inArray(taxpayers.id, declarantIds)) : [],
  ]);
  return { total, page, pageSize: 20, items: rows.map(r => {
    const declarant = declarants.find(d => d.taxpayer.id === r.process.declarantTaxpayerId);
    return { ...r.process, deceased: { ...r.deceased, cause: r.cause }, cemetery: r.cemetery, chapel: r.chapel, grave: r.grave,
      funeralHome: homes.find(h => h.id === r.process.funeralHomeId) ?? null,
      declarant: declarant ? { ...declarant.taxpayer, person: declarant.person, company: declarant.company } : null };
  }) };
}

export async function readCemeteryBurialReport(db: DatabaseExecutor, query: CemeteryQuery): Promise<CemeteryBurialReportRow[]> {
  const rows = await db.select({ process: cemeteryProcesses, deceased: cemeteryDeceased, cause: cemeteryDeathCauses, cemetery: cemeteries, grave: cemeteryGraves, funeralHome: cemeteryFuneralHomes })
    .from(cemeteryProcesses).innerJoin(cemeteryDeceased, eq(cemeteryDeceased.id, cemeteryProcesses.deceasedId))
    .leftJoin(cemeteryDeathCauses, eq(cemeteryDeathCauses.id, cemeteryDeceased.causeId)).leftJoin(cemeteries, eq(cemeteries.id, cemeteryProcesses.cemeteryId))
    .leftJoin(cemeteryGraves, eq(cemeteryGraves.id, cemeteryProcesses.graveId)).leftJoin(cemeteryFuneralHomes, eq(cemeteryFuneralHomes.id, cemeteryProcesses.funeralHomeId))
    .where(cemeteryProcessPredicate(query, true)).orderBy(asc(cemeteryProcesses.performedAt), asc(cemeteryProcesses.id));
  return rows.map(r => ({ ...r.process, deceased: { ...r.deceased, cause: r.cause }, cemetery: r.cemetery, grave: r.grave, funeralHome: r.funeralHome }));
}
