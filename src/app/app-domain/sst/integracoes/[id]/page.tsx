import Link from "next/link";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { readEsocialEvent } from "@/lib/sst/esocial-service";
import { SstForm } from "../../SstForm";
import { transmitEventAction } from "../actions";
export default async function IntegrationDetail({ params }: { params: Promise<{ id: string }> }) {
  const context = await getTenantContextForModule("SST");
  const row = await readEsocialEvent(context, (await params).id);
  return <div className="space-y-4 p-4"><Link className="underline" href="/sst/integracoes">Integrações</Link><h1 className="text-xl font-semibold">{row.kind} · {row.environment}</h1>
    <dl className="break-words"><dt>Origem / versão</dt><dd>{row.sourceId} / {row.sourceVersion}</dd><dt>Hash da origem</dt><dd>{row.sourceHash}</dd><dt>Leiaute</dt><dd>{row.layout}</dd></dl>
    <h2 className="font-semibold">Pendências de preparação</h2><ul className="list-inside list-disc">{row.missingFields.map((field) => <li key={field}>{field}</li>)}</ul>
    <p role="status">Transmissão bloqueada: certificado A1 e adaptador XMLDSig/XSD/mTLS indisponíveis. Sem homologação.</p>
    <SstForm action={transmitEventAction} label="Verificar disponibilidade de envio / consultar retorno"><input type="hidden" name="eventId" value={row.id}/></SstForm>
    <h2 className="font-semibold">Evidências oficiais verificadas</h2>{!row.evidence.length && <p>Nenhum protocolo, recibo ou rejeição oficial recebido.</p>}
    {row.evidence.map((evidence) => <article key={evidence.id} className="rounded border p-3"><p>{evidence.status} · protocolo {evidence.protocol}</p><p>Recibo: {evidence.receipt || "Ainda não emitido"}</p><p>Recebido em: {evidence.receivedAt.toISOString()}</p></article>)}
    <h2 className="font-semibold">Snapshot restrito da origem</h2><pre className="whitespace-pre-wrap break-words rounded border p-3 text-xs">{JSON.stringify(row.sourceSnapshot, null, 2)}</pre>
  </div>;
}
