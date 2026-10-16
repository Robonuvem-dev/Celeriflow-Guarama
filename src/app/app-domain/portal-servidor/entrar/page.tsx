import { PortalLoginCard } from "@/components/auth/PortalLoginCard";
import { employeePortalDestination } from "@/lib/portal-servidor/routes";

export default async function EmployeeLoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; access?: string }> }) {
  const params = await searchParams;
  const destination = employeePortalDestination(params.returnTo);
  const initialError = params.access === "unavailable" ? "Acesso funcional indisponível. Confira se sua conta está vinculada a um cadastro de servidor ativo." : "";
  return (
    <div className="flex min-h-[calc(100dvh-9rem)] items-center justify-center bg-[radial-gradient(circle_at_top_right,_#dbeafe_0,_transparent_35%),linear-gradient(135deg,#f8fafc,#e2e8f0)] px-4 py-8">
      <PortalLoginCard audience="employee" destination={destination} initialError={initialError} sessionEndpoint="/api/auth/portal-servidor/session" />
    </div>
  );
}
