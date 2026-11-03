import Link from "next/link";
import { notFound } from "next/navigation";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { db } from "@/db/client";
import { listDemandVersions, loadDemandDraft } from "@/db/repositories/procurement/purchase-demand";
import { formalizeDemand } from "./actions";
import { canPerformModuleOperation } from "@/lib/platform/tenant-context";
import { canSelectAnyPurchaseRequestOrigin, purchaseRequestOriginScope } from "@/lib/compras/purchase-request-policy";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";

export default async function DemandDocumentPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ versao?: string }> }) {
  const context = await getTenantContextForModule("COMPRAS");
  const { id } = await params;
  const database = context.database ?? db;
  const draft = await loadDemandDraft(database, id);
  if (!draft) notFound();
  const versions = await listDemandVersions(database, id);
  const { versao } = await searchParams;
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
