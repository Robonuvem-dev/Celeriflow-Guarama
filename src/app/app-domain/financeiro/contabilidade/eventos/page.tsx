import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import PostingRulesClient from "./PostingRulesClient";

export const dynamic = "force-dynamic";

export default async function PostingRulesPage() {
  const { prisma } = await getTenantContextForModule("FINANCEIRO");
  const [accounts, events] = await Promise.all([
    prisma.accountingPlan.findMany({ orderBy: { code: "asc" }, select: { id: true, code: true, name: true } }),
    prisma.accountingEventCatalog.findMany({ where: { isActive: true }, orderBy: { code: "asc" }, include: { rules: { where: { isActive: true }, include: { components: { orderBy: { sequence: "asc" } } } } } }),
  ]);
  return <PostingRulesClient accounts={accounts} events={events.filter(event => event.rules.length === 1).map(event => ({ eventCode: event.code, eventName: event.name, debitAccountId: event.rules[0].debitAccountId, creditAccountId: event.rules[0].creditAccountId, isReference: event.rules[0].isReference, components: event.rules[0].components.map(component => ({ debitAccountId: component.debitAccountId, creditAccountId: component.creditAccountId, valueBasis: component.valueBasis as "EVENT_VALUE" | "PAYMENT_NET" | "PAYMENT_RETENTION", creditFromOriginBank: component.creditFromOriginBank })) }))} />;
}
