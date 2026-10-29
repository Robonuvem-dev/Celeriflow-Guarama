import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { TaxOperationalTable } from "../TaxOperationalTable";

export function AnnualBatchResults({ year, items }: { year: number; items: { id: string; targetId: string; status: string; base: string; amount: string; assessmentId: string | null; error: string | null }[] }) {
  return <OperationalTablePanel title={`Memória e resultado do lote anual — ${year}`} triggerLabel="Memória e resultado individual">
    <TaxOperationalTable id="lote-anual-resultados"
      columns={[["target", "Cadastro", 90, 230, "identifier"], ["base", "Base BRL", 80, 140, "text", "right"], ["amount", "Simulado BRL", 80, 140, "text", "right"], ["status", "Situação", 80, 140, "status"], ["assessment", "Lançamento", 90, 200, "identifier"], ["error", "Falha", 100, 300]]}
      rows={items.map(item => ({ id: item.id, label: item.targetId, values: { target: item.targetId, base: item.base, amount: item.amount, status: item.status, assessment: item.assessmentId ?? "Não efetivado", error: item.error ?? "—" } }))} />
  </OperationalTablePanel>;
}
