import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { LicitacaoForm } from "../../LicitacaoForm";
import { notFound } from "next/navigation";
import { databaseConnection } from "@/db/client";
import { listBiddingProcesses, loadBiddingHeader } from "@/db/repositories/procurement/bidding";

export default async function EditarLicitacaoPage({ params }: { params: Promise<{ id: string }> }) {
  await getTenantContextForModule("COMPRAS");
  const resolvedParams = await params;
  const [licitacao, processos] = await Promise.all([
    loadBiddingHeader(databaseConnection.db, resolvedParams.id),
    listBiddingProcesses(databaseConnection.db),
  ]);

  if (!licitacao) {
    notFound();
  }

  return <LicitacaoForm data={licitacao} processos={processos} />;
}
