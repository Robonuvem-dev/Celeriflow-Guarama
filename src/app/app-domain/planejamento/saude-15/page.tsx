import { getPlanningContext } from "@/lib/planejamento/access";
import Saude15Client from "./Saude15Client";

export const dynamic = "force-dynamic";

export default async function DemonstrativoSaudePage() {
  await getPlanningContext("EXECUTIVE");
  return <Saude15Client />;
}
