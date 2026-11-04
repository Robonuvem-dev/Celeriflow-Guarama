import type { DatabaseExecutor } from "@/db/transaction";
import type { EmploymentContract } from "@/lib/contracts/personnel";
import { serviceTimeAssessment } from "./automatic-service-rights";

export async function assessThirteenthEntitlement(db: DatabaseExecutor, contract: EmploymentContract, through: Date) {
  const assessment = await serviceTimeAssessment(db, contract, through, "thirteenth"), excluded = new Set(assessment.exclusions);
  const months: Array<{ month: number; eligibleDays: number; acquired: boolean }> = [];
  for (let month = 0; month <= through.getUTCMonth(); month++) {
    const start = Math.max(Date.UTC(through.getUTCFullYear(), month, 1), contract.admittedAt.getTime());
    const end = Math.min(Date.UTC(through.getUTCFullYear(), month + 1, 0), through.getTime(), contract.endsAt?.getTime() ?? Infinity);
    let eligibleDays = 0;
    for (let at = start; at <= end; at += 86400000) if (!excluded.has(new Date(at).toISOString().slice(0, 10))) eligibleDays++;
    months.push({ month: month + 1, eligibleDays, acquired: eligibleDays >= 15 });
  }
  return { avos: months.filter(month => month.acquired).length, months, time: assessment };
}
