import Link from "next/link";
import { ArrowUpRight, Lock } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";

export type ModuleFoundationLink = {
  title: string;
  description: string;
  href: string;
  available: boolean;
  source: string;
};

export function ModuleFoundationPanel({ title, icon, description, links, areas }: {
  title: string;
  icon: React.ReactNode;
  description: string;
  links: ModuleFoundationLink[];
  areas: { title: string; description: string }[];
}) {
  return (
    <PageFrame className="min-h-0 flex-1 space-y-3 overflow-y-auto">
      <PageHeader title={title} icon={icon} />
      <p className="text-xs leading-5 text-slate-600">{description}</p>
      <section aria-labelledby="module-integrations-title" className="rounded-md border border-slate-200 bg-white p-3">
        <h2 id="module-integrations-title" className="mb-2 text-sm font-bold text-slate-800">Acessos integrados disponíveis</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {links.map(link => {
            const content = <><div className="flex items-center justify-between gap-2"><h3 className="text-xs font-semibold">{link.title}</h3>{link.available ? <ArrowUpRight className="size-3.5 shrink-0" /> : <Lock className="size-3.5 shrink-0" />}</div><p className="mt-1 text-[11px] leading-5 text-slate-500">{link.description}</p><p className="mt-2 text-[10px] font-medium text-slate-500">{link.source}{!link.available && " · Acesso indisponível para seu perfil ou módulo inativo"}</p></>;
            return link.available
              ? <Link key={link.href} href={link.href} className="rounded border border-slate-200 p-3 text-slate-700 transition-colors hover:border-indigo-300 hover:bg-slate-50">{content}</Link>
              : <div key={link.href} className="rounded border border-slate-200 bg-slate-50 p-3 text-slate-500">{content}</div>;
          })}
        </div>
        <p className="mt-3 text-[11px] leading-5 text-slate-500">As telas integradas utilizam as permissões e os registros do módulo de origem.</p>
      </section>
      <section aria-labelledby="module-areas-title" className="rounded-md border border-slate-200 bg-white p-3">
        <h2 id="module-areas-title" className="mb-2 text-sm font-bold text-slate-800">Áreas previstas para a próxima etapa</h2>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {areas.map(area => <article key={area.title} className="rounded border border-slate-100 p-3"><h3 className="text-xs font-semibold text-slate-700">{area.title}</h3><p className="mt-1 text-[11px] leading-5 text-slate-500">{area.description}</p></article>)}
        </div>
      </section>
    </PageFrame>
  );
}
