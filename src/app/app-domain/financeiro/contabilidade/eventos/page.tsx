import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import PostingRulesClient from "./PostingRulesClient";
import { db } from "@/db/client";
import { listFinancePageAccounts } from "@/db/repositories/finance-pages/catalog";
import { readFinancePostingRules } from "@/db/repositories/finance-pages/accounting";

export const dynamic = "force-dynamic";

export default async function PostingRulesPage() {
  const context = await getTenantContextForModule("FINANCEIRO");
  const executor = context.database ?? db;
  const [accounts, events] = await Promise.all([
    listFinancePageAccounts(executor),
    readFinancePostingRules(executor),
  ]);
  return <PostingRulesClient accounts={accounts} events={events.filter(event => event.rules.length === 1).map(event => ({ eventCode: event.code, eventName: event.name, debitAccountId: event.rules[0].debitAccountId, creditAccountId: event.rules[0].creditAccountId, isReference: event.rules[0].isReference, components: event.rules[0].components.map(component => ({ debitAccountId: component.debitAccountId, creditAccountId: component.creditAccountId, valueBasis: component.valueBasis as "EVENT_VALUE" | "PAYMENT_NET" | "PAYMENT_RETENTION", creditFromOriginBank: component.creditFromOriginBank })) }))} />;
}
