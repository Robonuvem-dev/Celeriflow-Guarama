"use client";

import { activateAdministrativeUnit, deactivateAdministrativeUnit, updateAdministrativeUnit } from "../actions";
import { RegistryList, registryColumns } from "../../cadastros/operational-registry";

type Unit = { id: string; name: string; type: string; address: string | null; managerName: string | null; secretariatId: string; isActive: boolean; secretariat: { name: string } | null };
const columns = registryColumns([
  ["name", "Nome", 200, 110, "identifier"], ["type", "Tipo", 130, 70], ["address", "Endereço", 230, 100],
  ["secretariat", "Secretaria vinculada", 210, 155], ["manager", "Responsável", 190, 105], ["status", "Status", 80, 65, "status"], ["actions", "Ações", 64, 64, "actions"],
]);

export default function UnidadesClient({ units, secretariats }: { units: Unit[]; secretariats: { id: string; name: string }[] }) {
  return <RegistryList records={units} columns={columns} preferenceId="administracao-unidades" label={record => record.name}
    searchValues={record => [record.name, record.type, record.address, record.managerName, record.secretariat?.name]}
    values={record => ({ name: record.name, type: record.type, address: record.address || "Não informado", secretariat: record.secretariat?.name || "—", manager: record.managerName || "—", status: record.isActive ? "Ativa" : "Inativa" })}
    editValues={record => ({ name: record.name, type: record.type, address: record.address || "", managerName: record.managerName || "", secretariatId: record.secretariatId || secretariats[0]?.id || "" })}
    fields={[{ key: "name", label: "Nome" }, { key: "type", label: "Tipo" }, { key: "address", label: "Endereço" }, { key: "managerName", label: "Responsável" }, { key: "secretariatId", label: "Secretaria", type: "select", options: secretariats.map(option => ({ value: option.id, label: option.name })) }]}
    onSave={(record, values) => updateAdministrativeUnit(record.id, { name: String(values.name), type: String(values.type), address: String(values.address), managerName: String(values.managerName), secretariatId: String(values.secretariatId) })}
    statusAction={record => ({ label: record.isActive ? "Inativar" : "Reativar", confirm: `Deseja ${record.isActive ? "inativar" : "reativar"} esta unidade?`, run: () => record.isActive ? deactivateAdministrativeUnit(record.id) : activateAdministrativeUnit(record.id) })} />;
}
