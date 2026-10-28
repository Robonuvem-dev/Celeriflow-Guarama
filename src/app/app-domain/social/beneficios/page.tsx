import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import BeneficiosClient from "./BeneficiosClient";
import { db } from "@/db/client";
import { listSocialBenefits, listSocialPrograms, socialBenefitFinanceOptions } from "@/db/repositories/social/queries";

export default async function BeneficiosSociaisPage() {
  const context = await getTenantContextForModule("SOCIAL");
  const database = context.database ?? db;
  const [beneficios, programas, { secretariats, appropriations }] = await Promise.all([
    listSocialBenefits(database), listSocialPrograms(database), socialBenefitFinanceOptions(database),
  ]);

  return <BeneficiosClient 
    beneficiosInicial={beneficios} 
    programasInicial={programas} 
    secretariats={secretariats} 
    appropriations={appropriations} 
  />;
}
