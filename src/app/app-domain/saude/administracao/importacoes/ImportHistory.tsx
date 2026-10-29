"use client";

import { useState } from "react";
import { Eye } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { HealthReadTable } from "../../HealthReadTable";
import { healthColumn } from "../../operational-columns";
import { OperationalTablePanel } from "@/components/app-ui/operational/OperationalTablePanel";

export type ImportBatchRow = {
  id: string;
  source: string;
  competence: string;
  origin: string;
  fileName: string;
  fileFormat: string;
  contractVersion: string;
  status: string;
  processedCount: number;
  insertedCount: number;
  updatedCount: number;
  ignoredCount: number;
  issueCount: number;
  startedAt: string;
  completedAt: string | null;
  actorName: string;
  issues: { id: string; rowNumber: number; entityType: string; reason: string }[];
};

function statusLabel(status: string) {
  if (status === "COMPLETED") return "Concluída";
  if (status === "COMPLETED_WITH_ISSUES") return "Com inconsistências";
  if (status === "FAILED") return "Falhou";
  return "Em processamento";
}

export function ImportHistory({ rows }: { rows: ImportBatchRow[] }) {
  const [detail, setDetail] = useState<ImportBatchRow | null>(null);
  return (
    <>
      <HealthReadTable id="saude-admin-importacoes" label="Histórico de cargas" columns={[healthColumn("source", "Origem", 160, 100), healthColumn("competence", "Competência", 130, 100), healthColumn("date", "Data", 180, 125), healthColumn("count", "Registros", 110, 85, "text", "right"), healthColumn("status", "Situação", 200, 120, "status"), healthColumn("actions", "Ações", 48, 48, "actions", "right", 64)]} rows={rows.map(row => ({ id: row.id, label: `${row.source} ${row.competence}`, values: { source: row.source, competence: row.competence, date: new Date(row.startedAt).toLocaleString("pt-BR"), count: String(row.processedCount), status: statusLabel(row.status) }, actions: <button onClick={() => setDetail(row)} aria-label={`Detalhar carga ${row.source} ${row.competence}`}><Eye className="size-4" /></button> }))} />
      <Dialog open={Boolean(detail)} onOpenChange={open => !open && setDetail(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-[760px]">
          <DialogHeader><DialogTitle>Detalhes da carga</DialogTitle><DialogDescription>{detail?.source} · competência {detail?.competence} · {detail?.fileName}</DialogDescription></DialogHeader>
          {detail && <div className="space-y-4 text-sm">
            <dl className="grid gap-3 rounded border border-slate-200 bg-slate-50 p-3 sm:grid-cols-3">
              {[['Situação', statusLabel(detail.status)], ['Origem', detail.origin], ['Formato', detail.fileFormat], ['Processados', String(detail.processedCount)], ['Incluídos', String(detail.insertedCount)], ['Atualizados', String(detail.updatedCount)], ['Ignorados', String(detail.ignoredCount)], ['Inconsistências', String(detail.issueCount)], ['Operador', detail.actorName]].map(([label, value]) => <div key={label}><dt className="text-[11px] font-semibold text-slate-500">{label}</dt><dd className="break-words font-medium text-slate-800">{value}</dd></div>)}
            </dl>
            <div><h3 className="mb-2 text-xs font-bold uppercase tracking-wide text-slate-700">Inconsistências</h3>
              <OperationalTablePanel title={`Inconsistências · ${detail.source}`} triggerLabel={`Consultar ${detail.issues.length} inconsistências carregadas de ${detail.issueCount}`} description={`Exibindo ${detail.issues.length} inconsistências carregadas de ${detail.issueCount}; o recorte da origem foi preservado.`}>
                <HealthReadTable key={detail.id} id="saude-importacao-inconsistencias" label="Inconsistências da carga" columns={[healthColumn("line", "Linha", 100, 70, "text", "right"), healthColumn("entity", "Entidade", 180, 110), healthColumn("reason", "Motivo", 500, 160)]} rows={detail.issues.map(item => ({ id: item.id, label: `Linha ${item.rowNumber}`, values: { line: String(item.rowNumber), entity: item.entityType, reason: item.reason } }))} />
              </OperationalTablePanel>
            </div>
          </div>}
          <DialogFooter><Button type="button" variant="outline" onClick={() => setDetail(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}
