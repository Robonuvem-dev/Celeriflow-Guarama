"use client";

import { updateEmployee, deactivateEmployee, activateEmployee } from "../actions";
import { RegistryList, registryColumns } from "../../cadastros/operational-registry";

type Employee = { id: string; name: string; cpf: string | null; email: string | null; isActive: boolean; role: { name: string } | null; secretariat: { name: string; acronym: string | null } | null; department: { name: string } | null };
type Option = { id: string; name: string };
type Department = Option & { secretariatId: string | null };
const columns = registryColumns([
  ["name", "Nome", 210, 110, "identifier"], ["cpf", "CPF", 130, 100], ["email", "E-mail", 190, 100], ["role", "Cargo", 160, 80],
  ["secretariat", "Secretaria", 180, 95], ["department", "Departamento", 180, 115], ["status", "Status", 80, 65, "status"], ["actions", "Ações", 64, 64, "actions"],
]);

export default function ServidoresClient({ employees, roles, secretariats, departments }: { employees: Employee[]; roles: Option[]; secretariats: Option[]; departments: Department[] }) {
  return <RegistryList records={employees} columns={columns} preferenceId="administracao-servidores" label={record => record.name}
    searchValues={record => [record.name, record.cpf, record.email]}
    values={record => ({ name: record.name, cpf: record.cpf || "Sem CPF", email: record.email || "—", role: record.role?.name || "—", secretariat: record.secretariat?.name || "Sem secretaria", department: record.department?.name || "—", status: record.isActive ? "Ativo" : "Inativo" })}
    editValues={record => ({ name: record.name, cpf: record.cpf || "", email: record.email || "", roleId: roles.find(option => option.name === record.role?.name)?.id || "", secretariatId: secretariats.find(option => option.name === record.secretariat?.name)?.id || "", departmentId: departments.find(option => option.name === record.department?.name)?.id || "" })}
    fields={[{ key: "name", label: "Nome" }, { key: "cpf", label: "CPF" }, { key: "email", label: "E-mail", type: "email" }, { key: "roleId", label: "Cargo", type: "select", options: roles.map(option => ({ value: option.id, label: option.name })) }, { key: "secretariatId", label: "Secretaria", type: "select", clears: ["departmentId"], options: secretariats.map(option => ({ value: option.id, label: option.name })) }, { key: "departmentId", label: "Departamento (opcional)", type: "select", options: (_, values) => departments.filter(option => !values.secretariatId || option.secretariatId === values.secretariatId).map(option => ({ value: option.id, label: option.name })) }]}
    onSave={(record, values) => updateEmployee(record.id, { name: String(values.name), cpf: String(values.cpf), email: String(values.email), roleId: String(values.roleId) || null, secretariatId: String(values.secretariatId) || null, departmentId: String(values.departmentId) || null })}
    statusAction={record => ({ label: record.isActive ? "Inativar" : "Reativar", confirm: record.isActive ? "Tem certeza que deseja INATIVAR este servidor? Ele não será excluído do sistema, apenas desativado." : "Deseja REATIVAR este servidor?", run: () => record.isActive ? deactivateEmployee(record.id) : activateEmployee(record.id) })} />;
}
