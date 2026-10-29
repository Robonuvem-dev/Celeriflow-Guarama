import { canViewOmbudsmanIdentity, getAttendanceContext } from "@/lib/attendance/access";
import { db } from "@/db/client";
import { ombudsmanScopeCondition } from "@/db/repositories/attendance-portals/scope";
import { listOmbudsmanSummaries } from "@/db/repositories/attendance-portals/queries";
import OuvidoriaClient from "./OuvidoriaClient";

export const dynamic = "force-dynamic";

export default async function OuvidoriaPage() {
  const context = await getAttendanceContext();
  const manifestacoes = await listOmbudsmanSummaries(db, ombudsmanScopeCondition(context), context.user.id);
  const safeManifestacoes = manifestacoes.map((manifestacao) => ({
    ...manifestacao,
    person: canViewOmbudsmanIdentity(context, manifestacao.isConfidential, manifestacao.accessGrants.some((grant) => grant.canViewIdentity)) ? manifestacao.person : null,
  }));

  return <OuvidoriaClient initialManifestacoes={safeManifestacoes} canManage={context.attendanceAccess.isOmbudsman} />;
}
