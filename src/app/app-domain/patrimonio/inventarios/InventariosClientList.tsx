"use client";

import { useState } from "react";
import Link from "next/link";
import { Eye, ExternalLink } from "lucide-react";
import { OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { operationalColumns } from "../_components/operational-columns";

const statusLabel: Record<string, string> = {
  COUNTING: "Em contagem",
  PENDING_APPROVAL: "Aguardando aprovação",
  CLOSED: "Encerrado",
  CANCELLED: "Cancelado",
};

export type InventoryRow = {
  id: string;
  startedAt: string;
  warehouseName: string;
  managerName: string;
  itemCount: number;
  status: string;
  lockMovements: boolean;
};

export function InventariosClientList({ sessions }: { sessions: InventoryRow[] }) {
  const [selected, setSelected] = useState<InventoryRow | null>(null);

  const columns = operationalColumns([
    ["start", "Início", 110, 90],
    ["warehouse", "Almoxarifado", 240, 130],
    ["manager", "Responsável", 200, 110],
    ["items", "Itens", 80, 60, "text", "right"],
    ["status", "Situação", 190, 120, "status"],
    ["lock", "Bloqueio", 100, 80],
    ["actions", "Ação", 120, 100, "actions"],
  ]);

  return (
    <>
      <OperationalTable
        preferenceId="patrimonio-inventarios"
        caption="Inventários de estoque"
        emptyMessage="Nenhum inventário registrado."
        columns={columns}
        rows={sessions.map((session) => ({
          id: session.id,
          label: session.warehouseName,
          values: {
            start: session.startedAt,
            warehouse: session.warehouseName,
            manager: session.managerName,
            items: String(session.itemCount),
            status: statusLabel[session.status] ?? session.status,
            lock: session.lockMovements ? "Ativo" : "Liberado",
          },
          cells: {
            warehouse: (
              <button
                type="button"
                onClick={() => setSelected(session)}
                className="text-left font-semibold text-[#0e4c7e] hover:underline"
              >
                {session.warehouseName}
              </button>
            ),
          },
          actions: (
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setSelected(session)}
                className="inline-flex items-center gap-1 text-xs font-semibold text-[#0e4c7e] hover:underline"
              >
                <Eye className="size-3.5" />
                Detalhes
              </button>
              <Link
                href={`/patrimonio/inventarios/${encodeURIComponent(session.id)}`}
                className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:underline"
              >
                <ExternalLink className="size-3.5" />
                Abrir
              </Link>
            </div>
          ),
        }))}
      />

      <Dialog open={Boolean(selected)} onOpenChange={(open) => { if (!open) setSelected(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Dados do Inventário</DialogTitle>
            <DialogDescription>
              Almoxarifado: {selected?.warehouseName}
            </DialogDescription>
          </DialogHeader>
          {selected && (
            <div className="space-y-3 text-xs text-slate-700">
              <div className="grid grid-cols-2 gap-2 rounded border border-slate-200 bg-slate-50 p-2.5">
                <div>
                  <span className="block font-semibold uppercase text-[10px] text-slate-500">Situação</span>
                  <span className="font-semibold text-slate-900">{statusLabel[selected.status] ?? selected.status}</span>
                </div>
                <div>
                  <span className="block font-semibold uppercase text-[10px] text-slate-500">Data de Início</span>
                  <span className="text-slate-900">{selected.startedAt}</span>
                </div>
                <div>
                  <span className="block font-semibold uppercase text-[10px] text-slate-500">Responsável Abertura</span>
                  <span className="text-slate-900">{selected.managerName}</span>
                </div>
                <div>
                  <span className="block font-semibold uppercase text-[10px] text-slate-500">Total de Itens</span>
                  <span className="text-slate-900">{selected.itemCount} item(ns)</span>
                </div>
                <div>
                  <span className="block font-semibold uppercase text-[10px] text-slate-500">Bloqueio de Movimentações</span>
                  <span className="text-slate-900">{selected.lockMovements ? "Ativo (movimentos bloqueados)" : "Liberado"}</span>
                </div>
              </div>
              <div className="flex justify-end gap-2 pt-2 border-t border-slate-200">
                <Link
                  href={`/patrimonio/inventarios/${encodeURIComponent(selected.id)}`}
                  className="inline-flex items-center gap-1.5 rounded bg-emerald-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-800"
                >
                  <ExternalLink className="size-3.5" />
                  Ir para Relatório e Contagem
                </Link>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                >
                  Fechar
                </button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
