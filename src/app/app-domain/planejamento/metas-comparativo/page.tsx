import { getPlanningContext } from "@/lib/planejamento/access";
import MetasComparativoClient from "./MetasComparativoClient";

export const dynamic = "force-dynamic";

export default async function MetasComparativoPage() {
  await getPlanningContext("EXECUTIVE");
  return <MetasComparativoClient />;
}
