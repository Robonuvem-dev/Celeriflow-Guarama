import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import CulturaProjetosClient, { type CulturaProjetoListItem } from "../components/CulturaProjetosClient";
import { db } from "@/db/client";
import { listCulturalProjects } from "@/db/repositories/culture/queries";

export const dynamic = "force-dynamic";

export default async function FomentoProjetosPage() {
  await getTenantContextForModule("CULTURA");
  const projetos = await listCulturalProjects(db);

  const projetosParaExibicao: CulturaProjetoListItem[] = projetos.map((projeto) => ({
    id: projeto.id,
    numero: projeto.numero,
    nome: projeto.nome,
    descricao: projeto.descricao,
    categoria: projeto.categoria,
    status: projeto.status,
    valorSolicitado: projeto.valorSolicitado,
    createdAt: projeto.createdAt.toISOString(),
    agente: {
      nome: projeto.agente.nome,
      tipo: projeto.agente.tipo,
      segmento: projeto.agente.segmento,
      pessoaNome: projeto.agente.person?.fullName ?? null,
      empresaNome: projeto.agente.company?.tradeName ?? projeto.agente.company?.corporateName ?? null,
    },
    appropriation: projeto.appropriation
      ? { id: projeto.appropriation.id, code: projeto.appropriation.code }
      : null,
    commitment: projeto.commitment
      ? { id: projeto.commitment.id, number: projeto.commitment.number }
      : null,
    purchaseProcess: projeto.purchaseProcess
      ? { id: projeto.purchaseProcess.id, number: projeto.purchaseProcess.number }
      : null,
    contract: projeto.contract
      ? { id: projeto.contract.id, number: projeto.contract.number }
      : null,
    documentCount: projeto.documentos.length,
  }));

  return <CulturaProjetosClient projetos={projetosParaExibicao} />;
}
