"use client";

import Link from "next/link";
import { Pencil } from "lucide-react";
import { deactivateSecretariat, activateSecretariat } from "../actions";
import { RegistryList, registryColumns } from "../../cadastros/operational-registry";
import styles from "@/components/app-ui/operational/operational.module.css";

type Secretariat = { id: string; name: string; acronym: string | null; managerName: string | null; managerId: string | null; manager: { id: string; name: string; registration: string | null; isActive: boolean; role: { name: string } | null } | null; isActive: boolean; _count: { departments: number } };
type ManagerOption = { id: string; name: string; registration: string | null; secretariatId: string | null; role: { name: string } | null };
const columns = registryColumns([
  ["name", "Nome", 220, 120, "identifier"], ["acronym", "Sigla", 75, 55], ["manager", "Responsável", 200, 100],
  ["role", "Cargo do responsável", 170, 150], ["link", "Vínculo do responsável", 170, 155],
  ["departments", "Departamentos", 130, 115], ["status", "Status", 80, 65, "status"], ["actions", "Ações", 64, 64, "actions"],
]);

export default function SecretariasClient({ secretariats, employees }: { secretariats: Secretariat[]; employees: ManagerOption[] }) {
  return (
    <RegistryList
      records={secretariats}
      columns={columns}
      preferenceId="administracao-secretarias"
      label={record => record.name}
      searchValues={record => [record.name, record.acronym, record.managerName, record.manager?.name, record.manager?.role?.name]}
      values={record => ({
        name: record.name,
        acronym: record.acronym || "—",
        manager: record.manager?.name || record.managerName || "Não definido",
        role: record.manager?.role?.name || "Sem cargo",
        link: record.manager ? (record.manager.isActive ? "Servidor ativo" : "Servidor inativo") : record.managerName ? "Nome sem vínculo com servidor" : "Selecione um servidor",
        departments: String(record._count.departments),
        status: record.isActive ? "Ativo" : "Inativo"
      })}
      extraActions={record => (
        <Link
          href={`/administracao/secretarias/${record.id}/editar`}
          className={styles.iconButton}
          aria-label={`Editar ${record.name}`}
          title="Editar secretaria completa"
        >
          <Pencil />
        </Link>
      )}
      statusAction={record => ({
        label: record.isActive ? "Inativar" : "Reativar",
        confirm: record.isActive ? "Tem certeza que deseja inativar esta secretaria? Ela não será excluída do sistema." : "Deseja reativar esta secretaria?",
        run: () => record.isActive ? deactivateSecretariat(record.id) : activateSecretariat(record.id)
      })}
    />
  );
}
