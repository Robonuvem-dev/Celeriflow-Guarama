import Link from "next/link";
import { notFound } from "next/navigation";
import { FileSignature } from "lucide-react";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { resolveConstructionAccess } from "@/lib/obras/construction-access";
import { documentKindSchema } from "@/lib/obras/construction-documents-policy";
import DocumentTemplatesClient from "./DocumentTemplatesClient";

export default async function ConstructionDocumentTemplatesPage({ searchParams }: { searchParams: Promise<{ kind?: string; page?: string }> }) {
  const query = await searchParams; const kind = documentKindSchema.safeParse(query.kind).data || "PERMIT";
  const context = await getTenantContextForModule("OBRAS"); const access = await resolveConstructionAccess(context); if (!access.administrator && !access.roles.length) notFound();
  const total = await context.prisma.constructionDocumentTemplateVersion.count({ where: { kind } }); const page = Math.min(Math.max(1, Math.ceil(total / 20)), Math.max(1, Number.parseInt(query.page || "1", 10) || 1));
  const [latest, history] = await Promise.all([context.prisma.constructionDocumentTemplateVersion.findFirst({ where: { kind }, orderBy: { version: "desc" } }), context.prisma.constructionDocumentTemplateVersion.findMany({ where: { kind }, orderBy: { version: "desc" }, skip: (page - 1) * 20, take: 20 })]);
  return <PageFrame className="space-y-4 p-4"><PageHeader title="Modelos e emissão de documentos urbanísticos" icon={<FileSignature className="size-4" />} /><Link className="text-sm underline" href="/obras/construcao-civil">Voltar às solicitações</Link><DocumentTemplatesClient key={kind} kind={kind} canManage={access.administrator || access.roles.includes("MANAGER")} latest={latest ? { title: latest.title, body: latest.body, stamp: latest.stamp, signaturePolicy: latest.signaturePolicy } : null} /><section className="rounded border p-4"><h2 className="font-semibold">Histórico imutável de modelos</h2>{history.map((item) => <p key={item.id} className="py-2 text-sm">Versão {item.version} — {item.title} — {item.signaturePolicy} — {item.createdAt.toISOString().slice(0, 10)}</p>)}{!history.length && <p className="text-sm">Publique o primeiro modelo para habilitar a emissão.</p>}<nav className="flex gap-4 text-sm">{page > 1 && <Link href={`?kind=${kind}&page=${page - 1}`}>Anterior</Link>}<span>Página {page} — {total} versões</span>{page * 20 < total && <Link href={`?kind=${kind}&page=${page + 1}`}>Próxima</Link>}</nav></section></PageFrame>;
}
