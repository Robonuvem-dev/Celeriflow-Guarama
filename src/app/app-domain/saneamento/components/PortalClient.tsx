"use client";

import { useMemo, useState } from "react";
import { OperationalTable, OperationalPagination, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalListFrame } from "@/components/app-ui/operational/OperationalListFrame";
import { OPERATIONAL_PAGE_SIZE } from "@/lib/operational-tables";
import operational from "@/components/app-ui/operational/operational.module.css";
import { LocalListToolbar } from "./LocalListToolbar";
import { portalColumns } from "./list-columns";
import styles from "./sanitation.module.css";
import { Pencil, PowerOff } from "lucide-react";
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { inactivatePortalRequest, updatePortalRequest } from "../actions";

type PortalRequest = {
  id: string;
  requestType: string;
  requesterName: string;
  requestedAt: string;
  source: string;
  status: string;
  active: boolean;
};

export function PortalClient({ requests }: { requests: PortalRequest[] }) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [activeFilter, setActiveFilter] = useState("Todos");
  const [editingRequest, setEditingRequest] = useState<PortalRequest | null>(null);
  const [saving, setSaving] = useState(false);

  const statuses = useMemo(
    () => ["Todos", ...Array.from(new Set(requests.map((request) => request.status)))],
    [requests]
  );

  const filteredRequests = useMemo(() => {
    const query = search.toLowerCase();

    return requests.filter((request) => {
      const matchesSearch =
        !query ||
        request.requestType.toLowerCase().includes(query) ||
        request.requesterName.toLowerCase().includes(query) ||
        request.source.toLowerCase().includes(query) ||
        request.status.toLowerCase().includes(query);
      const matchesStatus = statusFilter === "Todos" || request.status === statusFilter;
      const matchesActive =
        activeFilter === "Todos" ||
        (activeFilter === "Ativas" && request.active) ||
        (activeFilter === "Inativas" && !request.active);

      return matchesSearch && matchesStatus && matchesActive;
    });
  }, [activeFilter, requests, search, statusFilter]);
  const pageSize = OPERATIONAL_PAGE_SIZE;
  const pageCount = Math.max(1, Math.ceil(filteredRequests.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const paged = filteredRequests.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editingRequest) return;

    setSaving(true);
    const formData = new FormData(event.currentTarget);

    try {
      const result = await updatePortalRequest(editingRequest.id, {
        requestType: formData.get("requestType") as string,
        requesterName: formData.get("requesterName") as string,
        requestedAt: formData.get("requestedAt") as string,
        source: formData.get("source") as string,
        status: formData.get("status") as string,
      });

      if (result.error) {
        alert(result.error);
        return;
      }

      setEditingRequest(null);
    } catch {
      alert("Erro ao atualizar solicitação.");
    } finally {
      setSaving(false);
    }
  }

  async function handleInactivate(request: PortalRequest) {
    if (!confirm(`Inativar a solicitação "${request.requestType}"?`)) return;

    try {
      const result = await inactivatePortalRequest(request.id);
      if (result.error) alert(result.error);
    } catch {
      alert("Erro ao inativar solicitação.");
    }
  }

  const rows: OperationalRow[] = paged.map((request) => ({
    id: request.id, label: request.requestType,
    values: { type: request.requestType, requester: request.requesterName, date: formatDate(request.requestedAt), source: request.source, status: request.status, active: request.active ? "Ativa" : "Inativa" },
    actions: <div className={operational.rowActions}>
      <button type="button" onClick={() => setEditingRequest(request)} className={operational.iconButton} aria-label={`Editar solicitação ${request.requestType}`} title="Editar solicitação"><Pencil /></button>
      <button type="button" onClick={() => void handleInactivate(request)} disabled={!request.active} className={operational.iconButton} aria-label={`Inativar solicitação ${request.requestType}`} title="Inativar solicitação"><PowerOff /></button>
    </div>,
  }));

  return (
    <OperationalListFrame label="Lista de solicitações do portal"
      toolbar={<LocalListToolbar search={search} onSearch={(value) => { setSearch(value); setPage(1); }} placeholder="Buscar solicitação, solicitante..." filters={[
        { label: "Status", value: statusFilter, defaultValue: "Todos", options: statuses, onChange: (value) => { setStatusFilter(value); setPage(1); } },
        { label: "Situação", value: activeFilter, defaultValue: "Todos", options: ["Todos", "Ativas", "Inativas"], onChange: (value) => { setActiveFilter(value); setPage(1); } },
      ]} />}
      pagination={<OperationalPagination page={currentPage} total={filteredRequests.length} onPageChange={setPage} />}>
      <OperationalTable columns={portalColumns} rows={rows} preferenceId="sanitation-portal" caption="Solicitações do portal do consumidor" emptyMessage="Nenhuma solicitação encontrada." />

      <Sheet open={editingRequest !== null} onOpenChange={(open) => !open && setEditingRequest(null)}>
        <SheetContent side="right" className={styles.sheet}>
          <SheetHeader>
            <SheetTitle>Editar Solicitação</SheetTitle>
            <SheetDescription>Atualize os dados da solicitação do portal.</SheetDescription>
          </SheetHeader>
          {editingRequest && (
            <form onSubmit={handleSubmit} className="mt-4 space-y-3 pb-2">
              <Field label="Solicitação"><input name="requestType" required defaultValue={editingRequest.requestType} className="w-full rounded-md border p-2 text-sm" /></Field>
              <Field label="Solicitante"><input name="requesterName" required defaultValue={editingRequest.requesterName} className="w-full rounded-md border p-2 text-sm" /></Field>
              <Field label="Data"><input type="date" name="requestedAt" required defaultValue={editingRequest.requestedAt} className="w-full rounded-md border p-2 text-sm" /></Field>
              <Field label="Origem"><input name="source" required defaultValue={editingRequest.source} className="w-full rounded-md border p-2 text-sm" /></Field>
              <Field label="Status"><input name="status" required defaultValue={editingRequest.status} className="w-full rounded-md border p-2 text-sm" /></Field>
              <div className="flex flex-col-reverse gap-2 pt-3 sm:flex-row sm:justify-end"><button type="button" onClick={() => setEditingRequest(null)} className="rounded-md bg-gray-100 px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-200">Cancelar</button><button type="submit" disabled={saving} className="rounded-md bg-[#0284C7] px-4 py-2 text-sm font-medium text-white hover:bg-[#0369A1] disabled:opacity-50">{saving ? "Salvando..." : "Salvar Alterações"}</button></div>
            </form>
          )}
        </SheetContent>
      </Sheet>

    </OperationalListFrame>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block space-y-2 text-sm font-medium"><span>{label}</span>{children}</label>;
}

function formatDate(date: string) {
  const [year, month, day] = date.split("-");
  return `${day}/${month}/${year}`;
}
