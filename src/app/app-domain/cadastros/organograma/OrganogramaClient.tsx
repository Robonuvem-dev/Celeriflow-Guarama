"use client";

import { RegistryList, registryColumns } from "../operational-registry";

type Secretariat = { id: string; name: string; acronym: string | null; isActive: boolean; departments: { name: string }[]; units: { name: string; type: string }[] };
const columns = registryColumns([["name", "Secretaria", 240, 110, "identifier"], ["acronym", "Sigla", 70, 55], ["departments", "Departamentos", 260, 130], ["units", "Unidades administrativas", 300, 190], ["status", "Status", 85, 65, "status"]]);

export function OrganogramaClient({ secretariats }: { secretariats: Secretariat[] }) {
  return <RegistryList records={secretariats} columns={columns} preferenceId="cadastros-organograma" label={record => record.name}
    searchValues={record => [record.name, record.acronym, ...record.departments.map(item => item.name), ...record.units.map(item => `${item.name} (${item.type})`)]}
    values={record => ({ name: record.name, acronym: record.acronym || "—", departments: record.departments.map(item => item.name).join(", ") || "—", units: record.units.map(item => `${item.name} (${item.type})`).join(", ") || "—", status: record.isActive ? "Ativa" : "Inativa" })} />;
}
