import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { getSystemAdministratorEmail, SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";
import UsuariosClient from "./components/UsuariosClient";
import { db } from "@/db/client";
import { loadUserAdministration } from "@/db/repositories/platform/system-administration";

export default async function UsuariosPage() {
  const context = await getTenantContextForSystemAdministration();
  const { usuarios, perfis, servidores } = await loadUserAdministration(context.database ?? db, getSystemAdministratorEmail(), SYSTEM_ADMIN_PROFILE_CODE);

  return <UsuariosClient usuarios={usuarios} perfis={perfis} servidores={servidores} />;
}
