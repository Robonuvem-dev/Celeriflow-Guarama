import { notFound } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { constructionPortalCaseWhere } from "@/lib/obras/construction-portal-policy";
import { listConstructionProjectStamps } from "@/lib/obras/construction-project-stamp";
export default async function ConstructionPortalDocumentsLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params; const identity = await getConstructionPortalIdentity(); if (!await prisma.constructionCase.findFirst({ where: { AND: [{ id }, constructionPortalCaseWhere(identity.id)] }, select: { id: true } })) notFound(); const stamps = (await listConstructionProjectStamps(prisma, id)).filter((r) => r.publishedAt);
  return <>{children}<section className="mx-auto max-w-5xl space-y-3 p-6"><h2 className="font-semibold">Projetos carimbados — cópias derivadas assinadas</h2><p className="text-sm">Cópia derivada demonstrativa do deferimento, com original preservado. Download exige a assinatura correspondente da cópia e publicação. Sem homologação oficial ou PAdES.</p>{stamps.map((row) => <article key={row.id} className="space-y-2 rounded border p-4"><p className="text-sm">Deferimento {row.reviewId} — publicação {row.publishedAt?.toISOString().slice(0, 10)}</p><p className="break-all text-xs">Original: {row.originalHash}<br />Cópia derivada: {row.hashSha256}</p><a className="text-sm underline" href={`/api/construcao-civil/documentos/projeto-aprovado?id=${row.id}&portal=1`}>Baixar projeto carimbado assinado</a></article>)}</section></>;
}
