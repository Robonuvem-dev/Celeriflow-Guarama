import type { DatabaseExecutor } from "../../transaction";
import type { LeadInput, LeadRecord } from "@/lib/contracts/leads";
import { leads } from "../../schema/leads";

export async function insertLead(db: DatabaseExecutor, input: LeadInput): Promise<LeadRecord> {
  const [lead] = await db.insert(leads).values(input).returning();
  return lead;
}
