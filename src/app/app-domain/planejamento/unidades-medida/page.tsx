import { getPlanningContext } from "@/lib/planejamento/access";
import UnidadesMedidaClient from "./UnidadesMedidaClient";

export const dynamic = "force-dynamic";

export default async function UnidadesMedidaPage() {
  await getPlanningContext("EXECUTIVE");
  return <UnidadesMedidaClient />;
}
