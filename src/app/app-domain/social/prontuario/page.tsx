import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import ProntuarioClient from "./ProntuarioClient";
import { resolveSocialAccess } from "@/lib/social/access-policy";
import { db } from "@/db/client";
import { listSocialAttendances, socialProntuarioOptions, socialAttendanceOptions } from "@/db/repositories/social/queries";

export default async function ProntuarioSocialPage() {
  const context = await getTenantContextForModule("SOCIAL");
  const database = context.database ?? db;
  const access = await resolveSocialAccess(context);
  const atendimentos = (await listSocialAttendances(database, access)).map(row => ({ ...row, family: { id: row.family.id, familyCode: row.family.familyCode, nis: row.family.nis }, person: row.person ? { id: row.person.id, fullName: row.person.fullName } : null, professional: { id: row.professional.id, name: row.professional.name }, unit: { id: row.unit.id, name: row.unit.name } }));

  const { familias, persons } = await socialProntuarioOptions(database, access);
  const { professionals, units } = await socialAttendanceOptions(database, access);

  return <ProntuarioClient 
    atendimentosInicial={atendimentos} 
    familias={familias} 
    persons={persons} 
    professionals={professionals} 
    units={units} 
  />;
}
