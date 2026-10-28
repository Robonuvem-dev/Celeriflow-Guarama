import "server-only";
import type { DatabaseExecutor } from "@/db/transaction";
import type { CemeteryQuery } from "./query-policy";
import { readCemeteryProcessPage, readCemeteryBurialReport } from "@/db/repositories/cemeteries/queries";
import type { CemeteryProcessPage, CemeteryBurialReportRow } from "@/lib/contracts/cemeteries";

export async function listCemeteryProcesses(db: DatabaseExecutor, query: CemeteryQuery): Promise<CemeteryProcessPage> {
  return readCemeteryProcessPage(db, query);
}

export async function cemeteryBurialReport(db: DatabaseExecutor, query: CemeteryQuery): Promise<CemeteryBurialReportRow[]> {
  return readCemeteryBurialReport(db, query);
}
