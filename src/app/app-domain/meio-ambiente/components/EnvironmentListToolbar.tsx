import Link from "next/link";
import { Search } from "lucide-react";
import { OperationalFilters } from "@/components/app-ui/operational/OperationalListFrame";
import styles from "@/components/app-ui/operational/operational.module.css";
import type { EnvironmentSearchParams } from "../list-utils";

type Filter = { name: string; label: string; options: string[] };

export function EnvironmentListToolbar({ pathname, values, placeholder, filters }: { pathname: string; values: EnvironmentSearchParams; placeholder: string; filters: Filter[] }) {
  const filterNames = new Set(filters.map((filter) => filter.name));
  const preserved = Object.entries(values).filter(([key, value]) => value && key !== "page" && key !== "q");
  const clearParams = new URLSearchParams(preserved.filter(([key]) => !filterNames.has(key)) as [string, string][]);
  if (values.q) clearParams.set("q", values.q);
  return <>
    <form method="get" action={pathname} className={styles.searchForm}>
      {preserved.map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
      <input type="search" name="q" defaultValue={values.q} aria-label={placeholder} placeholder={placeholder} className={styles.searchInput} />
      <button type="submit" className={styles.iconButton} aria-label="Pesquisar"><Search /></button>
    </form>
    <OperationalFilters activeCount={filters.filter((filter) => values[filter.name]).length}>
      <form method="get" action={pathname} className="grid gap-4">
        {preserved.filter(([key]) => !filterNames.has(key)).map(([key, value]) => <input key={key} type="hidden" name={key} value={value} />)}
        <input type="hidden" name="q" value={values.q ?? ""} />
        <div className={styles.filterFields}>
          {filters.map((filter) => <label key={filter.name}>{filter.label}<select name={filter.name} defaultValue={values[filter.name] ?? ""}><option value="">Todos</option>{filter.options.map((option) => <option key={option}>{option}</option>)}</select></label>)}
        </div>
        <div className={styles.dialogFooter}>
          <Link className={styles.dialogButton} href={`${pathname}?${clearParams}`}>Limpar filtros</Link>
          <button type="submit" className={`${styles.dialogButton} ${styles.primaryButton}`}>Aplicar filtros</button>
        </div>
      </form>
    </OperationalFilters>
  </>;
}
