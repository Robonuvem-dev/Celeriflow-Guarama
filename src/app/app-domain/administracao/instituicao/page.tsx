import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { PageHeader } from "@/components/app-ui/PageHeader";
import { InstitutionForm } from "./InstitutionForm";
import { db } from "@/db/client";
import { findFirstInstitution } from "@/db/repositories/administration/queries";

export const dynamic = "force-dynamic";

export default async function InstituicaoPage() {
  const context = await getTenantContextForModule("ADMINISTRACAO");
  const institution = await findFirstInstitution(context.database ?? db);

  return (
    <PageFrame className="max-w-[1440px] space-y-2">
      <PageHeader title="Dados da Prefeitura" />
      <InstitutionForm institution={institution} />
    </PageFrame>
  );
}
