"use client";

import type { ReactNode } from "react";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { registryColumns } from "../operational-registry";

const columns = registryColumns([["severity", "Gravidade", 100, 90, "status"], ["type", "Tipo", 160, 65], ["recordType", "Tipo de registro", 150, 125], ["recordId", "Registro", 180, 85, "identifier"], ["description", "Descrição", 270, 100], ["status", "Status", 95, 65, "status"], ["detected", "Detectado", 110, 90]]);

export function QualityList({ rows, page, total, runId, toolbar, actions }: { rows: OperationalRow[]; page: number; total: number; runId?: string; toolbar: ReactNode; actions: ReactNode }) {
  return <OperationalListFrame toolbar={toolbar} actions={actions} pagination={<OperationalLinkPagination page={page} total={total} pathname="/cadastros/qualidade" values={{ run: runId }} />}>
    <OperationalTable columns={columns} rows={rows} preferenceId="cadastros-qualidade" caption="Achados da execução selecionada, sem conteúdo pessoal sensível" emptyMessage="Nenhuma inconsistência encontrada." />
  </OperationalListFrame>;
}
