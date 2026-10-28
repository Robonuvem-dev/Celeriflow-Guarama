import Link from "next/link";
import { and, desc, gt, isNull } from "drizzle-orm";
import { db } from "@/db/client";
import { constructionExternalApplications } from "@/db/schema/construction-portal";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import ConstructionExternalAuthorization from "@/components/construction/ConstructionExternalAuthorization";

export default async function ConstructionExternalAuthorizations() {
  await getTenantContextForSystemAdministration();
  const items = await db.select({ id: constructionExternalApplications.id, identityId: constructionExternalApplications.identityId, authorizationReason: constructionExternalApplications.authorizationReason, expiresAt: constructionExternalApplications.expiresAt }).from(constructionExternalApplications).where(and(isNull(constructionExternalApplications.revokedAt), isNull(constructionExternalApplications.caseId), gt(constructionExternalApplications.expiresAt, new Date()))).orderBy(desc(constructionExternalApplications.createdAt)).limit(100);
  return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8"><Link className="text-blue-700 underline" href="/obras/construcao-civil/configuracoes">Configurações urbanísticas</Link><h1 className="text-xl font-semibold">Autorizações administrativas de abertura externa</h1><ConstructionExternalAuthorization items={items.map((item) => ({ ...item, expiresAt: item.expiresAt.toISOString() }))} />{items.length === 100 && <p className="text-sm">Exibindo as 100 autorizações vigentes mais recentes.</p>}</main>;
}
