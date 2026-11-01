"use client";
import { useState } from "react";
import { SocialOperationalList } from "../../../../OperationalList";
export function SocialHistoryTable({ rows }: { rows: { id: string; date: string; actor: string; values: string }[] }) {
  const [page, setPage] = useState(1);
  return <SocialOperationalList id="historico-revisoes" page={page} total={rows.length} onPageChange={setPage} columns={[["date", "Registro", 200, 120], ["actor", "Autor", 180, 100], ["values", "Campos preservados", 500, 180]]} rows={rows.slice((page - 1) * 20, page * 20).map(row => ({ id: row.id, label: row.date, values: { date: new Date(row.date).toLocaleString("pt-BR"), actor: row.actor, values: row.values } }))} />;
}
