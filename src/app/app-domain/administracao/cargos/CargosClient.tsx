"use client";

import { updateRole, deactivateRole, activateRole } from "../actions";
import { RegistryList, registryColumns } from "../../cadastros/operational-registry";

type Role = { id: string; name: string; description: string | null; level: string | null; canSign: boolean; isActive: boolean; _count: { employees: number } };
const columns = registryColumns([
  ["name", "Nome", 220, 110, "identifier"], ["description", "Atribuições", 240, 100], ["level", "Nível", 100, 55],
  ["canSign", "Previsão de assinatura", 180, 165], ["employees", "Servidores vinculados", 180, 165], ["status", "Status", 80, 65, "status"], ["actions", "Ações", 64, 64, "actions"],
]);

export default function CargosClient({ roles }: { roles: Role[] }) {
  return <RegistryList records={roles} columns={columns} preferenceId="administracao-cargos" label={record => record.name}
    notice="Previsão de assinatura é informativa e não concede autorização para assinar documentos."
    searchValues={record => [record.name, record.description, record.level]}
    values={record => ({ name: record.name, description: record.description || "Não informadas", level: record.level || "—", canSign: record.canSign ? "Sim" : "Não", employees: String(record._count.employees), status: record.isActive ? "Ativo" : "Inativo" })}
    editValues={record => ({ name: record.name, description: record.description || "", level: record.level || "", canSign: record.canSign })}
    fields={[{ key: "name", label: "Nome" }, { key: "description", label: "Atribuições", type: "textarea" }, { key: "level", label: "Nível" }, { key: "canSign", label: "Previsão de assinatura", type: "checkbox" }]}
    onSave={(record, values) => updateRole(record.id, { name: String(values.name), description: String(values.description), level: String(values.level), canSign: !!values.canSign })}
    statusAction={record => ({ label: record.isActive ? "Inativar" : "Reativar", confirm: record.isActive ? "Tem certeza que deseja INATIVAR este cargo? Ele não será excluído do sistema, apenas desativado." : "Deseja REATIVAR este cargo?", run: () => record.isActive ? deactivateRole(record.id) : activateRole(record.id) })} />;
}
