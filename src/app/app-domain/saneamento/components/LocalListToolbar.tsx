"use client";

import { Search, X } from "lucide-react";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";

type LocalFilter = { label: string; value: string; defaultValue: string; options: string[]; onChange: (value: string) => void };

export function LocalListToolbar({ search, onSearch, placeholder, filters }: { search: string; onSearch: (value: string) => void; placeholder: string; filters: LocalFilter[] }) {
  return <>
    <div className={styles.searchForm}>
      <Search aria-hidden="true" />
      <input type="search" className={styles.searchInput} aria-label={placeholder} placeholder={placeholder} value={search} onChange={(event) => onSearch(event.target.value)} />
    </div>
    <OperationalFilters activeCount={filters.filter((filter) => filter.value !== filter.defaultValue).length}>
      <div className={styles.filterFields}>
        {filters.map((filter) => <label key={filter.label}>{filter.label}<select value={filter.value} onChange={(event) => filter.onChange(event.target.value)}>{filter.options.map((option) => <option key={option}>{option}</option>)}</select></label>)}
      </div>
      <button type="button" className={styles.dialogButton} onClick={() => filters.forEach((filter) => filter.onChange(filter.defaultValue))}>Limpar filtros</button>
    </OperationalFilters>
    {search && <button type="button" className={styles.iconButton} aria-label="Limpar busca" onClick={() => onSearch("")}><X /></button>}
  </>;
}
