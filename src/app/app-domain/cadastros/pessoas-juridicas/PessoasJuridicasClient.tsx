"use client";

import { updateCompany, deactivateCompany, activateCompany } from "../actions";
import { RegistryList, registryColumns } from "../operational-registry";

type Company = { id: string; corporateName: string; cnpj: string; emailPrimary: string | null; phone: string | null; status: string; taxpayerInfo?: { municipalInsc: string | null } | null };
const columns = registryColumns([
  ["name", "Razão social", 240, 120, "identifier"], ["cnpj", "CNPJ", 160, 125], ["phone", "Telefone", 130, 85],
  ["email", "E-mail", 200, 90], ["taxpayer", "Contribuinte", 110, 65], ["municipalInsc", "Inscrição municipal", 150, 85],
  ["status", "Status", 80, 60, "status"], ["actions", "Ações", 64, 64, "actions"],
]);

export default function PessoasJuridicasClient({ companies }: { companies: Company[] }) {
  return <RegistryList records={companies} columns={columns} preferenceId="cadastros-pessoas-juridicas" label={company => company.corporateName}
    searchValues={company => [company.corporateName, company.cnpj, company.emailPrimary, company.phone]}
    values={company => ({ name: company.corporateName, cnpj: company.cnpj.replace(/^(\d{2})(\d{3})(\d{3})(\d{4})(\d{2})/, "$1.$2.$3/$4-$5"), phone: company.phone || "—", email: company.emailPrimary || "—", taxpayer: company.taxpayerInfo ? "Sim" : "Não", municipalInsc: company.taxpayerInfo?.municipalInsc || "—", status: company.status })}
    editValues={company => ({ corporateName: company.corporateName, cnpj: company.cnpj, emailPrimary: company.emailPrimary || "", phone: company.phone || "", isTaxpayer: !!company.taxpayerInfo, municipalInsc: company.taxpayerInfo?.municipalInsc || "" })}
    fields={[{ key: "corporateName", label: "Razão social" }, { key: "cnpj", label: "CNPJ" }, { key: "emailPrimary", label: "E-mail", type: "email" }, { key: "phone", label: "Telefone" }, { key: "isTaxpayer", label: "Contribuinte", type: "checkbox" }, { key: "municipalInsc", label: "Inscrição municipal", visible: (_, values) => !!values.isTaxpayer }]}
    onSave={(company, values) => updateCompany(company.id, { corporateName: String(values.corporateName), cnpj: String(values.cnpj), emailPrimary: String(values.emailPrimary), phone: String(values.phone), isTaxpayer: !!values.isTaxpayer, municipalInsc: String(values.municipalInsc) })}
    statusAction={company => ({ label: company.status === "Ativo" ? "Inativar" : "Reativar", confirm: `Deseja realmente ${company.status === "Ativo" ? "inativar" : "reativar"} esta empresa?`, run: () => company.status === "Ativo" ? deactivateCompany(company.id) : activateCompany(company.id) })} />;
}
