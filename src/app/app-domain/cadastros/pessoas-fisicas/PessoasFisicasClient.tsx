"use client";

import { updatePerson, deactivatePerson, activatePerson } from "../actions";
import { RegistryList, registryColumns } from "../operational-registry";

type Person = { id: string; fullName: string; cpf: string | null; email: string | null; phonePrimary: string | null; status: string; taxpayerInfo?: { municipalInsc: string | null } | null };
const columns = registryColumns([
  ["fullName", "Nome completo", 240, 120, "identifier"], ["cpf", "CPF", 140, 105],
  ["phone", "Telefone", 130, 85], ["email", "E-mail", 200, 90],
  ["taxpayer", "Contribuinte", 110, 65], ["municipalInsc", "Inscrição municipal", 150, 85],
  ["status", "Status", 80, 60, "status"], ["actions", "Ações", 64, 64, "actions"],
]);

export default function PessoasFisicasClient({ persons }: { persons: Person[] }) {
  return <RegistryList records={persons} columns={columns} preferenceId="cadastros-pessoas-fisicas" label={person => person.fullName}
    searchValues={person => [person.fullName, person.cpf, person.email, person.phonePrimary]}
    values={person => ({ fullName: person.fullName, cpf: person.cpf?.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, "$1.$2.$3-$4") || "Não informado", phone: person.phonePrimary || "—", email: person.email || "—", taxpayer: person.taxpayerInfo ? "Sim" : "Não", municipalInsc: person.taxpayerInfo?.municipalInsc || "—", status: person.status })}
    editValues={person => ({ fullName: person.fullName, cpf: person.cpf || "", email: person.email || "", phonePrimary: person.phonePrimary || "", isTaxpayer: !!person.taxpayerInfo, municipalInsc: person.taxpayerInfo?.municipalInsc || "" })}
    fields={[{ key: "fullName", label: "Nome completo" }, { key: "cpf", label: "CPF" }, { key: "email", label: "E-mail", type: "email" }, { key: "phonePrimary", label: "Telefone" }, { key: "isTaxpayer", label: "Contribuinte", type: "checkbox" }, { key: "municipalInsc", label: "Inscrição municipal", visible: (_, values) => !!values.isTaxpayer }]}
    onSave={(person, values) => updatePerson(person.id, { fullName: String(values.fullName), cpf: String(values.cpf) || undefined, email: String(values.email), phonePrimary: String(values.phonePrimary), isTaxpayer: !!values.isTaxpayer, municipalInsc: String(values.municipalInsc) })}
    statusAction={person => ({ label: person.status === "Ativo" ? "Inativar" : "Reativar", confirm: `Deseja realmente ${person.status === "Ativo" ? "inativar" : "reativar"} este registro?`, run: () => person.status === "Ativo" ? deactivatePerson(person.id) : activatePerson(person.id) })} />;
}
