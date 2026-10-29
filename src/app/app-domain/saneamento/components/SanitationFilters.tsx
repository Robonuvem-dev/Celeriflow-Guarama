"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { Search } from "lucide-react";
import type { SanitationListQuery } from "@/lib/saneamento/list-query";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";

export function SanitationFilters({ query, onFilter, placeholder, filters = [], children }: {
  query: SanitationListQuery;
  onFilter: (values: Record<string, string>) => void;
  placeholder: string;
  filters?: { name: "status" | "category" | "type" | "year" | "month"; label: string; options: (string | { value: string; label: string })[]; required?: boolean }[];
  children?: ReactNode;
}) {
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const search = useRef<HTMLInputElement>(null);
  const committedSearch = useRef(query.q);
  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);
  useEffect(() => {
    if (search.current && (search.current.value === committedSearch.current || document.activeElement !== search.current)) search.current.value = query.q;
    committedSearch.current = query.q;
  }, [query.q]);

  return <>
    <form className={styles.searchForm} onSubmit={(event) => {
      event.preventDefault();
      if (timer.current) clearTimeout(timer.current);
      const data = new FormData(event.currentTarget);
      onFilter(Object.fromEntries([...data.entries()].map(([key, value]) => [key, String(value)])));
    }}>
      <input ref={search} name="q" type="search" aria-label={placeholder} placeholder={placeholder} defaultValue={query.q}
        className={styles.searchInput}
        onChange={(event) => {
          if (timer.current) clearTimeout(timer.current);
          const form = event.currentTarget.form;
          timer.current = setTimeout(() => form?.requestSubmit(), 350);
        }} />
      <button type="submit" className={styles.iconButton} aria-label="Pesquisar"><Search /></button>
    </form>
    {filters.length > 0 && <OperationalFilters activeCount={filters.filter((filter) => !filter.required && query[filter.name]).length}>
      <form className="grid gap-4" onSubmit={(event) => {
        event.preventDefault();
        if (timer.current) clearTimeout(timer.current);
        onFilter({ ...Object.fromEntries([...new FormData(event.currentTarget)].map(([key, value]) => [key, String(value)])), q: search.current?.value.trim() ?? "" });
      }}>
        <div className={styles.filterFields}>
          {filters.map((filter) => <label key={filter.name}>{filter.label}<select key={`${filter.name}:${query[filter.name]}`} name={filter.name} defaultValue={query[filter.name]}>
            {!filter.required && <option value="">{filter.label}</option>}
            {filter.options.map((option) => typeof option === "string" ? <option key={option}>{option}</option> : <option key={option.value} value={option.value}>{option.label}</option>)}
          </select></label>)}
        </div>
        <div className={styles.dialogFooter}>
          <button type="button" className={styles.dialogButton} onClick={() => {
            if (timer.current) clearTimeout(timer.current);
            onFilter({ ...Object.fromEntries(filters.filter((filter) => !filter.required).map((filter) => [filter.name, ""])), q: search.current?.value.trim() ?? "" });
          }}>Limpar filtros</button>
          <button type="submit" className={`${styles.dialogButton} ${styles.primaryButton}`}>Aplicar filtros</button>
        </div>
      </form>
    </OperationalFilters>}
    {children}
  </>;
}
