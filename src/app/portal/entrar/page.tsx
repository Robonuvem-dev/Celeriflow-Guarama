import { PortalLoginCard } from "@/components/auth/PortalLoginCard";
import { citizenReturnTo } from "@/lib/portal-cidadao/policy";

export default async function CitizenLoginPage({ searchParams }: { searchParams: Promise<{ returnTo?: string; error?: string }> }) {
  const query = await searchParams;
  return (
    <main className="bg-[radial-gradient(circle_at_top_left,_#d1fae5_0,_transparent_36%),linear-gradient(135deg,#f8fafc,#eef2f7)] px-4 py-12 sm:px-6 sm:py-16">
      <div className="mx-auto flex max-w-5xl justify-center">
        <PortalLoginCard audience="citizen" destination={citizenReturnTo(query.returnTo)} initialError={query.error === "access" ? "Sua conta não possui acesso municipal ativo. Entre em contato com o atendimento." : undefined} />
      </div>
    </main>
  );
}
