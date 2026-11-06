import { notFound } from "next/navigation";
import { db } from "@/db/client";
import { getTenantContextForModule } from "@/lib/platform/tenant-context";
import { listProcurementAuxiliaryRecords } from "@/db/repositories/procurement/auxiliary-catalogs";
import { PageFrame } from "@/components/app-ui/PageFrame";
import { 
  AlienacoesManager, 
  type AlienacaoItem, 
  type AlienacaoProduto, 
  type AlienacaoAta 
} from "./AlienacoesManager";

export const dynamic = "force-dynamic";

export default async function AlienacoesPage() {
  const context = await getTenantContextForModule("COMPRAS");
  const database = context.database ?? db;

  // Carregar os 3 catálogos de alienação
  const [rawAlienacoes, rawProdutos, rawAtas] = await Promise.all([
    listProcurementAuxiliaryRecords(database, "alienacoes"),
    listProcurementAuxiliaryRecords(database, "alienacoes-produtos"),
    listProcurementAuxiliaryRecords(database, "alienacoes-atas"),
  ]);

  const alienacoes: AlienacaoItem[] = rawAlienacoes.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    modalidade: (item.fields.modalidade as "LEILAO" | "CONCORRENCIA") || "LEILAO",
    data: item.fields.data || "",
    fundamento: item.fields.fundamento || "",
  }));

  const produtos: AlienacaoProduto[] = rawProdutos.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    processoAlienacaoId: item.fields.processoAlienacaoId || "",
    unidade: item.fields.unidade || "UN",
    quantidade: item.fields.quantidade || "1",
    valorUnitario: item.fields.valorUnitario || "0",
  }));

  const atas: AlienacaoAta[] = rawAtas.map((item) => ({
    id: item.id,
    code: item.code,
    name: item.name,
    processoAlienacaoId: item.fields.processoAlienacaoId || "",
    data: item.fields.data || "",
    conteudo: item.fields.conteudo || "",
  }));

  return (
    <PageFrame className="p-4 space-y-4">
      <AlienacoesManager
        alienacoes={alienacoes}
        produtos={produtos}
        atas={atas}
      />
    </PageFrame>
  );
}
