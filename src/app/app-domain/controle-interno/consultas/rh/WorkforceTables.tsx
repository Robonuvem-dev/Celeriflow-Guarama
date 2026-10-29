"use client";

import { useState, type ReactNode } from "react";
import type { OperationalRow } from "@/components/app-ui/operational/OperationalTable";
import FinanceOperationalList from "../../../financeiro/FinanceOperationalList";
import { financeColumn } from "../../../financeiro/operational-columns";
import styles from "@/components/app-ui/operational/operational.module.css";

const groupColumns = [financeColumn("role", "Cargo", 120), financeColumn("id", "ID do cargo", 100), financeColumn("current", "Situação atual", 105), financeColumn("legal", "Situação legal na data", 140), financeColumn("designation", "Denominação histórica", 150), financeColumn("effective", "Vigência legal", 100), financeColumn("reference", "Referência legal", 120), financeColumn("event", "Evento legal", 110), financeColumn("people", "Pessoas", 75, 90, "text", "right"), financeColumn("contracts", "Vínculos", 75, 90, "text", "right")];
const recordColumns = [financeColumn("employee", "Servidor", 140), financeColumn("id", "ID do servidor", 110), financeColumn("registration", "Matrícula", 90), financeColumn("role", "Cargo", 130), financeColumn("salary", "Enquadramento", 115), financeColumn("center", "Centro", 110), financeColumn("location", "Localização", 110), financeColumn("version", "Versão", 65), financeColumn("revision", "Revisão", 110)];

export default function WorkforceTables({ groups, records, filters, actions }: { groups: OperationalRow[]; records: OperationalRow[]; filters: ReactNode; actions: ReactNode }) {
  const [view, setView] = useState("groups");
  return <FinanceOperationalList label="Estatísticas funcionais" preferenceId={`controle-rh-${view}`} resetKey={view} columns={view === "groups" ? groupColumns : recordColumns} rows={view === "groups" ? groups : records} actions={actions}
    toolbar={<><select className={styles.dialogButton} aria-label="Visão das estatísticas funcionais" value={view} onChange={event => setView(event.target.value)}><option value="groups">Cargos e totais</option><option value="records">Vínculos e revisões utilizados</option></select>{filters}</>} />;
}
