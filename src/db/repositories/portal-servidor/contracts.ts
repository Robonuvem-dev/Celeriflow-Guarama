import { sql, type SQL } from "drizzle-orm";
import { Decimal } from "../../decimal";
import type { DatabaseExecutor } from "../../transaction";
import type { EmploymentContract, EmploymentRevision } from "@/lib/contracts/personnel";
import { portalRows } from "./records";

export async function portalContracts(db: DatabaseExecutor, condition: SQL, order: SQL = sql`registration ASC`): Promise<(EmploymentContract & { revisions: EmploymentRevision[] })[]> {
  const contracts = await portalRows<Omit<EmploymentContract, "salary"> & { salary: string }>(db, sql`SELECT * FROM "HrEmploymentContract" WHERE ${condition} ORDER BY ${order}`);
  const revisions = await portalRows<EmploymentRevision>(db, sql`SELECT * FROM "HrEmploymentRevision" WHERE "contractId"=ANY(${sql.param(contracts.map(contract => contract.id))}::text[])`);
  return contracts.map(contract => ({ ...contract, salary: new Decimal(contract.salary), revisions: revisions.filter(revision => revision.contractId === contract.id) }));
}
