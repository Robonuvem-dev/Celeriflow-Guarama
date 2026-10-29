"use client";

import { NewServiceOrderSheet } from "./NewServiceOrderSheet";
import { EditServiceOrderSheet } from "./EditServiceOrderSheet";
import { OperationalPagination, OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import { serviceColumns } from "./list-columns";
import { SanitationFilters } from "./SanitationFilters";
import { useSanitationList } from "./useSanitationList";
import type { SanitationPagination as Pagination } from "@/lib/saneamento/list-query";

type ServiceOrder = {
  id: string;
  orderNumber: string;
  orderType: string;
  description: string;
  priority: string;
  status: string;
  technician: string | null;
  createdAt: Date;
  unit: { code: string } | null;
};

export function ServicosClient({ orders, pagination }: { orders: ServiceOrder[]; pagination: Pagination }) {
  const list = useSanitationList(pagination);
  const { query, total } = pagination;
  const rows: OperationalRow[] = orders.map((order) => ({
    id: order.id, label: order.orderNumber,
    values: { number: order.orderNumber, type: order.orderType, unit: order.unit?.code ?? "Rede pública", technician: order.technician || "—", priority: order.priority, status: order.status },
    actions: <div className={styles.rowActions}><EditServiceOrderSheet order={order} /></div>,
  }));
  return <OperationalListFrame label="Lista de ordens de serviço" actions={<NewServiceOrderSheet />}
    toolbar={<SanitationFilters query={query} onFilter={list.filter} placeholder="Buscar OS, identificador ou técnico..." filters={[
      { name: "status", label: "Todos os status", options: ["Aberta", "Em Andamento", "Concluída", "Cancelada"] },
      { name: "type", label: "Todos os tipos", options: ["Vazamento", "Religação", "Corte", "Manutenção", "Troca de Hidrômetro"] },
    ]} />}
    pagination={<OperationalPagination page={query.page} total={total} pending={list.pending} onPageChange={list.setPage} />}>
    <OperationalTable columns={serviceColumns} rows={rows} preferenceId="sanitation-services" caption="Serviços e manutenção" emptyMessage="Nenhuma ordem de serviço encontrada." />
  </OperationalListFrame>;
}
