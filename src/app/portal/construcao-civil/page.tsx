import Link from "next/link";
import { redirect } from "next/navigation";
import { db } from "@/db/client";
import { and, asc, count, desc, eq, exists, ilike, isNull } from "drizzle-orm";
import { constructionCases, constructionParticipants } from "@/db/schema/construction-core";
import { processes } from "@/db/schema/processes";
import { AccessError } from "@/lib/platform/tenant-context";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { PublicOperationalList } from "../PublicOperationalList";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";

export default async function ConstructionPortalPage({ searchParams }: { searchParams: Promise<{ page?: string; q?: string }> }) {
  const identity = await getConstructionPortalIdentity().catch((error) => { if (error instanceof AccessError && error.status === 401) redirect("/portal/construcao-civil/entrar"); throw error; });
  const query = await searchParams; const q = (query.q || "").trim().slice(0, 100);
  const where = and(exists(db.select({ id: constructionParticipants.id }).from(constructionParticipants).where(and(eq(constructionParticipants.caseId, constructionCases.id), eq(constructionParticipants.identityId, identity.id), eq(constructionParticipants.isActive, true), isNull(constructionParticipants.endsAt)))), q ? ilike(processes.protocolNumber, `%${q}%`) : undefined);
  const total = (await db.select({ value: count() }).from(constructionCases).innerJoin(processes, eq(processes.id, constructionCases.processId)).where(where))[0].value;
  const page = Math.min(Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const items = await db.select({ id: constructionCases.id, category: constructionCases.category, reviewStatus: constructionCases.reviewStatus, process: { protocolNumber: processes.protocolNumber } }).from(constructionCases).innerJoin(processes, eq(processes.id, constructionCases.processId)).where(where).orderBy(desc(constructionCases.createdAt), asc(constructionCases.id)).offset((page - 1) * OPERATIONAL_PAGE_SIZE).limit(OPERATIONAL_PAGE_SIZE);
  const openingLink = <Link href="/portal/construcao-civil/nova" className="inline-flex h-7 items-center rounded bg-blue-600 px-2 text-sm text-white">Abrir solicitação autorizada</Link>;
  return <main className="mx-auto max-w-5xl space-y-2 px-4 py-3"><h1 className="text-xl font-semibold">Construção Civil — Área profissional</h1><p className="text-sm">{identity.professional.person.fullName}</p>
    <PublicOperationalList id="construcao-civil" caption="Solicitações autorizadas de Construção Civil" serverPagination={{ page, total, pathname: "/portal/construcao-civil", values: { q } }} actions={openingLink}
      toolbar={<form className="flex w-full min-w-0 gap-2"><input name="q" aria-label="Buscar protocolo" defaultValue={q} placeholder="Buscar protocolo" className="h-7 min-w-0 flex-1 rounded border px-2 text-sm" /><button className="rounded bg-blue-600 px-3 text-sm text-white">Buscar</button></form>}
      columns={[["protocol", "Protocolo", 240, 130, "identifier"], ["category", "Categoria", 180, 110], ["status", "Análise", 220, 120, "status"], ["actions", "Acesso", 90, 90, "actions"]]}
      rows={items.map((item) => ({ id: item.id, label: item.process.protocolNumber, values: { protocol: item.process.protocolNumber, category: item.category === "BUILDING" ? "Obra" : "Parcelamento", status: item.reviewStatus }, actions: <Link className="text-blue-700 underline" href={`/portal/construcao-civil/${item.id}`}>Abrir</Link> }))} />
  </main>;
}
