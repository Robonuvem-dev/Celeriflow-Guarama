import Link from "next/link";
import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import ConstructionExternalAuthorization from "@/components/construction/ConstructionExternalAuthorization";

export default async function ConstructionExternalAuthorizations() {
  const context = await getTenantContextForSystemAdministration();
  const items = await context.prisma.constructionExternalApplication.findMany({ where: { revokedAt: null, caseId: null, expiresAt: { gt: new Date() } }, select: { id: true, identityId: true, authorizationReason: true, expiresAt: true }, orderBy: { createdAt: "desc" }, take: 100 });
  return <main className="mx-auto max-w-5xl space-y-4 px-4 py-8"><Link className="text-blue-700 underline" href="/obras/construcao-civil/configuracoes">Configurações urbanísticas</Link><h1 className="text-xl font-semibold">Autorizações administrativas de abertura externa</h1><ConstructionExternalAuthorization items={items.map((item) => ({ ...item, expiresAt: item.expiresAt.toISOString() }))} />{items.length === 100 && <p className="text-sm">Exibindo as 100 autorizações vigentes mais recentes.</p>}</main>;
}
