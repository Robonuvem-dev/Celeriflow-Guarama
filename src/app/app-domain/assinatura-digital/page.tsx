import Link from "next/link";
import { canViewModule, getCurrentTenantContext, getTenantContextForModule } from "@/lib/platform/tenant-context";
import { canUseGed, getGedContext } from "@/lib/documents/ged-access";
import { PageFrame } from "@/components/app-ui/PageFrame";

export const dynamic = "force-dynamic";
export default async function DigitalSignatureHome() {
  const context = await getCurrentTenantContext();
  const ged = canUseGed(context.user);
  if (ged) await getGedContext(); else await getTenantContextForModule("ASSINATURA_DIGITAL");
  const central = canViewModule(context.user, "ASSINATURA_DIGITAL");
  const links = [
    ...(ged ? [{ href: "/assinatura-digital/acervo", title: "Documentos e pastas", description: "Importação, versões, edição controlada e recuperação do acervo." },
      { href: "/assinatura-digital/pesquisa", title: "Pesquisa e pastas inteligentes", description: "Conteúdo, frases, proximidade, fragmentos e thesaurus." },
      { href: "/assinatura-digital/tarefas", title: "Gestão documental", description: "Elaboração, consenso, aprovação e homologação por versão." },
      { href: "/assinatura-digital/modelos", title: "Modelos", description: "Crie, importe e gere documentos parametrizados." }] : []),
    ...(central ? [{ href: "/assinatura-digital/assine-agora", title: "Assine Agora", description: "Assinatura interna e integrações A1 para arquivos avulsos." },
      { href: "/assinatura-digital/registros", title: "Registros e comprovantes", description: "Originais temporários, evidências e validação." }] : []),
    { href: "/assinatura-digital/pendentes", title: "Pendentes de assinatura", description: "Fila única de solicitações dos módulos e do GED." },
  ];
  return <PageFrame className="space-y-4"><h1 className="text-lg font-semibold">GED e Assinatura Digital</h1><p className="text-sm text-slate-600">Importar → organizar → pesquisar → revisar → homologar → assinar → recuperar.</p><div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{links.map(link => <Link key={link.href} href={link.href} className="rounded border bg-white p-4 hover:border-indigo-500"><h2 className="font-semibold">{link.title}</h2><p className="mt-2 text-sm text-slate-600">{link.description}</p></Link>)}</div>
    {canViewModule(context.user, "DOCUMENTOS") && <div className="flex flex-wrap gap-4 text-sm"><Link className="underline" href="/assinatura-digital/acervo/integrados">Acervo integrado dos módulos e pastas anteriores</Link><Link className="underline" href="/assinatura-digital/modelos/anteriores">Cadastros de modelos anteriores</Link></div>}
  </PageFrame>;
}
