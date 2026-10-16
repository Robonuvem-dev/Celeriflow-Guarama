import Link from "next/link";
import { prisma } from "@/lib/prisma";
import { getConstructionPortalIdentity } from "@/lib/obras/construction-portal-access";
import { listConstructionAutomaticViability } from "@/lib/obras/construction-automatic-viability";
import { automaticViabilityDisclaimer } from "@/lib/obras/construction-automatic-viability-policy";
import AutomaticViabilityButton from "./AutomaticViabilityButton";

const outcomes: Record<string, string> = { APPROVED: "Favorável nos indicadores modelados", DENIED: "Incompatível com os indicadores modelados", MANUAL: "Sem decisão automática — dados ou regras insuficientes" };
export default async function AutomaticViabilityPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const identity = await getConstructionPortalIdentity();
  const runs = await listConstructionAutomaticViability(prisma, identity.id, id);
  return <main className="mx-auto max-w-5xl space-y-5 p-6">
    <h1 className="text-xl font-semibold">Viabilidade online automática — demonstrativo</h1>
    <Link href={`/portal/construcao-civil/${id}`} className="text-sm underline">Voltar à solicitação</Link>
    <p className="rounded border p-4 text-sm">{automaticViabilityDisclaimer}</p>
    <p className="text-sm">Consulta baseada no imóvel e na finalidade já autorizados nesta solicitação. A decisão dos indicadores e a memória são automáticas. Não há assinatura institucional automática configurada: documentos demonstrativos seguem para assinatura real GED; o download permanece bloqueado até sua validação.</p>
    <AutomaticViabilityButton caseId={id} />
    <section className="space-y-4" aria-label="Histórico de consultas">
      {!runs.length && <p>Nenhuma consulta registrada.</p>}
      {runs.map((run) => <article key={run.id} className="space-y-3 rounded border p-4">
        <h2 className="font-semibold">{outcomes[run.outcome] || run.outcome}</h2>
        <p className="text-sm">{new Date(run.createdAt).toLocaleString("pt-BR")} — referência {run.id}</p>
        <p className="text-sm">{run.downloadable ? "Documento demonstrativo assinado no GED." : run.signatureRoutingStatus === "REQUESTED" ? "Assinatura GED solicitada aos gestores habilitados. Download bloqueado." : run.signatureRoutingStatus === "AWAITING_SIGNER_CONFIGURATION" ? "Rascunho GED criado. Configure um gestor signatário e solicite sua assinatura no GED. Download bloqueado." : "Não há documento emitido: consulta exige análise técnica."}</p>
        {run.calculationSnapshot.reasons.map((reason) => <p key={reason} className="text-sm">{reason}</p>)}
        <details><summary className="cursor-pointer text-sm underline">Memória completa e regras publicadas utilizadas</summary><pre className="mt-3 max-h-96 overflow-auto whitespace-pre-wrap rounded bg-muted p-3 text-xs">{JSON.stringify(run.calculationSnapshot, null, 2)}</pre></details>
        {run.downloadable && <a className="text-sm underline" href={`/portal/construcao-civil/${id}/viabilidade-automatica/${run.id}/download`}>Baixar consulta demonstrativa assinada</a>}
      </article>)}
    </section>
  </main>;
}
