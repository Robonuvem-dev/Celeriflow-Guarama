"use client";

import { useEffect, useRef, useState } from "react";
import { Filter, PowerOff, RotateCcw, Search, X } from "lucide-react";
import { NewUnitSheet } from "./NewUnitSheet";
import { EditUnitSheet } from "./EditUnitSheet";
import { inactivateConsumerUnit } from "../actions";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { OperationalPagination, OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import { OperationalHeaderActions, useOperationalWorkspace } from "@/components/app-ui/operational/OperationalWorkspace";
import styles from "@/components/app-ui/operational/operational.module.css";
import { unitColumns } from "../unidades/columns";
import { useSanitationList } from "./useSanitationList";
import { getUnitAddress } from "@/lib/saneamento/unit-address";
import type { SanitationPagination as Pagination } from "@/lib/saneamento/list-query";

type Unit = {
  id: string;
  code: string;
  address: string;
  streetAddress: string | null;
  neighborhood: string | null;
  postalCode: string | null;
  category: string;
  status: string;
  ownerName: string | null;
};

export function UnidadesClient({ units, pagination }: { units: Unit[]; pagination: Pagination }) {
  const list = useSanitationList(pagination);
  const { query, total } = pagination;
  const { device } = useOperationalWorkspace();
  const [filtersOpen, setFiltersOpen] = useState(false);
  const [resetVersion, setResetVersion] = useState(0);
  const [announcement, setAnnouncement] = useState("");
  const search = useRef<HTMLInputElement>(null);
  const committedSearch = useRef(query.q);
  const activeFilters = Number(Boolean(query.status)) + Number(Boolean(query.category));

  useEffect(() => {
    if (search.current && (search.current.value === committedSearch.current || document.activeElement !== search.current)) search.current.value = query.q;
    committedSearch.current = query.q;
  }, [query.q]);

  async function handleInactivate(id: string, code: string) {
    if (!confirm(`Inativar a unidade ${code}? Esta ação pode ser revertida editando o status.`)) return;
    try {
      const result = await inactivateConsumerUnit(id);
      if (result.error) alert(result.error);
    } catch {
      alert("Erro ao inativar unidade.");
    }
  }

  const rows: OperationalRow[] = units.map((unit) => {
    const address = getUnitAddress(unit);
    return {
      id: unit.id, label: unit.code,
      values: { identifier: unit.code, street: address.streetAddress, neighborhood: address.neighborhood || "—", postalCode: address.postalCode || "—", owner: unit.ownerName || "—", category: unit.category, status: unit.status },
      actions: <div className={styles.rowActions}>
        <EditUnitSheet unit={unit} />
        <button type="button" className={styles.iconButton} onClick={() => void handleInactivate(unit.id, unit.code)} title="Inativar" aria-label={`Inativar unidade ${unit.code}`} disabled={unit.status === "Inativa"}><PowerOff aria-hidden="true" /></button>
      </div>,
    };
  });

  return <section className={styles.list} aria-label="Lista de unidades consumidoras" aria-busy={list.pending} data-operational-list>
    <OperationalHeaderActions>
      <NewUnitSheet compact />
      <button type="button" className={styles.iconButton} aria-label="Restaurar larguras padrão" title="Restaurar larguras padrão" onClick={() => { setResetVersion((version) => version + 1); setAnnouncement("Larguras padrão restauradas."); }}><RotateCcw /></button>
    </OperationalHeaderActions>

    <div className={styles.toolbar} data-operational-filters>
      <form className={styles.searchForm} onSubmit={(event) => { event.preventDefault(); list.filter({ q: search.current?.value.trim() ?? "" }); }}>
        <label htmlFor="unit-query" className={styles.srOnly}>Buscar unidade, titular, bairro ou CEP</label>
        <input ref={search} id="unit-query" name="q" type="search" defaultValue={query.q} placeholder="Buscar unidade, titular, bairro ou CEP…" className={styles.searchInput} />
        <button type="submit" className={styles.iconButton} disabled={list.pending} aria-label="Pesquisar unidades" title="Pesquisar unidades"><Search /></button>
      </form>
      <Dialog open={filtersOpen} onOpenChange={setFiltersOpen}>
        <button type="button" className={styles.filterButton} disabled={list.pending} onClick={() => setFiltersOpen(true)} aria-label={`Filtros de unidades${activeFilters ? `, ${activeFilters} ativos` : ""}`} aria-expanded={filtersOpen}>
          <Filter aria-hidden="true" />Filtros{activeFilters > 0 && <span className={styles.count}>{activeFilters}</span>}
        </button>
        <DialogContent className={styles.dialog} data-device={device}>
          <DialogHeader><DialogTitle>Filtros de unidades consumidoras</DialogTitle><DialogDescription>A busca será combinada com os filtros selecionados.</DialogDescription></DialogHeader>
          <form className="grid gap-4" onSubmit={(event) => {
            event.preventDefault(); const data = new FormData(event.currentTarget);
            list.filter({ q: search.current?.value.trim() ?? "", status: String(data.get("status") ?? ""), category: String(data.get("category") ?? "") });
            setFiltersOpen(false);
          }}>
            <div className={styles.filterFields}>
              <label htmlFor="unit-status">Status<select id="unit-status" name="status" defaultValue={query.status}><option value="">Todos os status</option>{["Ativa", "Cortada", "Suspensa", "Inativa"].map((value) => <option key={value}>{value}</option>)}</select></label>
              <label htmlFor="unit-category">Categoria<select id="unit-category" name="category" defaultValue={query.category}><option value="">Todas as categorias</option>{["Residencial", "Comercial", "Industrial", "Pública", "Rural"].map((value) => <option key={value}>{value}</option>)}</select></label>
            </div>
            <div className={styles.dialogFooter}>
              <button type="button" className={styles.dialogButton} onClick={() => { list.filter({ q: search.current?.value.trim() ?? "", status: "", category: "" }); setFiltersOpen(false); }}>Limpar filtros</button>
              <div className={styles.dialogButtons}><button type="button" className={styles.dialogButton} onClick={() => setFiltersOpen(false)}>Cancelar</button><button type="submit" className={`${styles.dialogButton} ${styles.primaryButton}`}>Aplicar filtros</button></div>
            </div>
          </form>
        </DialogContent>
      </Dialog>
      {(query.q || activeFilters > 0) && <button type="button" className={styles.iconButton} disabled={list.pending} aria-label="Limpar busca e filtros" title="Limpar busca e filtros" onClick={() => { if (search.current) search.current.value = ""; list.filter({ q: "", status: "", category: "" }); }}><X /></button>}
    </div>

    <OperationalTable columns={unitColumns} rows={rows} preferenceId="sanitation-units" resetVersion={resetVersion} />
    <OperationalPagination page={query.page} total={total} pending={list.pending} onPageChange={list.setPage} />
    <span className={styles.srOnly} role="status">{announcement}</span>
  </section>;
}
