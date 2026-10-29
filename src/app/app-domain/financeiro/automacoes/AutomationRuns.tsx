"use client";

import { useState } from "react";
import styles from "@/components/app-ui/operational/operational.module.css";

export default function AutomationRuns({ runs }: { runs: { id: string; date: string; connection: string; operation: string; environment: string; status: string; message: string }[] }) {
  const [requested, setPage] = useState(0);
  const page = Math.min(requested, Math.max(0, runs.length - 1));
  const run = runs[page];
  return <section className="space-y-3" aria-label="Execuções da integração bancária">
    {run ? <article key={run.id}><h2>{run.connection} · {run.operation}</h2><p className="whitespace-pre-wrap break-words">{run.message}</p><p>{run.date} · {run.environment} · {run.status}</p></article> : <p>Nenhuma execução bancária registrada.</p>}
    <nav className={styles.dialogButtons} aria-label="Execuções bancárias"><button className={styles.dialogButton} disabled={page === 0} onClick={() => setPage(page - 1)}>Anterior</button><span>{runs.length ? page + 1 : 0} de {runs.length}</span><button className={styles.dialogButton} disabled={page >= runs.length - 1} onClick={() => setPage(page + 1)}>Próxima</button></nav>
  </section>;
}
