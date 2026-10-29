"use client";

import { useState, type ReactNode } from "react";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE, type OperationalColumn } from "@/lib/operational-tables";
import { MoreHorizontal } from "lucide-react";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";

type TaxColumn = readonly [key: string, label: string, minWidth: number, initialWidth: number, type?: OperationalColumn["type"], align?: OperationalColumn["align"]];

export function TaxRowActions({ label, children }: { label: string; children: ReactNode }) {
  return <DropdownMenu><DropdownMenuTrigger render={<button type="button" aria-label={`Ações de ${label}`} className="inline-flex size-6 items-center justify-center rounded border" />}><MoreHorizontal className="size-4" /></DropdownMenuTrigger><DropdownMenuContent align="end">{children}</DropdownMenuContent></DropdownMenu>;
}

export function TaxRowAction({ children, onClick, disabled, href, target }: { children: ReactNode; onClick?: () => void; disabled?: boolean; href?: string; target?: string }) {
  return href ? <DropdownMenuItem render={<a href={href} target={target} rel={target === "_blank" ? "noreferrer" : undefined} />}>{children}</DropdownMenuItem> : <DropdownMenuItem onClick={onClick} disabled={disabled}>{children}</DropdownMenuItem>;
}

/** Domain configuration only; sizing, details, density and navigation belong to the common base. */
export function TaxOperationalTable({ id, columns, rows, toolbar, actions, pagination, resetKey = "", emptyMessage, state = "ready" }: {
  id: string;
  columns: readonly TaxColumn[];
  rows: OperationalRow[];
  toolbar?: ReactNode;
  actions?: ReactNode;
  pagination?: ReactNode;
  resetKey?: string;
  emptyMessage?: string;
  state?: "ready" | "loading" | "error";
}) {
  const [position, setPosition] = useState({ key: resetKey, page: 1 });
  const requestedPage = position.key === resetKey ? position.page : 1;
  const setPage = (page: number) => setPosition({ key: resetKey, page });
  const page = Math.min(requestedPage, Math.max(1, Math.ceil(rows.length / OPERATIONAL_PAGE_SIZE)));
  // Synchronize during render: returning to an earlier filter must not revive its old page.
  if (position.key !== resetKey || position.page !== page) setPosition({ key: resetKey, page });
  const configuration: OperationalColumn[] = columns.map(([key, label, minWidth, initialWidth, type = "text", align]) => ({
    key, label, minWidth, initialWidth, type, align,
    maxWidth: type === "actions" ? initialWidth : undefined,
    resizable: type !== "actions", sortable: false, details: type === "actions" ? "none" : "overflow",
  }));
  return <div className="flex min-h-0 min-w-0 flex-1 flex-col print:hidden"><OperationalListFrame toolbar={toolbar} actions={actions} pagination={pagination ?? <OperationalPagination page={page} total={rows.length} pending={state === "loading"} onPageChange={setPage} />}>
    <OperationalTable preferenceId={`tributacao:${id}`} columns={configuration} rows={pagination ? rows : rows.slice((page - 1) * OPERATIONAL_PAGE_SIZE, page * OPERATIONAL_PAGE_SIZE)} caption={id} emptyMessage={emptyMessage} state={state} />
  </OperationalListFrame></div>;
}
