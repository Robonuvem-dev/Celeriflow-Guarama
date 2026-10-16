import Link from "next/link";
import { Users } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveSocialAccess } from "@/lib/social/access-policy";

export default async function SocialPeoplePage({ searchParams }: { searchParams: Promise<{ q?: string; page?: string }> }) {
  const params = await searchParams;
  const q = (params.q || "").trim().slice(0, 160);
  const context = await getTenantContextForModule("SOCIAL");
  const access = await resolveSocialAccess(context);
  const where = !access.administrator && !access.links.length ? { id: { in: [] as string[] } } : {
    ...(q ? { OR: [{ fullName: { contains: q, mode: "insensitive" as const } }, { cpf: { contains: q } }, { socialProfile: { nis: { contains: q } } }] } : {}),
  };
  const total = await context.prisma.person.count({ where });
  const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(params.page || "1", 10) || 1));
  const persons = await context.prisma.person.findMany({ where, select: { id: true, fullName: true, socialName: true, cpf: true, status: true, socialProfile: { select: { nis: true } } }, orderBy: [{ fullName: "asc" }, { id: "asc" }], skip: (page - 1) * 20, take: 20 });
  return <PageFrame className="space-y-2 p-3"><PageHeader title="Prontuários individuais" icon={<Users className="size-4" />} />
    <section className="rounded-lg border border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
      <form className="flex gap-2 border-b p-2"><input aria-label="Buscar nome, CPF ou NIS" type="search" name="q" defaultValue={q} placeholder="Buscar nome, CPF ou NIS..." className="h-8 min-w-0 flex-1 rounded border px-2 text-sm" /><button className="rounded bg-blue-600 px-3 text-xs text-white">Buscar</button></form>
      <table className="w-full table-fixed text-left text-xs"><thead className="bg-slate-100 text-[10px] uppercase text-slate-500 dark:bg-slate-800"><tr><th className="p-2">Pessoa / nome social</th><th className="hidden p-2 sm:table-cell">CPF</th><th className="hidden p-2 md:table-cell">NIS</th><th className="w-20 p-2">Situação</th><th className="w-24 p-2 text-right">Ação</th></tr></thead><tbody>{persons.map((person) => <tr key={person.id} className="h-9 border-t hover:bg-slate-50 dark:hover:bg-slate-800"><td className="truncate p-2" title={person.socialName || person.fullName}>{person.socialName || person.fullName}</td><td className="hidden p-2 sm:table-cell">{person.cpf}</td><td className="hidden p-2 md:table-cell">{person.socialProfile?.nis || "—"}</td><td className="p-2">{person.status}</td><td className="p-2 text-right"><Link className="text-blue-700 underline" href={`/social/pessoas/${person.id}`}>Prontuário</Link></td></tr>)}</tbody></table>
      {!persons.length && <p className="p-6 text-center text-sm text-slate-500">Nenhuma pessoa disponível. Confirme os cadastros e vínculos profissionais.</p>}
      <div className="border-t px-3 py-2"><ErpPagination page={page} total={total} pageSize={20} previousHref={`?q=${encodeURIComponent(q)}&page=${page - 1}`} nextHref={`?q=${encodeURIComponent(q)}&page=${page + 1}`} label="pessoas" /></div>
    </section>
  </PageFrame>;
}
