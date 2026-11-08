import { getPlanningContext } from "@/lib/planejamento/access";
import ProdutosAcoesClient from "./ProdutosAcoesClient";

export const dynamic = "force-dynamic";

export default async function ProdutosAcoesPage() {
  await getPlanningContext("EXECUTIVE");
  return <ProdutosAcoesClient />;
}
