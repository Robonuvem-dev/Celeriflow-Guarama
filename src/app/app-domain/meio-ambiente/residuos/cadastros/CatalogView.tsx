"use client";

import Link from "next/link";
import { Package, Search, Trash2 } from "lucide-react";
import { OperationalFilters, OperationalListFrame, OperationalLinkPagination } from "@/components/app-ui/operational/OperationalListFrame";
import { OperationalTable, type OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { OperationalColumn } from "@/lib/operational-tables";
import { recyclingCatalogs, type RecyclingEntry, type RecyclingCatalogSaveResult } from "@/lib/environment/recycling-catalog";
import { CatalogForm } from "./CatalogForm";

type Props = { kind: RecyclingEntry["kind"]; entries: RecyclingEntry[]; search: string; situation: string; page: number; total: number; available: boolean; canCreate: boolean; canUpdate: boolean; saveAction: (form: FormData) => Promise<RecyclingCatalogSaveResult> };
const pathname = "/meio-ambiente/residuos/cadastros";
const columns: readonly OperationalColumn[] = [
  { key: "code", label: "Código", type: "identifier", initialWidth: 120, minWidth: 90, resizable: true, sortable: false, details: "overflow" },
  { key: "name", label: "Nome", type: "text", initialWidth: 240, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "description", label: "Descrição", type: "text", initialWidth: 300, minWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "address", label: "Endereço", type: "text", initialWidth: 260, minWidth: 140, resizable: true, sortable: false, details: "overflow" },
  { key: "situation", label: "Situação", type: "status", initialWidth: 100, minWidth: 85, maxWidth: 160, resizable: true, sortable: false, details: "overflow" },
  { key: "actions", label: "Ações", type: "actions", initialWidth: 64, minWidth: 64, maxWidth: 64, resizable: false, sortable: false, details: "none", align: "right" },
];
export function CatalogView(props: Props) {
  const values = { catalog: props.kind, q: props.search, situacao: props.situation };
  const rows: OperationalRow[] = props.entries.map(entry => ({ id: `${entry.kind}:${entry.code}`, label: `${entry.code} · ${entry.name}`, values: { code: entry.code, name: entry.name, description: entry.description, address: entry.address, situation: entry.active ? "Ativo" : "Inativo" },
    actions: props.available && props.canUpdate && <div className="flex items-center justify-end"><CatalogForm kind={props.kind} entry={entry} saveAction={props.saveAction} /></div> }));
  const showAddress = props.kind === "depots" || props.kind === "centers" || props.entries.some(entry => entry.address);
  return <OperationalListFrame label="Cadastros de reciclagem" actions={<>
    <Link className={styles.iconButton} href="/meio-ambiente/residuos" aria-label="Registros de resíduos" title="Registros de resíduos"><Trash2 /></Link>
    <Link className={styles.iconButton} href="/meio-ambiente/residuos/estoque" aria-label="Estoque de recicláveis" title="Estoque de recicláveis"><Package /></Link>
    {props.available && props.canCreate && <CatalogForm key={props.kind} kind={props.kind} saveAction={props.saveAction} />}
  </>} toolbar={<>
    <form method="get" action={pathname} className={styles.searchForm}>
      <input type="hidden" name="catalog" value={props.kind} /><input type="hidden" name="situacao" value={props.situation} />
      <input type="search" name="q" aria-label="Buscar cadastro" title={recyclingCatalogs[props.kind]} placeholder={`Buscar em ${recyclingCatalogs[props.kind]}`} defaultValue={props.search} className={styles.searchInput} />
      <button type="submit" className={styles.iconButton} aria-label="Pesquisar"><Search /></button>
    </form>
    <OperationalFilters activeCount={props.situation ? 2 : 1}>
      <form method="get" action={pathname} className="grid gap-4">
        <input type="hidden" name="q" value={props.search} />
        <div className={styles.filterFields}>
          <label>Catálogo<select aria-label="Catálogo" name="catalog" defaultValue={props.kind}>{Object.entries(recyclingCatalogs).map(([key, label]) => <option key={key} value={key}>{label}</option>)}</select></label>
          <label>Situação<select aria-label="Situação" name="situacao" defaultValue={props.situation}><option value="">Todos</option><option>Ativo</option><option>Inativo</option></select></label>
        </div>
        <div className={styles.dialogFooter}><Link className={styles.dialogButton} href={`${pathname}?catalog=${props.kind}`}>Limpar filtros</Link><button type="submit" className={`${styles.dialogButton} ${styles.primaryButton}`}>Aplicar filtros</button></div>
      </form>
    </OperationalFilters>
  </>} pagination={<OperationalLinkPagination pathname={pathname} values={values} page={props.page} total={props.total} />}>
    <OperationalTable columns={showAddress ? columns : columns.filter(column => column.key !== "address")} rows={rows} preferenceId={`environment-recycling-catalog-${props.kind}`} caption={recyclingCatalogs[props.kind]} emptyMessage={props.available ? "Nenhum cadastro encontrado." : "Configure a instância municipal para habilitar os cadastros."} />
  </OperationalListFrame>;
}
