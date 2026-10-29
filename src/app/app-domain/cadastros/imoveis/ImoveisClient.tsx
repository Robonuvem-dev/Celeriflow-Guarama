"use client";

import { updateRealEstate, deactivateRealEstate, activateRealEstate } from "../actions";
import { RegistryList, registryColumns } from "../operational-registry";

type RealEstate = { id: string; municipalInsc: string | null; propertyType: string | null; status: string; streetName: string | null; number: string | null; neighborhood: { name: string } | null; taxpayer: { person: { fullName: string } | null; company: { corporateName: string } | null } | null };
const columns = registryColumns([
  ["inscription", "Insc. imobiliária", 150, 125, "identifier"], ["street", "Logradouro", 200, 100], ["number", "Número", 80, 65],
  ["neighborhood", "Bairro", 150, 70], ["type", "Tipo", 120, 55], ["owner", "Proprietário", 210, 100], ["status", "Status", 80, 65, "status"], ["actions", "Ações", 64, 64, "actions"],
]);

export default function ImoveisClient({ realEstates }: { realEstates: RealEstate[] }) {
  return <RegistryList records={realEstates} columns={columns} preferenceId="cadastros-imoveis" label={record => record.municipalInsc || record.id}
    searchValues={record => [record.municipalInsc, record.streetName, record.number, record.neighborhood?.name, record.taxpayer?.person?.fullName, record.taxpayer?.company?.corporateName]}
    values={record => ({ inscription: record.municipalInsc || "S/ inscrição", street: record.streetName || "—", number: record.number || "S/N", neighborhood: record.neighborhood?.name || "—", type: record.propertyType || "—", owner: record.taxpayer?.person?.fullName || record.taxpayer?.company?.corporateName || "N/A", status: record.status })}
    editValues={record => ({ municipalInsc: record.municipalInsc || "", propertyType: record.propertyType || "", streetName: record.streetName || "", number: record.number || "" })}
    fields={[{ key: "municipalInsc", label: "Inscrição imobiliária" }, { key: "propertyType", label: "Tipo" }, { key: "streetName", label: "Logradouro" }, { key: "number", label: "Número" }]}
    onSave={(record, values) => updateRealEstate(record.id, { municipalInsc: String(values.municipalInsc), propertyType: String(values.propertyType), streetName: String(values.streetName), number: String(values.number) })}
    statusAction={record => ({ label: record.status === "Regular" ? "Inativar" : "Reativar", confirm: `Deseja realmente ${record.status === "Regular" ? "inativar" : "reativar"} este registro?`, run: () => record.status === "Regular" ? deactivateRealEstate(record.id) : activateRealEstate(record.id) })} />;
}
