import type { DatabaseExecutor } from "@/db/transaction";
import { listFiscalEntries } from "@/db/repositories/taxation-pages/registry";
import type { TaxActor } from "@/lib/tributacao";
import { assertInternalItbiProcessAccess } from "@/lib/tributacao/itbi-process-channel";
import { taxScopeSnapshot } from "@/lib/tributacao/scope";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../../TaxOperationalTable";

const labels: Record<string, string> = { status: "Situação", declaredPropertyValue: "Valor declarado", taxableBase: "Base de cálculo", appliedRate: "Alíquota", taxAmount: "Imposto", transmittedFraction: "Fração transmitida", registryOffice: "Tabelionato", cadastralUpdatedAt: "Transferência cadastral", cadastralUpdateMode: "Modo de transferência", assessmentId: "Lançamento", guideId: "Guia", documentId: "Documento", analysisNotes: "Análise fiscal", calculationSnapshot: "Memória do cálculo", taxpayerId: "Contribuinte", role: "Papel na transmissão", participationPercent: "Participação", liabilityType: "Responsabilidade", protocolNumber: "Protocolo" };
const display = (value: unknown) => value === undefined || value === null ? "Não informado" : typeof value === "object" ? JSON.stringify(value, null, 2) : String(value);

export default async function ItbiFieldHistory({ database, actor, id }: { database: DatabaseExecutor; actor: TaxActor; id: string }) {
  await assertInternalItbiProcessAccess(database, actor, id);
  const rows = await listFiscalEntries(database, { categories: ["ITBI_FIELD_HISTORY"], data: { declarationId: id }, order: "history" });
  return <details className="rounded border bg-white p-3"><summary className="cursor-pointer text-sm font-semibold">Histórico automático dos campos da declaração e das partes</summary><p className="my-2 text-xs">Posições observadas desde a ativação do histórico. Uma posição inicial de registro legado não reconstrói datas ou operadores de alterações anteriores.</p>
    {!rows.length && <p className="text-xs">Nenhuma posição capturada desde a ativação desta rotina.</p>}
    <OperationalTablePanel title="ITBI — histórico de campos e partes" triggerLabel="Abrir histórico completo em tabela" description="Cada alteração mantém o evento, operador, entidade, versão e origem. A posição legada continua identificada como observada, sem presumir o passado.">
      <TaxOperationalTable id="itbi-historico-campos" resetKey={id}
        toolbar={<span className="text-[13px]">Declaração {id} · {rows.length} posições documentadas</span>}
        columns={[["date", "Data", 64, 150], ["actor", "Operador", 64, 160], ["entity", "Entidade", 64, 120], ["version", "Versão", 40, 55], ["source", "Origem", 56, 110], ["field", "Campo", 64, 150], ["before", "Informação anterior", 80, 220], ["after", "Informação nova", 80, 250]]}
        rows={rows.flatMap(row => {
          const data = taxScopeSnapshot(row.data); const before = taxScopeSnapshot(data.before); const after = taxScopeSnapshot(data.after);
          const fields = Array.isArray(data.fields) ? data.fields.filter((field): field is string => typeof field === "string") : [];
          const context = { date: row.effectiveFrom.toLocaleString("pt-BR"), actor: String(data.actorName ?? "Operador não identificado na posição observada"), entity: row.entityType === "ITBI_PARTY" ? "Parte da transmissão" : "Declaração", version: String(row.version), source: row.source };
          if (row.source === "POSICAO_LEGADA_OBSERVADA") return [{ id: `${row.id}:baseline`, label: `Posição inicial v${row.version}`, values: { ...context, field: "Posição inicial observada", before: "Não reconstruída", after: display(after) } }];
          if (!fields.length) return [{ id: `${row.id}:position`, label: `Posição v${row.version}`, values: { ...context, field: "Sem campos alterados informados", before: display(before), after: display(after) } }];
          return fields.map(field => ({ id: `${row.id}:${field}`, label: `${labels[field] ?? field} · v${row.version}`, values: { ...context, field: labels[field] ?? field, before: display(before[field]), after: display(after[field]) } }));
        })} />
    </OperationalTablePanel>
  </details>;
}
