"use client";

import { OperationalPagination, OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { SanitationFilters } from "./SanitationFilters";
import { invoiceColumns } from "./list-columns";
import { useSanitationList } from "./useSanitationList";
import type { SanitationPagination as Pagination } from "@/lib/saneamento/list-query";

type Invoice = {
  id: string;
  invoiceNumber: string;
  competence: string;
  totalAmount: number;
  dueDate: string;
  status: string;
  unit: { code: string };
};

export function FaturasClient({ invoices, pagination }: { invoices: Invoice[]; pagination: Pagination }) {
  const list = useSanitationList(pagination);
  const { query, total } = pagination;
  const rows: OperationalRow[] = invoices.map((invoice) => ({
    id: invoice.id, label: invoice.invoiceNumber,
    values: { number: invoice.invoiceNumber, unit: invoice.unit.code, competence: invoice.competence, amount: invoice.totalAmount.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }), dueDate: new Date(invoice.dueDate).toLocaleDateString("pt-BR"), status: invoice.status },
  }));
  return <OperationalListFrame label="Lista de faturas"
    toolbar={<SanitationFilters query={query} onFilter={list.filter} placeholder="Buscar fatura, identificador..." filters={[{ name: "status", label: "Todos os status", options: ["Emitida", "Paga", "Vencida", "Cancelada"] }]} />}
    pagination={<OperationalPagination page={query.page} total={total} pending={list.pending} onPageChange={list.setPage} />}>
    <OperationalTable columns={invoiceColumns} rows={rows} preferenceId="sanitation-invoices" caption="Faturas de água e esgoto" emptyMessage="Nenhuma fatura encontrada." />
  </OperationalListFrame>;
}
