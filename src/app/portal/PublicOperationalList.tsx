"use client";

import { useState, type ReactNode } from "react";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import { publicOperationalColumns, type PublicColumn } from "./public-columns";

export type { PublicColumn } from "./public-columns";
type ServerPagination = { page: number; total: number; pathname: string; values?: Record<string, string | number | undefined | null>; pageParam?: string };

/** The full-screen panel owns its surface/context; PortalShell keeps public navigation.
 * No inline 100dvh is added below the institutional header, and no session is created.
 */
export function PublicOperationalList({ id, caption, columns, rows, serverPagination, toolbar, actions }: {
  id: string; caption: string; columns: PublicColumn[]; rows: OperationalRow[];
  serverPagination?: ServerPagination; toolbar?: ReactNode; actions?: ReactNode;
}) {
  const [requestedPage, setPage] = useState(1);
  const total = serverPagination?.total ?? rows.length;
  const page = serverPagination?.page ?? Math.min(requestedPage, Math.max(1, Math.ceil(total / OPERATIONAL_PAGE_SIZE)));
  const visible = serverPagination ? rows : rows.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE);
  const pagination = serverPagination ? <OperationalLinkPagination {...serverPagination} /> : <OperationalPagination page={page} total={total} onPageChange={setPage} />;
  return <OperationalTablePanel title={caption} triggerLabel={`Abrir tabela — ${caption}`} description="Consulta em área operacional. Até 20 registros por página, com todas as colunas e acesso aos valores integrais.">
    <OperationalListFrame toolbar={toolbar} actions={actions} pagination={pagination} label={caption}>
      <OperationalTable columns={publicOperationalColumns(columns)} rows={visible} preferenceId={`publico-${id}`} caption={caption} />
    </OperationalListFrame>
  </OperationalTablePanel>;
}
