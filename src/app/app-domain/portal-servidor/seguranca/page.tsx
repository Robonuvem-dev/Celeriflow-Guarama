import { getEmployeePortalAccess } from "@/lib/portal-servidor/access";
import { ErpPageTitle } from "@/components/app-ui/erp/ErpPageTitle";
import { PasswordChangeForm } from "./PasswordChangeForm";

export default async function EmployeeAccountSecurityPage() {
  const access = await getEmployeePortalAccess();
  if (access.status !== "AVAILABLE") return <p role="alert" className="p-4">Acesso funcional indisponível. Procure o RH.</p>;
  return <div className="flex min-h-0 flex-1 flex-col"><ErpPageTitle title="Minha senha" description="Atualização da credencial pessoal de acesso aos serviços municipais." /><div className="overflow-y-auto p-3"><PasswordChangeForm email={access.context.user.email} firebaseUid={access.context.user.firebaseUid} /></div></div>;
}
