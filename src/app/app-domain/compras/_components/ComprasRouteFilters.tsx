"use client";

import Link from "next/link";
import { useId, useState } from "react";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";

export function ComprasRouteFilters({ pathname, query, placeholder, filters }: {
  pathname: string;
  query: string;
  placeholder: string;
  filters: { name: string; label: string; value: string; options: { value: string; label: string }[] }[];
}) {
  const formId = useId();
  const [values, setValues] = useState(() => Object.fromEntries(filters.map((filter) => [filter.name, filter.value])));
  return <>
    <form id={formId} action={pathname} className={styles.searchForm}>
      {filters.map((filter) => <input key={filter.name} type="hidden" name={filter.name} value={values[filter.name]} />)}
      <input aria-label={placeholder} name="q" defaultValue={query} placeholder={placeholder} className={styles.searchInput} />
      <button type="submit" className={styles.filterButton}>Buscar</button>
    </form>
    <OperationalFilters activeCount={filters.filter((filter) => filter.value).length}>
      <div className={styles.filterFields}>
        {filters.map((filter) => <label key={filter.name}>{filter.label}<select aria-label={filter.label} value={values[filter.name]} onChange={(event) => setValues((current) => ({ ...current, [filter.name]: event.target.value }))}><option value="">Todas</option>{filter.options.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>)}
        <button type="submit" form={formId} className={styles.primaryButton}>Aplicar</button><Link href={pathname} className={styles.dialogButton}>Limpar</Link>
      </div>
    </OperationalFilters>
  </>;
}
