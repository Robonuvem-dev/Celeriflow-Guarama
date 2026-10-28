import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import SocialCatalogsClient from "./SocialCatalogsClient";
import { db } from "@/db/client";
import { listSocialCatalogs, listSocialWages } from "@/db/repositories/social/queries";

export default async function SocialConfigurationPage() {
  const context = await getTenantContextForModule("SOCIAL");
  const database = context.database ?? db;
  const [entries, wages] = await Promise.all([
    listSocialCatalogs(database), listSocialWages(database),
  ]);
  return <SocialCatalogsClient entries={entries.map(({ id, kind, name, description, isActive, allowedUnitTypes }) => ({ id, kind, name, description, isActive, allowedUnitTypes }))} wages={wages.map((wage) => ({ id: wage.id, validFrom: wage.validFrom.toISOString().slice(0, 10), value: wage.value.toString() }))} />;
}
