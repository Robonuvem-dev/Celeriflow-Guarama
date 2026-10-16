import { prisma } from "@/lib/prisma";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";
import { readOnlineItbiEntitlements } from "@/lib/tributacao/itbi-online";
import OnlineItbiClient from "./OnlineItbiClient";

export const dynamic = "force-dynamic";
export default async function NewOnlineItbiPage() {
  const account = await getCitizenAccount("/portal/tributario/itbi/novo");
  const notaries = await readOnlineItbiEntitlements(prisma, account.id);
  return <OnlineItbiClient notaries={notaries.map(row => ({ id: row.entityId, label: row.title }))}/>;
}
