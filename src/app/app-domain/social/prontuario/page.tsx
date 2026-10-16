import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import ProntuarioClient from "./ProntuarioClient";
import { resolveSocialAccess, socialAttendanceWhere } from "@/lib/social/access-policy";

export default async function ProntuarioSocialPage() {
  const context = await getTenantContextForModule("SOCIAL");
  const { prisma } = context;
  const access = await resolveSocialAccess(context);
  const atendimentos = await prisma.socialAttendance.findMany({
    where: socialAttendanceWhere(access),
    include: {
      family: { select: { id: true, familyCode: true, nis: true } },
      person: { select: { id: true, fullName: true } },
      professional: { select: { id: true, name: true } },
      unit: { select: { id: true, name: true } },
    },
    orderBy: {
      date: 'desc'
    }
  });

  const noAccess = !access.administrator && !access.links.length;
  const familias = await prisma.socialFamily.findMany({ where: noAccess ? { id: { in: [] } } : {}, select: { id: true, familyCode: true, nis: true }, orderBy: { familyCode: 'asc' } });
  const persons = await prisma.person.findMany({ where: noAccess ? { id: { in: [] } } : {}, select: { id: true, fullName: true }, orderBy: { fullName: 'asc' } });
  const professionals = await prisma.employee.findMany({ where: { isActive: true, ...(access.administrator ? {} : { id: access.employeeId || "" }) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });
  const units = await prisma.socialUnit.findMany({ where: { isActive: true, ...(access.administrator ? {} : { id: { in: access.links.map((link) => link.unitId) } }) }, select: { id: true, name: true }, orderBy: { name: 'asc' } });

  return <ProntuarioClient 
    atendimentosInicial={atendimentos} 
    familias={familias} 
    persons={persons} 
    professionals={professionals} 
    units={units} 
  />;
}
