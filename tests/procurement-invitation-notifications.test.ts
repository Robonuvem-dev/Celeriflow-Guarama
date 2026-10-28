import assert from "node:assert/strict";
import test from "node:test";
import { sql } from "drizzle-orm";
import { withDatabaseTransaction } from "../src/db/transaction";
import { notifyPendingPriceResearchInvitations } from "../src/lib/integrations/procurement-invitation-notifications.ts";
import { createProcurementDrizzleFixture } from "./helpers/procurement-drizzle-fixture";

test("price invitation reminders use the internal notification and audit infrastructure without claiming email delivery", async () => {
  const f = await createProcurementDrizzleFixture();
  try {
    const input = { actorUsuarioId: "buyer-1", recipientUserIds: ["buyer-1", "buyer-1", ""] };
    const first = await withDatabaseTransaction(f.connection, tx => notifyPendingPriceResearchInvitations(tx, input));
    const repeated = await withDatabaseTransaction(f.connection, tx => notifyPendingPriceResearchInvitations(tx, input));
    assert.deepEqual(first, { pendingInvitations: 1, eligibleRecipients: 1, notificationsCreated: 1 });
    assert.equal(repeated.notificationsCreated, 0);
    const [notification] = (await f.pg.query<{ sourceModule: string; entityType: string; type: string; message: string }>('SELECT "sourceModule", "entityType", type, message FROM "ProtocolNotification"')).rows;
    assert.equal(notification.sourceModule, "COMPRAS");
    assert.equal(notification.entityType, "PRICE_QUOTE");
    assert.equal(notification.type, "PRICE_RESEARCH_INVITATION_PENDING_DELIVERY");
    assert.match(notification.message, /entrega manual/);
    assert.doesNotMatch(notification.message, /e-mail|email/i);
    assert.equal((await f.audits())[0].eventType, "INTERNAL_NOTIFICATION_CREATED");
    await assert.rejects(withDatabaseTransaction(f.connection, async tx => {
      await tx.execute(sql`UPDATE "PriceQuote" SET id='quote-rollback'`);
      await notifyPendingPriceResearchInvitations(tx, input);
      throw new Error("source operation rollback");
    }), /source operation rollback/);
    assert.equal((await f.pg.query<{ total: number }>('SELECT count(*)::int AS total FROM "ProtocolNotification"')).rows[0].total, 1);
    assert.equal((await f.audits()).length, 1);
  } finally { await f.close(); }
});
