import Link from "next/link";
export default async function ConstructionPortalCaseLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params;
  return <><nav aria-label="Documentos da solicitação urbanística" className="mx-auto flex max-w-5xl gap-4 px-6 pt-4 text-sm"><Link className="underline" href={`/portal/construcao-civil/${id}`}>Solicitação</Link><Link className="underline" href={`/portal/construcao-civil/${id}/documentos`}>Documentos assinados e projetos carimbados</Link></nav>{children}</>;
}
