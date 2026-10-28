import type { DatabaseTransaction } from "@/db/transaction";
import { createCultureSpaceReservation } from "@/db/repositories/culture/reservations";

export async function createScopedSpaceReservation(tx: DatabaseTransaction, input: { spaceId: string; personId?: string | null; companyId?: string | null; eventId?: string | null; startsAt: Date; endsAt: Date; purpose: string; protocolNumber?: string }) {
  return createCultureSpaceReservation(tx, input);
}
