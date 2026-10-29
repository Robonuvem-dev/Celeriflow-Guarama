"use client";

import { updateDepartment, deactivateDepartment, activateDepartment } from "../actions";
import { RegistryList, registryColumns } from "../../cadastros/operational-registry";

type Department = { id: string; name: string; description: string | null; isActive: boolean; secretariat: { name: string } };
const columns = registryColumns([["name", "Nome", 260, 130, "identifier"], ["secretariat", "Secretaria vinculada", 260, 160], ["status", "Status", 90, 65, "status"], ["actions", "Ações", 64, 64, "actions"]]);

export default function DepartamentosClient({ departments, secretariats }: { departments: Department[]; secretariats: { id: string; name: string }[] }) {
  return <RegistryList records={departments} columns={columns} preferenceId="administracao-departamentos" label={record => record.name}
    searchValues={record => [record.name, record.description, record.secretariat.name]}
    values={record => ({ name: record.name, secretariat: record.secretariat.name, status: record.isActive ? "Ativo" : "Inativo" })}
    editValues={record => ({ name: record.name, description: record.description || "", secretariatId: secretariats.find(option => option.name === record.secretariat.name)?.id || "" })}
    fields={[{ key: "name", label: "Nome" }, { key: "secretariatId", label: "Secretaria", type: "select", options: secretariats.map(option => ({ value: option.id, label: option.name })) }]}
    onSave={(record, values) => updateDepartment(record.id, { name: String(values.name), description: String(values.description), secretariatId: String(values.secretariatId) })}
    statusAction={record => ({ label: record.isActive ? "Inativar" : "Reativar", confirm: record.isActive ? "Tem certeza que deseja INATIVAR este departamento? Ele não será excluído do sistema, apenas desativado." : "Deseja REATIVAR este departamento?", run: () => record.isActive ? deactivateDepartment(record.id) : activateDepartment(record.id) })} />;
}
