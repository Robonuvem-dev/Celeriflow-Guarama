import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { NewProposicaoSheet } from "../components/NewProposicaoSheet";
import { OperationalHeaderActions } from "@/components/app-ui/operational/OperationalWorkspace";
import { ProposicoesClient } from "./ProposicoesClient";
import { db } from "@/db/client";
import { listPropositions, listServingCouncilors } from "@/db/repositories/chamber/queries";

export default async function ProposicoesPage() {
  await getTenantContextForModule("CAMARA");
  const [proposicoes, vereadores] = await Promise.all([
    listPropositions(db),
    listServingCouncilors(db),
  ]);
  const rows = proposicoes.map((proposicao) => ({
    id: proposicao.id,
    numero: proposicao.numero,
    tipo: proposicao.tipo,
    autoria: proposicao.autor.nomeParlamentar,
    assunto: proposicao.ementa,
    data: proposicao.createdAt.toISOString(),
    status: proposicao.status,
  }));
  return <><OperationalHeaderActions><NewProposicaoSheet vereadores={vereadores} /></OperationalHeaderActions><ProposicoesClient rows={rows} /></>;
}
