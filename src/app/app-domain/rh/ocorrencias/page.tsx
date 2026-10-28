import Link from "next/link";
import { randomUUID } from "node:crypto";
import { db } from "@/db/client";
import { readOccurrencesPage } from "@/db/repositories/personnel-pages/requests";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { ErpPagination } from "@/components/app-ui/erp/ErpPagination";
import { OperationForm } from "../operacoes/OperationForm";

export const dynamic = "force-dynamic";
export default async function FunctionalOccurrencesPage({ searchParams }: { searchParams: Promise<{ page?: string; contractId?: string; type?: string }> }) {
  const context = await getTenantContextForModule("RH"); const params = await searchParams;
  const { total, page, rows, cancellations } = await readOccurrencesPage(context.database ?? db, params);
  const canceled = new Map(cancellations.map(row => [row.sourceKey, row.payload as { reason: string }]));
  const href = (value: number) => `?${new URLSearchParams({ page: String(value), contractId: params.contractId || "", type: params.type || "" })}`;
  return <div className="flex min-h-0 flex-1 flex-col gap-2 p-3"><ErpPageTitle title="Ocorrências funcionais" description="Advertências, elogios, multas e outras ocorrências, com ato e referências GED preservados." action={<Link href="/rh/atos">Atos de pessoal</Link>} />
    <OperationForm command="ocorrencia" title="Registrar ocorrência" fields={[{ name: "sourceKey", label: "Chave estável da origem", value: randomUUID(), required: true }, { name: "contractId", label: "Contrato", type: "lookup:contract", required: true }, { name: "type", label: "Tipo", options: ["ADVERTENCIA", "ELOGIO", "MULTA", "OUTRA"].map(value => ({ value, label: value })), required: true }, { name: "date", label: "Data", type: "date", required: true }, { name: "personnelActId", label: "ID do ato de pessoal", required: true }, { name: "reason", label: "Motivo / fundamento", type: "textarea", required: true }, { name: "notes", label: "Observações", type: "textarea" }, { name: "documentIds", label: "IDs dos documentos GED (separados por vírgula)" }, { name: "amount", label: "Valor decimal da multa (somente MULTA)" }]} />
    <form className="flex gap-2 text-xs"><input name="contractId" defaultValue={params.contractId} placeholder="ID contrato" className="h-8 rounded border px-2" /><select name="type" defaultValue={params.type || ""} className="rounded border px-2"><option value="">Todos os tipos</option>{["ADVERTENCIA", "ELOGIO", "MULTA", "OUTRA"].map(type => <option key={type}>{type}</option>)}</select><button className="rounded border px-3">Filtrar</button></form>
    <p className="text-xs">{total} ocorrências no filtro. Multas registram a ocorrência; eventual desconto exige origem e rubrica específicas na folha.</p>
    {rows.map(row => {
      const payload = row.payload as { input: { contractId: string; type: string; date: string; reason: string; notes: string; amount?: string; personnelActId: string }; documents: { id: string; title: string }[] };
      const cancellation = canceled.get(`OCORRENCIA:CANCELAMENTO:${row.id}`);
      return <details key={row.id} className="rounded border bg-white p-3 text-xs"><summary>{payload.input.date} · {payload.input.type} · {row.environment} · {cancellation ? "CANCELADA" : "REGISTRADA"} · {payload.input.contractId}</summary><p>{payload.input.reason}</p><p>{payload.input.notes}</p><p>ID {row.id} · ato {payload.input.personnelActId} · {payload.input.amount ? `multa R$ ${payload.input.amount}` : "sem valor financeiro"}</p><p>Referências GED: {payload.documents.map(document => document.id).join(", ") || "nenhuma"}</p>{cancellation ? <p>Cancelamento: {cancellation.reason}</p> : <OperationForm command="cancelar-ocorrencia" title="Cancelar com fundamento" fields={[{ name: "occurrenceId", label: "Ocorrência", value: row.id, type: "hidden" }, { name: "reason", label: "Motivo", required: true, type: "textarea" }]} />}</details>;
    })}
    <ErpPagination page={page} total={total} pageSize={20} label="ocorrências" previousHref={href(page - 1)} nextHref={href(page + 1)} />
  </div>;
}
