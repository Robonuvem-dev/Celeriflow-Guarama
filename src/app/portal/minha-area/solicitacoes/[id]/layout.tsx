import { RequestExecutorStatus } from "@/components/portal-institucional/RequestExecutorStatus";
import { getCitizenAccount } from "@/lib/portal-cidadao/access";

export default async function OwnRequestLayout({ children, params }: { children: React.ReactNode; params: Promise<{ id: string }> }) {
  const { id } = await params, account = await getCitizenAccount(`/portal/minha-area/solicitacoes/${id}`);
  return <>{children}<div className="mx-auto max-w-4xl px-4 pb-10"><RequestExecutorStatus actorId={account.id} requestId={id} /></div></>;
}
