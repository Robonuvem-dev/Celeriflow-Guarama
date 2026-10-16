import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import { getSystemAdministratorEmail, SYSTEM_ADMIN_PROFILE_CODE } from "@/lib/administration/c3-policy";
import UsuariosClient from "./components/UsuariosClient";

export default async function UsuariosPage() {
  const { prisma } = await getTenantContextForSystemAdministration();
  const [usuarios, perfis, servidores] = await Promise.all([
    prisma.usuario.findMany({
      where: {
        email: { not: getSystemAdministratorEmail() },
        perfil: { codigo: { not: SYSTEM_ADMIN_PROFILE_CODE } },
      },
      include: {
        perfil: true,
        employee: { include: { department: true, secretariat: true } }
      },
      orderBy: { nome: 'asc' }
    }),
    prisma.configuracaoPerfil.findMany({
      where: { ativo: true, codigo: { not: SYSTEM_ADMIN_PROFILE_CODE } },
      orderBy: { nome: 'asc' }
    }),
    prisma.employee.findMany({
      where: { isActive: true },
      include: { department: true, secretariat: true },
      orderBy: { name: 'asc' }
    })
  ]);

  return <UsuariosClient usuarios={usuarios} perfis={perfis} servidores={servidores} />;
}
