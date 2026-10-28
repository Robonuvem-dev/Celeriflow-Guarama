import { getOptionalTenantContext } from "@/lib/platform/tenant-context";
import { db } from "@/db/client";
import { findFirstInstitution } from "@/db/repositories/administration/queries";
import ClientLayout from "./ClientLayout";

export const dynamic = "force-dynamic";

export default async function AppDomainLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const context = await getOptionalTenantContext();

  const institution = context
    ? await findFirstInstitution(context.database ?? db)
    : null;

  return (
    <ClientLayout
      institution={institution}
      user={context?.user ?? null}
    >
      {children}
    </ClientLayout>
  );
}
