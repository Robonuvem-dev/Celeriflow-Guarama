import { getTenantContextForSystemAdministration } from "@/lib/platform/tenant-context";
import NovoEventoForm from "./NovoEventoForm";

export default async function NovoEventoPage() {
  await getTenantContextForSystemAdministration();
  return <NovoEventoForm />;
}
