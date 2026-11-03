import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { listDemandVersions, loadDemandDraft } from "@/db/repositories/procurement/purchase-demand";
import { formalizeDemand, routeDemand } from "./actions";
import { demandStatusLabel, listDemandEvents } from "@/db/repositories/procurement/purchase-demand-workflow";
import { listManagedDocuments } from "@/db/repositories/documents/ged";
import { canUseGed } from "@/lib/documents/ged-access";
import { gedQuerySchema } from "@/lib/documents/ged-policy";
import { documentVersions } from "@/db/schema/document-workflow";
import { eq } from "drizzle-orm";
import { canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { canSelectAnyPurchaseRequestOrigin, purchaseRequestOriginScope } from "@/lib/compras/purchase-request-policy";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export default async function DemandDocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ versao?: string; q?: string; pagina?: string }> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const { id } = await params;
  const database = context.database ?? db;
  const draft = await loadDemandDraft(database, id);
  if (!draft) notFound();
  const versions = await listDemandVersions(database, id);
  const { versao, q, pagina } = await searchParams;
  const selected = versions.find(entry => String(entry.version) === versao);
  if (versao && !selected) notFound();
  const request = selected?.snapshot ?? draft.snapshot;
  const planning = request.planning;
  const scope = purchaseRequestOriginScope(context.user);
  const canFormalize = Boolean(draft.request.approvedAt && draft.request.status !== "Rascunho"
    && canPerformModuleOperation(context.user, "COMPRAS", "update")
    && (canSelectAnyPurchaseRequestOrigin(context.user)
      || (scope?.secretariatId === draft.request.secretariatId && scope.departmentId === draft.request.departmentId)));
  const submit = formalizeDemand.bind(null, id, versions[0]?.version ?? 0);
  const events = selected ? await listDemandEvents(database, selected.id) : [];
  const latest = events[0];
  const current = selected && selected.id === versions[0]?.id;
  const canGed = canUseGed(context.user);
  const page = Number(pagina);
  const documents = current && canFormalize && canGed && !latest
    ? await listManagedDocuments(context, gedQuerySchema.parse({ text: typeof q === "string" ? q.slice(0, 100) : "", mode: "fragment" }), Number.isSafeInteger(page) && page > 0 ? page : 1)
    : null;
  const eligible = documents?.documents.filter(doc => ["FINAL", "SIGNED"].includes(doc.versionStatus) && !doc.checkoutOwnerId);
  const route = selected ? routeDemand.bind(null, id, selected.version, latest?.step ?? 0) : null;
  const [linked] = latest?.documentVersionId && canGed
    ? await database.select().from(documentVersions).where(eq(documentVersions.id, latest.documentVersionId))
    : [];
  const download = linked && encodeURIComponent(JSON.stringify([{ id: linked.documentId, versionId: linked.id }]));
  const money = new Intl.NumberFormat("pt-BR", { style: "currency", currency: "BRL" });
  const date = new Intl.DateTimeFormat("pt-BR", { dateStyle: "short", timeZone: "America/Sao_Paulo" });
  const fields = [
    ["Secretaria", request.secretariat],
    ["Departamento", request.department],
    ["Solicitante", request.requester],
    ["Prioridade", request.priority],
    ["Situação da solicitação", request.status],
    ["Registrada em", date.format(new Date(request.createdAt))],
    ["Solicitação aprovada em", request.approvedAt ? date.format(new Date(request.approvedAt)) : null],
    ["Valor estimado", request.estimatedValue == null ? null : money.format(request.estimatedValue)],
  ];

  return (
    <PageFrame className="space-y-3">
      <PageHeader title={`DFD · ${request.number}`} action={<Link className="underline" href={`/compras/solicitacoes/${id}`}>Voltar à solicitação</Link>} />
      <Card>
        <CardHeader><CardTitle>Documento de Formalização de Demanda</CardTitle></CardHeader>
        <CardContent className="space-y-4 text-sm">
                    <p className="text-muted-foreground">{selected
            ? `Versão ${selected.version} formalizada em ${date.format(selected.createdAt)}`
            : "Prévia gerada com os dados atuais da solicitação."}</p>
          <nav aria-label="Versões do DFD" className="flex flex-wrap gap-3">
            <Link className="underline" href={`/compras/solicitacoes/${id}/dfd`}>Prévia atual</Link>
            {versions.map(entry => (
              <Link key={entry.id} className="underline" href={`?versao=${entry.version}`}>Versão {entry.version}</Link>
            ))}
          </nav>
          {!selected && canFormalize && (
            <form action={submit}>
              <button type="submit" className="rounded border px-3 py-2">
                {versions.length ? "Formalizar revisão" : "Formalizar DFD"}
              </button>
            </form>
          )}
          {selected && (
            <section className="space-y-3">
              <h2 className="font-medium">Tramitação do DFD</h2>
              <p>{latest ? demandStatusLabel[latest.status] : "Aguardando encaminhamento"}</p>
              {download && <a className="underline" href={`/api/assinatura-digital/ged/download?items=${download}`}>Baixar versão vinculada do GED</a>}
              {events.length > 0 && <ol className="list-decimal pl-5">
                {events.map(event => <li key={event.id}>{date.format(event.createdAt)} · {demandStatusLabel[event.status]} · {event.reason}</li>)}
              </ol>}
              {documents && (
                <form className="flex flex-wrap gap-2">
                  <input type="hidden" name="versao" value={selected.version} />
                  <label>Buscar no GED <input name="q" className="border" maxLength={100} defaultValue={q} /></label>
                  <button type="submit" className="underline">Buscar</button>
                  {documents.page > 1 && <button name="pagina" value={documents.page - 1}>Anterior</button>}
                  {documents.documents.length > 0 && <button name="pagina" value={documents.page + 1}>Próxima</button>}
                </form>
              )}
              {current && canFormalize && route && ((!latest && eligible?.length) || (latest?.status === "EM_ANALISE" && latest.actorId !== context.user.id)) ? (
                <form action={route} className="grid gap-2">
                  {!latest && <label>Documento final do GED
                    <select name="document" required defaultValue="" className="block w-full rounded border">
                      <option value="" disabled>Selecione um documento</option>
                      {eligible?.map(doc => <option key={doc.id} value={`${doc.id}:${doc.versionId}`}>{doc.title} · versão {doc.versionNumber}</option>)}
                    </select>
                  </label>}
                  <label>Justificativa <textarea name="reason" required maxLength={2000} className="block w-full rounded border" /></label>
                  <div className="flex flex-wrap gap-3">
                    {!latest ? <button name="status" value="EM_ANALISE" className="rounded border px-3 py-2">Encaminhar para análise</button> : <>
                      <button name="status" value="APROVADO" className="rounded border px-3 py-2">Aprovar</button>
                      <button name="status" value="DEVOLVIDO" className="rounded border px-3 py-2">Devolver para revisão</button>
                    </>}
                  </div>
                </form>
              ) : null}
            </section>
          )}
          <dl className="grid gap-3 sm:grid-cols-2">
            {fields.map(([label, value]) => <div key={label}><dt className="font-medium">{label}</dt><dd>{value ?? "Não informado"}</dd></div>)}
          </dl>
          <section><h2 className="font-medium">Objeto</h2><p className="whitespace-pre-wrap">{request.object}</p></section>
          <section><h2 className="font-medium">Justificativa da necessidade</h2><p className="whitespace-pre-wrap">{request.justification}</p></section>
          <section>
            <h2 className="font-medium">Itens solicitados</h2>
            <ul className="list-disc pl-5">{request.items.map(item => <li key={item.id}>{item.name} · {item.quantity}</li>)}</ul>
          </section>
          <section>
            <h2 className="font-medium">Planejamentos vinculados</h2>
            {planning.length === 0 ? <p>Nenhum planejamento vinculado.</p> : (
              <ul className="list-disc pl-5">{planning.map(entry => <li key={entry.id}><Link className="underline" href={`/compras/planejamento/${entry.id}`}>{entry.name}</Link> · {entry.status}</li>)}</ul>
            )}
          </section>
        </CardContent>
      </Card>
    </PageFrame>
  );
}
