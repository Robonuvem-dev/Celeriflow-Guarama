"use client";

import { OperationalPagination, OperationalTable } from "@/components/app-ui/operational/OperationalTable";
import styles from "@/components/app-ui/operational/operational.module.css";
import { unitColumns } from "./columns";

export function UnitsListState({ state, onRetry }: { state: "loading" | "error"; onRetry?: () => void }) {
  return <section className={styles.list} aria-label="Lista de unidades consumidoras" aria-busy={state === "loading"}>
    <div className={styles.toolbar}><input className={styles.searchInput} disabled aria-label="Buscar unidades consumidoras" placeholder="Buscar unidade, titular, bairro ou CEP…" /></div>
    <OperationalTable columns={unitColumns} rows={[]} preferenceId="sanitation-units" state={state} onRetry={onRetry} />
    <OperationalPagination page={1} total={0} pending onPageChange={() => {}} />
  </section>;
}
