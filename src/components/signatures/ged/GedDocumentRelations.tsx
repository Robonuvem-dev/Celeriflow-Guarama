"use client";
import Link from "next/link";

export function GedDocumentRelations({ extra, onWithdraw }: {
  extra: { access: Record<string, boolean>; publications?: { id: string; title: string; status: string; versionId: string }[]; sources?: { module: string; sourceId: string }[]; generatedFrom?: { id: string; name: string; version: number }[] };
  onWithdraw: (publicationId: string) => Promise<void>;
}) {
  return <details className="rounded border bg-white p-3"><summary className="font-semibold">Origens, modelos e publicações</summary><div className="mt-3 space-y-3 text-sm">
    {extra.sources?.map(source => <p key={`${source.module}:${source.sourceId}`}><Link className="underline" href={`/${source.module.toLowerCase()}`}>{source.module}</Link> · referência {source.sourceId}</p>)}
    {extra.generatedFrom?.map(template => <p key={template.id}>Gerado do modelo <Link className="underline" href="/assinatura-digital/modelos">{template.name}</Link> · versão {template.version}</p>)}
    {extra.publications?.map(publication => <article key={publication.id} className="rounded border p-2"><p>{publication.title} · {publication.status}</p><p className="break-all text-xs">Versão publicada: {publication.versionId}</p>{extra.access.share && publication.status === "PUBLISHED" && <button className="mt-2 rounded border px-2 py-1" onClick={() => void onWithdraw(publication.id)}>Retirar publicação</button>}</article>)}
    {!extra.sources?.length && !extra.generatedFrom?.length && !extra.publications?.length && <p>Nenhum vínculo disponível nesta consulta.</p>}
  </div></details>;
}
