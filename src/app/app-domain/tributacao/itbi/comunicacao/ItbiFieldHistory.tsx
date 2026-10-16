import type { PrismaClient } from "@prisma/client";
import type { TaxActor } from "@/lib/tributacao";
import { assertInternalItbiProcessAccess } from "@/lib/tributacao/itbi-process-channel";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";

const labels: Record<string, string> = { status: "Situação", declaredPropertyValue: "Valor declarado", taxableBase: "Base de cálculo", appliedRate: "Alíquota", taxAmount: "Imposto", transmittedFraction: "Fração transmitida", registryOffice: "Tabelionato", cadastralUpdatedAt: "Transferência cadastral", cadastralUpdateMode: "Modo de transferência", assessmentId: "Lançamento", guideId: "Guia", documentId: "Documento", analysisNotes: "Análise fiscal", calculationSnapshot: "Memória do cálculo", taxpayerId: "Contribuinte", role: "Papel na transmissão", participationPercent: "Participação", liabilityType: "Responsabilidade", protocolNumber: "Protocolo" };
const display = (value: unknown) => value === undefined || value === null ? "Não informado" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);

export default async function ItbiFieldHistory({ prisma, actor, id }: { prisma: PrismaClient; actor: TaxActor; id: string }) {
  await assertInternalItbiProcessAccess(prisma, actor, id);
  const rows = await prisma.taxRegistryEntry.findMany({ where: { category: "ITBI_FIELD_HISTORY", data: { path: ["declarationId"], equals: id } }, orderBy: [{ effectiveFrom: "asc" }, { createdAt: "asc" }, { version: "asc" }] });
  return <details className="rounded border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">Histórico automático dos campos da declaração e das partes</summary><p className="my-2 text-xs">Posições observadas desde a ativação do histórico. Uma posição inicial de registro legado não reconstrói datas ou operadores de alterações anteriores.</p>
    {!rows.length && <p className="text-xs">Nenhuma posição capturada desde a ativação desta rotina.</p>}
    <ol className="space-y-3">{rows.map(row => { const data = taxScopeSnapshot(row.data); const before = taxScopeSnapshot(data.before); const after = taxScopeSnapshot(data.after); const fields = Array.isArray(data.fields) ? data.fields.filter((field): field is string => typeof field === "string") : [];
      return <li key={row.id} className="space-y-2 rounded border p-2 text-xs"><p className="font-semibold">{row.effectiveFrom.toLocaleString("pt-BR")} · {String(data.actorName ?? "Operador não identificado na posição observada")} · {row.entityType === "ITBI_PARTY" ? "Parte da transmissão" : "Declaração"} · v{row.version}</p>
        {row.source === "POSICAO_LEGADA_OBSERVADA" ? <details><summary>Posição inicial observada</summary><pre className="overflow-auto whitespace-pre-wrap">{display(after)}</pre></details> : <div className="overflow-auto"><table className="w-full text-left"><thead><tr><th>Campo</th><th>Informação anterior</th><th>Informação nova</th></tr></thead><tbody>{fields.map(field => <tr key={field} className="border-t align-top"><td className="p-2">{labels[field] ?? field}</td><td className="max-w-md whitespace-pre-wrap break-words p-2">{display(before[field])}</td><td className="max-w-md whitespace-pre-wrap break-words p-2">{display(after[field])}</td></tr>)}</tbody></table></div>}
      </li>;
    })}</ol>
  </details>;
}
