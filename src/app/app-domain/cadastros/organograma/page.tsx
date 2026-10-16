import Link from "next/link";
import { Network } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { ErpListFrame } from "@/components/app-ui/erp/ErpListFrame";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export const dynamic = "force-dynamic";

export default async function OrganogramaPage() {
  const { prisma } = await getTenantContextForModule("CADASTROS");
  const secretariats = await prisma.secretariat.findMany({
    include: { departments: { orderBy: { name: "asc" } }, units: { orderBy: { name: "asc" } } },
    orderBy: { name: "asc" },
  });
  return <PageFrame className="flex h-full min-h-0 flex-col"><PageHeader title="Organograma" icon={<Network className="size-4 text-emerald-700" />} action={<div className="flex gap-2"><Link href="/administracao/secretarias" className="h-7 rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">Administrar secretarias</Link><Link href="/administracao/departamentos" className="h-7 rounded border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700">Administrar departamentos</Link></div>} /><ErpListFrame summary={<p className="text-[11px] text-slate-500">Estrutura canônica de secretarias, departamentos e unidades administrativas.</p>}><table className="w-full table-fixed text-left text-xs"><thead className="sticky top-0 z-10 border-b border-slate-200 bg-slate-100 text-[10px] font-bold uppercase tracking-[0.06em] text-slate-600"><tr><th className="h-8 px-3">Secretaria</th><th className="h-8 px-3">Departamentos</th><th className="h-8 px-3">Unidades administrativas</th><th className="h-8 w-24 px-3">Status</th></tr></thead><tbody className="divide-y divide-slate-100">{secretariats.map(secretariat => <tr key={secretariat.id} className="align-top hover:bg-slate-50"><td className="px-3 py-2 font-semibold text-slate-800">{secretariat.acronym ? `${secretariat.acronym} - ` : ""}{secretariat.name}</td><td className="px-3 py-2 text-slate-600">{secretariat.departments.map(item => item.name).join(", ") || "-"}</td><td className="px-3 py-2 text-slate-600">{secretariat.units.map(item => `${item.name} (${item.type})`).join(", ") || "-"}</td><td className="px-3 py-2"><span className={`rounded px-2 py-0.5 text-[10px] font-semibold ${secretariat.isActive ? "bg-emerald-100 text-emerald-700" : "bg-slate-100 text-slate-500"}`}>{secretariat.isActive ? "Ativa" : "Inativa"}</span></td></tr>)}</tbody></table>{!secretariats.length && <p className="p-6 text-center text-xs text-slate-500">Nenhuma estrutura cadastrada.</p>}</ErpListFrame></PageFrame>;
}
