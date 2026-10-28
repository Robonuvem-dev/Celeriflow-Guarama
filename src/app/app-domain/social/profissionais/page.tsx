import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import SocialProfessionalsClient from "./SocialProfessionalsClient";
import { db } from "@/db/client";
import { listSocialLinks, socialAttendanceOptions } from "@/db/repositories/social/queries";

export default async function SocialProfessionalsPage() {
  const context = await getTenantContextForSystemAdministration();
  const database = context.database ?? db;
  const [links, { professionals: employees, units }] = await Promise.all([
    listSocialLinks(database), socialAttendanceOptions(database, { administrator: true, employeeId: null, links: [] }),
  ]);
  return <SocialProfessionalsClient links={links.map((link) => ({ ...link, startsAt: link.startsAt.toISOString().slice(0, 10), endsAt: link.endsAt?.toISOString().slice(0, 10) || "", createdAt: undefined, updatedAt: undefined }))} employees={employees} units={units} />;
}
