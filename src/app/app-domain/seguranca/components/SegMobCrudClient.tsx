"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Check, Eye, Pencil, Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { OperationalListFrame, OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, OperationalPagination } from "@/components/app-ui/operational/OperationalTable";
import { OPERATIONAL_PAGE_SIZE as PAGE_SIZE, paginateFullValue, type OperationalColumn } from "@/lib/operational-tables";
import styles from "@/components/app-ui/operational/operational.module.css";
import { createSegMobItem, toggleSegMobItemStatus, updateSegMobItem } from "../actions";
import type { SegMobFormData, SegMobItem, SegMobPageConfig } from "../types";

const defaultForm: SegMobFormData = {
  code: "",
  title: "",
  type: "",
  status: "Ativo",
  isActive: true,
  location: "",
  district: "",
  responsible: "",
  priority: "Normal",
  date: "",
  description: "",
  plate: "",
  value: 0,
  category: "",
  relatedModule: "",
  relatedId: "",
};


function toDateInput(value?: Date | string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  return date.toISOString().slice(0, 10);
}

function formatDate(value?: Date | string | null) {
  if (!value) return "-";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "-";
  return date.toLocaleDateString("pt-BR");
}

function RecordText({ text }: { text: string }) {
  const body = useRef<HTMLDivElement>(null);
  const [pages, setPages] = useState<string[]>([]);
  const [page, setPage] = useState(0);
  useEffect(() => {
    const element = body.current;
    if (!element) return;
    const measure = () => {
      const probe = document.createElement("div");
      const computed = getComputedStyle(element);
      Object.assign(probe.style, { position: "fixed", visibility: "hidden", width: `${element.clientWidth}px`, font: computed.font, lineHeight: computed.lineHeight, whiteSpace: "pre-wrap", overflowWrap: "anywhere" });
      document.body.appendChild(probe);
      try { setPages(paginateFullValue(text, value => { probe.textContent = value; return probe.scrollHeight <= element.clientHeight && probe.scrollWidth <= element.clientWidth + 1; })); setPage(0); }
      finally { probe.remove(); }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(element);
    document.fonts.addEventListener("loadingdone", measure);
    return () => { observer.disconnect(); document.fonts.removeEventListener("loadingdone", measure); };
  }, [text]);
  return <><div ref={body} style={{ height: "min(30dvh, 240px)", fontSize: ".8125rem", lineHeight: "1.4", whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{pages[page] || "Preparando leitura…"}</div><div className={styles.dialogButtons}><button type="button" className={styles.dialogButton} disabled={page === 0} onClick={() => setPage(current => current - 1)}>Anterior</button><span aria-live="polite">Trecho {page + 1} de {Math.max(1, pages.length)}</span><button type="button" className={styles.dialogButton} disabled={page >= pages.length - 1} onClick={() => setPage(current => current + 1)}>Próximo</button></div></>;
}


export default function SegMobCrudClient({
  items,
  config,
}: {
  items: SegMobItem[];
  config: SegMobPageConfig;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("Todos");
  const [typeFilter, setTypeFilter] = useState("Todos");
  const [activeFilter, setActiveFilter] = useState("Ativos");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingKind, setEditingKind] = useState(config.kind);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [formData, setFormData] = useState<SegMobFormData>(defaultForm);
  const [page, setPage] = useState(1);
  const [detailItem, setDetailItem] = useState<SegMobItem | null>(null);

  const typeOptions = useMemo(() => {
    return Array.from(new Set([...config.typeOptions, ...items.map((item) => item.type).filter(Boolean)]));
  }, [config.typeOptions, items]);

  const statusOptions = useMemo(() => {
    return Array.from(new Set([...config.statusOptions, ...items.map((item) => item.status).filter(Boolean)]));
  }, [config.statusOptions, items]);

  const filteredItems = items.filter((item) => {
    const search = searchTerm.toLowerCase();
    const matchesSearch = [item.code, item.title, item.type, item.status, item.location, item.district, item.responsible, item.category]
      .filter(Boolean)
      .some((value) => String(value).toLowerCase().includes(search));
    const matchesStatus = statusFilter === "Todos" || item.status === statusFilter;
    const matchesType = typeFilter === "Todos" || item.type === typeFilter || item.category === typeFilter;
    const matchesActive = activeFilter === "Todos" || (activeFilter === "Ativos" ? item.isActive : !item.isActive);
    return matchesSearch && matchesStatus && matchesType && matchesActive;
  });
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / PAGE_SIZE));
  const activePage = Math.min(page, totalPages);
  const paginatedItems = filteredItems.slice((activePage - 1) * PAGE_SIZE, activePage * PAGE_SIZE);

  const updateFilter = (callback: () => void) => {
    callback();
    setPage(1);
  };

  const openNew = () => {
    setEditingId(null);
    setEditingKind(config.kind);
    setFormData({
      ...defaultForm,
      type: config.typeOptions[0] || "",
      status: config.statusOptions[0] || "Ativo",
      priority: config.priorityOptions?.[0] || "Normal",
      category: config.categories?.[0] || "",
      date: toDateInput(new Date()),
    });
    setIsModalOpen(true);
  };

  const openEdit = (item: SegMobItem) => {
    setEditingId(item.id);
    setFormData({
      code: item.code,
      title: item.title,
      type: item.type,
      status: item.status,
      isActive: item.isActive,
      location: item.location || "",
      district: item.district || "",
      responsible: item.responsible || "",
      priority: item.priority || "Normal",
      date: toDateInput(item.date),
      description: item.description || "",
      plate: item.plate || "",
      value: item.value || 0,
      category: item.category || config.categories?.[0] || "",
      relatedModule: item.relatedModule || "",
      relatedId: item.relatedId || "",
    });
    setIsModalOpen(true);
  };

  const submit = async (event: React.FormEvent) => {
    event.preventDefault();
    setIsSubmitting(true);
    const result = editingId
      ? await updateSegMobItem(editingKind, editingId, formData)
      : await createSegMobItem(config.kind, formData);
    setIsSubmitting(false);
    if (result?.error) {
      window.alert(result.error);
      return;
    }
    setIsModalOpen(false);
  };

  const toggleActive = async (item: SegMobItem) => {
    const action = item.isActive ? "inativar" : "ativar";
    if (!window.confirm(`Deseja ${action} este registro?`)) return;
    const result = await toggleSegMobItemStatus(item.kind, item.id, !item.isActive);
    if (result?.error) window.alert(result.error);
  };

  const columns: OperationalColumn[] = [
    { key: "code", label: config.codeLabel, type: "identifier", initialWidth: 120, minWidth: 85, maxWidth: 250, resizable: true, sortable: false, details: "overflow" },
    { key: "title", label: config.titleLabel, type: "text", initialWidth: 230, minWidth: 120, maxWidth: 600, resizable: true, sortable: false, details: "overflow" },
    { key: "type", label: config.typeLabel || "Tipo", type: "text", initialWidth: 150, minWidth: 90, maxWidth: 400, resizable: true, sortable: false, details: "overflow" },
    { key: "location", label: config.locationLabel || "Local/Equipe", type: "text", initialWidth: 180, minWidth: 100, maxWidth: 500, resizable: true, sortable: false, details: "overflow" },
    { key: "district", label: "Bairro/região", type: "text", initialWidth: 140, minWidth: 100, maxWidth: 400, resizable: true, sortable: false, details: "overflow" },
    { key: "status", label: "Status", type: "status", initialWidth: 120, minWidth: 85, maxWidth: 300, resizable: true, sortable: false, details: "overflow" },
    { key: "date", label: "Data", type: "text", initialWidth: 110, minWidth: 95, maxWidth: 200, resizable: true, sortable: false, details: "overflow" },
    { key: "actions", label: "Ações", type: "actions", initialWidth: 100, minWidth: 95, maxWidth: 120, resizable: false, sortable: false, details: "none" },
  ];

  return (
    <>
      <OperationalListFrame label={config.title} actions={<button type="button" className={styles.newButton} onClick={openNew}><Plus />{config.newLabel}</button>}
        toolbar={<><input aria-label="Buscar código, local ou responsável" className={styles.searchInput} placeholder="Buscar código, local ou responsável…" value={searchTerm} onChange={(event) => updateFilter(() => setSearchTerm(event.target.value))} /><OperationalFilters activeCount={Number(statusFilter !== "Todos") + Number(typeFilter !== "Todos") + Number(activeFilter !== "Todos")}><label>Status<select value={statusFilter} onChange={(event) => updateFilter(() => setStatusFilter(event.target.value))}><option>Todos</option>{statusOptions.map(status => <option key={status}>{status}</option>)}</select></label><label>Tipo<select value={typeFilter} onChange={(event) => updateFilter(() => setTypeFilter(event.target.value))}><option>Todos</option>{Array.from(new Set([...typeOptions, ...config.categories || []])).map(type => <option key={type}>{type}</option>)}</select></label><label>Atividade<select value={activeFilter} onChange={(event) => updateFilter(() => setActiveFilter(event.target.value))}><option>Ativos</option><option>Inativos</option><option>Todos</option></select></label><button type="button" onClick={() => updateFilter(() => { setStatusFilter("Todos"); setTypeFilter("Todos"); setActiveFilter("Todos"); })}>Limpar filtros</button></OperationalFilters></>}
        pagination={<OperationalPagination page={activePage} total={filteredItems.length} onPageChange={setPage} />}>
        <OperationalTable columns={columns} preferenceId={`seguranca.${config.kind}`} caption={`${config.title} — ${config.description}`} emptyMessage="Nenhum registro encontrado." rows={paginatedItems.map(item => ({ id: item.id, label: item.title, values: { code: item.code, title: item.title, type: item.type || item.category || "—", location: item.location || "—", district: item.district || "—", status: item.isActive ? item.status : "Inativo", date: formatDate(item.date) }, actions: <div className={styles.rowActions}><button type="button" className={styles.iconButton} aria-label={`Ver detalhes de ${item.title}`} onClick={() => setDetailItem(item)}><Eye /></button><button type="button" className={styles.iconButton} aria-label={`${item.isActive ? "Inativar" : "Ativar"} ${item.title}`} onClick={() => void toggleActive(item)}>{item.isActive ? <X /> : <Check />}</button><button type="button" className={styles.iconButton} aria-label={`Editar ${item.title}`} onClick={() => openEdit(item)}><Pencil /></button></div> }))} />
      </OperationalListFrame>

      <Dialog open={Boolean(detailItem)} onOpenChange={(open) => !open && setDetailItem(null)}>
        <DialogContent className={styles.dialog}>
          <DialogHeader><DialogTitle>{detailItem?.title}</DialogTitle><DialogDescription>{detailItem?.code} · {detailItem?.type}</DialogDescription></DialogHeader>
          {detailItem && <RecordText text={`Local: ${detailItem.location || "—"}\nBairro/região: ${detailItem.district || "—"}\nResponsável: ${detailItem.responsible || "—"}\nData: ${formatDate(detailItem.date)}\nSituação: ${detailItem.status}\nPrioridade: ${detailItem.priority || "—"}\nDescrição: ${detailItem.description || "Sem descrição."}`} />}
          <DialogFooter><Button type="button" onClick={() => setDetailItem(null)}>Fechar</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={isModalOpen} onOpenChange={setIsModalOpen}>
        <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[720px]">
          <DialogHeader>
            <DialogTitle>{editingId ? "Editar registro" : config.newLabel}</DialogTitle>
            <DialogDescription>Use informacoes administrativas da prefeitura, equipes responsaveis, local e situacao operacional.</DialogDescription>
          </DialogHeader>
          <form onSubmit={submit} className="space-y-4">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="code">{config.codeLabel}</Label>
                <Input id="code" required={Boolean(editingId)} value={formData.code} placeholder="Deixe em branco para gerar automaticamente" onChange={(event) => setFormData({ ...formData, code: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">{config.typeLabel || "Tipo"}</Label>
                <select id="type" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={formData.type} onChange={(event) => setFormData({ ...formData, type: event.target.value })}>
                  {typeOptions.map((type) => <option key={type}>{type}</option>)}
                </select>
              </div>
            </div>

            {config.showCategory && config.categories && (
              <div className="space-y-2">
                <Label htmlFor="category">Categoria</Label>
                <select id="category" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={formData.category} onChange={(event) => setFormData({ ...formData, category: event.target.value })}>
                  {config.categories.map((category) => <option key={category}>{category}</option>)}
                </select>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="title">{config.titleLabel}</Label>
              <Input id="title" required value={formData.title} onChange={(event) => setFormData({ ...formData, title: event.target.value })} />
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="location">{config.locationLabel || "Local/Equipe"}</Label>
                <Input id="location" value={formData.location} onChange={(event) => setFormData({ ...formData, location: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="district">Bairro/Regiao</Label>
                <Input id="district" value={formData.district} onChange={(event) => setFormData({ ...formData, district: event.target.value })} />
              </div>
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              <div className="space-y-2">
                <Label htmlFor="status">Status</Label>
                <select id="status" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={formData.status} onChange={(event) => setFormData({ ...formData, status: event.target.value })}>
                  {statusOptions.map((status) => <option key={status}>{status}</option>)}
                </select>
              </div>
              {config.showPriority && (
                <div className="space-y-2">
                  <Label htmlFor="priority">Prioridade</Label>
                  <select id="priority" className="h-10 w-full rounded-md border border-input bg-background px-3 text-sm" value={formData.priority} onChange={(event) => setFormData({ ...formData, priority: event.target.value })}>
                    {(config.priorityOptions || ["Normal"]).map((priority) => <option key={priority}>{priority}</option>)}
                  </select>
                </div>
              )}
              {config.showDate && (
                <div className="space-y-2">
                  <Label htmlFor="date">Data</Label>
                  <Input id="date" type="date" value={formData.date} onChange={(event) => setFormData({ ...formData, date: event.target.value })} />
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-3">
              {config.showResponsible && (
                <div className="space-y-2 md:col-span-1">
                  <Label htmlFor="responsible">Responsavel</Label>
                  <Input id="responsible" value={formData.responsible} onChange={(event) => setFormData({ ...formData, responsible: event.target.value })} />
                </div>
              )}
              {config.showPlate && (
                <div className="space-y-2">
                  <Label htmlFor="plate">Placa/Prefixo</Label>
                  <Input id="plate" value={formData.plate} onChange={(event) => setFormData({ ...formData, plate: event.target.value.toUpperCase() })} />
                </div>
              )}
              {config.showValue && (
                <div className="space-y-2">
                  <Label htmlFor="value">Valor/Estimativa</Label>
                  <Input id="value" type="number" step="0.01" value={formData.value} onChange={(event) => setFormData({ ...formData, value: Number(event.target.value) })} />
                </div>
              )}
            </div>

            <div className="grid gap-4 md:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="relatedModule">Modulo vinculado</Label>
                <Input id="relatedModule" placeholder="Ex: Obras, Patrimonio, Protocolos" value={formData.relatedModule} onChange={(event) => setFormData({ ...formData, relatedModule: event.target.value })} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="relatedId">Referencia interna</Label>
                <Input id="relatedId" placeholder="Ex: OS-2026-014" value={formData.relatedId} onChange={(event) => setFormData({ ...formData, relatedId: event.target.value })} />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="description">Observacoes administrativas</Label>
              <Textarea id="description" value={formData.description} onChange={(event) => setFormData({ ...formData, description: event.target.value })} />
            </div>

            <label className="flex items-center gap-2 text-sm font-medium">
              <input type="checkbox" checked={formData.isActive} onChange={(event) => setFormData({ ...formData, isActive: event.target.checked })} />
              Registro ativo na gestao municipal
            </label>

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setIsModalOpen(false)}>Cancelar</Button>
              <Button type="submit" disabled={isSubmitting} className={`${config.accentClass} text-white`}>
                {isSubmitting ? "Salvando..." : "Salvar"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
