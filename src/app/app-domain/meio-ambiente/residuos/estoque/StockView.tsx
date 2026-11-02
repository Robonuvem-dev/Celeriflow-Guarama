"use client";

import Link from "next/link";
import { useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalPagedContent } from "@/components/app-ui/operational/OperationalPagedContent";
import { useOperationalWorkspace } from "@/components/app-ui/operational/OperationalContext";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { OperationalColumn } from "@/lib/operational-tables";
import type { RecyclingEntry } from "@/lib/environment/recycling-catalog";
import type { RecyclingMovementHistoryItem, RecyclingMovementResult, RecyclingStockPosition } from "@/lib/environment/recycling-stock";
import { MovementForm } from "./MovementForm";

type Props = {
  entries: RecyclingEntry[]; positions: RecyclingStockPosition[]; history: RecyclingMovementHistoryItem[];
  stockPage: number; historyPage: number; stockTotal: number; historyTotal: number; pageSize: number;
  view?: "stock" | "history";
  canRecord: boolean; today: string; entryRequestKey: string;
  recordAction: (form: FormData) => Promise<RecyclingMovementResult>;
};
const pathname = "/meio-ambiente/residuos/estoque";
const decimal = (value: string) => value.replace(".", ",");
const date = (value: string) => value.split("-").reverse().join("/");
const stockColumns: readonly OperationalColumn[] = [
  { key: "material", label: "Material", type: "text", initialWidth: 220, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "type", label: "Tipo", type: "text", initialWidth: 150, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "unit", label: "Unidade", type: "text", initialWidth: 100, minWidth: 70, resizable: true, sortable: false, details: "overflow" },
  { key: "depot", label: "Depósito", type: "text", initialWidth: 180, minWidth: 120, resizable: true, sortable: false, details: "overflow" },
  { key: "quantity", label: "Saldo no depósito", type: "text", initialWidth: 150, minWidth: 120, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "total", label: "Total do material", type: "text", initialWidth: 150, minWidth: 120, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "actions", label: "Movimentação", type: "actions", initialWidth: 150, minWidth: 140, maxWidth: 180, resizable: false, sortable: false, details: "none", align: "right" },
];
const historyColumns: readonly OperationalColumn[] = [
  { key: "date", label: "Data", type: "text", initialWidth: 100, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "kind", label: "Movimento", type: "text", initialWidth: 100, minWidth: 85, resizable: true, sortable: false, details: "overflow" },
  { key: "material", label: "Material", type: "text", initialWidth: 200, minWidth: 130, resizable: true, sortable: false, details: "overflow" },
  { key: "depot", label: "Depósito", type: "text", initialWidth: 160, minWidth: 100, resizable: true, sortable: false, details: "overflow" },
  { key: "quantity", label: "Quantidade", type: "text", initialWidth: 140, minWidth: 115, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "amount", label: "Valor obtido", type: "text", initialWidth: 160, minWidth: 135, resizable: true, sortable: false, details: "overflow", align: "right" },
  { key: "actions", label: "Detalhes", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];

function MovementDetails({ movement }: { movement: RecyclingMovementHistoryItem }) {
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const { device } = useOperationalWorkspace();
  return <Dialog open={open} onOpenChange={setOpen}>
    <button ref={trigger} type="button" className={styles.iconButton} aria-label={`Detalhes da movimentação de ${movement.snapshot.material.name} em ${date(movement.occurredOn)}`} onClick={() => setOpen(true)}><FileText /></button>
    <DialogContent className={`${styles.dialog} ${styles.filtersDialog}`} data-device={device} showCloseButton={false} finalFocus={trigger}>
      <DialogHeader><DialogTitle>Detalhes da movimentação</DialogTitle><DialogDescription>{movement.snapshot.material.code} · {movement.snapshot.material.name}</DialogDescription></DialogHeader>
      <OperationalPagedContent device={device} label="Detalhes da movimentação" footer={<button type="button" className={styles.dialogButton} onClick={() => setOpen(false)}><X />Fechar</button>}>
        <dl className="grid gap-3 text-sm">
          <div><dt className="font-medium">Data e movimento</dt><dd>{date(movement.occurredOn)} · {movement.kind === "ENTRY" ? "Entrada" : "Saída"}</dd></div>
          <div><dt className="font-medium">Depósito</dt><dd>{movement.snapshot.depot.code} · {movement.snapshot.depot.name}</dd></div>
          <div><dt className="font-medium">Tipo</dt><dd>{movement.snapshot.materialType.name}</dd></div>
          <div><dt className="font-medium">Quantidade</dt><dd>{decimal(movement.quantity)} {movement.snapshot.unit.name}</dd></div>
          <div><dt className="font-medium">Saldo após a movimentação</dt><dd>{decimal(movement.quantityAfter)} {movement.snapshot.unit.name}</dd></div>
          {movement.kind === "ENTRY" ? <div><dt className="font-medium">Origem da coleta</dt><dd>{movement.origin}</dd></div> : <>
            <div><dt className="font-medium">Destino</dt><dd>{movement.snapshot.destination?.name} · {movement.snapshot.destination?.address}</dd></div>
            <div><dt className="font-medium">Valor total obtido</dt><dd>R$ {decimal(movement.amount)}</dd></div>
          </>}
          <div><dt className="font-medium">Observações</dt><dd className="whitespace-pre-wrap">{movement.notes || "—"}</dd></div>
        </dl>
      </OperationalPagedContent>
    </DialogContent>
  </Dialog>;
}

export function StockView(props: Props) {
  const history = props.view === "history";
  const values = { estoquePagina: props.stockPage, historicoPagina: props.historyPage, visao: history ? "historico" : "saldos" };
  const viewHref = (view: string) => `${pathname}?${new URLSearchParams({ estoquePagina: String(props.stockPage), historicoPagina: String(props.historyPage), visao: view })}`;
  const rows: OperationalRow[] = history ? props.history.map(movement => ({
    id: movement.id, label: `${movement.snapshot.material.name} · ${date(movement.occurredOn)}`,
    values: { date: date(movement.occurredOn), kind: movement.kind === "ENTRY" ? "Entrada" : "Saída", material: `${movement.snapshot.material.code} · ${movement.snapshot.material.name}`, depot: movement.snapshot.depot.name, quantity: `${decimal(movement.quantity)} ${movement.snapshot.unit.name}`, amount: movement.kind === "EXIT" ? `R$ ${decimal(movement.amount)}` : "—" },
    actions: <div className="flex items-center justify-end"><MovementDetails movement={movement} /></div>,
  })) : props.positions.map(position => ({
    id: `${position.materialCode}:${position.depotCode}`, label: `${position.materialName} · ${position.depotName}`,
    values: { material: `${position.materialCode} · ${position.materialName}`, type: position.typeName, unit: position.unitName, depot: position.depotName, quantity: decimal(position.quantity), total: decimal(position.materialTotal) },
    actions: props.canRecord && position.canDispatch ? <div className="flex items-center justify-end"><MovementForm entries={props.entries} today={props.today} initialRequestKey={position.requestKey} position={position} recordAction={props.recordAction} /></div> : position.canDispatch ? "Consulta" : "Sem saldo disponível",
  }));
  return <OperationalListFrame label={history ? "Histórico de recicláveis" : "Saldo de recicláveis por depósito"}
    actions={props.canRecord && <MovementForm entries={props.entries} today={props.today} initialRequestKey={props.entryRequestKey} recordAction={props.recordAction} />}
    toolbar={<>
      <nav aria-label="Consulta de recicláveis" className="flex min-w-0 flex-1 items-center gap-2">
        <Link href={viewHref("saldos")} scroll={false} aria-current={!history ? "page" : undefined} className={`${styles.dialogButton} ${!history ? styles.primaryButton : ""}`}>Saldos</Link>
        <Link href={viewHref("historico")} scroll={false} aria-current={history ? "page" : undefined} className={`${styles.dialogButton} ${history ? styles.primaryButton : ""}`}>Histórico</Link>
      </nav>
      <Link className={styles.dialogButton} href="/meio-ambiente/residuos" aria-label="Registros de resíduos">Resíduos</Link>
      <Link className={styles.dialogButton} href="/meio-ambiente/residuos/cadastros" aria-label="Cadastros de reciclagem">Cadastros</Link>
    </>}
    pagination={<OperationalLinkPagination pathname={pathname} values={values} pageParam={history ? "historicoPagina" : "estoquePagina"} page={history ? props.historyPage : props.stockPage} total={history ? props.historyTotal : props.stockTotal} />}>
    <OperationalTable columns={history ? historyColumns : stockColumns} rows={rows} preferenceId={history ? "environment-recycling-history" : "environment-recycling-stock"}
      caption={history ? "Histórico de coletas e destinações" : "Saldo por depósito e total do material em todos os depósitos"} emptyMessage={history ? "Nenhuma movimentação registrada." : "Nenhum saldo registrado."} />
  </OperationalListFrame>;
}
